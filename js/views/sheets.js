/* Edit sheets for a transaction and an investment. `getCtx` returns fresh app context. */
import { INVESTMENT_TYPES, ruleKeyFor, categorize } from "../categories.js";
import { inr, esc, uid, localISO } from "../format.js";
import { icon } from "../icons.js";
import { openSheet, catPicker, toast, bubble, $, $$ } from "../ui.js";

export function openTxnSheet(getCtx, id) {
  const ctx = getCtx();
  const t = ctx.state.transactions.find((x) => x.id === id);
  if (!t) return;
  const cats = ctx.state.categories;
  const key = ruleKeyFor(t);
  const linked = ctx.state.investments.some((i) => i.fromTxn === t.id);

  openSheet({
    title: t.type === "credit" ? "Money in" : "Payment",
    html: `
      <form id="t-form" class="stack" novalidate>
        <div class="amount-card flat">
          <label for="t-amt">Amount</label>
          <div class="amount-row"><span class="cur">₹</span><input id="t-amt" class="num" type="number" inputmode="decimal" min="0" step="0.01" value="${t.amount}"></div>
        </div>
        <div class="seg2 small">
          <button type="button" aria-pressed="${t.type === "debit"}" data-type="debit">${icon("arrowUp")}Spent</button>
          <button type="button" aria-pressed="${t.type === "credit"}" data-type="credit">${icon("arrowDown")}Received</button>
        </div>
        <label class="field"><span>${t.type === "credit" ? "From" : "Paid to"}</span><input class="input" id="t-name" type="text" maxlength="60" value="${esc(t.merchant)}"></label>
        <div class="field"><span>Category</span>${catPicker(cats, t.category, "t-cat")}</div>
        ${key ? `<label class="row-field"><span><b>Always use this category</b><small>for ${esc(key)}</small></span><span class="switch"><input type="checkbox" id="t-rule" checked><i></i></span></label>` : ""}
        <div class="two">
          <label class="field"><span>When</span><input class="input" id="t-date" type="datetime-local" value="${esc(t.date)}"></label>
          <label class="field"><span>Note</span><input class="input" id="t-note" type="text" maxlength="80" value="${esc(t.note || "")}" placeholder="Optional"></label>
        </div>
        <label class="row-field"><span><b>Count in budget</b><small>Turn off for transfers to yourself or one-offs</small></span><span class="switch"><input type="checkbox" id="t-inc" ${t.excluded ? "" : "checked"}><i></i></span></label>
        ${t.raw ? `<details class="rawsms"><summary>Original message${t.bank ? " · " + esc(t.bank) : ""}</summary><p>${esc(t.raw)}</p></details>` : ""}
        <button class="btn" type="submit">${icon("check")}Save</button>
        ${t.category === "investments" && t.type === "debit" && !linked ? `<button class="btn outline" type="button" id="t-inv">${icon("trend")}Record as investment</button>` : ""}
        <button class="btn ghost-danger" type="button" id="t-del">${icon("trash")}Delete</button>
      </form>`,
    onMount(body, close) {
      let type = t.type;
      $$("[data-type]", body).forEach((b) => b.addEventListener("click", () => {
        type = b.dataset.type;
        $$("[data-type]", body).forEach((x) => x.setAttribute("aria-pressed", String(x === b)));
      }));
      $("#t-form", body).addEventListener("submit", (e) => {
        e.preventDefault();
        const amount = Math.round(Number($("#t-amt", body).value) * 100) / 100;
        if (!(amount > 0)) return toast("Enter an amount above ₹0.");
        const cat = (body.querySelector('input[name="t-cat"]:checked') || {}).value || t.category;
        const makeRule = key && cat !== t.category && $("#t-rule", body) && $("#t-rule", body).checked;
        let moved = 0;
        getCtx().update((s) => {
          const x = s.transactions.find((y) => y.id === id);
          if (!x) return;
          Object.assign(x, {
            amount, type, category: cat, merchant: $("#t-name", body).value.trim() || x.merchant,
            date: $("#t-date", body).value || x.date, note: $("#t-note", body).value.trim(),
            excluded: !$("#t-inc", body).checked, reviewed: true
          });
          if (makeRule) {
            s.rules = s.rules.filter((r) => r.match !== key);
            s.rules.unshift({ match: key, category: cat, type });
            for (const o of s.transactions) {
              if (o.id !== id && !o.reviewed && ruleKeyFor(o) === key && o.category !== cat) {
                o.category = categorize(o, s.rules);
                moved++;
              }
            }
          }
        });
        close();
        toast(moved ? `Saved. ${moved} more from ${key} moved too.` : "Saved");
      });
      const inv = $("#t-inv", body);
      if (inv) inv.addEventListener("click", () => {
        close();
        getCtx().openInvest(null, { amount: t.amount, date: String(t.date).slice(0, 10), name: t.merchant, type: "mf", fromTxn: t.id });
      });
      $("#t-del", body).addEventListener("click", () => {
        const idx = getCtx().state.transactions.findIndex((x) => x.id === id);
        const copy = JSON.parse(JSON.stringify(t));
        getCtx().update((s) => (s.transactions = s.transactions.filter((x) => x.id !== id)));
        close();
        toast(`Deleted ${t.merchant}`, { action: "Undo", onAction: () => getCtx().update((s) => s.transactions.splice(idx, 0, copy)) });
      });
    }
  });
}

