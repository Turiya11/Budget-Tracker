import { icon } from "../icons.js";
import { monthName, monthKey, esc } from "../format.js";

export function monthSwitch(month, title) {
  const isNow = month === monthKey();
  const year = month.slice(0, 4);
  return `<div class="monthrow">
    <div class="mr-title">
      <h1 class="big">${esc(title || monthName(month))}</h1>
      <span class="mr-sub">${title ? esc(monthName(month)) + " " + year : year}${isNow ? "" : ` · <button class="linkbtn" data-act="this-month" type="button">Back to today</button>`}</span>
    </div>
    <div class="mr-nav">
      <button class="round sm" type="button" data-act="prev-month" aria-label="Previous month">${icon("chevL")}</button>
      <button class="round sm" type="button" data-act="next-month" aria-label="Next month">${icon("chevR")}</button>
    </div>
  </div>`;
}

export const byDateDesc = (a, b) => String(b.date).localeCompare(String(a.date));

export function emptyCard(iconName, tone, text, cta, href) {
  return `<div class="card empty">
    <span class="bubble tone-${tone} lg">${icon(iconName)}</span>
    <p>${esc(text)}</p>
    ${cta ? `<button class="btn small" type="button" data-go="${esc(href)}">${esc(cta)}</button>` : ""}
  </div>`;
}
