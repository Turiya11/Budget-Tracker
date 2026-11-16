import { investSummary } from "../budget.js";
import { INVESTMENT_TYPES } from "../categories.js";
import { inr, esc, pct, monthLabel, shortDate } from "../format.js";
import { icon } from "../icons.js";
import { bubble, bar, $ } from "../ui.js";
import { monthSwitch, byDateDesc, emptyCard } from "./common.js";

const TYPES = Object.fromEntries(INVESTMENT_TYPES.map((t) => [t.id, t]));

export default {
  render(root, ctx) {
    const { state, month } = ctx;
    const s = investSummary(state, month);
    const goal = Number(state.settings.investGoal) || 0;
    const linked = new Set(state.investments.map((i) => i.fromTxn).filter(Boolean));
    const detected = state.transactions.filter((t) => t.category === "investments" && t.type === "debit" && !linked.has(t.id) && !t.investDismissed);
    const all = state.investments.slice().sort(byDateDesc);
    const groups = new Map();
    for (const i of all) {
      const k = String(i.date).slice(0, 7);
      if (!groups.has(k)) groups.set(k, []);
      groups.get(k).push(i);
    }
    const types = Object.entries(s.byType).sort((a, b) => b[1] - a[1]);

    root.innerHTML = `
      ${monthSwitch(month, "Investments")}
      <section class="hero">
        <span class="k">Invested this month</span>
        <span class="v num">${inr(s.month)}</span>
        ${goal ? `<span class="sub num">of your ${inr(goal)} monthly goal · ${pct(s.month, goal)}%</span>${bar(s.month, goal, { tone: "mint" })}` : ""}
        <div class="hero-foot num"><span>Total invested ${inr(s.total)}</span>
          ${s.valueBase ? `<span class="${s.gain < 0 ? "bad" : "good"}">Now ${inr(s.value)} (${s.gain < 0 ? "" : "+"}${inr(s.gain)})</span>` : ""}</div>
      </section>
      <button class="btn" type="button" id="inv-add">${icon("plus")}Record an investment</button>

      ${detected.length ? `
      <section class="card">
        <h2>Payments that look like investments</h2>
        <p class="hint">Found in your transactions. Record them here to track them.</p>
        <div class="list">${detected.slice(0, 5).map((t) => `
          <div class="detect">
            ${bubble("trend", "mint")}
            <span class="txn-mid"><span class="txn-name">${esc(t.merchant)}</span><span class="txn-sub">${esc(shortDate(t.date))}</span></span>
            <span class="txn-amt num">${inr(t.amount)}</span>
            <button class="btn small" type="button" data-log="${esc(t.id)}">Record</button>
          </div>`).join("")}</div>
      </section>` : ""}

      ${types.length ? `<section class="sec"><div class="sec-head"><h2>By type</h2><span class="hint">All time</span></div>
        <div class="tiles">${types.map(([id, amt]) => {
          const t = TYPES[id] || TYPES.other;
          return `<div class="tile">${bubble(t.icon, t.tone)}<span class="tile-name">${esc(t.name)}</span><span class="tile-amt num"><b>${inr(amt)}</b></span><span class="tile-sub">${pct(amt, s.total)}% of total</span></div>`;
        }).join("")}</div></section>` : ""}

      <section class="sec">
        <div class="sec-head"><h2>History</h2></div>
        ${all.length ? [...groups].map(([k, items]) => `
          <div class="day"><div class="day-head"><span>${esc(monthLabel(k))}</span><span class="num">${inr(items.reduce((a, i) => a + Number(i.amount), 0))}</span></div>
          <div class="list">${items.map((i) => {
            const t = TYPES[i.type] || TYPES.other;
            const gain = i.currentValue != null && i.currentValue !== "" ? Number(i.currentValue) - Number(i.amount) : null;
            return `<button class="txn" type="button" data-inv="${esc(i.id)}">
              ${bubble(t.icon, t.tone)}
              <span class="txn-mid"><span class="txn-name">${esc(i.name || t.name)}${i.sip ? ' <span class="pill">SIP</span>' : ""}</span>
                <span class="txn-sub">${esc(t.name)} · ${esc(shortDate(i.date))}${i.units ? " · " + esc(i.units) + " units" : ""}</span></span>
              <span class="txn-amt num">${inr(i.amount, { paise: true })}${gain != null ? `<small class="${gain < 0 ? "bad" : "good"}">${gain < 0 ? "" : "+"}${inr(gain)}</small>` : ""}</span>
            </button>`;
          }).join("")}</div></div>`).join("")
          : emptyCard("trend", "mint", "Nothing recorded yet. Add each SIP, stock buy or deposit to see your total grow.", "", "")}
      </section>

      <section class="card">
        <label class="field"><span>Monthly investing goal (optional)</span>
          <span class="money"><input class="input num" id="inv-goal" type="number" inputmode="numeric" min="0" step="500" value="${goal || ""}" placeholder="e.g. 2,000"></span>
        </label>
        <p class="hint">This section is a record of what you put in. It doesn't fetch prices; update "current value" on an entry whenever you like.</p>
      </section>`;

    $("#inv-add", root).addEventListener("click", () => ctx.openInvest(null));
    root.querySelectorAll("[data-log]").forEach((b) => b.addEventListener("click", () => {
      const t = state.transactions.find((x) => x.id === b.dataset.log);
      if (!t) return;
      const name = t.merchant;
      const type = /groww|zerodha|coin|kuvera|mf|mutual|sip|bse|iccl|cams|kfin/i.test(`${t.merchant} ${t.vpa} ${t.raw}`) ? "mf" : "other";
      ctx.openInvest(null, { amount: t.amount, date: String(t.date).slice(0, 10), name, type, fromTxn: t.id });
    }));
    $("#inv-goal", root).addEventListener("change", (e) => ctx.update((s) => (s.settings.investGoal = Math.max(0, Math.round(Number(e.target.value) || 0)))));
  }
};
