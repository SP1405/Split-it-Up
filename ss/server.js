require("dotenv").config();
const express = require("express");
const app = express();

app.get("/", (req, res) => {
  const ok = !!process.env.PAYPAL_CLIENT_ID;
  res.send(`SplitSnap is running. PayPal keys loaded: ${ok}`);
});

app.listen(process.env.PORT || 3000, () =>
  console.log("Open http://localhost:3000")
);