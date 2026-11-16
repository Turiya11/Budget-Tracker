# Budget Tracker

A personal finance tracker for everyday use in India, built for iPhone. It logs UPI and card payments automatically from your bank SMS, sorts them into categories, keeps you inside a monthly budget, and lets you record your investments separately.

**Open it:** https://turiya11.github.io/Budget-Tracker/

## What it does

| | |
|---|---|
| **Quick add** | A big keypad and your usual payees as one-tap chips. Tap *Chai* and the amount and category fill in from last time, then tap Add. Can open straight to this screen. |
| **Statement import** | Download your statement from your bank as Excel or CSV and import it. Every payment is added and categorized, and anything already logged is left out. Works with HDFC, ICICI, SBI, Axis, Kotak and most other banks. |
| **Automatic capture** | An iOS Shortcuts automation sends every bank debit/credit SMS to your own Supabase database. The app pulls them in when you open it. |
| **Categorization** | Recognises 240+ Indian merchants (Swiggy, Zomato, Blinkit, Uber, IRCTC, Amazon, Airtel, Groww…). Change a category once and it remembers that merchant. |
| **Budgets** | A monthly budget plus optional limits per category, with a daily allowance for the rest of the month. |
| **Alerts** | A notification on every captured payment that warns you when a category or the whole month crosses your warning level (80% by default) or goes over. Also large-payment and spending-pace alerts. |
| **Investments** | Record SIPs, stocks, ETFs, gold, FDs, PPF, NPS and savings. Track monthly totals, a monthly goal and current value. Payments to Groww, Zerodha etc. are spotted and offered for recording. |
| **Paste SMS** | Paste one or more bank SMS to log them in one go. |
| **Your data** | Stored on your phone, backed up to your own Supabase project. Export JSON or CSV any time. |

INR throughout, with Indian digit grouping (₹12,34,567).

Auto-capture is optional. Quick add plus a monthly statement import needs no setup at all.

## How auto-capture works

```
Bank SMS ──► iOS Shortcuts automation ──► your Supabase (bt_capture)
                                             │  stores the SMS
                                             └► returns a notification: "Food & dining at 85% of its limit"
App opened ──► bt_pull ──► parse + categorize on the phone ──► bt_save (backup) ──► bt_ack (clear inbox)
```

No app can read UPI transactions directly, and RBI's Account Aggregator system is only open to licensed businesses. On an iPhone the bank SMS is the most reliable automatic source, and Shortcuts can act on it in the background.

Security: the tables have row-level security on with no policies, so the public API key can't read or write them. Everything goes through `security definer` functions that check a random 32-character device secret, stored in the database only as a SHA-256 hash. OTP texts, payment requests, failed payments and reminders are thrown away by `bt_capture` without being saved, and payment SMS are deleted from the inbox once the app has pulled them in. Don't share the *Log bank SMS* shortcut: it contains the secret.

If you set up auto-capture before this change, run `supabase/setup.sql` again to get it (and to clear out any skipped texts the old version kept).

## Setup (once, about 15 minutes)

1. Open the app and go to **Settings → Auto-capture**. It walks you through every step with copy buttons.
2. Create a free project at [supabase.com](https://supabase.com) (Mumbai region).
3. In the project's **SQL Editor**, run [`supabase/setup.sql`](supabase/setup.sql).
4. Paste the **Project URL** and **anon/publishable key** into the app and tap **Connect**.
5. In **Shortcuts**, build the *Log bank SMS* shortcut from the values the app shows.
6. Add a **Message** automation for each phrase (`debited`, `Sent Rs`, `credited`, `spent`), set to **Run Immediately**, that runs the shortcut.
7. In Safari: **Share → Add to Home Screen**.

> Free Supabase projects pause after a week with no activity. Daily SMS captures keep the project active.

## Development

Plain HTML, CSS and ES modules. There's no build step and no dependencies.

```bash
python3 -m http.server 5174   # then open http://localhost:5174
npm test                      # SMS parser, statement reader, categorizer and budget tests (Node 18+)
```

| Path | |
|---|---|
| `js/parser.js` | Bank SMS parser (HDFC, ICICI, SBI, Axis, Kotak and others) |
| `js/categories.js` | Default categories, merchant rules, categorizer |
| `js/budget.js` | Budget totals, pace and alert rules |
| `js/capture.js` | Turns SMS into transactions, de-duplicates |
| `js/statement.js` | Bank statement reader: finds the columns, cleans up narrations, matches what's already logged |
| `js/sync.js` | Supabase RPC client |
| `js/views/` | Screens: home, activity, add (quick add, paste SMS, statement), budget, invest, settings, setup |
| `vendor/` | [SheetJS](https://sheetjs.com) 0.20.3 for reading Excel files (Apache 2.0), loaded only when you import |
| `supabase/setup.sql` | Tables and functions for your Supabase project |
| `tests/` | `node --test` suites |

This app is for tracking only. It doesn't give investment advice.
