// ============================================================
// GET /api/list-discounts
// ADMIN-ONLY. Lists every discount code you've generated, whether each
// one has been used yet, and who it was for (if you gave a recipient).
// Useful for checking "which codes are still live" or "did Alicia's
// code get used yet".
//
// Auth: same ADMIN_SECRET as generate-discount.js. You can pass it
// either as a header (safer) or as a ?secret= query param (handy for
// just pasting a URL straight into your browser address bar).
//
// ---- Simplest: see everything, newest first ----
//   curl "https://YOUR_SITE/api/list-discounts?secret=YOUR_ADMIN_SECRET"
//
// ---- Or with a header instead of a query param ----
//   curl https://YOUR_SITE/api/list-discounts \
//     -H "x-admin-secret: YOUR_ADMIN_SECRET"
//
// ---- Filter to only unused (still redeemable) codes ----
//   curl "https://YOUR_SITE/api/list-discounts?secret=YOUR_ADMIN_SECRET&used=false"
//
// ---- Filter to only already-used codes ----
//   curl "https://YOUR_SITE/api/list-discounts?secret=YOUR_ADMIN_SECRET&used=true"
//
// ---- Filter to codes starting with a prefix, e.g. all "JW..." codes ----
//   curl "https://YOUR_SITE/api/list-discounts?secret=YOUR_ADMIN_SECRET&prefix=JW"
//
// Response:
//   {
//     "summary": { "total": 12, "used": 4, "unused": 8 },
//     "codes": [
//       { "code": "JW003", "used": false, "recipient": "Zoe", ... },
//       { "code": "JW002", "used": true,  "recipient": "Marcus", ... },
//       ...
//     ]
//   }
// Sorted newest-created first.
// ============================================================

const { Redis } = require("@upstash/redis");
const kv = new Redis({
  url: process.env.KV_REST_API_URL,
  token: process.env.KV_REST_API_TOKEN,
});

module.exports = async (req, res) => {
  if (req.method !== "GET" && req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return res.status(500).json({ error: "ADMIN_SECRET is not set on the server." });
  }
  const providedSecret = req.headers["x-admin-secret"] || req.query?.secret;
  if (providedSecret !== adminSecret) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const usedFilter = req.query?.used; // "true" | "false" | undefined
    const prefixFilter = req.query?.prefix ? String(req.query.prefix).trim().toUpperCase() : null;

    // 找出所有折扣码的key（"discount:XXXX"），排除掉流水号计数器的key（"discount_seq:..."）
    const keys = (await kv.keys("discount:*")).filter((k) => !k.startsWith("discount_seq:"));

    if (keys.length === 0) {
      return res.status(200).json({ summary: { total: 0, used: 0, unused: 0 }, codes: [] });
    }

    // 批次拿出所有record（比逐一 get 快很多）
    const records = await kv.mget(...keys);

    let codes = keys.map((key, i) => ({
      code: key.replace(/^discount:/, ""),
      ...records[i],
    })).filter((c) => c.type); // 过滤掉万一有的空值/坏资料

    if (usedFilter === "true") codes = codes.filter((c) => c.used === true);
    if (usedFilter === "false") codes = codes.filter((c) => c.used === false);
    if (prefixFilter) codes = codes.filter((c) => c.code.startsWith(prefixFilter));

    codes.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));

    const total = codes.length;
    const used = codes.filter((c) => c.used).length;

    return res.status(200).json({
      summary: { total, used, unused: total - used },
      codes,
    });
  } catch (err) {
    console.error("list-discounts error:", err);
    return res.status(500).json({ error: "Could not list codes (is Upstash Redis connected? see README)." });
  }
};
