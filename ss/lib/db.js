// Tiny "database": bills live in memory and are saved to data/db.json
// so they survive a server restart. Good enough for a hackathon demo.
const fs = require("fs");
const path = require("path");

const DIR = path.join(__dirname, "..", "data");
const FILE = path.join(DIR, "db.json");

let db = { bills: {} };
try {
    db = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch {
    // first run: no file yet, start empty
}

function save() {
    fs.mkdirSync(DIR, { recursive: true });
    fs.writeFileSync(FILE, JSON.stringify(db, null, 2));
}

function getBill(id) {
    return Object.hasOwn(db.bills, id) ? db.bills[id] : undefined;
}

function saveBill(bill) {
    db.bills[bill.id] = bill;
    save();
    return bill;
}

module.exports = { getBill, saveBill };