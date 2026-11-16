/* Bank statement import: pick an Excel/CSV file, preview, untick what's already logged, add. */
import { inr, esc, shortDate, parseLocal } from "../format.js";
import { icon } from "../icons.js";
import { bubble, catBubble, toast, $, $$ } from "../ui.js";
import { parseStatementFile, matchExisting, txnFromStatement } from "../statement.js";

// {fileName, items, txns, match, pick:Set} | {error} | null
let S = null;
let busy = false;

const ACCEPT = ".xls,.xlsx,.csv,.txt,text/csv,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

function loadReader() {
  if (window.XLSX) return Promise.resolve(window.XLSX);
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = "vendor/xlsx.full.min.js";
    s.onload = () => (window.XLSX ? resolve(window.XLSX) : reject(new Error("load")));
    s.onerror = () => reject(new Error("Couldn't load the file reader. Check your connection and try again."));
    document.head.appendChild(s);
  });
}

async function readFile(file, ctx) {
  busy = true;
  S = null;
  ctx.rerender();
  try {
    if (/\.pdf$/i.test(file.name)) throw new Error("PDF statements can't be read. Download the statement as Excel (XLS) or CSV instead.");
    if (file.size > 15 * 1024 * 1024) throw new Error("That file is too big for a statement. Pick a shorter date range.");
    const [XLSX, buf] = await Promise.all([loadReader(), file.arrayBuffer()]);
    const res = parseStatementFile(XLSX, new Uint8Array(buf));
    if (!res.ok) throw new Error(res.reason);
    const state = ctx.state;
    const items = res.items.slice().sort((a, b) => b.date.localeCompare(a.date));
    const match = matchExisting(state.transactions, items);
    const txns = items.map((it) => txnFromStatement(it, state.rules));
    S = { fileName: file.name, items, txns, match, pick: new Set(items.map((_, i) => i).filter((i) => !match[i])) };
  } catch (e) {
    S = { error: e && e.message && e.message !== "load" ? e.message : "Couldn't read that file. Download the statement as Excel or CSV and try again." };
  } finally {
    busy = false;
    ctx.rerender();
  }
}

function pickerHtml(error) {
  return `
    <section class="card">
      <div class="imp-head">${bubble("file", "lilac")}<div><h2>Import a bank statement</h2><p class="hint">Adds every payment from your statement at once, sorted into categories.</p></div></div>
      <ol class="imp-steps">
        <li>In your bank's app or netbanking, open your account statement.</li>
        <li>Pick the dates and download it as <b>Excel</b> or <b>CSV</b>. PDF statements can't be read.</li>
        <li>Choose the file here. It's read on this phone and isn't uploaded anywhere.</li>
      </ol>
      <label class="btn filebtn">${busy ? `${icon("refresh", "spin")}Reading statement…` : `${icon("upload")}Choose statement file`}
        <input type="file" id="imp-file" accept="${ACCEPT}" ${busy ? "disabled" : ""}>
      </label>
      ${error ? `<p class="err" role="alert">${esc(error)}</p>` : ""}
    </section>
    <p class="hint sm">Payments already in the app, from SMS or added by hand, are spotted and left unticked, so overlapping date ranges won't be counted twice.</p>`;
}

