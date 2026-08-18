// ============================================================
// Serverless function (deploy target: Vercel)
// Creates a real Stripe Checkout session from the cart sent by the browser.
//
// Setup required before this works:
//   1. Create a Stripe account: https://dashboard.stripe.com/register
//   2. Get your Secret key from Developers > API keys
//   3. In your Vercel project, add an Environment Variable:
//        STRIPE_SECRET_KEY = sk_test_xxxxxxxx   (use the TEST key first)
//   4. Connect an Upstash Redis store to the project (needed for discount
//      codes — see README.md "Discount codes" section)
//   5. Redeploy after adding the environment variable.
//
// While STRIPE_SECRET_KEY is a "sk_test_..." key, no real money moves —
// use Stripe's test card 4242 4242 4242 4242 (any future date, any CVC)
// to test the full flow safely. Switch to the "sk_live_..." key only
// once you've tested a full order end to end.
//
// Discount codes: the browser only ever sends the CODE (a string), never
// a discount amount. This function looks the code up in Upstash Redis,
// verifies it exists and hasn't been used, computes the discount itself,
// and marks the code as used at the moment a Checkout session is created
// for it — so the same code cannot be applied twice, even by the same
// person opening two tabs. (Trade-off: if someone applies a code and then
// abandons payment without completing it, that code is now spent. This
// keeps the logic simple; ask if you'd like it upgraded to only redeem
// on confirmed payment via a Stripe webhook instead.)
// ============================================================

const Stripe = require("stripe");
const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 运费规则 — 必须跟 script.js 顶部那两个常数保持一致，
// 因为购物车画面显示的金额，跟这里真正跟Stripe收的钱，要对得上。
// 如果改了 script.js 里的门槛/运费，记得这里也要跟着改。
const FREE_SHIPPING_THRESHOLD_CENTS = 10000; // S$100.00
const SHIPPING_FEE_CENTS = 500; // S$5.00

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    return res.status(500).json({ error: "STRIPE_SECRET_KEY is missing." });
  }

  const stripe = Stripe(secretKey);

  try {
    const { cart, discountCode } = req.body;

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // 1. 安全计算原价总额 (Cents) — 完全基于服务器自己记的价格逻辑
    const rawTotalCents = cart.reduce((sum, item) => {
      const price = Number(item.priceCents || item.price || 0);
      const qty = Number(item.quantity || item.qty || 1);
      return sum + price * qty;
    }, 0);

    // 2. 如果有折扣码，向 KV 查证：存在、未使用过，才算数
    let discountRecord = null;
    let discountKey = null;

    if (discountCode && typeof discountCode === "string") {
      discountKey = `discount:${discountCode.trim().toUpperCase()}`;
      const record = await kv.get(discountKey);
      if (record && !record.used) {
        discountRecord = record;
      }
      // 如果代码不存在或已被使用，静默忽略折扣（不让下单失败），
      // 前端 Apply 按钮那一步已经先跟人说过"无效/已使用"了。
    }

    const hasValidDiscount = !!discountRecord && rawTotalCents > 0;
    let finalTotalCents = rawTotalCents;
    if (hasValidDiscount) {
      if (discountRecord.type === "percent") {
        finalTotalCents = Math.round(rawTotalCents * (1 - discountRecord.value / 100));
      } else if (discountRecord.type === "fixed") {
        finalTotalCents = rawTotalCents - Math.round(discountRecord.value * 100);
      }
      finalTotalCents = Math.max(1, finalTotalCents); // Stripe需要单价至少1分钱
    }
    const discountRatio = hasValidDiscount ? finalTotalCents / rawTotalCents : 1;

    // 3. 生成符合 Stripe 规范的 line_items
    const line_items = cart.map((item) => {
      const basePrice = Number(item.priceCents || item.price || 0);
      let finalPrice = hasValidDiscount ? Math.round(basePrice * discountRatio) : basePrice;
      if (finalPrice < 1) finalPrice = 1;

      const qty = Number(item.quantity || item.qty || 1);

      return {
        price_data: {
          currency: "sgd",
          product_data: {
            name: item.name + (hasValidDiscount ? " (Discounted)" : ""),
            description: item.personalise ? `Personalisation: ${item.personalise}` : undefined,
          },
          unit_amount: finalPrice,
        },
        quantity: qty,
      };
    });

    const origin = req.headers.origin || `https://${req.headers.host}`;

    // 3.5 运费 — 用折扣后的商品小计来判断是否达到免运费门槛，
    //     未达门槛就加一条"Shipping"的line item，金额是服务器自己算的，
    //     不是前端传来的数字，避免被篡改。
    const shippingFeeCents = finalTotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_FEE_CENTS;
    if (shippingFeeCents > 0) {
      line_items.push({
        price_data: {
          currency: "sgd",
          product_data: { name: "Shipping" },
          unit_amount: shippingFeeCents,
        },
        quantity: 1,
      });
    }

    // 4. 发起 Stripe 结算 Session
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      line_items,
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/index.html`,
      shipping_address_collection: { allowed_countries: ["SG"] },
    });

    // 5. 立刻把这个折扣码标记为已使用 — 从这一刻起，任何人再用同一个码
    //    (包括原本那个人自己)都会被 validate-discount 判定为"已使用过"。
    if (hasValidDiscount && discountKey) {
      await kv.set(discountKey, {
        ...discountRecord,
        used: true,
        usedAt: Date.now(),
        stripeSessionId: session.id,
      });
    }

    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("Stripe Error:", err.message);
    return res.status(500).json({ error: err.message });
  }
};
