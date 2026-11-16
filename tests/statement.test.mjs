import { test } from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import {
  parseStatementRows, parseStatementFile, parseStatementDate, parseAmount, narrationInfo, matchExisting, txnFromStatement
} from "../js/statement.js";

const require = createRequire(import.meta.url);
const XLSX = require("../vendor/xlsx.full.min.js");

test("dates: Indian day-first formats, month names, Excel serials", () => {
  assert.equal(parseStatementDate("05/11/26"), "2026-11-05T12:00");
  assert.equal(parseStatementDate("05-11-2026"), "2026-11-05T12:00");
  assert.equal(parseStatementDate("5 Nov 2026"), "2026-11-05T12:00");
  assert.equal(parseStatementDate("05-Nov-26"), "2026-11-05T12:00");
  assert.equal(parseStatementDate("05 Nov 2026 01:30 PM"), "2026-11-05T13:30");
  assert.equal(parseStatementDate("2026-11-05"), "2026-11-05T12:00");
  assert.equal(parseStatementDate(46331), "2026-11-05T12:00");
  assert.equal(parseStatementDate(46331.5), "2026-11-05T12:00");
  assert.equal(parseStatementDate(8000), null);
  assert.equal(parseStatementDate("********"), null);
});

test("amounts with commas, Dr/Cr suffixes and brackets", () => {
  assert.deepEqual(parseAmount("1,23,456.50"), { v: 123456.5, dc: "" });
  assert.deepEqual(parseAmount("1,200.00 Dr"), { v: 1200, dc: "dr" });
  assert.deepEqual(parseAmount("500.00(Cr)"), { v: 500, dc: "cr" });
  assert.deepEqual(parseAmount("(250.00)"), { v: -250, dc: "" });
  assert.deepEqual(parseAmount(""), { v: 0, dc: "" });
});

test("narrations from different banks", () => {
  const n = (s, t = "debit") => narrationInfo(s, t);
  let r = n("UPI-SWIGGY LIMITED-swiggy@icici-ICIC0DC0099-631234567890-PAYMENT");
  assert.equal(r.merchant, "Swiggy Limited");
  assert.equal(r.vpa, "swiggy@icici");
  assert.equal(r.ref, "631234567890");
  assert.equal(r.mode, "UPI");
  r = n("UPI/631234567891/Zomato Ltd/zomato.order@ptybl/Paytm Payments/PYTM0123456");
  assert.equal(r.merchant, "Zomato Ltd");
  r = n("TO TRANSFER-UPI/DR/631234567892/BLINKIT/YESB/blinkit.payu@ybl/Payment--");
  assert.equal(r.merchant, "Blinkit");
  r = n("UPI/P2A/631234567893/RAHUL KUMAR/Payment/HDFC BANK");
  assert.equal(r.merchant, "Rahul Kumar");
  assert.equal(r.p2a, true);
  r = n("POS 416021XXXXXX1234 AMAZON PAY INDIA PRIVA");
  assert.equal(r.merchant, "Amazon Pay India Priva");
  assert.equal(r.mode, "Card");
  r = n("NEFT CR-HDFC0000001-ACME TECHNOLOGIES PVT LTD-TURIYA-N312263123456", "credit");
  assert.equal(r.merchant, "Acme Technologies Pvt Ltd");
  assert.equal(r.mode, "NEFT");
  r = n("ACH D- BSE LTD-123456789");
  assert.equal(r.merchant, "Bse Ltd");
  assert.equal(r.mode, "NACH");
  r = n("NWD-416021XXXXXX1234-S1ANBG12-BANGALORE");
  assert.equal(r.merchant, "ATM withdrawal");
});