export default {
  render(body, ctx) {
    const { cats } = ctx;
    if (!S || S.error) {
      body.innerHTML = pickerHtml(S && S.error);
      const input = $("#imp-file", body);
      input.addEventListener("change", () => {
        if (input.files && input.files[0]) readFile(input.files[0], ctx);
      });
      return;
    }

    const { items, txns, match, pick } = S;
    const dates = items.map((i) => i.date).sort();
    const already = match.filter(Boolean).length;
    const totals = () => {
      let out = 0, inn = 0;
      pick.forEach((i) => (items[i].type === "debit" ? (out += items[i].amount) : (inn += items[i].amount)));
      return { out, inn };
    };
    const t = totals();

    body.innerHTML = `
      <section class="card imp-sum">
        <div class="imp-file">${icon("file")}<b>${esc(S.fileName)}</b><button class="linkbtn" type="button" id="imp-reset">Change</button></div>
        <p class="hint">${esc(shortDate(dates[0]))} – ${esc(shortDate(dates[dates.length - 1]))} · ${items.length} transaction${items.length === 1 ? "" : "s"}${already ? ` · ${already} already in the app` : ""}</p>
        <div class="imp-stats">
          <span><small>Spent</small><b class="num" id="imp-out">${inr(t.out)}</b></span>
          <span><small>Received</small><b class="num good" id="imp-in">${inr(t.inn)}</b></span>
        </div>
        <button class="btn" type="button" data-imp-add ${pick.size ? "" : "disabled"}>${icon("plus")}<span data-imp-label>Add ${pick.size} transaction${pick.size === 1 ? "" : "s"}</span></button>
      </section>
      <div class="sec-head"><h2>Transactions</h2><button class="linkbtn" type="button" id="imp-toggle">${pick.size ? "Untick all" : "Tick all new"}</button></div>
      <div class="list" id="imp-list">
        ${items.map((it, i) => {
          const tx = txns[i];
          const cat = cats[tx.category];
          const sub = [match[i] ? "Already in the app" : "", shortDate(it.date).replace(/ \d{4}$/, ""), cat ? cat.name : "Other"].filter(Boolean).join(" · ");
          return `<label class="txn imp-row ${it.type === "credit" ? "in" : ""} ${pick.has(i) ? "" : "off"}">
            <input type="checkbox" class="imp-check" data-i="${i}" ${pick.has(i) ? "checked" : ""} aria-label="Import ${esc(tx.merchant)}, ${inr(it.amount, { paise: true })}">
            ${catBubble(cat)}
            <span class="txn-mid"><span class="txn-name">${esc(tx.merchant)}</span><span class="txn-sub ${match[i] ? "warn-text" : ""}">${esc(sub)}</span></span>
            <span class="txn-amt num">${it.type === "credit" ? "+" : "−"}${inr(it.amount, { paise: true })}</span>
          </label>`;
        }).join("")}
      </div>
      <button class="btn" type="button" data-imp-add ${pick.size ? "" : "disabled"}>${icon("plus")}<span data-imp-label>Add ${pick.size} transaction${pick.size === 1 ? "" : "s"}</span></button>
      <p class="hint sm center">New transactions land in Activity under “To review”, where you can fix any category.</p>`;

    const paint = () => {
      const t = totals();
      $("#imp-out", body).textContent = inr(t.out);
      $("#imp-in", body).textContent = inr(t.inn);
      $$("[data-imp-label]", body).forEach((el) => (el.textContent = `Add ${pick.size} transaction${pick.size === 1 ? "" : "s"}`));
      $$("[data-imp-add]", body).forEach((b) => (b.disabled = !pick.size));
      $("#imp-toggle", body).textContent = pick.size ? "Untick all" : "Tick all new";
    };

    $$(".imp-check", body).forEach((c) => c.addEventListener("change", () => {
      const i = Number(c.dataset.i);
      if (c.checked) pick.add(i);
      else pick.delete(i);
      c.closest(".imp-row").classList.toggle("off", !c.checked);
      paint();
    }));

    $("#imp-toggle", body).addEventListener("click", () => {
      const tickNew = !pick.size;
      pick.clear();
      if (tickNew) items.forEach((_, i) => !match[i] && pick.add(i));
      $$(".imp-check", body).forEach((c) => {
        c.checked = pick.has(Number(c.dataset.i));
        c.closest(".imp-row").classList.toggle("off", !c.checked);
      });
      paint();
    });

    $("#imp-reset", body).addEventListener("click", () => {
      S = null;
      ctx.rerender();
    });

    $$("[data-imp-add]", body).forEach((b) => b.addEventListener("click", () => {
      const chosen = [...pick].sort((a, z) => a - z).map((i) => txns[i]);
      if (!chosen.length) return;
      const latest = chosen.reduce((m, tx) => (tx.date > m ? tx.date : m), chosen[0].date).slice(0, 7);
      S = null;
      ctx.update((s) => s.transactions.push(...chosen));
      toast(`Added ${chosen.length} transaction${chosen.length === 1 ? "" : "s"}`, {
        action: "Review",
        onAction: () => {
          ctx.setMonth(latest);
          ctx.go("#activity?f=review");
        }
      });
    }));
  }
};
