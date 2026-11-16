/* App shell: routing, header, sync loop, alerts. */
import * as store from "./store.js";
import * as sync from "./sync.js";
import { applyInbox } from "./capture.js";
import { catMap, freshAlerts } from "./budget.js";
import { monthKey, shiftMonth } from "./format.js";
import { icon } from "./icons.js";
import { $, $$, toast } from "./ui.js";
import { openTxnSheet, openInvestSheet } from "./views/sheets.js";
import home from "./views/home.js";
import activity from "./views/activity.js";
import add from "./views/add.js";
import budget from "./views/budget.js";
import invest from "./views/invest.js";
import settings from "./views/settings.js";
import setup from "./views/setup.js";

const VIEWS = { home, activity, add, budget, invest, settings, setup };
const TABS = ["home", "activity", "add", "budget", "invest"];
const TITLES = { home: "Overview", activity: "Activity", add: "Add", budget: "Budget", invest: "Investments", settings: "Settings", setup: "Auto-capture" };

const S = { month: monthKey(), route: "home", params: {}, syncing: false };

function parseHash() {
  const h = location.hash.slice(1);
  const [r, q] = h.split("?");
  S.route = VIEWS[r] ? r : "home";
  S.params = Object.fromEntries(new URLSearchParams(q || ""));
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}
function setMonth(k) {
  S.month = k;
  render();
}

export function ctx() {
  const state = store.get();
  return {
    state,
    cats: catMap(state),
    month: S.month,
    route: S.route,
    params: S.params,
    syncing: S.syncing,
    setMonth,
    go,
    update: store.update,
    syncNow,
    pushNow: () => pushSnapshot(true),
    rerender: render,
    openTxn: (id) => openTxnSheet(ctx, id),
    openInvest: (id, prefill) => openInvestSheet(ctx, id, prefill)
  };
}

/* ---------- header + nav ---------- */
function renderChrome() {
  const st = store.get();
  const isTab = TABS.includes(S.route);
  $("#hdr-title").textContent = TITLES[S.route];
  const left = $("#hdr-left");
  if (isTab) {
    const configured = sync.isConfigured(st.sync);
    left.innerHTML = icon("refresh", S.syncing ? "spin" : "") + (configured && st.sync.lastError ? '<i class="dot-badge warn"></i>' : "");
    left.setAttribute("aria-label", configured ? "Sync now" : "Set up auto-capture");
    left.dataset.act = configured ? "sync" : "setup";
  } else {
    left.innerHTML = icon("back");
    left.setAttribute("aria-label", "Back");
    left.dataset.act = "back";
  }
  const right = $("#hdr-right");
  right.style.visibility = S.route === "settings" ? "hidden" : "visible";
  right.innerHTML = icon("gear") + (!sync.isConfigured(st.sync) ? '<i class="dot-badge"></i>' : "");
  $$(".nav a").forEach((a) => {
    if (a.dataset.route === S.route) a.setAttribute("aria-current", "page");
    else a.removeAttribute("aria-current");
  });
}

let lastRoute = null;
function render() {
  renderChrome();
  const root = $("#view");
  const y = window.scrollY;
  root.innerHTML = "";
  VIEWS[S.route].render(root, ctx());
  if (lastRoute === S.route) window.scrollTo(0, y);
  else window.scrollTo(0, 0);
  lastRoute = S.route;
}

/* ---------- sync ---------- */
let lastPushed = "";
let lastAttempt = "";
let pushTimer = null;

async function pushSnapshot(force = false) {
  const st = store.get();
  if (!sync.isConfigured(st.sync)) return;
  const data = { ...store.exportable(), summary: sync.serverSummary(st) };
  const json = JSON.stringify(data);
  if (!force && (json === lastPushed || json === lastAttempt)) return;
  lastAttempt = json;
  await sync.saveSnapshot(st.sync, data);
  lastPushed = json;
}
function schedulePush() {
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushSnapshot().catch((e) => setSyncError(e.message));
  }, 2500);
}
function setSyncError(msg) {
  if (store.get().sync.lastError !== msg) store.update((s) => (s.sync.lastError = msg));
}

async function syncNow({ quiet = false } = {}) {
  const st = store.get();
  if (!sync.isConfigured(st.sync) || S.syncing) return;
  S.syncing = true;
  renderChrome();
  try {
    const rows = (await sync.pull(st.sync)) || [];
    let added = [];
    if (rows.length) store.update((s) => (added = applyInbox(s, rows).added));
    await pushSnapshot(true);
    if (rows.length) await sync.ack(st.sync, rows.map((r) => r.id));
    store.update((s) => {
      s.sync.lastSync = Date.now();
      s.sync.lastError = "";
    });
    if (added.length) {
      toast(`${added.length} new transaction${added.length > 1 ? "s" : ""} captured`, {
        action: "Review",
        onAction: () => go("#activity?f=review")
      });
    } else if (!quiet) toast("You're up to date");
  } catch (e) {
    setSyncError(e.message);
    if (!quiet) toast(e.message);
  } finally {
    S.syncing = false;
    renderChrome();
  }
}

/* ---------- in-app alerts ---------- */
let checking = false;
function checkAlerts() {
  if (checking) return;
  const st = store.get();
  const key = monthKey();
  const fresh = freshAlerts(st, key);
  if (!fresh.length) return;
  checking = true;
  store.update((s) => {
    s.alertsFired[key] = s.alertsFired[key] || {};
    fresh.forEach((a) => (s.alertsFired[key][a.id] = Date.now()));
  });
  checking = false;
  const order = { over: 0, warn: 1, info: 2 };
  const top = fresh.sort((a, b) => order[a.level] - order[b.level])[0];
  toast(top.title + ". " + top.body, { ms: 7000, action: "Budget", onAction: () => go("#budget") });
}

/* ---------- events ---------- */
document.addEventListener("click", (e) => {
  const a = e.target.closest("[data-act],[data-go],[data-txn],[data-inv]");
  if (!a) return;
  if (a.dataset.go) return go(a.dataset.go);
  if (a.dataset.txn) return openTxnSheet(ctx, a.dataset.txn);
  if (a.dataset.inv) return openInvestSheet(ctx, a.dataset.inv);
  switch (a.dataset.act) {
    case "sync": return syncNow();
    case "setup": return go("#setup");
    case "back": return history.length > 1 ? history.back() : go("#home");
    case "settings": return go("#settings");
    case "prev-month": return setMonth(shiftMonth(S.month, -1));
    case "next-month": return setMonth(shiftMonth(S.month, 1));
    case "this-month": return setMonth(monthKey());
  }
});

window.addEventListener("hashchange", () => {
  parseHash();
  render();
});

store.subscribe(() => {
  render();
  schedulePush();
  checkAlerts();
});

let hiddenAt = 0;
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "hidden") {
    hiddenAt = Date.now();
    return;
  }
  // Coming back after a few minutes counts as opening the app.
  if (store.get().settings.openOnAdd && hiddenAt && Date.now() - hiddenAt > 3 * 60000 && TABS.includes(S.route) && !document.querySelector("#sheet[open]")) go("#add");
  syncNow({ quiet: true });
});
setInterval(() => {
  if (document.visibilityState === "visible") syncNow({ quiet: true });
}, 60000);

/* ---------- boot ---------- */
$("#hdr-right").dataset.act = "settings";
if (store.get().settings.openOnAdd && (!location.hash || location.hash === "#home")) history.replaceState(null, "", "#add");
parseHash();
render();
checkAlerts();
syncNow({ quiet: true });

if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

