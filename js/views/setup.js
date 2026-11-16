/* Auto-capture: connect Supabase and build the iPhone Shortcut + automations. */
import * as sync from "../sync.js";
import * as store from "../store.js";
import { esc, relTime, localISO } from "../format.js";
import { icon } from "../icons.js";
import { bubble, copy, toast, $, $$ } from "../ui.js";

const PHRASES = ["debited", "Sent Rs", "credited", "spent"];
let draft = { url: "", key: "", secret: "" };
let needSecret = false;
let busy = false;
let lastTest = null;

function copyRow(label, value, id, secret = false) {
  return `<div class="copyrow">
    <span class="copyrow-k">${esc(label)}</span>
    <code class="copyrow-v ${secret ? "secret" : ""}" id="${id}">${esc(value)}</code>
    <button class="btn small outline" type="button" data-copy="${id}">${icon("copy")}Copy</button>
  </div>`;
}

export default {
  render(root, ctx) {
    const st = ctx.state.sync;
    const on = sync.isConfigured(st);
    if (!draft.url && st.url) draft = { url: st.url, key: st.key, secret: st.secret };

    const status = on
      ? `<section class="hero">
          <span class="k">Auto-capture</span>
          <span class="v sm">${st.lastError ? "Needs attention" : "Connected"}</span>
          <span class="sub">${st.lastError ? esc(st.lastError) : "Last synced " + esc(relTime(st.lastSync))}</span>
          <div class="btnrow">
            <button class="btn small" type="button" data-act="sync">${icon("refresh")}Sync now</button>
            <button class="btn small outline" type="button" id="s-test">${icon("bell")}Preview a notification</button>
          </div>
          ${lastTest ? `<div class="notif-preview"><span class="np-app">${icon("wallet")} SHORTCUTS</span><b>${esc(lastTest.title || "(no notification)")}</b><span>${esc(lastTest.body || "")}</span></div>` : ""}
        </section>`
      : `<section class="hero">
          <span class="k">Auto-capture</span>
          <span class="v sm">Not set up</span>
          <span class="sub">About 15 minutes, once. After that every UPI or card payment your bank texts you is logged, categorized and checked against your budget.</span>
        </section>`;

    root.innerHTML = `
      ${status}
      <section class="card how">
        <h2>How it works</h2>
        <div class="flow">
          <span>${bubble("sms", "lilac")}<small>Bank SMS arrives</small></span>${icon("chevR")}
          <span>${bubble("phone", "pink")}<small>Shortcut sends it to your database</small></span>${icon("chevR")}
          <span>${bubble("bell", "mint")}<small>You get a budget notification</small></span>${icon("chevR")}
          <span>${bubble("wallet", "sky")}<small>App adds it when opened</small></span>
        </div>
        <p class="hint">The database is your own free Supabase project. Only this app and your Shortcut hold the key and secret to it.</p>
      </section>

      <ol class="steps">
        <li class="card">
          <h2>Create a free Supabase project</h2>
          <p>Sign up at Supabase and create a new project. Pick the <b>Mumbai</b> region. Save the database password it asks for somewhere safe; this app doesn't need it.</p>
          <a class="btn small outline" href="https://supabase.com/dashboard/new" target="_blank" rel="noopener">${icon("link")}Open Supabase</a>
        </li>
        <li class="card">
          <h2>Run the setup script</h2>
          <p>In your project open <b>SQL Editor → New query</b>, paste the script and tap <b>Run</b>. It creates a private inbox and the functions this app uses.</p>
          <button class="btn small outline" type="button" id="s-sql">${icon("copy")}Copy setup script</button>
        </li>
        <li class="card">
          <h2>Connect this app</h2>
          <p>In Supabase open <b>Project Settings → API</b> (or <b>Connect</b>). Copy the <b>Project URL</b> and the <b>anon public</b> or <b>publishable</b> key.</p>
          <label class="field"><span>Project URL</span><input class="input" id="s-url" type="url" inputmode="url" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="https://abcdxyz.supabase.co" value="${esc(draft.url)}"></label>
          <label class="field"><span>Anon / publishable key</span><input class="input mono" id="s-key" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="eyJhbGciOi… or sb_publishable_…" value="${esc(draft.key)}"></label>
          ${needSecret ? `<label class="field"><span>Device secret from your other phone</span><input class="input mono" id="s-secret" type="text" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="Shown on the old device under Auto-capture" value=""></label>
            <p class="hint">This database is already linked to another device. Paste that device's secret to reconnect, or create a new Supabase project.</p>` : ""}
          <p class="err" id="s-err" role="alert"></p>
          <div class="btnrow">
            <button class="btn small" type="button" id="s-connect" ${busy ? "disabled" : ""}>${icon("link")}${on ? "Reconnect" : "Connect"}</button>
            ${on ? `<button class="btn small outline" type="button" id="s-off">Disconnect</button>` : ""}
          </div>
        </li>
        <li class="card ${on ? "" : "locked"}">
          <h2>Make the “Log bank SMS” shortcut</h2>
          ${on ? `
          <p>Open the <b>Shortcuts</b> app → <b>+</b> → name it <b>Log bank SMS</b>. Then add these actions in order:</p>
          <ol class="sub-steps">
            <li><b>Get Contents of URL</b>. Set the URL to:${copyRow("URL", sync.captureEndpoint(st), "c-url")}
              Tap the arrow to show more. <b>Method:</b> POST. Under <b>Headers</b> add one:${copyRow("apikey", st.key, "c-key", true)}
              <b>Request Body:</b> JSON, with three Text fields:
              ${copyRow("p_secret", st.secret, "c-secret", true)}
              <div class="copyrow"><span class="copyrow-k">p_body</span><span class="copyrow-v">choose the <b>Shortcut Input</b> variable</span></div>
              <div class="copyrow"><span class="copyrow-k">p_sender</span><span class="copyrow-v">iPhone</span></div>
            </li>
            <li><b>Get Dictionary Value</b>: get <b>Value</b> for <code>title</code> in <i>Contents of URL</i>. Then <b>Set Variable</b> named <code>Title</code>.</li>
            <li><b>Get Dictionary Value</b>: get <b>Value</b> for <code>body</code> in <i>Contents of URL</i>.</li>
            <li><b>If</b> <i>Title</i> <b>has any value</b> → inside it add <b>Show Notification</b>: text <i>Dictionary Value</i>, and under Show More set Title to <i>Title</i>.</li>
          </ol>
          <p class="hint">Allow notifications for Shortcuts when iOS asks.</p>` : `<p class="hint">Connect the app first. The values you need will appear here.</p>`}
        </li>
        <li class="card ${on ? "" : "locked"}">
          <h2>Run it on every bank SMS</h2>
          <p>In Shortcuts open <b>Automation → +</b> → <b>Message</b>. Set <b>Message Contains</b> to the phrase, choose <b>Run Immediately</b>, tap <b>Next → New Blank Automation</b>, add <b>Run Shortcut → Log bank SMS</b>, and set its input to <i>Shortcut Input</i>.</p>
          <p>Make one automation for each phrase so every bank's format is caught:</p>
          <div class="chips wrap">${PHRASES.map((p, i) => `<button class="chip" type="button" data-copytext="${esc(p)}">${esc(p)}${icon("copy")}</button>`).join("")}</div>
          <p class="hint">If a message matches two phrases, the database ignores the duplicate.</p>
        </li>
        <li class="card">
          <h2>Install the app</h2>
          <p>In Safari tap <b>Share → Add to Home Screen</b>. Open it from there; it syncs whenever you open it.</p>
        </li>
      </ol>

      ${on ? `<details class="acc">
        <summary>${bubble("lock", "grey")}<span class="acc-t">Device secret</span><span class="chev">${icon("chevD")}</span></summary>
        <div class="acc-body">
          <p class="hint">Needed only to connect a new phone to this same database. Keep it private.</p>
          ${copyRow("Secret", st.secret, "c-secret2", true)}
        </div>
      </details>` : ""}`;

    $$("[data-copy]", root).forEach((b) => b.addEventListener("click", () => copy($("#" + b.dataset.copy, root).textContent, b)));
    $$("[data-copytext]", root).forEach((b) => b.addEventListener("click", () => copy(b.dataset.copytext)));

    $("#s-sql", root).addEventListener("click", async (e) => {
      const btn = e.currentTarget;
      try {
        const res = await fetch("supabase/setup.sql", { cache: "no-cache" });
        if (!res.ok) throw new Error();
        copy(await res.text(), btn);
      } catch (err) {
        toast("Couldn't load the script. Open supabase/setup.sql in the GitHub repo instead.");
      }
    });

    $("#s-url", root).addEventListener("input", (e) => (draft.url = e.target.value));
    $("#s-key", root).addEventListener("input", (e) => (draft.key = e.target.value.trim()));

    $("#s-connect", root).addEventListener("click", async () => {
      const err = $("#s-err", root);
      const url = sync.normalizeUrl(draft.url);
      const key = draft.key.trim();
      if (!/^https:\/\/[\w.-]+/.test(url)) { err.textContent = "Paste the Project URL, like https://abcdxyz.supabase.co"; return; }
      if (key.length < 20) { err.textContent = "Paste the anon or publishable key."; return; }
      const typed = needSecret && $("#s-secret", root) ? $("#s-secret", root).value.trim() : "";
      const secret = typed || (st.url === url && st.secret) || sync.newSecret();
      const cfg = { url, key, secret };
      busy = true;
      err.textContent = "";
      $("#s-connect", root).disabled = true;
      try {
        await sync.claim(cfg);
        needSecret = false;
        let restore = null;
        try { restore = await sync.loadSnapshot(cfg); } catch (e) { /* no backup yet */ }
        ctx.update((s) => Object.assign(s.sync, cfg, { lastError: "" }));
        const local = store.get();
        if (restore && restore.data && local.transactions.length === 0 && local.investments.length === 0) {
          store.replaceData(restore.data);
          toast("Connected. Your data was restored from the cloud backup.");
        } else {
          toast("Connected");
        }
        ctx.pushNow().catch(() => {});
        ctx.syncNow({ quiet: true });
      } catch (e) {
        if (/different device secret/.test(e.message)) {
          needSecret = true;
          ctx.rerender();
          return;
        }
        err.textContent = e.message;
      } finally {
        busy = false;
        const b = $("#s-connect", root);
        if (b) b.disabled = false;
      }
    });

    const off = $("#s-off", root);
    if (off) off.addEventListener("click", () => {
      ctx.update((s) => (s.sync = { url: "", key: "", secret: "", lastSync: 0, lastError: "" }));
      draft = { url: "", key: "", secret: "" };
      lastTest = null;
      toast("Disconnected. Your data stays on this phone; the cloud copy stays in Supabase.");
    });

    const test = $("#s-test", root);
    if (test) test.addEventListener("click", async () => {
      try {
        lastTest = await sync.testCapture(st, `Sent Rs.250.00 From Test Bank A/C *0000 To SWIGGY On ${localISO().slice(0, 10)} Ref 000000000000`);
        ctx.rerender();
      } catch (e) {
        toast(e.message);
      }
    });
  }
};
