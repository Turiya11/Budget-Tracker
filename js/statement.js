/*
 * Reads bank statements (Excel / CSV downloads from Indian banks) into transactions.
 * Finds the header row and columns by name, so it works with HDFC, ICICI, SBI, Axis, Kotak
 * and most other banks without per-bank code. Pure module: safe in Node tests.
 */
import { vpaName } from "./parser.js";
import { categorize } from "./categories.js";
import { pad, uid } from "./format.js";

const MAX_ROWS = 3000;

/* ---------- cells ---------- */

function norm(cell) {
  return String(cell ?? "").toLowerCase().replace(/[^a-z0-9/ ]+/g, " ").replace(/\s+/g, " ").trim();
}

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12 };

function okDate(y, m, d) {
  if (y < 100) y += 2000;
  if (!(m >= 1 && m <= 12 && d >= 1 && d <= 31 && y >= 2000 && y <= 2100)) return null;
  return { y, m, d };
}

/** Statement date cell → "YYYY-MM-DDTHH:mm", or null. Indian order (day first). */
export function parseStatementDate(v) {
  let p = null;
  let hh = 12;
  let mm = 0;
  if (v instanceof Date && !isNaN(v)) {
    p = okDate(v.getFullYear(), v.getMonth() + 1, v.getDate());
  } else if (typeof v === "number") {
    // Excel serial date (1900 system). 36526 = 1 Jan 2000; a fraction is the time of day.
    if (v < 36526 || v > 73051) return null;
    const ms = Math.round((v - 25569) * 86400000);
    const d = new Date(ms);
    p = okDate(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate());
    if (v % 1) {
      hh = d.getUTCHours();
      mm = d.getUTCMinutes();
    }
  } else {
    const s = String(v ?? "").trim();
    let m;
    if ((m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/))) p = okDate(+m[1], +m[2], +m[3]);
    else if ((m = s.match(/^(\d{1,2})[/\-. ](\d{1,2})[/\-. ](\d{2}|\d{4})(?!\d)/))) p = okDate(+m[3], +m[2], +m[1]);
    else if ((m = s.match(/^(\d{1,2})[/\-. ]?([a-z]{3,9})[/\-., ]+(\d{2}|\d{4})(?!\d)/i))) {
      const mon = MONTHS[m[2].toLowerCase().slice(0, 4)] || MONTHS[m[2].toLowerCase().slice(0, 3)];
      if (mon) p = okDate(+m[3], mon, +m[1]);
    }
    const t = s.match(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s*(am|pm)?/i);
    if (p && t) {
      hh = +t[1] % 24;
      mm = +t[2] % 60;
      if (t[3]) hh = (hh % 12) + (/pm/i.test(t[3]) ? 12 : 0);
    }
  }
  if (!p) return null;
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(hh)}:${pad(mm)}`;
}

/** Amount cell → {v, dc} where dc is "dr", "cr" or "" (from a suffix like "1,200.00 Dr"). */
export function parseAmount(v) {
  if (typeof v === "number") return { v, dc: "" };
  const s = String(v ?? "").trim();
  if (!s) return { v: 0, dc: "" };
  const dc = /\b(dr|debit)\.?\)?$/i.test(s) ? "dr" : /\b(cr|credit)\.?\)?$/i.test(s) ? "cr" : "";
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/^(?:rs\.?|inr|₹)\s*/i, ""));
  const n = parseFloat(s.replace(/[^0-9.]/g, ""));
  if (!isFinite(n)) return { v: 0, dc };
  return { v: neg ? -n : n, dc };
}

/* ---------- header detection ---------- */

function colKind(h) {
  if (!h) return null;
  if (/^(dr ?\/ ?cr|cr ?\/ ?dr|debit ?\/ ?credit|credit ?\/ ?debit|type|txn type|transaction type|d ?\/ ?c|c ?\/ ?d)$/.test(h)) return "drcr";
  if (/balance|^bal\b/.test(h)) return "balance";
  if (/withdraw|^debits?\b|debit amount|^dr\b|amount ?\(?dr\)?$|^paid out/.test(h)) return "debit";
  if (/deposit|^credits?\b|credit amount|^cr\b|amount ?\(?cr\)?$|^paid in/.test(h)) return "credit";
  if (/^(txn |transaction |tran )?amount|^amt\b|^amount/.test(h)) return "amount";
  if (/narration|description|particulars|remarks|details|^transaction$/.test(h)) return "desc";
  if (/chq|cheque|ref|utr/.test(h)) return "ref";
  if (/\b(date|dt)\b/.test(h)) {
    if (/value/.test(h)) return "vdate";
    return "date";
  }
  return null;
}

/** Finds the header row and column positions. Returns null when the sheet doesn't look like a statement. */
export function findColumns(rows) {
  const limit = Math.min(rows.length, 80);
  for (let r = 0; r < limit; r++) {
    const row = rows[r] || [];
    const cols = {};
    row.forEach((cell, i) => {
      const k = colKind(norm(cell));
      if (!k) return;
      // Keep the first of each kind, except a "Dr/Cr" after the amount column (Kotak puts one after balance too).
      if (cols[k] === undefined) cols[k] = i;
    });
    if (cols.date === undefined && cols.vdate !== undefined) cols.date = cols.vdate;
    const hasMoney = (cols.debit !== undefined && cols.credit !== undefined) || cols.amount !== undefined;
    if (cols.date !== undefined && cols.desc !== undefined && hasMoney) return { header: r, ...cols };
  }
  return null;
}

/* ---------- narration ---------- */

const STOP = new Set([
  "upi", "dr", "cr", "p2m", "p2a", "payment", "payments", "pay", "paid", "to", "from", "by", "transfer", "trf", "tfr",
  "imps", "neft", "rtgs", "pos", "ach", "nach", "ecs", "ecom", "purchase", "txn", "ref", "no", "sent", "using", "via",
  "na", "nil", "mb", "ib", "inb", "mob", "bil", "onl", "bill", "pymt", "collect", "request", "upiintent", "upi intent",
  "debit", "credit", "card", "visa", "rupay", "mastercard", "ltd", "india", "bank", "paytm", "phonepe", "gpay", "google",
  "yes", "icici", "hdfc", "sbi", "axis", "kotak", "ybl", "okicici", "okhdfcbank", "okaxis", "oksbi", "ibl", "axl", "apl"
]);
const BANK_CODE = /^(yesb|icic|hdfc|sbin|utib|kkbk|pytm|airp|barb|cnrb|punb|idfb|indb|fdrl|ubin|aubl|ioba|ibkl|kvbl|rbl|ratn|mahb|cbin|idib|ucba|bkid|psib|esfb|jsfb|ujvn|fino)/i;

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s.&'-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
}

function goodToken(tok) {
  const t = tok.trim();
  if (t.length < 3 || /@/.test(t)) return false;
  if (!/[a-z]{3}/i.test(t)) return false;
  if (/^[a-z]{4}0[a-z0-9]{6}$/i.test(t)) return false; // IFSC
  if (BANK_CODE.test(t) && t.length <= 11 && /\d/.test(t)) return false;
  if (/^[a-z]{4}$/i.test(t) && BANK_CODE.test(t)) return false;
  const words = t.toLowerCase().split(/\s+/).filter((w) => !/^[\dx*]+$/.test(w));
  if (!words.length || words.every((w) => STOP.has(w) || w.length < 2)) return false;
  return true;
}

function cleanToken(tok) {
  let s = tok
    .replace(/\b\d[\dx*]{5,}\b/gi, " ") // card / account numbers
    .replace(/^(?:(?:pos|ecom|upi|to|by|from|trf|transfer|imps|neft|rtgs|nach|ach|dr|cr|bil|onl|ib|mb)\b[\s.]*)+/i, "")
    .replace(/\s+/g, " ")
    .trim();
  if (s === s.toUpperCase() || s === s.toLowerCase()) s = titleCase(s);
  return s.slice(0, 40);
}

/** Pulls payee, UPI ID, reference and mode out of a statement narration. */
export function narrationInfo(text, type) {
  const s = String(text || "").replace(/\s+/g, " ").trim();
  const vpaM = s.match(/([\w.]+@[a-z][a-z0-9.]{1,})/i);
  const vpa = vpaM ? vpaM[1].toLowerCase().replace(/[.]+$/, "") : "";
  const refM = s.match(/(?<!\d)(\d{12})(?!\d)/);
  let mode = "Bank";
  if (/\bupi\b/i.test(s) || vpa) mode = "UPI";
  else if (/\b(nwd|awb|atw|atm|cash wdl|cash withdrawal)\b/i.test(s)) mode = "ATM";
  else if (/\b(pos|ecom|card|vps|ips|me dc|vis)\b/i.test(s)) mode = "Card";
  else if (/\b(nach|ach|ecs)\b/i.test(s)) mode = "NACH";
  else if (/\b(neft|imps|rtgs)\b/i.test(s)) mode = s.match(/\b(neft|imps|rtgs)\b/i)[1].toUpperCase();

  let merchant = "";
  if (mode === "ATM") merchant = "ATM withdrawal";
  else {
    const tokens = s.split(/\s*[/|:*]\s*|\s*-+\s*|\s{2,}/);
    for (const tok of tokens) {
      if (goodToken(tok)) {
        merchant = cleanToken(tok);
        if (merchant.length >= 3) break;
        merchant = "";
      }
    }
  }
  if (!merchant && vpa) merchant = vpaName(vpa);
  if (!merchant) merchant = type === "credit" ? "Money received" : "Payment";
  const local = vpa ? vpa.split("@")[0] : "";
  const p2a = /upi\/p2a\//i.test(s) || /^\+?\d{10,12}$/.test(local);
  return { merchant, vpa, ref: refM ? refM[1] : "", mode, p2a };
}

/* ---------- rows → transactions ---------- */

function cell(row, i) {
  return i === undefined ? "" : row[i];
}

/**
 * Parses statement rows (array of arrays, as from a spreadsheet).
 * Returns {ok: true, items: [...], skipped} or {ok: false, reason}.
 * Each item: {date, type, amount, narration, balance, merchant, vpa, ref, mode, p2a, key}
 */
export function parseStatementRows(rows) {
  if (!Array.isArray(rows) || !rows.length) return { ok: false, reason: "The file is empty." };
  const cols = findColumns(rows);
  if (!cols) {
    return { ok: false, reason: "Couldn't find the transaction table. Download the statement as Excel or CSV and try again." };
  }
  const items = [];
  let skipped = 0;
  for (let r = cols.header + 1; r < rows.length && items.length < MAX_ROWS; r++) {
    const row = rows[r] || [];
    // Skip an "Opening balance" first row (Kotak); stop at the summary block some banks put under the table.
    if (row.some((c) => /^(statement summary|opening balance|closing balance|total|grand total)\b/i.test(String(c ?? "").trim()))) {
      if (items.length) break;
      continue;
    }
    const rawDate = cell(row, cols.date);
    // A bare number in the date column only counts as a date on a row with a description.
    const date = typeof rawDate === "number" && !String(cell(row, cols.desc) ?? "").trim() ? null : parseStatementDate(rawDate);
    if (!date) {
      if (row.some((c) => String(c ?? "").trim())) skipped++;
      continue;
    }
    let type = "";
    let amount = 0;
    if (cols.debit !== undefined || cols.credit !== undefined) {
      const d = parseAmount(cell(row, cols.debit)).v;
      const c = parseAmount(cell(row, cols.credit)).v;
      if (Math.abs(d) > 0) { type = "debit"; amount = Math.abs(d); }
      else if (Math.abs(c) > 0) { type = "credit"; amount = Math.abs(c); }
    }
    if (!type && cols.amount !== undefined) {
      const a = parseAmount(cell(row, cols.amount));
      const flag = norm(cell(row, cols.drcr));
      amount = Math.abs(a.v);
      if (/^(d|dr|debit|withdrawal)\b/.test(flag) || a.dc === "dr") type = "debit";
      else if (/^(c|cr|credit|deposit)\b/.test(flag) || a.dc === "cr") type = "credit";
      else if (a.v < 0) type = "debit";
      else if (a.v > 0) type = cols.drcr === undefined ? "credit" : "";
    }
    if (!type || !(amount > 0)) {
      skipped++;
      continue;
    }
    amount = Math.round(amount * 100) / 100;
    const narration = String(cell(row, cols.desc) ?? "").replace(/\s+/g, " ").trim();
    const refCell = String(cell(row, cols.ref) ?? "").trim();
    const balance = cell(row, cols.balance);
    const info = narrationInfo(narration, type);
    if (!info.ref && /^\d{12}$/.test(refCell.replace(/^0+(?=\d{12}$)/, ""))) info.ref = refCell.slice(-12);
    items.push({
      date,
      type,
      amount,
      narration,
      balance: balance === "" || balance === undefined ? "" : String(balance),
      ...info,
      key: [date.slice(0, 10), type, amount.toFixed(2), narration.toLowerCase(), String(balance ?? "")].join("|")
    });
  }
  if (!items.length) return { ok: false, reason: "Found the table, but no transactions in it." };
  return { ok: true, items, skipped };
}

/**
 * Reads a statement file with SheetJS. Tries every sheet and keeps the first one that parses.
 * `XLSX` is passed in so this module stays dependency-free.
 */
export function parseStatementFile(XLSX, data) {
  // raw: true keeps "05/11/2026" as text in CSVs, so it isn't misread as 11 May (US order).
  const wb = XLSX.read(data, { type: "array", raw: true, cellDates: false, dense: true });
  let first = null;
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "", blankrows: false });
    const res = parseStatementRows(rows);
    if (res.ok) return res;
    first = first || res;
  }
  return first || { ok: false, reason: "The file is empty." };
}

/* ---------- matching against what's already logged ---------- */

function dayDiff(a, b) {
  const [ya, ma, da] = a.slice(0, 10).split("-").map(Number);
  const [yb, mb, db] = b.slice(0, 10).split("-").map(Number);
  return Math.abs(Date.UTC(ya, ma - 1, da) - Date.UTC(yb, mb - 1, db)) / 86400000;
}

/**
 * For each statement item, finds a transaction already in the app that is the same payment
 * (same statement row, same UPI reference, or same amount and direction within a day).
 * Each existing transaction matches at most one item. Returns an array of txn ids (or null).
 */
export function matchExisting(transactions, items) {
  const used = new Set();
  const byKey = new Map();
  const byRef = new Map();
  for (const t of transactions) {
    if (t.stmtKey) byKey.set(t.stmtKey, t);
    if (t.ref) byRef.set(t.ref + "|" + Number(t.amount).toFixed(2), t);
  }
  const out = items.map((it) => {
    const k = byKey.get(it.key);
    if (k && !used.has(k.id)) { used.add(k.id); return k.id; }
    const r = it.ref && byRef.get(it.ref + "|" + it.amount.toFixed(2));
    if (r && !used.has(r.id)) { used.add(r.id); return r.id; }
    return null;
  });
  // Looser pass: same direction and amount within a day (manual entries, SMS with no reference).
  items.forEach((it, i) => {
    if (out[i]) return;
    const t = transactions.find((t) => !used.has(t.id) && !t.stmtKey && t.type === it.type &&
      Math.abs(Number(t.amount) - it.amount) < 0.005 && dayDiff(String(t.date), it.date) <= 1);
    if (t) { used.add(t.id); out[i] = t.id; }
  });
  return out;
}

/** Statement item → app transaction. */
export function txnFromStatement(item, rules = []) {
  const txn = {
    id: uid(),
    type: item.type,
    amount: item.amount,
    merchant: item.merchant,
    vpa: item.vpa,
    account: "",
    bank: "",
    ref: item.ref,
    mode: item.mode,
    p2a: item.p2a,
    date: item.date,
    note: "",
    raw: item.narration,
    source: "statement",
    stmtKey: item.key,
    excluded: false,
    reviewed: false
  };
  txn.category = categorize(txn, rules);
  return txn;
}
