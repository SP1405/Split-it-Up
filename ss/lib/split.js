// How splitting works (all money is integer cents):
// - A friend claims items, each either whole or a share: split 1 = whole, 2 = half, 3 = third, 4 = quarter.
// - Every item counts as 12 "units" (12 divides evenly by 1, 2, 3 and 4), so we can add up
//   halves, thirds and quarters exactly with whole numbers and never over-sell an item.
// - Your share of tax and tip = (your item cents / bill item subtotal) x tax (or tip), rounded.
const UNITS = 12;
const SPLITS = [1, 2, 3, 4];

// How many units of each item are already taken (paid, or being paid right now)
function takenUnits(bill) {
  const taken = {};
  const add = (claims) => {
    for (const c of claims) taken[c.itemId] = (taken[c.itemId] || 0) + UNITS / c.split;
  };
  for (const p of bill.payments) add(p.claims);
  for (const o of Object.values(bill.pending || {})) if (o.capturing) add(o.claims);
  return taken;
}

// Check a friend's claims and work out exactly what they owe.
// Throws an Error with a friendly message if anything is wrong.
function priceClaims(bill, claims) {
  if (!Array.isArray(claims) || claims.length === 0) throw new Error("Pick at least one item");

  const taken = takenUnits(bill);
  const seen = new Set();
  const clean = [];
  let itemsCents = 0;

  for (const c of claims) {
    const item = bill.items.find((i) => i.id === c?.itemId);
    if (!item) throw new Error("Unknown item");
    if (seen.has(item.id)) throw new Error("Each item can only be picked once");
    seen.add(item.id);

    const split = Number(c.split);
    if (!SPLITS.includes(split)) throw new Error("Choose whole, 1/2, 1/3 or 1/4");
    if ((taken[item.id] || 0) + UNITS / split > UNITS)
      throw new Error(`Not enough of "${item.name}" left — someone already paid for it`);

    itemsCents += Math.round(item.priceCents / split);
    clean.push({ itemId: item.id, split });
  }

  const subtotal = bill.items.reduce((s, i) => s + i.priceCents, 0);
  const taxCents = Math.round((itemsCents / subtotal) * bill.taxCents);
  const tipCents = Math.round((itemsCents / subtotal) * bill.tipCents);

  return { claims: clean, itemsCents, taxCents, tipCents, totalCents: itemsCents + taxCents + tipCents };
}

module.exports = { priceClaims };
