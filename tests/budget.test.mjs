import { test } from "node:test";
import assert from "node:assert/strict";
import { summarize, activeAlerts, freshAlerts, investSummary } from "../js/budget.js";
import { applyInbox } from "../js/capture.js";
import { DEFAULT_CATEGORIES } from "../js/categories.js";

function state() {
  return {
    settings: { monthlyBudget: 10000, warnAt: 80, largeTxn: 2000, paceAlert: false },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c, limit: c.id === "food" ? 3000 : 0 })),
    rules: [],
    transactions: [],
    investments: [],
    alertsFired: {},
    skipped: []
  };
}

test("inbox rows become categorized transactions, duplicates and OTPs skipped", () => {
  const s = state();
  const rows = [
    { id: 1, body: "Sent Rs.2,600.00 From HDFC Bank A/C *1234 To SWIGGY On 16/11/26 Ref 631234567890", received_at: "2026-11-16T13:05" },
    { id: 2, body: "Sent Rs.2,600.00 From HDFC Bank A/C *1234 To SWIGGY On 16/11/26 Ref 631234567890", received_at: "2026-11-16T13:05" },
    { id: 3, body: "123456 is your OTP. Do not share.", received_at: "2026-11-16T13:06" },
    { id: 4, body: "Money Received - INR 10000.00 in your HDFC Bank A/c xx1234 by VPA acme.payroll@okicici (UPI Ref No 631234567897).", received_at: "2026-11-01T10:00" },
    { id: 5, body: "Rs.1000.00 debited from A/c XX1234 to VPA groww.mf@hdfcbank on 16-11-26 UPI Ref 631234567899", received_at: "2026-11-05T09:00" }
  ];
  const r = applyInbox(s, rows);
  assert.equal(r.added.length, 3);
  assert.equal(s.skipped.length, 1);
  const sum = summarize(s, "2026-11");
  assert.equal(sum.spent, 2600);
  assert.equal(sum.income, 10000);
  assert.equal(sum.outside, 1000);
  assert.equal(sum.byCat.food, 2600);
  // re-applying the same rows adds nothing
  assert.equal(applyInbox(s, rows).added.length, 0);
});

test("alerts: category warn, then over; overall budget", () => {
  const s = state();
  s.transactions.push({ id: "a", type: "debit", amount: 2500, category: "food", date: "2026-11-10T10:00", reviewed: true });
  let a = activeAlerts(s, "2026-11");
  assert.deepEqual(a.map((x) => x.id), ["cat-food-warn"]);
  s.transactions.push({ id: "b", type: "debit", amount: 600, category: "food", date: "2026-11-11T10:00", reviewed: true });
  s.transactions.push({ id: "c", type: "debit", amount: 5200, category: "shopping", date: "2026-11-12T10:00", reviewed: true });
  a = activeAlerts(s, "2026-11");
  assert.deepEqual(a.map((x) => x.id).sort(), ["cat-food-over", "overall-warn"]);
  s.alertsFired["2026-11"] = { "cat-food-over": 1 };
  assert.deepEqual(freshAlerts(s, "2026-11").map((x) => x.id), ["overall-warn"]);
});

test("excluded transactions don't count", () => {
  const s = state();
  s.transactions.push({ id: "a", type: "debit", amount: 900, category: "food", date: "2026-11-10T10:00", excluded: true });
  assert.equal(summarize(s, "2026-11").spent, 0);
});

test("investment summary", () => {
  const s = state();
  s.investments.push({ id: "1", type: "mf", amount: 1000, date: "2026-11-05", currentValue: 1100 });
  s.investments.push({ id: "2", type: "stock", amount: 2000, date: "2026-10-05", currentValue: "" });
  const r = investSummary(s, "2026-11");
  assert.equal(r.month, 1000);
  assert.equal(r.total, 3000);
  assert.equal(r.gain, 100);
});
