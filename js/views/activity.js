import { inr, esc, dayLabel } from "../format.js";
import { icon } from "../icons.js";
import { txnRow, $ } from "../ui.js";
import { monthSwitch, byDateDesc, emptyCard } from "./common.js";

let query = "";

function filterTxns(list, f, cats) {
  const q = query.trim().toLowerCase();
  return list.filter((t) => {
    if (f === "spent" && t.type !== "debit") return false;
    if (f === "received" && t.type !== "credit") return false;
    if (f === "review" && t.reviewed) return false;
    if (cats[f] && t.category !== f) return false;
    if (q) {
      const hay = `${t.merchant} ${t.note || ""} ${(cats[t.category] || {}).name || ""} ${t.amount}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}

function listHtml(items, cats) {
  if (!items.length) return "";
  const groups = new Map();
  for (const t of items) {
    const d = String(t.date).slice(0, 10);
    if (!groups.has(d)) groups.set(d, []);
    groups.get(d).push(t);
  }
  let html = "";
  for (const [, ts] of groups) {
    const out = ts.filter((t) => t.type === "debit" && !t.excluded).reduce((a, t) => a + Number(t.amount), 0);
    html += `<div class="day"><div class="day-head"><span>${esc(dayLabel(ts[0].date))}</span><span class="num">${out ? "−" + inr(out) : ""}</span></div>
      <div class="list">${ts.map((t) => txnRow(t, cats)).join("")}</div></div>`;
  }
  return html;
}

export default {
  render(root, ctx) {
    const { state, month, cats, params } = ctx;
    const f = params.f || "all";
    const monthTx = state.transactions.filter((t) => String(t.date).slice(0, 7) === month).sort(byDateDesc);
    const counts = {
      all: monthTx.length,
      spent: monthTx.filter((t) => t.type === "debit").length,
      received: monthTx.filter((t) => t.type === "credit").length,
      review: monthTx.filter((t) => !t.reviewed).length
    };
    const usedCats = [...new Set(monthTx.map((t) => t.category))].filter((id) => cats[id]);
    const chips = [["all", "All"], ["spent", "Spent"], ["received", "Received"], ["review", "To review"]]
      .filter(([id]) => id === "all" || counts[id] || f === id)
      .map(([id, label]) => [id, label, counts[id]])
      .concat(usedCats.map((id) => [id, cats[id].name, monthTx.filter((t) => t.category === id).length]));

    root.innerHTML = `
      ${monthSwitch(month, "Activity")}
      <label class="search">${icon("search")}<span class="sr">Search transactions</span>
        <input id="act-q" type="search" placeholder="Search merchant, note, category" value="${esc(query)}" autocomplete="off" enterkeyhint="search">
      </label>
      <div class="chips" role="group" aria-label="Filter">
        ${chips.map(([id, label, n]) => `<button class="chip" type="button" aria-pressed="${f === id}" data-go="#activity${id === "all" ? "" : "?f=" + esc(id)}">${esc(label)}<span class="count num">${n}</span></button>`).join("")}
      </div>
      ${f === "review" && counts.review ? `<button class="btn outline small" type="button" id="mark-all">${icon("check")}Mark all ${counts.review} as reviewed</button>` : ""}
      <div id="act-list"></div>`;

    const paint = () => {
      const items = filterTxns(monthTx, f, cats);
      $("#act-list", root).innerHTML = items.length
        ? listHtml(items, cats)
        : monthTx.length
          ? `<p class="hint center">Nothing matches.</p>`
          : emptyCard("list", "lilac", "No transactions this month.", "Add a transaction", "#add");
    };
    paint();
    $("#act-q", root).addEventListener("input", (e) => {
      query = e.target.value;
      paint();
    });
    const mark = $("#mark-all", root);
    if (mark) mark.addEventListener("click", () => {
      ctx.update((s) => s.transactions.forEach((t) => {
        if (String(t.date).slice(0, 7) === month) t.reviewed = true;
      }));
    });
  }
};
