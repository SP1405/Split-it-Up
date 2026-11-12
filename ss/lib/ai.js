const { GoogleGenAI } = require("@google/genai");

// Tried in order: if a model is busy or errors, fall back to the next (faster, lighter) one.
const MODELS = [process.env.GEMINI_MODEL || "gemini-3.5-flash", "gemini-3.5-flash-lite"];

const PROMPT = `You are reading a photo of a restaurant or store receipt.
Return ONLY JSON in exactly this shape:
{"merchant": string, "items": [{"name": string, "quantity": number, "price": number}], "subtotal": number, "tax": number, "tip": number, "total": number}
Rules:
- "price" is the line total in dollars for that line (already multiplied by quantity).
- Do NOT include subtotal, tax, tip, total, payment, or change lines in "items".
- Use 0 for anything not printed on the receipt.
- Rewrite abbreviated item names so a normal person understands them (e.g. "CHKN SAND" -> "Chicken Sandwich").`;

const cents = (n) => Math.round((Number(n) || 0) * 100);

async function scanReceipt(base64, mimeType) {
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY in .env");
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

  let res, lastErr;
  for (const model of MODELS) {
    try {
      res = await ai.models.generateContent({
        model,
        contents: [{ role: "user", parts: [{ inlineData: { mimeType, data: base64 } }, { text: PROMPT }] }],
        config: {
          responseMimeType: "application/json",
          httpOptions: { timeout: 25000 }, // don't wait forever on a busy model
        },
      });
      break;
    } catch (err) {
      console.error(`Gemini ${model} failed:`, err.message.slice(0, 200));
      lastErr = err;
    }
  }
  if (!res) throw new Error("AI couldn't read this receipt — try again or use a clearer photo. (" + lastErr.message.slice(0, 120) + ")");

  const data = JSON.parse(res.text);

  // Split "2 x Beer $14" into two $7 beers so two different friends can each claim one.
  const items = [];
  for (const it of data.items || []) {
    const total = cents(it.price);
    if (!it.name || total <= 0) continue;
    const qty = Number.isInteger(it.quantity) && it.quantity > 1 && it.quantity <= 10 ? it.quantity : 1;
    const each = Math.floor(total / qty);
    for (let k = 0; k < qty; k++) {
      items.push({
        id: "i" + (items.length + 1),
        name: String(it.name),
        priceCents: k === qty - 1 ? total - each * (qty - 1) : each,
      });
    }
  }

  return {
    merchant: data.merchant || "Receipt",
    items,
    taxCents: cents(data.tax),
    tipCents: cents(data.tip),
    totalCents: cents(data.total),
  };
}

module.exports = { scanReceipt };