export function openInvestSheet(getCtx, id, prefill = {}) {
  const ctx = getCtx();
  const existing = id ? ctx.state.investments.find((x) => x.id === id) : null;
  const i = existing || { type: "mf", name: "", amount: "", date: localISO().slice(0, 10), units: "", currentValue: "", note: "", sip: false, ...prefill };

  openSheet({
    title: existing ? "Investment" : "Record an investment",
    html: `
      <form id="i-form" class="stack" novalidate>
        <div class="typepick" role="radiogroup" aria-label="Type">
          ${INVESTMENT_TYPES.map((t) => `<label><input type="radio" name="i-type" value="${t.id}" ${t.id === i.type ? "checked" : ""}><span class="opt">${bubble(t.icon, t.tone)}<span>${esc(t.name)}</span></span></label>`).join("")}
        </div>
        <div class="amount-card flat">
          <label for="i-amt">Amount invested</label>
          <div class="amount-row"><span class="cur">₹</span><input id="i-amt" class="num" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(i.amount)}" placeholder="0"></div>
        </div>
        <label class="field"><span>Fund, stock or account</span><input class="input" id="i-name" type="text" maxlength="60" value="${esc(i.name)}" placeholder="e.g. Nifty 50 index fund"></label>
        <div class="two">
          <label class="field"><span>Date</span><input class="input" id="i-date" type="date" value="${esc(String(i.date).slice(0, 10))}"></label>
          <label class="field"><span>Units / qty</span><input class="input num" id="i-units" type="number" inputmode="decimal" min="0" step="any" value="${esc(i.units ?? "")}" placeholder="Optional"></label>
        </div>
        <label class="field"><span>Current value (optional)</span><span class="money"><input class="input num" id="i-val" type="number" inputmode="decimal" min="0" step="0.01" value="${esc(i.currentValue ?? "")}" placeholder="Update whenever you check"></span></label>
        <label class="field"><span>Note</span><input class="input" id="i-note" type="text" maxlength="80" value="${esc(i.note || "")}" placeholder="Optional"></label>
        <label class="row-field"><span><b>Monthly SIP</b><small>Marks it as a recurring investment</small></span><span class="switch"><input type="checkbox" id="i-sip" ${i.sip ? "checked" : ""}><i></i></span></label>
        <p class="err" id="i-err" role="alert"></p>
        <button class="btn" type="submit">${icon("check")}${existing ? "Save" : "Record"}</button>
        ${existing ? `<button class="btn ghost-danger" type="button" id="i-del">${icon("trash")}Delete</button>` : ""}
      </form>`,
    onMount(body, close) {
      $("#i-form", body).addEventListener("submit", (e) => {
        e.preventDefault();
        const amount = Math.round(Number($("#i-amt", body).value) * 100) / 100;
        if (!(amount > 0)) {
          $("#i-err", body).textContent = "Enter the amount you invested.";
          return $("#i-amt", body).focus();
        }
        const val = $("#i-val", body).value;
        const units = $("#i-units", body).value;
        const rec = {
          type: (body.querySelector('input[name="i-type"]:checked') || {}).value || "other",
          name: $("#i-name", body).value.trim(),
          amount,
          date: $("#i-date", body).value || localISO().slice(0, 10),
          units: units === "" ? "" : Number(units),
          currentValue: val === "" ? "" : Number(val),
          note: $("#i-note", body).value.trim(),
          sip: $("#i-sip", body).checked
        };
        getCtx().update((s) => {
          if (existing) Object.assign(s.investments.find((x) => x.id === id) || {}, rec);
          else s.investments.push({ id: uid(), fromTxn: prefill.fromTxn || null, ...rec });
        });
        close();
        toast(existing ? "Saved" : `Recorded ${inr(amount)}`);
      });
      const del = $("#i-del", body);
      if (del) del.addEventListener("click", () => {
        const copy = JSON.parse(JSON.stringify(existing));
        getCtx().update((s) => (s.investments = s.investments.filter((x) => x.id !== id)));
        close();
        toast("Deleted", { action: "Undo", onAction: () => getCtx().update((s) => s.investments.push(copy)) });
      });
    }
  });
}
