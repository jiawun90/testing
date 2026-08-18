// ============================================================
// POST /api/generate-discount
// Creates brand-new, unique, single-use discount code(s) and stores them
// in Upstash Redis as unused. This is an ADMIN-ONLY endpoint — it is how
// *you* mint codes to hand out (e.g. a birthday party guest, a giveaway
// winner, a whole class). It is not called by the storefront.
//
// Protect it with a secret so strangers can't mint themselves free
// discounts: set an ADMIN_SECRET environment variable in Vercel, then
// call this endpoint with that same value in the x-admin-secret header.
//
// ---- Basic: one random code ----
//   curl -X POST https://YOUR_SITE/api/generate-discount \
//     -H "Content-Type: application/json" \
//     -H "x-admin-secret: YOUR_ADMIN_SECRET" \
//     -d '{"type":"percent","value":10,"recipient":"Alicia (birthday guest)"}'
//   Response: { "code": "A1B2C3D4", ... }
//
// ---- One specific code of your choosing ----
//   -d '{"type":"percent","value":10,"code":"ALICIA10","recipient":"Alicia"}'
//   Rejected with 409 if that code already exists.
//
// ---- A batch of N random codes, same discount for all ----
//   -d '{"type":"percent","value":10,"count":20,"recipient":"Class party favours"}'
//   Response: { "codes": [ {"code":"A1B2C3D4",...}, {"code":"E5F6G7H8",...}, ... ] }
//
// ---- One code per named person (auto-generated, one each) ----
//   -d '{"type":"percent","value":10,"recipients":["Alicia","Marcus","Zoe"]}'
//   Response: { "codes": [ {"code":"A1B2C3D4","recipient":"Alicia",...}, ... ] }
//
// ---- Sequential codes with your own prefix, e.g. JW001, JW002, JW003... ----
// Add a "prefix" field instead of relying on random codes. The number
// after the prefix keeps counting up every time you call this endpoint
// with that same prefix — call it once, get JW001; call it again
// (even days later, even in a different batch), get JW002, and so on.
// Combine with "count" or "recipients" to mint a whole run at once:
//   -d '{"type":"percent","value":10,"prefix":"JW","count":5}'
//   Response: { "codes": [ {"code":"JW001",...}, ..., {"code":"JW005",...} ] }
//
//   -d '{"type":"percent","value":10,"prefix":"JW","recipients":["Alicia","Marcus"]}'
//   Response: { "codes": [ {"code":"JW001","recipient":"Alicia",...}, {"code":"JW002","recipient":"Marcus",...} ] }
//
// Default padding is 3 digits (JW001). Add "padding" to change it, e.g.
// "padding": 4 → JW0001. "prefix" can't be combined with a custom "code".
//
// Give each code to ONE person. It will work exactly once, for any
// cart total, then stop working — even if the same person tries it again.
// ============================================================

const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});
const crypto = require("crypto");

// 生成一个"前缀 + 流水号"的code，例如 prefix="JW" → "JW001"、"JW002"...
// 用 Redis 的 INCR 保证每次呼叫拿到的数字一定是新的、不会重复，
// 这个计数器会持续累加，不会因为重新部署或换电脑而重置。
async function nextSequentialCode(prefix, padding) {
  const seqKey = `discount_seq:${prefix}`;
  const n = await kv.incr(seqKey);
  return `${prefix}${String(n).padStart(padding, "0")}`;
}

