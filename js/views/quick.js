/* Quick add: amount keypad, recent payees as one-tap chips, category guessed from the name. */
import { inr, esc, uid, localISO, dayLabel, parseLocal } from "../format.js";
import { icon } from "../icons.js";
import { catBubble, catPicker, openSheet, toast, $, $$ } from "../ui.js";
import { categorize } from "../categories.js";

// Survives re-renders (a sync finishing mid-entry re-renders the view).
const Q = { type: "debit", amt: "", name: "", cat: null, catLocked: false, day: "" };

const STARTERS = {
  debit: [["Chai", "food"], ["Auto", "transport"], ["Metro", "transport"], ["Swiggy", "food"], ["Blinkit", "groceries"], ["Recharge", "bills"], ["Rent", "home"]],
  credit: [["Stipend", "income"], ["Refund", "income"], ["From a friend", "income"]]
};
const GENERIC = /^(payment|money received|upi payment|atm withdrawal)$/i;

const todayKey = () => localISO().slice(0, 10);

/** Payees used in the last 120 days, most frequent first (ties: most recent). */
function recents(state, type) {
  const cutoff = Date.now() - 120 * 86400000;
  const seen = new Map();
  const list = state.transactions
    .filter((t) => t.type === type && !t.excluded)
    .sort((a, b) => String(b.date).localeCompare(String(a.date)));
  for (const t of list) {
    if (parseLocal(t.date).getTime() < cutoff) break;
    const name = String(t.merchant || "").trim();
    const k = name.toLowerCase();
    if (!k || GENERIC.test(k) || /^upi ••/i.test(k)) continue;
    const e = seen.get(k);
    if (e) e.n++;
    else seen.set(k, { name, cat: t.category, amount: Number(t.amount), n: 1 });
  }
  const out = [...seen.values()].sort((a, b) => b.n - a.n).slice(0, 10);
  for (const [name, cat] of STARTERS[type]) {
    if (out.length >= 8) break;
    if (!seen.has(name.toLowerCase())) out.push({ name, cat, amount: 0, n: 0 });
  }
  return out;
}

function lastFor(state, name, type) {
  const k = name.trim().toLowerCase();
  if (!k) return null;
  let best = null;
  for (const t of state.transactions) {
    if (t.type !== type || String(t.merchant || "").trim().toLowerCase() !== k) continue;
    if (!best || String(t.date) > String(best.date)) best = t;
  }
  return best;
}

function guessCat(state, name, type) {
  const prev = lastFor(state, name, type);
  if (prev) return prev.category;
  if (!name.trim()) return type === "credit" ? "income" : "other";
  return categorize({ type, merchant: name, vpa: "" }, state.rules);
}

function amountText(s) {
  if (!s) return "0";
  const [i, d] = s.split(".");
  const int = Number(i || 0).toLocaleString("en-IN");
  return s.includes(".") ? `${int}.${d}` : int;
}

function press(key) {
  let s = Q.amt;
  if (key === "del") s = s.slice(0, -1);
  else if (key === ".") {
    if (!s.includes(".")) s = (s || "0") + ".";
  } else if (/^\d$/.test(key)) {
    const [i, d] = s.split(".");
    if (s.includes(".")) {
      if (d.length >= 2) return false;
      s += key;
    } else if (i === "0" || i === "") s = key;
    else if (i.length >= 7) return false;
    else s += key;
  } else return false;
  Q.amt = s;
  return true;
}

let keyHandler = null;

