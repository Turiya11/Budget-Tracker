import { inr, esc, uid, localISO } from "../format.js";
import { icon } from "../icons.js";
import { catPicker, toast, $, $$ } from "../ui.js";
import { txnFromSms } from "../capture.js";
import { splitMessages } from "../parser.js";

let mode = "manual";
let txType = "debit";
let pasted = "";
let preview = null;

export default {
  render(root, ctx) {
    const { state, cats } = ctx;
    const spendCats = state.categories.filter((c) => c.kind !== "income");
    const inCats = state.categories.filter((c) => c.id === "income" || c.id === "other" || c.id === "people");

    root.innerHTML = `
      <h1 class="big">Add</h1>
      <div class="seg2" role="tablist">
        <button type="button" role="tab" aria-selected="${mode === "manual"}" data-mode="manual">Type it in</button>
        <button type="button" role="tab" aria-selected="${mode === "paste"}" data-mode="paste">Paste bank SMS</button>
      </div>
      <div id="add-body"></div>`;

    $$("[data-mode]", root).forEach((b) => b.addEventListener("click", () => {
      mode = b.dataset.mode;
      ctx.rerender();
    }));
    const body = $("#add-body", root);

    if (mode === "manual") {
      body.innerHTML = `
        <form id="add-form" class="stack" novalidate>
          <div class="seg2 small">
            <button type="button" aria-pressed="${txType === "debit"}" data-type="debit">${icon("arrowUp")}Spent</button>
            <button type="button" aria-pressed="${txType === "credit"}" data-type="credit">${icon("arrowDown")}Received</button>
          </div>
          <div class="amount-card">
            <label for="f-amt">Amount</label>
            <div class="amount-row"><span class="cur">₹</span><input id="f-amt" class="num" type="number" inputmode="decimal" min="0" step="0.01" placeholder="0" autocomplete="off"></div>
          </div>
          <label class="field"><span>${txType === "debit" ? "Paid to" : "Received from"}</span>
            <input class="input" id="f-name" type="text" maxlength="60" placeholder="${txType === "debit" ? "Chai stall, auto, Swiggy…" : "Stipend, friend, refund…"}" autocomplete="off">
          </label>
          <div class="field"><span>Category</span>${catPicker(txType === "debit" ? spendCats : inCats, txType === "debit" ? "food" : "income", "f-cat")}</div>
          <div class="two">
            <label class="field"><span>When</span><input class="input" id="f-date" type="datetime-local" value="${localISO()}"></label>
            <label class="field"><span>Note</span><input class="input" id="f-note" type="text" maxlength="80" placeholder="Optional"></label>
          </div>
          <p class="err" id="f-err" role="alert"></p>
          <button class="btn" type="submit">${icon("plus")}Add ${txType === "debit" ? "expense" : "money in"}</button>
        </form>`;
      $$("[data-type]", body).forEach((b) => b.addEventListener("click", () => {
        txType = b.dataset.type;
        ctx.rerender();
      }));
      $("#add-form", body).addEventListener("submit", (e) => {
        e.preventDefault();
        const amount = Math.round(Number($("#f-amt", body).value) * 100) / 100;
        const name = $("#f-name", body).value.trim();
        const err = $("#f-err", body);
        if (!(amount > 0)) { err.textContent = "Enter an amount above ₹0."; $("#f-amt", body).focus(); return; }
        if (!name) { err.textContent = txType === "debit" ? "Who did you pay?" : "Who was it from?"; $("#f-name", body).focus(); return; }
        const cat = (body.querySelector('input[name="f-cat"]:checked') || {}).value || (txType === "debit" ? "other" : "income");
        const date = $("#f-date", body).value || localISO();
        ctx.update((s) => s.transactions.push({
          id: uid(), type: txType, amount, merchant: name, vpa: "", account: "", bank: "", ref: "", mode: "Cash",
          date, note: $("#f-note", body).value.trim(), raw: "", source: "manual", category: cat, excluded: false, reviewed: true
        }));
        toast(`Added ${name} · ${inr(amount, { paise: true })}`, { action: "View", onAction: () => ctx.go("#activity") });
      });
      return;
    }

    // ---- paste mode ----
    body.innerHTML = `
      <div class="stack">
        <p class="hint">Copy one or more bank SMS from Messages and paste them here. Leave a blank line between messages.</p>
        <label class="field"><span class="sr">Bank SMS</span>
          <textarea class="input area" id="p-text" rows="6" placeholder="Sent Rs.250.00 From HDFC Bank A/C *1234 To SWIGGY On 16/11/26 Ref 6312…">${esc(pasted)}</textarea>
        </label>
        <button class="btn outline" type="button" id="p-read">${icon("sms")}Read messages</button>
        <div id="p-out"></div>
      </div>`;
    const out = $("#p-out", body);
    const paintPreview = () => {
      if (!preview) return (out.innerHTML = "");
      const ok = preview.filter((r) => r.txn);
      const bad = preview.filter((r) => !r.txn);
      out.innerHTML = `
        ${ok.length ? `<div class="list">${ok.map((r) => `
          <div class="txn static ${r.txn.type === "credit" ? "in" : ""}">
            <span class="bubble tone-${esc((cats[r.txn.category] || {}).tone || "grey")}">${icon((cats[r.txn.category] || {}).icon || "dots")}</span>
            <span class="txn-mid"><span class="txn-name">${esc(r.txn.merchant)}</span><span class="txn-sub">${esc((cats[r.txn.category] || {}).name || "Other")} · ${esc(r.txn.mode)}${r.txn.bank ? " · " + esc(r.txn.bank) : ""}</span></span>
            <span class="txn-amt num">${r.txn.type === "credit" ? "+" : "−"}${inr(r.txn.amount, { paise: true })}</span>
          </div>`).join("")}</div>` : ""}
        ${bad.length ? `<p class="hint">${bad.length} message${bad.length > 1 ? "s" : ""} skipped: ${esc([...new Set(bad.map((r) => r.skip))].join(", "))}.</p>` : ""}
        ${ok.length ? `<p class="hint">They'll be dated now. Tap any transaction later to change its date or category.</p>
          <button class="btn" type="button" id="p-add">${icon("plus")}Add ${ok.length} transaction${ok.length > 1 ? "s" : ""}</button>` : ""}`;
      const addBtn = $("#p-add", out);
      if (addBtn) addBtn.addEventListener("click", () => {
        ctx.update((s) => ok.forEach((r) => s.transactions.push({ ...r.txn, source: "paste" })));
        toast(`Added ${ok.length} transaction${ok.length > 1 ? "s" : ""}`, { action: "Review", onAction: () => ctx.go("#activity?f=review") });
        pasted = "";
        preview = null;
        ctx.rerender();
      });
    };
    paintPreview();
    $("#p-text", body).addEventListener("input", (e) => (pasted = e.target.value));
    $("#p-read", body).addEventListener("click", () => {
      const msgs = splitMessages(pasted);
      if (!msgs.length) return toast("Paste a bank SMS first.");
      const seen = { transactions: state.transactions.slice(), rules: state.rules };
      preview = msgs.map((m) => {
        const r = txnFromSms(seen, m, { source: "paste" });
        if (r.txn) seen.transactions.push(r.txn);
        return r;
      });
      paintPreview();
    });
  }
};
