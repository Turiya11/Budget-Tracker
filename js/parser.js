/*
 * Reads Indian bank / UPI transaction SMS and returns a structured transaction.
 * Handles the common formats used by HDFC, ICICI, SBI, Axis, Kotak and most other banks.
 * Pure function: no DOM, safe in Node tests.
 */

const AMOUNT_RE = /(?:rs\.?|inr|₹)\s*:?\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/gi;
const AMOUNT_BARE_RE = /(?:debited|credited)\s+(?:by|with|for)\s+([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i;

const DEBIT_RE = /\b(debited|debit(?:ed)? for|sent|spent|paid|withdrawn|withdrawal|purchase[d]?|txn of|transferred|deducted)\b/i;
const CREDIT_RE = /\b(credited|received|deposited|refund(?:ed)?|reversed|reversal|cashback)\b/i;
const IGNORE_RE = /\b(otp|one[- ]time password|verification code|will be debited|to be debited|is due|due on|due date|amount due|requested|collect request|failed|declined|unsuccessful|insufficient|mandate (?:created|registered|set ?up)|autopay (?:set|registered|setup)|e-?mandate)\b/i;

const BANKS = [
  ["HDFC", /hdfc/i], ["ICICI", /icici/i], ["SBI", /\bsbi\b|state bank/i], ["Axis", /axis/i],
  ["Kotak", /kotak/i], ["Yes Bank", /yes ?bank|yesbnk/i], ["IDFC First", /idfc/i], ["IndusInd", /indusind/i],
  ["PNB", /\bpnb\b|punjab national/i], ["Bank of Baroda", /baroda|\bbob\b/i], ["Canara", /canara/i],
  ["Union Bank", /union bank|unionb/i], ["Federal", /federal/i], ["AU Bank", /\bau small|aubank/i],
  ["Paytm Bank", /paytm payments bank|ppbl/i], ["Airtel Bank", /airtel payments bank/i], ["IDBI", /idbi/i]
];

const DEBIT_MERCHANT = [
  /\bto\s+vpa\s+([\w.\-]+@[\w.\-]+)/i,
  /\btrf\s+to\s+(.+?)\s+(?:ref(?:no)?|on|upi)\b/i,
  /;\s*([^;]+?)\s+credited\b/i,
  /\bupi\/p2[ma]\/\d+\/([^\/\n]+?)(?:\/|\n|$)/i,
  /\bto\s+([a-z0-9][\w .&'@\-]*?)\s+on\s+\d/i,
  /\bto\s+([\w.\-]+@[\w.\-]+)/i,
  /\bat\s+([a-z0-9][\w .&'*\-]*?)\s+(?:on|via|ref|txn|for)\b/i,
  /\b([\w.\-]+@[a-z]{2,})\b/i
];
const CREDIT_MERCHANT = [
  /\bby\s+(?:a\/c\s+linked\s+to\s+)?vpa\s+([\w.\-]+@[\w.\-]+)/i,
  /\bfrom\s+vpa\s+([\w.\-]+@[\w.\-]+)/i,
  /\bfrom\s+([a-z0-9][\w .&'@\-]*?)(?:\s+(?:on|ref|via|upi|\()|[.;]|$)/i,
  /\b([\w.\-]+@[a-z]{2,})\b/i
];
const NOT_A_NAME = /^(?:(?:a\/c|ac|acct|account|your|you|bank|card)\b|xx|\*)/i;

function titleCase(s) {
  return s.toLowerCase().replace(/(^|[\s.&'-])([a-z])/g, (m, p, c) => p + c.toUpperCase());
}

export function vpaName(vpa) {
  const local = String(vpa).split("@")[0];
  if (/^\+?\d{10,12}$/.test(local)) return "UPI ••" + local.slice(-4);
  let n = local
    .replace(/^(paytmqr|bharatpe|q\d+|pay|upi|gpay|phonepe|mab)[._-]+/i, "")
    .replace(/[._-]+/g, " ")
    .replace(/\b\d{4,}\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return n ? titleCase(n) : "UPI payment";
}

function cleanName(raw) {
  let s = String(raw || "").replace(/\s+/g, " ").trim().replace(/[.,;:\-]+$/, "").trim();
  if (/@/.test(s)) return vpaName(s);
  if (!s || NOT_A_NAME.test(s)) return "";
  if (s === s.toUpperCase() || s === s.toLowerCase()) s = titleCase(s);
  return s.slice(0, 40);
}

function firstIndex(re, text) {
  const m = re.exec(text);
  return m ? m.index : Infinity;
}

function pickAmount(text) {
  AMOUNT_RE.lastIndex = 0;
  let m;
  while ((m = AMOUNT_RE.exec(text))) {
    const before = text.slice(Math.max(0, m.index - 20), m.index).toLowerCase();
    if (/(bal|balance|limit|avl|available)[^a-z0-9]{0,6}$/.test(before)) continue;
    const v = parseFloat(m[1].replace(/,/g, ""));
    if (v > 0) return v;
  }
  const b = text.match(AMOUNT_BARE_RE);
  if (b) {
    const v = parseFloat(b[1].replace(/,/g, ""));
    if (v > 0) return v;
  }
  return null;
}

/**
 * @param {string} text  SMS body
 * @param {{sender?: string}} [meta]
 * @returns {{ok: true, type, amount, merchant, vpa, account, ref, bank, mode, p2a} | {ok: false, reason}}
 */
export function parseSms(text, meta = {}) {
  const body = String(text || "").replace(/\r/g, "").trim();
  if (!body) return { ok: false, reason: "empty" };
  if (IGNORE_RE.test(body)) return { ok: false, reason: "not a completed transaction" };

  const d = firstIndex(DEBIT_RE, body);
  const c = firstIndex(CREDIT_RE, body);
  if (d === Infinity && c === Infinity) return { ok: false, reason: "no debit or credit found" };
  const type = d <= c ? "debit" : "credit";

  const amount = pickAmount(body);
  if (!amount) return { ok: false, reason: "no amount found" };

  let merchant = "";
  let vpa = "";
  for (const re of type === "debit" ? DEBIT_MERCHANT : CREDIT_MERCHANT) {
    const m = body.match(re);
    if (m && m[1]) {
      if (/@/.test(m[1])) vpa = m[1].toLowerCase();
      merchant = cleanName(m[1]);
      if (merchant) break;
    }
  }
  if (!vpa) {
    const v = body.match(/\b([\w.\-]+@[a-z]{2,})\b/i);
    if (v) vpa = v[1].toLowerCase();
  }
  if (!merchant) merchant = type === "credit" ? "Money received" : "Payment";

  const acc = body.match(/(?:a\/?c|acct|account|ac|card)\s*(?:no\.?|number)?\s*[:\-]?\s*(?:ending\s*)?[x*•.]*\s*(\d{3,6})\b/i);
  const ref = body.match(/(?:upi\s*ref(?:\s*no)?|ref\s*no|refno|ref|upi|txn\s*id|utr)[\s.:#\-]*([0-9]{6,})/i);
  const senderBank = BANKS.find(([, re]) => re.test(meta.sender || ""));
  const textBank = BANKS.find(([, re]) => re.test(body));

  let mode = "Bank";
  // UPI reference numbers (RRN) are 12 digits; HDFC's "Sent Rs" texts don't say "UPI".
  if (/\bupi\b/i.test(body) || vpa || (ref && ref[1].length === 12 && !/\bcard\b/i.test(body))) mode = "UPI";
  else if (/\bcard\b/i.test(body)) mode = "Card";
  else if (/\b(neft|imps|rtgs)\b/i.test(body)) mode = body.match(/\b(neft|imps|rtgs)\b/i)[1].toUpperCase();
  else if (/\batm\b|withdrawn|withdrawal/i.test(body)) mode = "ATM";

  const local = vpa ? vpa.split("@")[0] : "";
  const p2a = /upi\/p2a\//i.test(body) || /^\+?\d{10,12}$/.test(local);

  return {
    ok: true,
    type,
    amount,
    merchant,
    vpa,
    account: acc ? acc[1].slice(-4) : "",
    ref: ref ? ref[1] : "",
    bank: (senderBank || textBank || [""])[0],
    mode,
    p2a
  };
}

/** Splits pasted text holding several messages (blank-line separated) into single messages. */
export function splitMessages(text) {
  return String(text || "")
    .split(/\n\s*\n+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
