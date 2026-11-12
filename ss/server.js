require("dotenv").config();
const path = require("path");
const express = require("express");
const { createOrder, captureOrder } = require("./lib/paypal");
const { scanReceipt } = require("./lib/ai");
const crypto = require("crypto");
const { getBill, saveBill } = require("./lib/db");
const { priceClaims } = require("./lib/split");



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
  const { pending, ...publicBill } = bill; // don't send unfinished orders to the browser
  res.json(publicBill);
});

// ---------- Paying your share (PayPal / Venmo) ----------

// Step A: friend clicks the PayPal or Venmo button.
// Browser sends ONLY { name, claims } — the server works out the amount itself.
app.post("/api/bills/:id/orders", async (req, res) => {
  try {
    const bill = getBill(req.params.id);
    if (!bill) return res.status(404).json({ error: "Bill not found" });

    const name = String(req.body.name || "").trim().slice(0, 40);
    if (!name) return res.status(400).json({ error: "Enter your name" });

    let share;
    try {
      share = priceClaims(bill, req.body.claims);
    } catch (err) {
      return res.status(400).json({ error: err.message });
    }
    if (share.totalCents < 1) return res.status(400).json({ error: "Amount is too small" });

    // Ask PayPal for an order for exactly this person's share
    const amount = (share.totalCents / 100).toFixed(2); // PayPal wants "12.34"
    const order = await createOrder(amount, `${name}'s share at ${bill.merchant}`.slice(0, 127));

    // Remember what this order is for, so capture can't be tricked into paying for other items
    bill.pending = bill.pending || {};
    bill.pending[order.id] = { name, claims: share.claims, totalCents: share.totalCents };
    saveBill(bill);

    res.json({ id: order.id, totalCents: share.totalCents });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Step B: friend approved the payment in the PayPal/Venmo popup -> take the money
app.post("/api/bills/:id/orders/:orderId/capture", async (req, res) => {
  const bill = getBill(req.params.id);
  if (!bill) return res.status(404).json({ error: "Bill not found" });

  const orderId = req.params.orderId;
  const order = bill.pending && Object.hasOwn(bill.pending, orderId) ? bill.pending[orderId] : null;
  if (!order) return res.status(404).json({ error: "Order not found" });
  if (order.capturing) return res.status(409).json({ error: "This payment is already being processed" });

  // Re-check: did someone else pay for these items while this person was in the popup?
  try {
    priceClaims(bill, order.claims);
  } catch (err) {
    delete bill.pending[orderId];
    saveBill(bill);
    return res.status(409).json({ error: err.message + ". You were not charged." });
  }

  order.capturing = true; // hold these items while we talk to PayPal
  try {
    const data = await captureOrder(orderId);
    if (data.status !== "COMPLETED") throw new Error("Payment not completed (" + data.status + ")");

    // Only now, after PayPal says COMPLETED, do we record the payment
    bill.payments.push({
      name: order.name,
      orderId,
      claims: order.claims,
      totalCents: order.totalCents,
      paidAt: new Date().toISOString(),
    });
    delete bill.pending[orderId];
    saveBill(bill);
    res.json({ status: "COMPLETED", totalCents: order.totalCents });
  } catch (err) {
    order.capturing = false;
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// The shareable link: /b/9f2c41ab shows bill.html
app.get("/b/:id", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "bill.html"));
});


app.post("/api/orders", async (req, res) => {
  try {
    const order = await createOrder("5.00", "Split It Up test payment");
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
