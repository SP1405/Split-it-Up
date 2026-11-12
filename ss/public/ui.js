// Split It Up UI helpers shared by every page: receipts and the AG Grid theme.
// Plain script, exposes window.SplitItUp.
(function () {
  const esc = (s) =>
    String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const money = (c) => "$" + ((c || 0) / 100).toFixed(2);

  // Stable small hash so the same bill always gets the same tilt
  function hash(str) {
    let h = 2166136261;
    for (const ch of String(str)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    return h >>> 0;
  }
  function tiltFor(seed, max = 2) { return ((hash(seed) % 1000) / 1000) * 2 * max - max; }

  // ---------- receipt ----------
  // Libre Barcode 39 needs *CODE* with A-Z 0-9 only
  function barcode(id) {
    return "*" + String(id || "SPLITITUP").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12) + "*";
  }

  /**
   * HTML for a receipt. bill: { id, merchant, date?, items:[{name, quantity?, priceCents}], taxCents, tipCents, totalCents? }
   * opts.tableSlot: put an empty element with this id instead of the item table (for AG Grid)
   */
  function receiptHTML(bill, opts = {}) {
    const items = bill.items || [];
    const itemsSum = items.reduce((s, i) => s + (i.priceCents || 0), 0);
    const total = bill.totalCents ?? itemsSum + (bill.taxCents || 0) + (bill.tipCents || 0);
    // "2026-11-10" parses as UTC midnight (= previous day in the US); read date-only strings as local
    const when = bill.date || bill.createdAt;
    const date = !when ? new Date()
      : /^\d{4}-\d{2}-\d{2}$/.test(when) ? new Date(when + "T00:00:00")
      : new Date(when);
    const dateStr = date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", year: "numeric" });
    const order = String(bill.id || "0001").toUpperCase().slice(0, 8);

    const rows = items
      .map(
        (i) => `<tr><td class="qty">${String(i.quantity || 1).padStart(2, "0")}</td>
          <td>${esc(i.name)}</td><td class="amt">${money(i.priceCents)}</td></tr>`
      )
      .join("");

    const table = opts.tableSlot
      ? `<div id="${esc(opts.tableSlot)}" class="receipt__grid"></div>`
      : `<table class="receipt__table">
          <thead><tr><th class="qty">QTY</th><th>ITEM</th><th class="amt">AMT</th></tr></thead>
          <tbody>${rows}</tbody></table>`;

    return `<article class="receipt">
      <p class="receipt__merchant">${esc(bill.merchant || "Receipt")}</p>
      <p class="receipt__sub">split with friends</p>
      <div class="receipt__meta"><span>ORDER #${esc(order)}</span></div>
      <div class="receipt__meta"><span>${esc(dateStr)}</span></div>
      <hr />
      ${table}
      <hr />
      <div class="receipt__row"><span>ITEM COUNT:</span><span>${items.length}</span></div>
      <div class="receipt__row"><span>SUBTOTAL:</span><span>${money(itemsSum)}</span></div>
      <div class="receipt__row"><span>TAX:</span><span>${money(bill.taxCents)}</span></div>
      <div class="receipt__row"><span>TIP:</span><span>${money(bill.tipCents)}</span></div>
      <hr />
      <div class="receipt__row receipt__total"><span>TOTAL:</span><span>${money(total)}</span></div>
      <p class="receipt__thanks">THANK YOU FOR SPLITTING!</p>
      <div class="receipt__barcode" aria-hidden="true">${esc(barcode(bill.id))}</div>
      <div class="receipt__brand">split it up</div>
    </article>`;
  }

  /** Render a receipt into a container. */
  function renderReceipt(container, bill, opts = {}) {
    container.classList.add("receipt-wrap");
    container.style.setProperty("--tilt", (opts.tilt ?? tiltFor(bill.id || bill.merchant)).toFixed(2) + "deg");
    container.innerHTML = receiptHTML(bill, opts);
  }

  // ---------- confetti + doodles scattered on the white canvas ----------
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  const STAR = "M50 10 L63.5 35.4 L91.8 40.4 L71.9 61.1 L75.9 89.6 L50 77 L24.1 89.6 L28.1 61.1 L8.2 40.4 L36.5 35.4Z";
  const HEART = "M50 88 C22 68 6 50 10 32 C14 14 38 10 50 28 C62 10 86 14 90 32 C94 50 78 68 50 88Z";
  const ink = 'fill="none" stroke="#1C1C1E" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"';

  const FILLED = {
    star: (c) => `<svg viewBox="0 0 100 100"><path d="${STAR}" fill="${c}" stroke="${c}" stroke-width="8" stroke-linejoin="round"/></svg>`,
    heart: (c) => `<svg viewBox="0 0 100 100"><path d="${HEART}" fill="${c}"/></svg>`,
    dot: (c) => `<svg viewBox="0 0 10 10"><circle cx="5" cy="5" r="5" fill="${c}"/></svg>`,
  };
  // hand-drawn black line doodles
  const DOODLES = [
    `<svg viewBox="0 0 100 100"><path d="M50 8 L61 39 L93 41 L66 59 L77 92 L50 71 L21 91 L33 58 L7 42 L40 37 Z" ${ink}/></svg>`,
    `<svg viewBox="0 0 100 100"><path d="M50 12 V88 M14 50 H86 M24 24 L76 76 M76 24 L24 76" ${ink} stroke-width="6"/></svg>`,
    `<svg viewBox="0 0 100 70"><path d="M18 58 Q4 58 6 46 Q8 34 22 38 Q24 20 42 24 Q52 8 68 22 Q88 18 88 38 Q98 50 84 58 Z" fill="#fff" stroke="#1C1C1E" stroke-width="3.5" stroke-linejoin="round"/></svg>`,
    `<svg viewBox="0 0 100 100"><path d="M38 78 V24 L78 14 V66" ${ink}/><ellipse cx="29" cy="78" rx="11" ry="8" fill="#1C1C1E"/><ellipse cx="69" cy="67" rx="11" ry="8" fill="#1C1C1E"/></svg>`,
    `<svg viewBox="0 0 100 100"><path d="M50 6 Q54 46 94 50 Q54 54 50 94 Q46 54 6 50 Q46 46 50 6Z" fill="#1C1C1E"/></svg>`,
  ];

  /**
   * Scatter pastel stars/hearts/dots plus a few black doodles in a fixed layer behind the page.
   * Same seed = same layout every load.
   */
  function confetti(opts = {}) {
    const layer = document.createElement("div");
    layer.className = "confetti";
    layer.setAttribute("aria-hidden", "true");
    const rand = rng(opts.seed ?? 7);
    const area = (window.innerWidth * window.innerHeight) / (1280 * 800);
    const n = Math.round((opts.count ?? 46) * Math.min(1.2, Math.max(0.45, area)));
    const colors = ["#9CCBFF", "#A8E6B0", "#FFE58F", "#FFB8C9", "#D9CCFF"];
    const place = (html, x, y, size, rot) => {
      const el = document.createElement("div");
      el.style.cssText = `left:${x}%;top:${y}%;width:${size}px;height:${size}px;rotate:${rot}deg`;
      el.innerHTML = html;
      layer.appendChild(el);
    };

    for (let i = 0; i < n; i++) {
      const r = rand();
      const c = colors[Math.floor(rand() * colors.length)];
      const x = rand() * 100, y = rand() * 100, rot = rand() * 60 - 30;
      if (r < 0.4) place(FILLED.dot(c), x, y, 6 + rand() * 6, 0);
      else if (r < 0.75) place(FILLED.star(c), x, y, 18 + rand() * 14, rot);
      else place(FILLED.heart(c === "#FFB8C9" ? c : "#FFB8C9"), x, y, 16 + rand() * 10, rot);
    }
    // doodles hug the left and right edges so they stay out of the content
    // fewer, smaller doodles on phones, where the content runs nearly edge to edge
    const narrow = window.innerWidth < 600;
    const doodles = opts.doodles ?? (narrow ? 3 : 6);
    for (let i = 0; i < doodles; i++) {
      const left = i % 2 === 0;
      const x = left ? 2 + rand() * 8 : 90 + rand() * 8;
      const size = narrow ? 22 + rand() * 12 : 36 + rand() * 34;
      place(DOODLES[i % DOODLES.length], x, 8 + rand() * 84, size, rand() * 40 - 20);
    }
    document.body.prepend(layer);
    return layer;
  }

  /** Turn "Welcome!" into mixed-size letters like "WelcOme!". */
  function bouncy(el) {
    const sizes = [1, 0.62, 0.7, 0.88, 1.12, 0.74, 0.9, 1];
    const text = el.textContent;
    el.setAttribute("aria-label", text);
    el.classList.add("bouncy");
    el.innerHTML = [...text]
      .map((ch, i) => ch === " " ? '<span aria-hidden="true">&nbsp;</span>'
        : `<span aria-hidden="true" style="font-size:${sizes[i % sizes.length]}em">${esc(ch)}</span>`)
      .join("");
  }

  // ---------- wallet tabs: Wallet / Scan / Receipt ----------
  const TAB_ICONS = {
    wallet: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="6" width="18" height="13" rx="3"/><path d="M3 10h18M16 14.5h2"/></svg>',
    scan: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 8.5A2.5 2.5 0 0 1 6.5 6H8l1.5-2h5L16 6h1.5A2.5 2.5 0 0 1 20 8.5v8a2.5 2.5 0 0 1-2.5 2.5h-11A2.5 2.5 0 0 1 4 16.5z"/><circle cx="12" cy="12.5" r="3.5"/></svg>',
    receipt: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h12v18l-2-1.5-2 1.5-2-1.5-2 1.5-2-1.5L6 21z"/><path d="M9 8h6M9 12h6M9 16h3"/></svg>',
  };

  /**
   * Render the tab bar into `el`. active: "wallet" | "scan" | "receipt".
   * billId: which bill the Receipt tab opens; if omitted, the newest saved bill.
   */
  async function tabs(el, active, billId) {
    const draw = (id) => {
      const t = [
        ["wallet", "Wallet", "/"],
        ["scan", "Scan", "/scan.html"],
        // the owner's Receipt tab opens the host dashboard (friends get /b/:id without tabs)
        ["receipt", "Receipt", id ? "/b/" + encodeURIComponent(id) + "/host" : null],
      ];
      el.className = "tabs";
      el.setAttribute("aria-label", "Wallet sections");
      el.innerHTML = t
        .map(([key, label, href]) => {
          const on = key === active;
          if (!href && !on) return `<span class="tab" aria-disabled="true" title="Scan a receipt first">${TAB_ICONS[key]}${label}</span>`;
          return `<a class="tab${on ? " is-active" : ""}" href="${href || "#"}"${on ? ' aria-current="page"' : ""}>${TAB_ICONS[key]}${label}</a>`;
        })
        .join("");
    };
    draw(billId);
    if (billId) return;
    try {
      const res = await fetch("/api/bills");
      const bills = res.ok ? await res.json() : [];
      if (bills.length) draw(bills[bills.length - 1].id);
    } catch {
      /* offline or static preview: leave the Receipt tab disabled */
    }
  }

  // ---------- AG Grid theme: looks printed on the receipt ----------
  function gridTheme() {
    if (!window.agGrid || !agGrid.themeQuartz) return undefined;
    return agGrid.themeQuartz.withParams({
      backgroundColor: "transparent",
      foregroundColor: "#36363A",
      textColor: "#36363A",
      accentColor: "#5AA9F0",
      fontFamily: "Space Mono, Courier New, monospace",
      headerFontFamily: "Space Mono, Courier New, monospace",
      fontSize: 13,
      headerFontSize: 13,
      headerFontWeight: 700,
      headerBackgroundColor: "transparent",
      headerTextColor: "#1C1C1E",
      oddRowBackgroundColor: "transparent",
      wrapperBorder: false,
      wrapperBorderRadius: 0,
      columnBorder: false,
      headerColumnBorder: false,
      headerRowBorder: { style: "dashed", width: 1.5, color: "rgba(54,54,58,0.5)" },
      rowBorder: { style: "dashed", width: 1, color: "rgba(54,54,58,0.28)" },
      rowHoverColor: "rgba(191, 227, 255, 0.35)",
      selectedRowBackgroundColor: "rgba(191, 227, 255, 0.75)",
      checkboxBorderRadius: 999,
      checkboxBorderWidth: 1.5,
      checkboxUncheckedBorderColor: "#1C1C1E",
      checkboxUncheckedBackgroundColor: "#FFFFFF",
      checkboxCheckedBackgroundColor: "#BFE3FF",
      checkboxCheckedBorderColor: "#1C1C1E",
      checkboxCheckedShapeColor: "#1C1C1E",
      inputBorder: { width: 1.5, color: "#1C1C1E" },
      inputFocusBorder: { width: 2, color: "#5AA9F0" },
      cellHorizontalPadding: 8,
      spacing: 6,
      rowHeight: 40,
      headerHeight: 36,
    });
  }

  window.SplitItUp = { esc, money, hash, tiltFor, receiptHTML, renderReceipt, gridTheme, barcode, confetti, bouncy, tabs };
})();
