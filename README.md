# Split It Up 🧾

**Snap a receipt → AI itemizes it → share a link → each friend taps what they had and pays their exact share with PayPal.**

🔗 **Live demo:** https://split-it-up-iao5.onrender.com
🎥 **Demo video:** https://www.youtube.com/watch?v=WygiXBxGBjU

> Built for the **"Build what's next with PayPal and AI"** hackathon. All payments run in the **PayPal sandbox**, so no real money moves.

---

## The problem

When friends go out, one person usually ends up paying the bill, and on a big night out it's often several bills: dinner, then drinks, then dessert. By the end of the night nobody remembers who paid for what or who had which items. Someone has to sit down later, dig through receipts and texts, work out what everyone owes, and then chase people for weeks to get paid back.

Split It Up handles it as it happens. Each time someone pays, they snap the receipt and share a link, and everyone pays for exactly what they had right there, so nobody has to sort it out later.

## What Split It Up does

1. **Snap the receipt.** The host takes a photo. **Google Gemini** reads it and returns every line item, tax, and tip. Lines like "2 × Huevos Rancheros $39" are split into separate items so two people can each claim one.
2. **Check and share.** The host fixes anything the AI misread, picks a tip (15 / 18 / 20%), and gets a share link plus a QR code.
3. **Friends tap what they had.** Each friend opens the link, enters their name, and taps their items. Shared something? Take ½, ⅓ or ¼ of it.
4. **Everyone pays their exact share.** That's their items plus their **proportional share of tax and tip**, paid with **PayPal** through PayPal Checkout.
5. **The host watches it fill up live.** The host dashboard updates every few seconds: who's paid, what's left, and items greyed out once they're covered.

## Try it (for judges)

1. Open the **[live demo](https://split-it-up-iao5.onrender.com)**. The free server may take **~50 seconds to wake up** on the first visit.
2. Tap **Scan** and upload any restaurant receipt photo.
3. Review the items, add a tip, enter your name, and **create the bill**.
4. Open the share link (or scan the QR code with your phone), tick some items, and pay with the **PayPal button**:
   - **Sandbox buyer login:** `TODO: sandbox personal email` / `TODO: password`
5. Watch the payment appear on the host dashboard (`/b/<id>/host`).

> Bills are stored on the free server's temporary disk, so they reset when the server sleeps or redeploys. Create a fresh bill rather than reusing an old link.

## Tools used

| Tool | What it does in Split It Up |
|---|---|
| **Google Gemini 3.5 Flash** (`@google/genai`), with **Gemini 3.5 Flash-Lite** as an automatic fallback | Reads the receipt photo and returns structured JSON: merchant, line items with prices, tax, tip, and total. It also expands abbreviations ("CHKN SAND" → "Chicken Sandwich"). If the main model is busy, the server retries with Flash-Lite. |
| **PayPal Orders v2 REST API** | The server creates an order for each friend's exact share, then captures it after they approve. |
| **PayPal JavaScript SDK (Smart Buttons)** | The PayPal checkout button on the bill page. |
| **Node.js + Express** | API server and static hosting. |
| **Plain HTML / CSS / JavaScript** | No framework and no build step. |
| **AG Grid Community**, **qrcode-generator** | Item tables, and QR codes for the share link. |
| **Render** | Hosting for the live demo. |

## How the money stays correct

Judges and friends both need to trust the numbers, so:

- **All money is integer cents** on the server, and is only formatted as dollars for display.
- **The server computes every amount.** The browser only sends `{ name, claims: [{ itemId, split }] }`. It never sends a price or total, so editing the page can't change what you pay.
- **Tax and tip are proportional:** your share = (your item cents ÷ bill item subtotal) × tax (or tip).
- **No item can be over-claimed.** Each item counts as 12 "units", so ½ = 6, ⅓ = 4 and ¼ = 3 add up exactly with whole numbers, with no floating-point drift. Claims are validated when the order is created **and again right before capture**. If someone else paid for the item while you were in the PayPal popup, you're told and **not charged**.
- **A payment is recorded only after PayPal returns `COMPLETED`** and the captured amount matches the share exactly.

## How it works

```
Browser                         Server (Express)                         External
───────                         ────────────────                         ────────
scan.html  ── photo ──────────▶ POST /api/scan ─────────────────────────▶ Gemini (receipt → JSON)
           ── edited items ───▶ POST /api/bills            → saves bill, returns id
bill.html  ── name + claims ──▶ POST /api/bills/:id/orders → computes share ▶ PayPal: create order
           (PayPal popup: friend approves)
           ── approved ───────▶ POST /api/bills/:id/orders/:oid/capture  ▶ PayPal: capture
host.html  ── every 3s ───────▶ GET  /api/bills/:id        → payments, totals, who's paying
```

| Route | Purpose |
|---|---|
| `GET /` | Wallet home screen |
| `GET /scan.html` | Scan a receipt and create a bill |
| `GET /b/:id` | Shareable bill page: friends claim items and pay |
| `GET /b/:id/host` | Host dashboard: live "who's paid" |
| `POST /api/scan` | Receipt photo → itemized receipt (Gemini) |
| `GET /api/bills`, `POST /api/bills`, `GET /api/bills/:id` | List, create, and read bills |
| `POST /api/bills/:id/orders` | Create a PayPal order for one person's share |
| `POST /api/bills/:id/orders/:orderId/capture` | Capture the payment and record it |

## Run it locally

You need **Node.js 20+**, a **PayPal developer account** (sandbox app credentials), and a **Gemini API key** (free at [Google AI Studio](https://aistudio.google.com/apikey)).

```bash
git clone https://github.com/swathipappoppula/Split-it-Up.git
cd Split-it-Up/ss
npm install
```

Create `ss/.env`:

```
PAYPAL_CLIENT_ID=your_sandbox_client_id
PAYPAL_CLIENT_SECRET=your_sandbox_client_secret
GEMINI_API_KEY=your_gemini_key
PORT=3000
# optional: GEMINI_MODEL=gemini-3.5-flash
```

```bash
npm start
```

Open http://localhost:3000. Pay with a **sandbox Personal account** from the PayPal Developer Dashboard (Testing Tools → Sandbox Accounts).

> On Brave, turn Shields off for the site if the PayPal buttons don't appear.

## Project structure

```
ss/
├── server.js          Express app and all API routes
├── lib/
│   ├── ai.js          Gemini receipt scanning (with model fallback)
│   ├── paypal.js      PayPal OAuth, create order, capture order
│   ├── split.js       Share maths: 12-unit splits, proportional tax & tip, validation
│   └── db.js          Bills in memory, persisted to data/db.json
└── public/
    ├── index.html     Wallet home
    ├── scan.html      Scan & edit receipt
    ├── bill.html      Friend's claim & pay page
    ├── host.html      Host's live dashboard
    ├── styles.css     Design system
    └── ui.js          Shared UI helpers
```

## What's next

- **Natural-language claiming:** type "I had the latte and split the hashbrowns with Sam" and Gemini ticks the boxes for you.
- Pay the host directly (PayPal `payee`), so money goes straight to whoever fronted the bill.
- A real database so bills last forever.

## License

[MIT](LICENSE)
