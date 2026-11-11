require("dotenv").config();
const path = require("path");
const express = require("express");
const { createOrder, captureOrder } = require("./lib/paypal");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

// The Client ID is public (it's meant to be in the browser). The Secret never leaves the server.
app.get("/api/config", (req, res) => {
  res.json({ clientId: process.env.PAYPAL_CLIENT_ID });
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
