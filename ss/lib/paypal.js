const BASE = "https://api-m.sandbox.paypal.com";

async function getToken() {
  const auth = Buffer.from(
    process.env.PAYPAL_CLIENT_ID + ":" + process.env.PAYPAL_CLIENT_SECRET
  ).toString("base64");
  const res = await fetch(BASE + "/v1/oauth2/token", {
    method: "POST",
    headers: { Authorization: "Basic " + auth, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = await res.json();
  if (!res.ok) throw new Error("PayPal login failed: " + JSON.stringify(data));
  return data.access_token;
}

async function call(method, path, body) {
  const res = await fetch(BASE + path, {
    method,
    headers: { Authorization: "Bearer " + (await getToken()), "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = await res.json();
  if (!res.ok) throw new Error("PayPal error: " + JSON.stringify(data));
  return data;
}

function createOrder(amount, description) {
  return call("POST", "/v2/checkout/orders", {
    intent: "CAPTURE",
    purchase_units: [{ description, amount: { currency_code: "USD", value: amount } }],
  });
}

function captureOrder(orderId) {
  return call("POST", "/v2/checkout/orders/" + orderId + "/capture");
}

module.exports = { createOrder, captureOrder };
