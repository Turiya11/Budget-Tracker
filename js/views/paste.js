/* Paste one or more bank SMS to log them. */
import { inr, esc } from "../format.js";
import { icon } from "../icons.js";
import { toast, $ } from "../ui.js";
import { txnFromSms } from "../capture.js";
import { splitMessages } from "../parser.js";

let pasted = "";
let preview = null;

export default {
  render(body, ctx) {
    const { state, cats } = ctx;
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
