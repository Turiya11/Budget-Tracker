import { summarize } from "../budget.js";
import { TONES } from "../categories.js";
import { inr, esc, pct, uid } from "../format.js";
import { icon } from "../icons.js";
import { catBubble, bar, toast, $, $$ } from "../ui.js";
import { monthSwitch } from "./common.js";

const ICONS = ["dots", "food", "basket", "car", "bag", "bolt", "film", "pulse", "book", "home", "user", "tag", "phone", "coin"];

export default {
  render(root, ctx) {
    const { state, month } = ctx;
    const s = summarize(state, month);
    const st = state.settings;
    const budgetCats = state.categories.filter((c) => c.inBudget !== false && c.kind !== "income");
    const otherCats = state.categories.filter((c) => !(c.inBudget !== false && c.kind !== "income") && c.kind !== "income");
    const limitsTotal = budgetCats.reduce((a, c) => a + (Number(c.limit) || 0), 0);

    root.innerHTML = `
      ${monthSwitch(month, "Budget")}
      <section class="card">
        <label class="field"><span>Monthly spending budget</span>
          <span class="money"><input class="input num" id="b-total" type="number" inputmode="numeric" min="0" step="500" value="${st.monthlyBudget || ""}" placeholder="e.g. 8,000"></span>
        </label>
        ${s.budget ? `<div class="kv num"><span>Spent in this month</span><b>${inr(s.spent)} · ${pct(s.spent, s.budget)}%</b></div>${bar(s.spent, s.budget, { over: s.spent > s.budget })}` : ""}
        <p class="hint">${limitsTotal ? `Category limits add up to ${inr(limitsTotal)}${s.budget ? (limitsTotal > s.budget ? `, ${inr(limitsTotal - s.budget)} more than your budget.` : `, ${inr(s.budget - limitsTotal)} left unassigned.`) : "."}` : "Optional: give categories their own limits below to get alerts per category."}</p>
      </section>

      <section class="sec">
        <div class="sec-head"><h2>Category limits</h2><span class="hint">Leave blank for no limit</span></div>
        <div class="list">
          ${budgetCats.map((c) => {
            const spent = s.byCat[c.id] || 0;
            const lim = Number(c.limit) || 0;
            const over = lim && spent > lim;
            return `<div class="limrow">
              ${catBubble(c)}
              <div class="limrow-mid">
                <span class="limrow-name">${esc(c.name)}</span>
                <span class="limrow-sub num ${over ? "bad" : ""}">${inr(spent)}${lim ? ` of ${inr(lim)}${over ? " · over by " + inr(spent - lim) : ""}` : " spent"}</span>
                ${lim ? bar(spent, lim, { over, tone: c.tone }) : ""}
              </div>
              <label class="limin"><span class="sr">${esc(c.name)} monthly limit</span>
                <span class="money sm"><input class="input num" type="number" inputmode="numeric" min="0" step="100" data-limit="${esc(c.id)}" value="${lim || ""}" placeholder="—"></span>
              </label>
            </div>`;
          }).join("")}
        </div>
      </section>

      <section class="card">
        <h2>Alerts</h2>
        <p class="hint">Your iPhone shows these as notifications when a payment is captured. They also appear in the app.</p>
        <label class="row-field"><span><b>Warn me at</b><small>Percent of a budget or limit</small></span>
          <select class="input sel" id="a-warn">${[50, 60, 70, 75, 80, 85, 90, 95].map((v) => `<option value="${v}" ${Number(st.warnAt) === v ? "selected" : ""}>${v}%</option>`).join("")}</select>
        </label>
        <label class="row-field"><span><b>Large payment alert</b><small>Any single payment at or above</small></span>
          <span class="money sm"><input class="input num" id="a-large" type="number" inputmode="numeric" min="0" step="500" value="${st.largeTxn || ""}" placeholder="Off"></span>
        </label>
        <label class="row-field"><span><b>Spending pace</b><small>Tell me when I'm spending faster than the month is passing</small></span>
          <span class="switch"><input type="checkbox" id="a-pace" ${st.paceAlert ? "checked" : ""}><i></i></span>
        </label>
      </section>

      <details class="acc">
        <summary>${catBubble({ icon: "tag", tone: "violet" })}<span class="acc-t">Categories</span><span class="chev">${icon("chevD")}</span></summary>
        <div class="acc-body">
          <p class="hint">Switch off "Counts in budget" for money that isn't spending, like transfers to your own accounts.</p>
          ${[...budgetCats, ...otherCats].map((c) => `
            <div class="catrow">
              ${catBubble(c)}
              <span class="catrow-name">${esc(c.name)}</span>
              ${c.system ? `<span class="hint sm">Not counted</span>` : `
                <label class="mini-switch"><span class="sr">Counts in budget</span><span class="switch sm"><input type="checkbox" data-inbudget="${esc(c.id)}" ${c.inBudget !== false ? "checked" : ""}><i></i></span></label>
                ${c.custom ? `<button class="iconbtn" type="button" data-delcat="${esc(c.id)}" aria-label="Delete ${esc(c.name)}">${icon("trash")}</button>` : ""}`}
            </div>`).join("")}
          <form class="addcat" id="addcat" novalidate>
            <input class="input" id="nc-name" type="text" maxlength="24" placeholder="New category name">
            <select class="input sel" id="nc-icon" aria-label="Icon">${ICONS.map((i) => `<option value="${i}">${i}</option>`).join("")}</select>
            <button class="btn small" type="submit">${icon("plus")}Add</button>
          </form>
        </div>
      </details>

      ${state.rules.length ? `
      <details class="acc">
        <summary>${catBubble({ icon: "edit", tone: "pink" })}<span class="acc-t">Your merchant rules</span><span class="count num">${state.rules.length}</span><span class="chev">${icon("chevD")}</span></summary>
        <div class="acc-body">
          <p class="hint">Made when you change a merchant's category and keep "Always use this category" on.</p>
          ${state.rules.map((r, i) => `<div class="catrow"><span class="catrow-name">${esc(r.match)} → ${esc((ctx.cats[r.category] || {}).name || r.category)}</span>
            <button class="iconbtn" type="button" data-delrule="${i}" aria-label="Delete rule for ${esc(r.match)}">${icon("trash")}</button></div>`).join("")}
        </div>
      </details>` : ""}`;

    const num = (v) => Math.max(0, Math.round(Number(v) || 0));
    $("#b-total", root).addEventListener("change", (e) => ctx.update((s) => (s.settings.monthlyBudget = num(e.target.value))));
    $$("[data-limit]", root).forEach((inp) => inp.addEventListener("change", () => {
      ctx.update((s) => {
        const c = s.categories.find((x) => x.id === inp.dataset.limit);
        if (c) c.limit = num(inp.value);
      });
    }));
    $("#a-warn", root).addEventListener("change", (e) => ctx.update((s) => (s.settings.warnAt = Number(e.target.value))));
    $("#a-large", root).addEventListener("change", (e) => ctx.update((s) => (s.settings.largeTxn = num(e.target.value))));
    $("#a-pace", root).addEventListener("change", (e) => ctx.update((s) => (s.settings.paceAlert = e.target.checked)));
    $$("[data-inbudget]", root).forEach((inp) => inp.addEventListener("change", () => {
      ctx.update((s) => {
        const c = s.categories.find((x) => x.id === inp.dataset.inbudget);
        if (c) c.inBudget = inp.checked;
      });
    }));
    $$("[data-delcat]", root).forEach((b) => b.addEventListener("click", () => {
      const id = b.dataset.delcat;
      const c = state.categories.find((x) => x.id === id);
      const n = state.transactions.filter((t) => t.category === id).length;
      ctx.update((s) => {
        s.categories = s.categories.filter((x) => x.id !== id);
        s.transactions.forEach((t) => { if (t.category === id) t.category = "other"; });
        s.rules = s.rules.filter((r) => r.category !== id);
      });
      toast(`Deleted ${c.name}${n ? `. ${n} transaction${n > 1 ? "s" : ""} moved to Other` : ""}.`);
    }));
    $$("[data-delrule]", root).forEach((b) => b.addEventListener("click", () => {
      ctx.update((s) => s.rules.splice(Number(b.dataset.delrule), 1));
    }));
    $("#addcat", root).addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#nc-name", root).value.trim();
      if (!name) return $("#nc-name", root).focus();
      if (state.categories.some((c) => c.name.toLowerCase() === name.toLowerCase())) return toast("You already have a category with that name.");
      const tone = TONES[state.categories.length % TONES.length];
      ctx.update((s) => {
        const otherIdx = s.categories.findIndex((c) => c.id === "other");
        s.categories.splice(otherIdx < 0 ? s.categories.length : otherIdx, 0, { id: "c-" + uid(), name, icon: $("#nc-icon", root).value, tone, limit: 0, inBudget: true, custom: true });
      });
      toast(`Added ${name}`);
    });
  }
};
