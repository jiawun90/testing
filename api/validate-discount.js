// ============================================================
// POST /api/validate-discount
// Checks whether a discount code exists, is unused, and returns its
// value so the cart can preview the discount. This endpoint does NOT
// mark the code as used — redemption happens in create-checkout-session.js
// at the point a real Stripe Checkout session is created for it, so a
// person can "preview" a code without burning it just by typing it in.
//
// Setup required: see README.md "Discount codes" section for how to
// connect an Upstash Redis store to this project.
// ============================================================

const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ valid: false, message: "Method not allowed" });
  }

  const { code } = req.body || {};
  if (!code || typeof code !== "string") {
    return res.status(400).json({ valid: false, message: "Enter a code" });
  }

  const key = `discount:${code.trim().toUpperCase()}`;

  try {
    const record = await kv.get(key);

    if (!record) {
      return res.status(200).json({ valid: false, message: "Invalid code" });
    }
    if (record.used) {
      return res.status(200).json({ valid: false, message: "This code has already been used" });
    }

    return res.status(200).json({
      valid: true,
      type: record.type,
      value: record.value,
      label: record.label,
    });
  } catch (err) {
    console.error("validate-discount error:", err);
    return res.status(500).json({
      valid: false,
      message: "Could not check this code right now (is Upstash Redis connected? see README).",
    });
  }
};
