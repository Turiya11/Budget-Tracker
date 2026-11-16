import * as sync from "../sync.js";
import * as store from "../store.js";
import { esc, relTime, shortDate } from "../format.js";
import { icon } from "../icons.js";
import { bubble, toast, downloadFile, $ } from "../ui.js";

let pendingRestore = null;
let confirmErase = false;

function csvCell(v) {
  const s = String(v ?? "");
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default {
  render(root, ctx) {
    const { state, cats } = ctx;
    const st = state.sync;
    const on = sync.isConfigured(st);
    const today = new Date().toISOString().slice(0, 10);

    root.innerHTML = `
      <h1 class="big">Settings</h1>
      <button class="row" type="button" data-go="#setup">
        ${bubble("sms", on ? (st.lastError ? "rose" : "mint") : "lilac")}
        <span class="row-txt"><b>Auto-capture</b><small>${on ? (st.lastError ? esc(st.lastError) : "Connected · synced " + esc(relTime(st.lastSync))) : "Not set up"}</small></span>
        ${icon("chevR")}
      </button>
      <button class="row" type="button" data-go="#budget">
        ${bubble("bell", "pink")}
        <span class="row-txt"><b>Budget & alerts</b><small>Monthly budget, category limits, alert levels</small></span>
        ${icon("chevR")}
      </button>

      <section class="card">
        <label class="row-field"><span><b>Open on Quick add</b><small>Start the app on the Add screen, so logging a payment takes a couple of taps.</small></span>
          <span class="switch"><input type="checkbox" id="x-openadd" ${state.settings.openOnAdd ? "checked" : ""}><i></i></span></label>
      </section>

      <section class="card">
        <h2>Backup & restore</h2>
        <p class="hint">Your data lives on this phone${on ? " and is backed up to your Supabase project after every change" : ""}. Save a file now and then as an extra copy.</p>
        <div class="btnrow">
          <button class="btn small" type="button" id="x-json">${icon("download")}Save backup</button>
          <button class="btn small outline" type="button" id="x-csv">${icon("download")}Transactions CSV</button>
          <label class="btn small outline" for="x-file">${icon("upload")}Restore file</label>
          <input class="sr" type="file" id="x-file" accept="application/json,.json">
          ${on ? `<button class="btn small outline" type="button" id="x-cloud">${icon("cloud")}Restore from cloud</button>` : ""}
        </div>
        ${pendingRestore ? `<div class="confirm">
          <span>Replace everything on this phone with ${esc(pendingRestore.label)}? This can't be undone.</span>
          <div class="btnrow"><button class="btn small danger" type="button" id="x-yes">Replace my data</button><button class="btn small outline" type="button" id="x-no">Cancel</button></div>
        </div>` : ""}
      </section>

      ${state.skipped.length ? `<details class="acc">
        <summary>${bubble("sms", "grey")}<span class="acc-t">Skipped messages</span><span class="count num">${state.skipped.length}</span><span class="chev">${icon("chevD")}</span></summary>
        <div class="acc-body">
          <p class="hint">Captured SMS the app couldn't read as a payment. OTP texts are never saved. If one was a real payment, add it from the Add tab.</p>
          ${state.skipped.map((m) => `<div class="skipped"><small>${esc(m.reason)}${m.date ? " · " + esc(shortDate(m.date)) : ""}</small><p>${esc(m.body)}</p></div>`).join("")}
          <button class="btn small outline" type="button" id="x-clear-skipped">Clear list</button>
        </div>
      </details>` : ""}

      <details class="acc">
        <summary>${bubble("phone", "sky")}<span class="acc-t">Install on iPhone</span><span class="chev">${icon("chevD")}</span></summary>
        <div class="acc-body"><p>Open this page in <b>Safari</b>, tap <b>Share</b>, then <b>Add to Home Screen</b>. It opens full screen like an app and works offline.</p></div>
      </details>

      <section class="card">
        <h2>Erase data on this phone</h2>
        <p class="hint">Deletes all transactions, budgets and investments stored here.${on ? " Auto-capture is disconnected too, so your cloud backup in Supabase stays as it is. Reconnect later to bring it back." : ""}</p>
        ${confirmErase
          ? `<div class="confirm"><span>Erase everything on this phone?</span><div class="btnrow"><button class="btn small danger" type="button" id="x-erase-yes">Erase</button><button class="btn small outline" type="button" id="x-erase-no">Cancel</button></div></div>`
          : `<button class="btn small outline danger-text" type="button" id="x-erase">${icon("trash")}Erase data</button>`}
      </section>
      <p class="hint center">Budget Tracker · data stays on your device and your own database.</p>`;

    $("#x-openadd", root).addEventListener("change", (e) => ctx.update((s) => (s.settings.openOnAdd = e.target.checked)));
    $("#x-json", root).addEventListener("click", () => {
      downloadFile(`budget-tracker-backup-${today}.json`, JSON.stringify({ app: "budget-tracker", version: 1, exportedAt: new Date().toISOString(), data: store.exportable() }, null, 2));
      toast("Backup saved");
    });
    $("#x-csv", root).addEventListener("click", () => {
      const head = ["date", "type", "amount", "merchant", "category", "mode", "bank", "account", "counted_in_budget", "note", "ref"];
      const rows = state.transactions.slice().sort((a, b) => String(a.date).localeCompare(String(b.date))).map((t) =>
        [t.date.replace("T", " "), t.type === "debit" ? "spent" : "received", t.amount, t.merchant, (cats[t.category] || {}).name || t.category, t.mode, t.bank, t.account, t.excluded ? "no" : "yes", t.note, t.ref].map(csvCell).join(","));
      downloadFile(`budget-tracker-transactions-${today}.csv`, [head.join(","), ...rows].join("\n"), "text/csv");
      toast("CSV saved");
    });
    $("#x-file", root).addEventListener("change", (e) => {
      const f = e.target.files && e.target.files[0];
      e.target.value = "";
      if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const p = JSON.parse(String(r.result));
          if (p.app !== "budget-tracker" || !p.data) throw new Error();
          pendingRestore = { data: p.data, label: `the backup from ${shortDate(String(p.exportedAt || "").slice(0, 16).replace("Z", "") || today)}` };
          ctx.rerender();
        } catch (err) {
          toast("That file isn't a Budget Tracker backup.");
        }
      };
      r.readAsText(f);
    });
    const cloud = $("#x-cloud", root);
    if (cloud) cloud.addEventListener("click", async () => {
      try {
        const res = await sync.loadSnapshot(st);
        if (!res || !res.data) return toast("There's no cloud backup yet.");
        pendingRestore = { data: res.data, label: `the cloud backup from ${new Date(res.updated_at).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" })}` };
        ctx.rerender();
      } catch (e) {
        toast(e.message);
      }
    });
    const yes = $("#x-yes", root);
    if (yes) yes.addEventListener("click", () => {
      const { summary, ...data } = pendingRestore.data;
      pendingRestore = null;
      store.replaceData(data);
      toast("Restored");
    });
    const no = $("#x-no", root);
    if (no) no.addEventListener("click", () => { pendingRestore = null; ctx.rerender(); });
    const cs = $("#x-clear-skipped", root);
    if (cs) cs.addEventListener("click", () => ctx.update((s) => (s.skipped = [])));
    const er = $("#x-erase", root);
    if (er) er.addEventListener("click", () => { confirmErase = true; ctx.rerender(); });
    const ey = $("#x-erase-yes", root);
    if (ey) ey.addEventListener("click", () => {
      confirmErase = false;
      // Disconnect first so the empty state is never pushed over the cloud backup.
      store.update((s) => (s.sync = store.defaults().sync));
      store.replaceData(store.defaults());
      toast("Erased");
    });
    const en = $("#x-erase-no", root);
    if (en) en.addEventListener("click", () => { confirmErase = false; ctx.rerender(); });
  }
};
