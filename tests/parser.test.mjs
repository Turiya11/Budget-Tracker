import { test } from "node:test";
import assert from "node:assert/strict";
import { isOtp, parseSms, splitMessages } from "../js/parser.js";
import { categorize } from "../js/categories.js";

const cases = [
  {
    name: "HDFC UPI sent",
    sms: "Sent Rs.250.00\nFrom HDFC Bank A/C *1234\nTo SWIGGY\nOn 16/11/26\nRef 631234567890\nNot You?\nCall 18002586161/SMS BLOCK UPI to 7308080808",
    sender: "AX-HDFCBK-S",
    want: { type: "debit", amount: 250, merchant: "Swiggy", account: "1234", ref: "631234567890", bank: "HDFC", mode: "UPI", cat: "food" }
  },
  {
    name: "ICICI debit with merchant credited",
    sms: "ICICI Bank Acct XX123 debited for Rs 499.00 on 16-Nov-26; ZOMATO LTD credited. UPI:631234567891. Call 18002662 for dispute. SMS BLOCK 123 to 9215676766.",
    want: { type: "debit", amount: 499, merchant: "Zomato Ltd", account: "123", ref: "631234567891", bank: "ICICI", cat: "food" }
  },
  {
    name: "SBI UPI debited by (no Rs)",
    sms: "Dear UPI user A/C X4321 debited by 120.0 on date 16Nov26 trf to UBER INDIA Refno 631234567892. If not u? call 1800111109. -SBI",
    want: { type: "debit", amount: 120, merchant: "Uber India", account: "4321", ref: "631234567892", bank: "SBI", cat: "transport" }
  },
  {
    name: "Kotak UPI to VPA",
    sms: "Sent Rs.1,299.00 from Kotak Bank AC X9876 to amazonpay@apl on 16-11-26.UPI Ref 631234567893. Not you, https://kotak.com/KBANKT/Fraud",
    want: { type: "debit", amount: 1299, merchant: "Amazonpay", vpa: "amazonpay@apl", account: "9876", bank: "Kotak", cat: "other" }
  },
  {
    name: "Axis P2M",
    sms: "INR 89.00 debited\nA/c no. XX5555\n16-11-26, 13:02:11\nUPI/P2M/631234567894/BLINKIT\nNot you? SMS BLOCKUPI Cust ID to 919951860002\nAxis Bank",
    want: { type: "debit", amount: 89, merchant: "Blinkit", account: "5555", bank: "Axis", cat: "groceries" }
  },
  {
    name: "Card spend",
    sms: "Spent Rs.2,450 On HDFC Bank Card 7788 At MYNTRA DESIGNS On 2026-11-16:14:22:10.Not You? To Block+Reissue Call 18002586161",
    want: { type: "debit", amount: 2450, merchant: "Myntra Designs", account: "7788", mode: "Card", cat: "shopping" }
  },
  {
    name: "Balance after amount is ignored",
    sms: "Rs 60.00 debited from A/c XX1111 on 16-11-26 to VPA rapido.bike@axisbank (UPI Ref 631234567895). Avl Bal Rs 12,345.67 -Canara Bank",
    want: { type: "debit", amount: 60, merchant: "Rapido Bike", cat: "transport" }
  },
  {
    name: "P2P to phone number",
    sms: "Sent Rs.500.00 From HDFC Bank A/C *1234 To 9876543210@ybl On 16/11/26 Ref 631234567896 Not You?",
    want: { type: "debit", amount: 500, merchant: "UPI ••3210", cat: "people" }
  },
  {
    name: "HDFC money received",
    sms: "Money Received - INR 10000.00 in your HDFC Bank A/c xx1234 on 16-11-26 by A/c linked to VPA acme.payroll@okicici (UPI Ref No 631234567897).",
    want: { type: "credit", amount: 10000, merchant: "Acme Payroll", cat: "income" }
  },
  {
    name: "ICICI credit from name",
    sms: "Dear Customer, Acct XX123 is credited with Rs 750.00 on 16-Nov-26 from RAHUL SHARMA. UPI:631234567898-ICICI Bank.",
    want: { type: "credit", amount: 750, merchant: "Rahul Sharma", cat: "income" }
  },
  {
    name: "SIP via groww",
    sms: "Rs.1000.00 debited from A/c XX1234 to VPA groww.mf@hdfcbank on 16-11-26 UPI Ref 631234567899",
    want: { type: "debit", amount: 1000, cat: "investments" }
  }
];

for (const c of cases) {
  test(c.name, () => {
    const p = parseSms(c.sms, { sender: c.sender });
    assert.equal(p.ok, true, JSON.stringify(p));
    for (const [k, v] of Object.entries(c.want)) {
      if (k === "cat") continue;
      assert.equal(p[k], v, `${k}: got ${JSON.stringify(p[k])}`);
    }
    if (c.want.cat) assert.equal(categorize({ ...p, raw: c.sms }), c.want.cat);
  });
}

const ignored = [
  "123456 is your OTP for txn of Rs 500 at AMAZON. Do not share. -HDFC Bank",
  "Rs 2,000 will be debited from your A/c XX12 on 20-11-26 towards SIP mandate.",
  "Rahul has requested money from you on Google Pay. Rs 300",
  "Txn of Rs 450 failed due to insufficient balance. -SBI",
  "Your Airtel bill of Rs 499 is due on 20 Nov.",
  "OTP is 482913 to pay Rs 1,299.00 to MYNTRA using your ICICI Bank Credit Card XX1234. Valid for 10 mins.",
  "Use OTP 7781 to confirm UPI payment of Rs 650 debited... do not share. -Kotak",
  "Your one time password for sending Rs 5,000 to RAHUL via IMPS is 559012. -SBI"
];
for (const sms of ignored) {
  test("ignores: " + sms.slice(0, 30), () => {
    assert.equal(parseSms(sms).ok, false);
  });
}

test("real debit alerts with a 'never share your OTP' footer are still logged", () => {
  const p = parseSms("Rs.349.00 debited from A/c XX1234 to VPA swiggy@icici on 16-11-26. UPI Ref 631234567890. Never share your OTP or PIN with anyone. -IDFC FIRST Bank");
  assert.equal(p.ok, true);
  assert.equal(p.amount, 349);
  assert.equal(isOtp("Sent Rs.20.00 From HDFC Bank A/C *1234 To CHAI On 16/11/26 Ref 631234567891 Not You? Call 18002586161. Do not share OTP"), false);
});

test("user rule beats built-in", () => {
  const p = parseSms(cases[0].sms);
  assert.equal(categorize(p, [{ match: "swiggy", category: "other" }]), "other");
});

test("splitMessages", () => {
  assert.equal(splitMessages("a\nb\n\nc\n\n\nd").length, 3);
});
