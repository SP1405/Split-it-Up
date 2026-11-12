require("dotenv").config();
const path = require("path");
const express = require("express");
const { createOrder, captureOrder } = require("./lib/paypal");
const { scanReceipt } = require("./lib/ai");
const crypto = require("crypto");
const { getBill, saveBill } = require("./lib/db");


const app = express();
app.use(express.json({ limit: "10mb" })); // receipt photos are big
app.use(express.static(path.join(__dirname, "public")));

app.get("/api/config", (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID });
});

// AI: photo in, itemized receipt out
app.post("/api/scan", async (req, res) => {
  try {
    const { image, mimeType } = req.body;
    if (!image) return res.status(400).json({ error: "No image sent" });
    const receipt = await scanReceipt(image, mimeType || "image/jpeg");
    res.json(receipt);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// ---------- Bills ----------

// Money is always whole cents, never negative, max $10,000
const isCents = (n) => Number.isInteger(n) && n >= 0 && n <= 1000000;

// Host creates a bill from the (edited) scanned receipt
app.post("/api/bills", (req, res) => {
  const { hostName, merchant, items, taxCents, tipCents } = req.body;

  // Never trust the browser: check everything
  if (!hostName || !String(hostName).trim()) return res.status(400).json({ error: "Enter your name" });
  if (!Array.isArray(items) || items.length === 0 || items.length > 100)
    return res.status(400).json({ error: "Add at least one item" });
  for (const it of items) {
    if (!it || !String(it.name || "").trim() || !isCents(it.priceCents) || it.priceCents === 0)
      return res.status(400).json({ error: "Every item needs a name and a price" });
  }
  if (!isCents(taxCents) || !isCents(tipCents))
    return res.status(400).json({ error: "Tax and tip must be valid amounts" });

  const bill = {
    id: crypto.randomBytes(4).toString("hex"), // short random id, e.g. "9f2c41ab"
    hostName: String(hostName).trim().slice(0, 40),
    merchant: String(merchant || "Receipt").trim().slice(0, 80),
    // The server assigns item ids itself (i1, i2, ...)
    items: items.map((it, i) => ({
      id: "i" + (i + 1),
      name: String(it.name).trim().slice(0, 80),
      priceCents: it.priceCents,
    })),
    taxCents,
    tipCents,
    payments: [], // filled in Step 3 when friends pay
    createdAt: new Date().toISOString(),
  };
  saveBill(bill);
  res.json({ id: bill.id });
});

// Anyone with the link can read the bill (bill.html calls this)
app.get("/api/bills/:id", (req, res) => {
  const bill = getBill(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });
  res.json(bill);
});

// The shareable link: /b/9f2c41ab shows bill.html
app.get("/b/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "bill.html"));
});


app.post("/api/orders", async (req, res) => {
  try {
    const order = await createOrder("5.00", "SplitSnap test payment");
    res.json({ id: order.id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.post("/api/orders/:id/capture", async (req, res) => {
  try {
    const data = await captureOrder(req.params.id);
    res.json({ status: data.status, name: data.payer?.name?.given_name });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

app.listen(process.env.PORT || 3000, () => console.log("Open http://localhost:3000"));
