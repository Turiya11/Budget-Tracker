import { summarize, pace, activeAlerts } from "../budget.js";
import { isConfigured } from "../sync.js";
import { inr, esc, pct } from "../format.js";
import { icon } from "../icons.js";
import { catBubble, bar, txnRow, bubble } from "../ui.js";
import { monthSwitch, byDateDesc, emptyCard } from "./common.js";

export default {
  render(root, ctx) {
    const { state, month, cats } = ctx;
    const s = summarize(state, month);
    const p = pace(month);
    const alerts = activeAlerts(state, month);
    const left = s.budget - s.spent;
    const over = s.budget > 0 && left < 0;
    const monthTx = state.transactions.filter((t) => String(t.date).slice(0, 7) === month);
    const recent = monthTx.slice().sort(byDateDesc).slice(0, 5);
    const top = Object.entries(s.byCat).sort((a, b) => b[1] - a[1]).slice(0, 4);

    const heroFoot = s.budget > 0
      ? `<div class="hero-foot num">
          <span class="${over ? "bad" : ""}">${over ? inr(-left) + " over budget" : inr(left) + " left"}</span>
          <span>${p.current && left > 0 && p.daysLeft > 0 ? inr(left / p.daysLeft) + "/day for " + p.daysLeft + (p.daysLeft === 1 ? " day" : " days") : ""}</span>
        </div>`
      : `<button class="linkbtn" type="button" data-go="#budget">Set a monthly budget</button>`;

    const setupCard = !isConfigured(state.sync) ? `
      <button class="card setupcard" type="button" data-go="#setup">
        ${bubble("sms", "lilac")}
        <span><b>Turn on auto-capture</b><small>Log UPI and card payments from your bank SMS without typing them.</small></span>
        ${icon("chevR")}
      </button>` : "";

    const alertHtml = alerts.map((a) => `
      <div class="alert lv-${a.level}" role="status">
        <span class="alert-ic">${icon(a.level === "info" ? "trend" : "alert")}</span>
        <span><b>${esc(a.title)}</b><small>${esc(a.body)}</small></span>
      </div>`).join("");

    const tiles = top.length
      ? `<div class="tiles">${top.map(([id, amt]) => {
          const c = cats[id] || { name: "Other", icon: "dots", tone: "grey" };
          const lim = Number(c.limit) || 0;
          return `<button class="tile" type="button" data-go="#activity?f=${esc(id)}">
            ${catBubble(c)}
            <span class="tile-name">${esc(c.name)}</span>
            <span class="tile-amt num"><b>${inr(amt)}</b>${lim ? " / " + inr(lim) : ""}</span>
            ${lim ? bar(amt, lim, { over: amt > lim, tone: c.tone }) : `<span class="tile-sub">${pct(amt, s.spent)}% of spending</span>`}
          </button>`;
        }).join("")}</div>`
      : `<p class="hint">Spending by category shows up here once you have transactions this month.</p>`;

    root.innerHTML = `
      ${monthSwitch(month)}
      ${setupCard}
      <section class="hero">
        <span class="k">Spent this month</span>
        <span class="v num ${over ? "bad" : ""}">${inr(s.spent)}</span>
        ${s.budget > 0 ? `<span class="sub num">of ${inr(s.budget)} budget · ${pct(s.spent, s.budget)}%</span>${bar(s.spent, s.budget, { over })}` : ""}
        ${heroFoot}
      </section>
      ${alertHtml}
      ${s.review ? `<button class="reviewchip" type="button" data-go="#activity?f=review"><i class="newdot"></i>${s.review} new ${s.review === 1 ? "transaction" : "transactions"} to review ${icon("chevR")}</button>` : ""}
      <div class="stats">
        <div class="stat">${bubble("arrowDown", "sage")}<span><span class="k">Money in</span><span class="v num">${inr(s.income)}</span></span></div>
        <button class="stat" type="button" data-go="#invest">${bubble("trend", "mint")}<span><span class="k">Invested</span><span class="v num">${inr(s.invested)}</span></span></button>
      </div>
      <section class="sec">
        <div class="sec-head"><h2>Where it went</h2><button class="linkbtn" type="button" data-go="#budget">Limits</button></div>
        ${tiles}
      </section>
      <section class="sec">
        <div class="sec-head"><h2>Recent</h2>${monthTx.length ? `<button class="linkbtn" type="button" data-go="#activity">See all ${monthTx.length}</button>` : ""}</div>
        ${recent.length ? `<div class="list">${recent.map((t) => txnRow(t, cats)).join("")}</div>`
          : emptyCard("list", "lilac", "No transactions this month yet. Auto-captured payments appear here, or add one yourself.", "Add a transaction", "#add")}
      </section>`;
  }
};
