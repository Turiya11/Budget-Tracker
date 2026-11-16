/* Shared UI pieces: bubbles, rows, sheet, toast, copy. */
import { icon } from "./icons.js";
import { esc, inr, timeLabel } from "./format.js";

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

export function bubble(iconName, tone, cls = "") {
  return `<span class="bubble tone-${esc(tone || "grey")} ${cls}">${icon(iconName)}</span>`;
}
export function catBubble(cat, cls = "") {
  return bubble(cat ? cat.icon : "dots", cat ? cat.tone : "grey", cls);
}

export function bar(value, max, { over = false, tone = "" } = {}) {
  const w = max > 0 ? Math.min(value / max, 1) * 100 : value > 0 ? 100 : 0;
  return `<span class="bar ${over ? "over" : ""} ${tone ? "tone-" + tone : ""}"><i style="width:${w.toFixed(1)}%"></i></span>`;
}

export function txnRow(t, cats) {
  const cat = cats[t.category];
  const sign = t.type === "credit" ? "+" : "−";
  const sub = [cat ? cat.name : "Other", t.mode, timeLabel(t.date)].filter(Boolean).join(" · ");
  return `<button class="txn ${t.type === "credit" ? "in" : ""} ${t.excluded ? "muted" : ""}" type="button" data-txn="${esc(t.id)}">
    ${catBubble(cat)}
    <span class="txn-mid">
      <span class="txn-name">${esc(t.merchant)}${!t.reviewed ? '<i class="newdot" title="New"></i>' : ""}</span>
      <span class="txn-sub">${esc(sub)}</span>
    </span>
    <span class="txn-amt num">${sign}${inr(t.amount, { paise: true })}</span>
  </button>`;
}

export function catPicker(categories, selected, name = "cat") {
  return `<div class="catpick" role="radiogroup" aria-label="Category">${categories
    .map(
      (c) => `<label><input type="radio" name="${name}" value="${esc(c.id)}" ${c.id === selected ? "checked" : ""}>
      <span class="opt">${catBubble(c)}<span>${esc(c.name)}</span></span></label>`
    )
    .join("")}</div>`;
}

/* ---------- toast ---------- */
let toastTimer = null;
export function toast(text, { action, onAction, ms = 4500 } = {}) {
  const el = $("#toast");
  $("#toast-text").textContent = text;
  const btn = $("#toast-btn");
  btn.hidden = !action;
  btn.textContent = action || "";
  btn.onclick = () => {
    el.hidden = true;
    onAction && onAction();
  };
  el.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (el.hidden = true), ms);
}

/* ---------- bottom sheet ---------- */
export function openSheet({ title, html, onMount }) {
  const dlg = $("#sheet");
  $("#sheet-title").textContent = title;
  const body = $("#sheet-body");
  body.innerHTML = html;
  const close = () => {
    if (dlg.open) dlg.close();
  };
  dlg.onclick = (e) => {
    if (e.target === dlg) close();
  };
  $("#sheet-close").onclick = close;
  if (!dlg.open) dlg.showModal();
  body.scrollTop = 0;
  onMount && onMount(body, close);
  return close;
}

/* ---------- clipboard ---------- */
export async function copy(text, btn) {
  try {
    await navigator.clipboard.writeText(text);
    if (btn) {
      const old = btn.innerHTML;
      btn.innerHTML = icon("check") + "Copied";
      setTimeout(() => (btn.innerHTML = old), 1600);
    } else toast("Copied");
  } catch (e) {
    toast("Couldn't copy. Press and hold the text to copy it.");
  }
}

export function downloadFile(name, text, type = "application/json") {
  const blob = new Blob([text], { type });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 2000);
}
