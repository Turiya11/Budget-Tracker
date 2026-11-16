/*
 * Talks to the user's own Supabase project through the RPC functions in supabase/setup.sql.
 * Every call carries the device secret; the tables themselves are closed to the public key.
 */
import { summarize, budgetCats } from "./budget.js";
import { flatRules } from "./categories.js";
import { monthKey } from "./format.js";

export function isConfigured(sync) {
  return !!(sync && sync.url && sync.key && sync.secret);
}

export function normalizeUrl(url) {
  let u = String(url || "").trim().replace(/\/+$/, "");
  u = u.replace(/\/rest\/v1.*$/, "");
  if (u && !/^https?:\/\//.test(u)) u = "https://" + u;
  return u;
}

export function newSecret() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function captureEndpoint(sync) {
  return normalizeUrl(sync.url) + "/rest/v1/rpc/bt_capture";
}

async function rpc(sync, fn, args, { timeout = 15000 } = {}) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), timeout);
  const headers = { apikey: sync.key, "Content-Type": "application/json", Accept: "application/json" };
  if (/^eyJ/.test(sync.key)) headers.Authorization = "Bearer " + sync.key;
  let res;
  try {
    res = await fetch(normalizeUrl(sync.url) + "/rest/v1/rpc/" + fn, {
      method: "POST",
      headers,
      body: JSON.stringify(args),
      signal: ctrl.signal
    });
  } catch (e) {
    throw new Error(e.name === "AbortError" ? "The database took too long to answer." : "Couldn't reach your database. Check your connection.");
  } finally {
    clearTimeout(t);
  }
  const text = await res.text();
  let data = null;
  try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
  if (!res.ok) {
    const msg = (data && (data.message || data.hint || data.error)) || "HTTP " + res.status;
    if (/secret_mismatch/.test(msg)) throw new Error("This database is linked to a different device secret.");
    if (/bad_secret/.test(msg)) throw new Error("Your device secret was not accepted. Reconnect in Settings.");
    if (/function .* does not exist|Could not find the function/i.test(msg)) throw new Error("Setup SQL hasn't been run in this Supabase project yet.");
    if (res.status === 401 || /Invalid API key|No API key/i.test(msg)) throw new Error("The Supabase key was rejected. Copy the anon / publishable key again.");
    throw new Error(msg);
  }
  return data;
}

export const claim = (sync) => rpc(sync, "bt_claim", { p_secret: sync.secret });
export const status = (sync) => rpc(sync, "bt_status", { p_secret: sync.secret });
export const pull = (sync) => rpc(sync, "bt_pull", { p_secret: sync.secret });
export const ack = (sync, ids) => rpc(sync, "bt_ack", { p_secret: sync.secret, p_ids: ids });
export const loadSnapshot = (sync) => rpc(sync, "bt_load", { p_secret: sync.secret });
export const saveSnapshot = (sync, data) => rpc(sync, "bt_save", { p_secret: sync.secret, p_data: data }, { timeout: 30000 });
export const testCapture = (sync, body) => rpc(sync, "bt_capture", { p_secret: sync.secret, p_body: body, p_sender: "TEST", p_dry_run: true });

/** Compact numbers the server uses to word each notification. */
export function serverSummary(state, now = new Date()) {
  const key = monthKey(now);
  const s = summarize(state, key);
  const set = budgetCats(state);
  return {
    month: key,
    budget: s.budget,
    spent: s.spent,
    warnAt: Number(state.settings.warnAt) || 80,
    largeTxn: Number(state.settings.largeTxn) || 0,
    categories: state.categories
      .filter((c) => set.has(c.id))
      .map((c) => ({ id: c.id, name: c.name, limit: Number(c.limit) || 0, spent: s.byCat[c.id] || 0 })),
    names: Object.fromEntries(state.categories.map((c) => [c.id, c.name])),
    rules: flatRules(state.rules)
  };
}