test("HDFC layout: Date, Narration, Withdrawal Amt., Deposit Amt.", () => {
  const rows = [
    ["HDFC BANK Ltd.", "", "", "", "", "", ""],
    ["Statement From : 01/11/2026 To : 15/11/2026"],
    ["Date", "Narration", "Chq./Ref.No.", "Value Dt", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
    ["********", "********", "********", "********", "********", "********", "********"],
    ["01/11/26", "NEFT CR-ICIC0000001-ACME TECHNOLOGIES-TURIYA-N1234", "0000N1234", "01/11/26", "", "10,000.00", "18,000.00"],
    ["03/11/26", "UPI-SWIGGY-swiggy@icici-ICIC0DC0099-631234567890-PAYMENT", "0000631234567890", "03/11/26", "349.00", "", "17,651.00"],
    ["04/11/26", "UPI-RAHUL KUMAR-9876543210@ybl-YESB0YBLUPI-631234567891-CHAI", "0000631234567891", "04/11/26", "20.00", "", "17,631.00"],
    ["", "", "", "", "", "", ""],
    ["STATEMENT SUMMARY :-"],
    ["Opening Balance", "Dr Count", "Cr Count", "Debits", "Credits", "Closing Bal"],
    [8000, 2, 1, 369, 10000, 17631]
  ];
  const r = parseStatementRows(rows);
  assert.equal(r.ok, true);
  assert.equal(r.items.length, 3);
  const [sal, swiggy, chai] = r.items;
  assert.equal(sal.type, "credit");
  assert.equal(sal.amount, 10000);
  assert.equal(swiggy.type, "debit");
  assert.equal(swiggy.amount, 349);
  assert.equal(swiggy.date, "2026-11-03T12:00");
  assert.equal(swiggy.ref, "631234567890");
  assert.equal(chai.p2a, true);
  assert.equal(txnFromStatement(swiggy).category, "food");
  assert.equal(txnFromStatement(chai).category, "people");
  assert.equal(txnFromStatement(sal).category, "income");
});

test("ICICI, SBI and Axis column names", () => {
  const icici = parseStatementRows([
    ["S No.", "Value Date", "Transaction Date", "Cheque Number", "Transaction Remarks", "Withdrawal Amount (INR )", "Deposit Amount (INR )", "Balance (INR )"],
    [1, "05/11/2026", "05/11/2026", "-", "UPI/631234567892/Uber India/uber@axisbank/Axis Bank", 212.4, 0, 9787.6]
  ]);
  assert.equal(icici.items[0].merchant, "Uber India");
  assert.equal(icici.items[0].amount, 212.4);
  assert.equal(txnFromStatement(icici.items[0]).category, "transport");

  const sbi = parseStatementRows([
    ["Account Name", ":", "Mr. T Joshi"],
    ["Txn Date", "Value Date", "Description", "Ref No./Cheque No.", "Debit", "Credit", "Balance"],
    ["6 Nov 2026", "6 Nov 2026", "TO TRANSFER-UPI/DR/631234567893/AIRTEL/YESB/airtel@ybl/Recharge--", "TRANSFER TO 4897691162091", "299.00", " ", "9,488.60"]
  ]);
  assert.equal(sbi.items[0].merchant, "Airtel");
  assert.equal(txnFromStatement(sbi.items[0]).category, "bills");

  const axis = parseStatementRows([
    ["Tran Date", "CHQNO", "PARTICULARS", "DR", "CR", "BAL", "SOL"],
    ["07-11-2026", "", "UPI/P2M/631234567894/BLINKIT/Payment/YES BANK", "540.00", "", "8948.60", "1234"]
  ]);
  assert.equal(axis.items[0].merchant, "Blinkit");
  assert.equal(txnFromStatement(axis.items[0]).category, "groceries");
});

test("Kotak layout: one Amount column with Dr/Cr, opening balance row skipped", () => {
  const r = parseStatementRows([
    ["Sl. No.", "Transaction Date", "Value Date", "Description", "Chq / Ref No.", "Amount", "Dr / Cr", "Balance", "Dr / Cr"],
    ["", "", "", "Opening Balance", "", "", "", "5,000.00", "CR"],
    ["1", "08-11-2026", "08-11-2026", "UPI/NETFLIX/631234567895/Subscription", "UPI-631234567895", "199.00", "DR", "4,801.00", "CR"],
    ["2", "09-11-2026", "09-11-2026", "UPI/Refund/631234567896/AMAZON", "UPI-631234567896", "499.00", "CR", "5,300.00", "CR"]
  ]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.items.map((i) => [i.type, i.amount]), [["debit", 199], ["credit", 499]]);
  assert.equal(r.items[0].merchant, "Netflix");
});

test("not a statement", () => {
  assert.equal(parseStatementRows([["Name", "Phone"], ["A", "1"]]).ok, false);
  assert.equal(parseStatementRows([]).ok, false);
});

test("matching skips payments already in the app", () => {
  const r = parseStatementRows([
    ["Date", "Narration", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"],
    ["03/11/26", "UPI-SWIGGY-swiggy@icici-ICIC0DC0099-631234567890-PAYMENT", "349.00", "", "17,651.00"],
    ["04/11/26", "UPI-CHAI POINT-chai@ybl-YESB0YBLUPI-631234567891-UPI", "20.00", "", "17,631.00"],
    ["04/11/26", "UPI-CHAI POINT-chai@ybl-YESB0YBLUPI-631234567899-UPI", "20.00", "", "17,611.00"],
    ["05/11/26", "UPI-METRO-dmrc@hdfc-HDFC0000001-631234567892-UPI", "40.00", "", "17,571.00"]
  ]);
  const existing = [
    { id: "sms", type: "debit", amount: 349, ref: "631234567890", date: "2026-11-03T13:05" },
    { id: "manual", type: "debit", amount: 20, ref: "", date: "2026-11-04T09:00" }
  ];
  const m = matchExisting(existing, r.items);
  // SMS by reference; one manual chai matches one of the two chai rows; metro is new.
  assert.deepEqual(m, ["sms", "manual", null, null]);

  // Re-importing the same file matches every row by its statement key.
  const imported = r.items.map((it) => txnFromStatement(it));
  assert.deepEqual(matchExisting(imported, r.items), imported.map((t) => t.id));
});

test("files through SheetJS: CSV keeps day-first dates, XLSX date cells, HTML .xls", () => {
  const csv = "Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance\n05/11/2026,UPI-ZOMATO-zomato@hdfc-HDFC0000001-631234567897-UPI,\"1,250.00\",,\"9,000.00\"\n";
  let r = parseStatementFile(XLSX, new TextEncoder().encode(csv));
  assert.equal(r.ok, true);
  assert.equal(r.items[0].date, "2026-11-05T12:00");
  assert.equal(r.items[0].amount, 1250);

  const ws = XLSX.utils.aoa_to_sheet([
    ["Transaction Date", "Description", "Debit", "Credit", "Balance"],
    [new Date(Date.UTC(2026, 10, 5)), "UPI/631234567898/Rapido/rapido@ybl", 85, "", 8915]
  ], { cellDates: false });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, "Statement");
  const buf = XLSX.write(wb, { type: "array", bookType: "xlsx" });
  r = parseStatementFile(XLSX, new Uint8Array(buf));
  assert.equal(r.ok, true);
  assert.equal(r.items[0].date.slice(0, 10), "2026-11-05");
  assert.equal(r.items[0].merchant, "Rapido");

  const html = `<html><body><table>
    <tr><td>Value Date</td><td>Transaction Date</td><td>Transaction Remarks</td><td>Withdrawal Amount (INR )</td><td>Deposit Amount (INR )</td><td>Balance (INR )</td></tr>
    <tr><td>06/11/2026</td><td>06/11/2026</td><td>UPI/631234567899/BookMyShow/bms@icici/ICICI Bank</td><td>450.00</td><td>0.00</td><td>8,465.00</td></tr>
  </table></body></html>`;
  r = parseStatementFile(XLSX, new TextEncoder().encode(html));
  assert.equal(r.ok, true);
  assert.equal(r.items[0].date, "2026-11-06T12:00");
  assert.equal(txnFromStatement(r.items[0]).category, "entertainment");
});
