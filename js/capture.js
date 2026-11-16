/* Turns raw SMS (from the cloud inbox or pasted) into transactions in state. */
import { parseSms } from "./parser.js";
import { categorize } from "./categories.js";
import { uid, localISO } from "./format.js";

/** Builds a transaction from an SMS, or returns {skip: reason}. Does not touch state. */
export function txnFromSms(state, body, { date, sender, inboxId, source = "sms" } = {}) {
  const raw = String(body || "").trim();
  if (state.transactions.some((t) => t.raw && t.raw === raw)) return { skip: "already added" };
  const p = parseSms(raw, { sender });
  if (!p.ok) return { skip: p.reason };
  if (p.ref && state.transactions.some((t) => t.ref === p.ref && Number(t.amount) === p.amount)) return { skip: "already added" };
  const txn = {
    id: uid(),
    type: p.type,
    amount: p.amount,
    merchant: p.merchant,
    vpa: p.vpa,
    account: p.account,
    bank: p.bank,
    ref: p.ref,
    mode: p.mode,
    p2a: p.p2a,
    date: date || localISO(),
    note: "",
    raw,
    source,
    inboxId: inboxId ?? null,
    excluded: false,
    reviewed: false
  };
  txn.category = categorize(txn, state.rules);
  return { txn };
}

/**
 * Applies cloud inbox rows to state (mutates). Returns {added: txn[], skipped: n}.
 * Rows: {id, body, sender, received_at}
 */
export function applyInbox(state, rows) {
  const added = [];
  let skipped = 0;
  for (const row of rows) {
    if (state.transactions.some((t) => t.inboxId === row.id)) continue;
    const r = txnFromSms(state, row.body, { date: row.received_at, sender: row.sender, inboxId: row.id });
    if (r.txn) {
      state.transactions.push(r.txn);
      added.push(r.txn);
    } else {
      skipped++;
      if (r.skip !== "already added") {
        state.skipped.unshift({ body: String(row.body).slice(0, 500), reason: r.skip, date: row.received_at });
        state.skipped = state.skipped.slice(0, 30);
      }
    }
  }
  return { added, skipped };
}
