/* App state: one JSON document in localStorage, with subscribe/update. */
import { DEFAULT_CATEGORIES } from "./categories.js";

const KEY = "bt-state-v1";

export function defaults() {
  return {
    version: 1,
    settings: {
      monthlyBudget: 0,
      warnAt: 80,
      largeTxn: 2000,
      paceAlert: true,
      notify: true,
      investGoal: 0,
      openOnAdd: false
    },
    sync: { url: "", key: "", secret: "", lastSync: 0, lastError: "", restoredAt: 0 },
    categories: DEFAULT_CATEGORIES.map((c) => ({ ...c })),
    rules: [],
    transactions: [],
    investments: [],
    alertsFired: {},
    skipped: []
  };
}

export function migrate(s) {
  const d = defaults();
  const out = { ...d, ...s };
  out.settings = { ...d.settings, ...(s.settings || {}) };
  out.sync = { ...d.sync, ...(s.sync || {}) };
  out.categories = Array.isArray(s.categories) && s.categories.length ? s.categories : d.categories;
  for (const c of d.categories) if (!out.categories.some((x) => x.id === c.id)) out.categories.push({ ...c });
  for (const k of ["rules", "transactions", "investments", "skipped"]) out[k] = Array.isArray(s[k]) ? s[k] : [];
  out.alertsFired = s.alertsFired && typeof s.alertsFired === "object" ? s.alertsFired : {};
  return out;
}

function load() {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) || "null");
    if (raw && typeof raw === "object") return migrate(raw);
  } catch (e) {
    /* fall through */
  }
  return defaults();
}

let state = load();
const subs = new Set();
let saveError = false;

function save() {
  try {
    localStorage.setItem(KEY, JSON.stringify(state));
    saveError = false;
  } catch (e) {
    saveError = true;
  }
}

export const get = () => state;
export const hadSaveError = () => saveError;

/** Mutate state inside fn, then persist and notify. */
export function update(fn) {
  fn(state);
  save();
  subs.forEach((f) => f(state));
}

/** Replace data (restore). Keeps this device's sync credentials. */
export function replaceData(data) {
  const sync = state.sync;
  state = migrate(data);
  state.sync = { ...state.sync, ...sync };
  save();
  subs.forEach((f) => f(state));
}

export function subscribe(f) {
  subs.add(f);
  return () => subs.delete(f);
}

/** Everything except this device's sync credentials. */
export function exportable() {
  const { sync, ...rest } = state;
  return JSON.parse(JSON.stringify(rest));
}

// Another tab changed storage: reload.
if (typeof window !== "undefined") {
  window.addEventListener("storage", (e) => {
    if (e.key === KEY) {
      state = load();
      subs.forEach((f) => f(state));
    }
  });
}
