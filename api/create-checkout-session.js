// ============================================================
// Serverless function (Vercel)
// Creates a HitPay Payment Request from the cart sent by the browser.
//
// Required Vercel Environment Variables:
//   HITPAY_API_KEY  = your HitPay API key (from Dashboard → Developers → API Keys)
//                     Use the Sandbox key (usually starts with "tes") for testing first.
//   HITPAY_SALT     = (optional) webhook salt, for later webhook verification
//
// Optional:
//   HITPAY_API_BASE = override API base URL
//                     default: sandbox if key looks like test, else production
//
// Also needs the existing Upstash Redis vars for discount codes:
//   KV_REST_API_URL, KV_REST_API_TOKEN
//
// Flow:
//   1. Browser POSTs { cart, discountCode }
//   2. This function recalculates total + shipping + discount on the server
//   3. Creates a HitPay payment request
//   4. Returns { url } → browser redirects customer to HitPay checkout
//   5. After payment, HitPay redirects to success.html
// ============================================================

const { Redis } = require("@upstash/redis");

const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

// 运费规则 — 必须跟 script.js 顶部那两个常数保持一致
const FREE_SHIPPING_THRESHOLD_CENTS = 10000; // S$100.00
const SHIPPING_FEE_CENTS = 500; // S$5.00

function getHitPayBaseUrl(apiKey) {
  if (process.env.HITPAY_API_BASE) return process.env.HITPAY_API_BASE.replace(/\/$/, "");
  // Sandbox keys commonly start with "tes" / "test"
  const isSandbox = /^tes/i.test(apiKey || "");
  return isSandbox
    ? "https://api.sandbox.hit-pay.com"
    : "https://api.hit-pay.com";
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const apiKey = process.env.HITPAY_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "HITPAY_API_KEY is missing. Add it in Vercel Environment Variables." });
  }

  try {
    const { cart, discountCode } = req.body || {};

    if (!Array.isArray(cart) || cart.length === 0) {
      return res.status(400).json({ error: "Cart is empty" });
    }

    // 1. 服务器端重新计算商品小计（不信任前端传来的总价）
    const rawTotalCents = cart.reduce((sum, item) => {
      const price = Number(item.priceCents || item.price || 0);
      const qty = Number(item.quantity || item.qty || 1);
      return sum + price * qty;
    }, 0);

    if (rawTotalCents <= 0) {
      return res.status(400).json({ error: "Invalid cart total" });
    }

    // 2. 折扣码验证（继续用现有 Redis）
    let discountRecord = null;
    let discountKey = null;

    if (discountCode && typeof discountCode === "string") {
      discountKey = `discount:${discountCode.trim().toUpperCase()}`;
      try {
        const record = await kv.get(discountKey);
        if (record && !record.used) {
          discountRecord = record;
        }
      } catch (e) {
        console.warn("Discount lookup failed:", e.message);
      }
    }

    const hasValidDiscount = !!discountRecord && rawTotalCents > 0;
    let finalTotalCents = rawTotalCents;

    if (hasValidDiscount) {
      if (discountRecord.type === "percent") {
        finalTotalCents = Math.round(rawTotalCents * (1 - Number(discountRecord.value) / 100));
      } else if (discountRecord.type === "fixed") {
        // fixed value is in dollars (e.g. 5 = S$5)
        finalTotalCents = rawTotalCents - Math.round(Number(discountRecord.value) * 100);
      }
      finalTotalCents = Math.max(1, finalTotalCents);
    }

    // 3. 运费（用折扣后金额判断免运费）
    const shippingFeeCents =
      finalTotalCents >= FREE_SHIPPING_THRESHOLD_CENTS ? 0 : SHIPPING_FEE_CENTS;

    const chargeCents = finalTotalCents + shippingFeeCents;
    // HitPay amount 用「元」为单位，例如 12.80
    const amountDollars = (chargeCents / 100).toFixed(2);

    const origin = req.headers.origin || `https://${req.headers.host}`;

    // 订单说明（会显示在 HitPay 后台 / 付款页）
    const purposeParts = cart.map((item) => {
      const qty = Number(item.quantity || item.qty || 1);
      const name = item.name || "Item";
      const personalise = item.personalise ? ` [${item.personalise}]` : "";
      return qty > 1 ? `${name} x${qty}${personalise}` : `${name}${personalise}`;
    });
    if (shippingFeeCents > 0) purposeParts.push("Shipping");
    if (hasValidDiscount) purposeParts.push(`Discount: ${discountCode}`);
    const purpose = purposeParts.join(" | ").slice(0, 200);

    const referenceNumber = `JW-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;

    // 4. 调用 HitPay 创建 Payment Request
    const baseUrl = getHitPayBaseUrl(apiKey);
    const body = {
      amount: amountDollars,
      currency: "SGD",
      purpose,
      reference_number: referenceNumber,
      redirect_url: `${origin}/success.html`,
      // 不强制指定 payment_methods，使用 HitPay 后台已开启的付款方式
      // 若之后要指定，先在 Dashboard → Settings → Payment Methods 开启，例如:
      // payment_methods: ["paynow_online"]
    };

    const hitpayRes = await fetch(`${baseUrl}/v1/payment-requests`, {
      method: "POST",
      headers: {
        "X-BUSINESS-API-KEY": apiKey,
        "Content-Type": "application/json",
        "X-Requested-With": "XMLHttpRequest",
      },
      body: JSON.stringify(body),
    });

    const data = await hitpayRes.json().catch(() => ({}));

    if (!hitpayRes.ok) {
      console.error("HitPay error:", hitpayRes.status, data);
      const msg =
        data.message ||
        data.error ||
        (typeof data === "string" ? data : null) ||
        `HitPay request failed (${hitpayRes.status})`;
      return res.status(502).json({ error: msg });
    }

    if (!data.url) {
      console.error("HitPay response missing url:", data);
      return res.status(502).json({ error: "HitPay did not return a checkout URL" });
    }

    // 5. 标记折扣码已使用（与原来 Stripe 逻辑一致）
    if (hasValidDiscount && discountKey) {
      try {
        await kv.set(discountKey, {
          ...discountRecord,
          used: true,
          usedAt: Date.now(),
          hitpayPaymentRequestId: data.id,
          referenceNumber,
        });
      } catch (e) {
        console.warn("Failed to mark discount used:", e.message);
      }
    }

    return res.status(200).json({
      url: data.url,
      paymentRequestId: data.id,
      referenceNumber,
    });
  } catch (err) {
    console.error("Checkout error:", err);
    return res.status(500).json({ error: err.message || "Checkout failed" });
  }
};