export default {
  render(root, ctx) {
    const { state, cats } = ctx;
    if (!Q.catLocked || !cats[Q.cat]) Q.cat = guessCat(state, Q.name, Q.type);
    const chips = recents(state, Q.type);
    const day = Q.day && Q.day !== todayKey() ? Q.day : "";
    const debit = Q.type === "debit";

    root.innerHTML = `
      <section class="qa-card" aria-label="New ${debit ? "expense" : "money in"}">
        <div class="qa-top">
          <div class="seg2 mini" role="group" aria-label="Type">
            <button type="button" aria-pressed="${debit}" data-qtype="debit">Spent</button>
            <button type="button" aria-pressed="${!debit}" data-qtype="credit">Received</button>
          </div>
          <label class="qbtn qa-date">${icon("calendar")}<span id="qa-day">${esc(day ? dayLabel(day + "T12:00") : "Today")}</span>
            <input type="date" id="qa-date" value="${esc(day || todayKey())}" max="${todayKey()}" aria-label="Date">
          </label>
        </div>
        <output class="qa-amt num ${Q.amt ? "" : "empty"}" id="qa-amt" aria-live="polite"><span class="cur">₹</span><span id="qa-amt-v">${esc(amountText(Q.amt))}</span></output>
        <button type="button" class="qbtn qa-cat" id="qa-cat" aria-label="Category: ${esc((cats[Q.cat] || {}).name || "Other")}. Change">
          ${catBubble(cats[Q.cat])}<span id="qa-cat-name">${esc((cats[Q.cat] || {}).name || "Other")}</span>${icon("chevD")}
        </button>
      </section>

      <div class="qa-who">
        <label class="sr" for="qa-name">${debit ? "Paid to" : "Received from"}</label>
        <input class="input" id="qa-name" type="text" maxlength="60" autocomplete="off" enterkeyhint="done"
          placeholder="${debit ? "Paid to (optional)" : "From (optional)"}" value="${esc(Q.name)}">
        <div class="chips" role="group" aria-label="Recent">
          ${chips.map((c) => `<button class="chip" type="button" data-chip="${esc(c.name)}" data-cat="${esc(c.cat)}" data-amt="${c.amount || ""}" aria-pressed="${c.name.toLowerCase() === Q.name.trim().toLowerCase()}">${esc(c.name)}</button>`).join("")}
        </div>
      </div>

      <div class="qa-keys" role="group" aria-label="Amount keypad">
        ${["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0"].map((k) => `<button type="button" class="key num" data-key="${k}">${k}</button>`).join("")}
        <button type="button" class="key" data-key="del" aria-label="Delete">${icon("backspace")}</button>
        <button type="button" class="key save" id="qa-save">${icon("check")}<span>Add</span></button>
      </div>`;

    const amtEl = $("#qa-amt", root);
    const paintAmt = () => {
      $("#qa-amt-v", root).textContent = amountText(Q.amt);
      amtEl.classList.toggle("empty", !Q.amt);
    };
    const paintCat = () => {
      const c = cats[Q.cat] || cats.other;
      const btn = $("#qa-cat", root);
      btn.firstElementChild.outerHTML = catBubble(c);
      $("#qa-cat-name", root).textContent = c.name;
      btn.setAttribute("aria-label", `Category: ${c.name}. Change`);
    };
    const paintChips = () => {
      const k = Q.name.trim().toLowerCase();
      $$("[data-chip]", root).forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.chip.toLowerCase() === k)));
    };

    $$("[data-qtype]", root).forEach((b) => b.addEventListener("click", () => {
      if (Q.type === b.dataset.qtype) return;
      Q.type = b.dataset.qtype;
      Q.name = "";
      Q.catLocked = false;
      ctx.rerender();
    }));

    $("#qa-date", root).addEventListener("change", (e) => {
      const v = e.target.value;
      Q.day = v && v <= todayKey() ? v : "";
      $("#qa-day", root).textContent = Q.day && Q.day !== todayKey() ? dayLabel(Q.day + "T12:00") : "Today";
    });

    $("#qa-cat", root).addEventListener("click", () => {
      const list = state.categories.filter((c) => (debit ? c.kind !== "income" : ["income", "people", "other"].includes(c.id)));
      openSheet({
        title: "Category",
        html: catPicker(list, Q.cat, "qa-cat"),
        onMount(body, close) {
          $$('input[name="qa-cat"]', body).forEach((i) => i.addEventListener("change", () => {
            Q.cat = i.value;
            Q.catLocked = true;
            paintCat();
            close();
          }));
        }
      });
    });

    const nameEl = $("#qa-name", root);
    nameEl.addEventListener("input", () => {
      Q.name = nameEl.value;
      if (!Q.catLocked) {
        Q.cat = guessCat(state, Q.name, Q.type);
        paintCat();
      }
      paintChips();
    });
    nameEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        nameEl.blur();
      }
    });

    $$("[data-chip]", root).forEach((b) => b.addEventListener("click", () => {
      const same = Q.name.trim().toLowerCase() === b.dataset.chip.toLowerCase();
      Q.name = same ? "" : b.dataset.chip;
      nameEl.value = Q.name;
      if (!Q.catLocked) Q.cat = same ? guessCat(state, "", Q.type) : b.dataset.cat || guessCat(state, Q.name, Q.type);
      // Repeat payments (chai, metro): fill in last time's amount if nothing is typed yet.
      if (!same && !Q.amt && Number(b.dataset.amt) > 0) {
        Q.amt = String(Math.round(Number(b.dataset.amt) * 100) / 100);
        paintAmt();
      }
      paintCat();
      paintChips();
    }));

    $$("[data-key]", root).forEach((b) => b.addEventListener("click", () => {
      if (press(b.dataset.key)) paintAmt();
    }));

    const save = () => {
      const amount = Math.round(Number(Q.amt) * 100) / 100;
      if (!(amount > 0)) {
        amtEl.classList.remove("shake");
        void amtEl.offsetWidth;
        amtEl.classList.add("shake");
        toast("Type the amount first", { top: true });
        return;
      }
      const cat = cats[Q.cat] ? Q.cat : debit ? "other" : "income";
      const name = Q.name.trim() || (debit ? cats[cat].name : "Money received");
      const time = localISO().slice(11);
      const id = uid();
      const txn = {
        id, type: Q.type, amount, merchant: name, vpa: "", account: "", bank: "", ref: "", mode: "",
        date: `${Q.day || todayKey()}T${time}`, note: "", raw: "", source: "manual", category: cat, excluded: false, reviewed: true
      };
      Q.amt = "";
      Q.name = "";
      Q.catLocked = false;
      ctx.update((s) => s.transactions.push(txn));
      toast(`Added ${inr(amount, { paise: true })} · ${name}`, {
        top: true,
        action: "Undo",
        onAction: () => ctx.update((s) => (s.transactions = s.transactions.filter((t) => t.id !== id)))
      });
    };
    $("#qa-save", root).addEventListener("click", save);

    // Typing digits on a hardware keyboard works too.
    if (keyHandler) document.removeEventListener("keydown", keyHandler);
    keyHandler = (e) => {
      if (!document.contains(amtEl)) {
        document.removeEventListener("keydown", keyHandler);
        keyHandler = null;
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey || /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement?.tagName || "")) return;
      if (document.querySelector("#sheet[open]")) return;
      const key = e.key === "Backspace" ? "del" : e.key;
      if (e.key === "Enter") {
        e.preventDefault();
        save();
      } else if (press(key)) {
        e.preventDefault();
        paintAmt();
      }
    };
    document.addEventListener("keydown", keyHandler);
  }
};