function buildRecord({ type, value, label, recipient }) {
  return {
    type,
    value,
    label: label || (type === "percent" ? `${value}% OFF` : `-S$${value.toFixed(2)}`),
    used: false,
    recipient: recipient || null,
    createdAt: Date.now(),
  };
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(500).json({ error: "ADMIN_SECRET is not set on the server." });
  }
  if (req.headers["x-admin-secret"] !== adminSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const {
      type = "percent",
      value = 10,
      label,
      recipient,
      code: customCode,
      count = 1,
      recipients,
      prefix,
      padding = 3,
    } = req.body || {};

    if (type !== "percent" && type !== "fixed") {
      return res.status(400).json({ error: "type must be 'percent' or 'fixed'" });
    }
    if (typeof value !== "number" || value <= 0) {
      return res.status(400).json({ error: "value must be a positive number" });
    }
    if (prefix && customCode) {
      return res.status(400).json({ error: "Can't use 'prefix' together with a custom 'code' — pick one." });
    }

    let cleanPrefix = null;
    if (prefix) {
      cleanPrefix = String(prefix).trim().toUpperCase();
      if (!/^[A-Z0-9_-]{1,12}$/.test(cleanPrefix)) {
        return res.status(400).json({
          error: "prefix must be 1–12 characters, letters/numbers/dashes/underscores only",
        });
      }
    }
    const cleanPadding = Number(padding) || 3;
    if (cleanPadding < 1 || cleanPadding > 8) {
      return res.status(400).json({ error: "padding must be between 1 and 8" });
    }

    // 决定"每一组code怎么产生"：优先顺序是 自订code > 前缀流水号 > 随机
    async function makeOneCode() {
      if (customCode && typeof customCode === "string") {
        const code = customCode.trim().toUpperCase();
        if (!/^[A-Z0-9_-]{3,32}$/.test(code)) {
          throw { httpStatus: 400, message: "Custom code must be 3–32 characters, letters/numbers/dashes/underscores only" };
        }
        const existing = await kv.get(`discount:${code}`);
        if (existing) {
          throw { httpStatus: 409, message: `Code "${code}" already exists. Choose a different one.` };
        }
        return code;
      }
      if (cleanPrefix) {
        return nextSequentialCode(cleanPrefix, cleanPadding);
      }
      // 都没指定的话，系统随机生成 8 位英数字代码，例如 "A1B2C3D4"
      return crypto.randomBytes(4).toString("hex").toUpperCase();
    }

    // ---- 模式一："recipients" 名单，一人生成一组专属code ----
    if (recipients) {
      if (!Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: "recipients must be a non-empty array of names" });
      }
      if (recipients.length > 100) {
        return res.status(400).json({ error: "recipients list can have at most 100 names at a time" });
      }
      if (customCode) {
        return res.status(400).json({ error: "Can't use a custom 'code' together with 'recipients' — each person needs their own auto-generated code." });
      }

      const results = [];
      for (const name of recipients) {
        const code = await makeOneCode();
        const record = buildRecord({ type, value, label, recipient: String(name).trim() });
        await kv.set(`discount:${code}`, record);
        results.push({ code, ...record });
      }
      return res.status(200).json({ codes: results });
    }

    // ---- 模式二：单一 code 或 "count" 批量生成 ----
    const batchSize = Number(count) || 1;
    if (batchSize < 1 || batchSize > 100) {
      return res.status(400).json({ error: "count must be between 1 and 100" });
    }
    if (customCode && batchSize > 1) {
      return res.status(400).json({ error: "Can't use a custom 'code' together with 'count' > 1 — custom codes are one at a time." });
    }

    const results = [];
    for (let i = 0; i < batchSize; i++) {
      const code = await makeOneCode();
      const record = buildRecord({ type, value, label, recipient });
      await kv.set(`discount:${code}`, record);
      results.push({ code, ...record });
    }

    // 只生成一个的话，回应格式是 { code, type, value, ... }
    // 生成多个的话，回应会是 { codes: [ {code,...}, {code,...}, ... ] }
    if (batchSize === 1) {
      return res.status(200).json(results[0]);
    }
    return res.status(200).json({ codes: results });
  } catch (err) {
    if (err && err.httpStatus) {
      return res.status(err.httpStatus).json({ error: err.message });
    }
    console.error("generate-discount error:", err);
    return res.status(500).json({ error: "Could not generate code (is Upstash Redis connected? see README)." });
  }
};
