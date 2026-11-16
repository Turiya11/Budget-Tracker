/* Budget maths and alert rules. Pure module: takes state, returns numbers. */
import { inr, monthKey, monthLabel, daysInMonth, pct } from "./format.js";

export function catMap(state) {
  const m = {};
  for (const c of state.categories) m[c.id] = c;
  return m;
}
export function budgetCats(state) {
  return new Set(state.categories.filter((c) => c.inBudget !== false && c.kind !== "income").map((c) => c.id));
}
export function countsAsSpend(t, set) {
  return t.type === "debit" && !t.excluded && set.has(t.category);
}

export function summarize(state, key) {
  const set = budgetCats(state);
  const byCat = {};
  let spent = 0, income = 0, outside = 0, count = 0, review = 0;
  for (const t of state.transactions) {
    if (String(t.date).slice(0, 7) !== key) continue;
    count++;
    if (!t.reviewed) review++;
    const amt = Number(t.amount) || 0;
    if (t.type === "credit") {
      if (!t.excluded) income += amt;
    } else if (countsAsSpend(t, set)) {
      spent += amt;
      byCat[t.category] = (byCat[t.category] || 0) + amt;
    } else {
      outside += amt;
    }
  }
  let invested = 0;
  for (const i of state.investments) if (String(i.date).slice(0, 7) === key) invested += Number(i.amount) || 0;
  return { key, spent, income, outside, count, review, invested, byCat, budget: Number(state.settings.monthlyBudget) || 0 };
}

export function pace(key, now = new Date()) {
  const days = daysInMonth(key);
  const cur = monthKey(now);
  if (key === cur) {
    const day = now.getDate();
    return { days, day, daysLeft: days - day + 1, frac: day / days, current: true };
  }
  const past = key < cur;
  return { days, day: past ? days : 0, daysLeft: past ? 0 : days, frac: past ? 1 : 0, current: false };
}

/**
 * Alerts that are true right now for a month. Each has a stable id so the app
 * can notify once per month per alert.
 */
export function activeAlerts(state, key, now = new Date()) {
  const s = summarize(state, key);
  const warnAt = Number(state.settings.warnAt) || 80;
  const out = [];
  const level = (spent, limit) => (!limit ? null : spent >= limit ? "over" : spent >= (limit * warnAt) / 100 ? "warn" : null);

  const lv = level(s.spent, s.budget);
  if (lv) {
    out.push({
      id: "overall-" + lv,
      level: lv,
      title: lv === "over" ? "Over your monthly budget" : `${pct(s.spent, s.budget)}% of your monthly budget used`,
      body: `${inr(s.spent)} of ${inr(s.budget)} spent in ${monthLabel(key)}.`
    });
  }
  for (const c of state.categories) {
    if (!c.limit || c.inBudget === false || c.kind === "income") continue;
    const spent = s.byCat[c.id] || 0;
    const l = level(spent, c.limit);
    if (!l) continue;
    out.push({
      id: `cat-${c.id}-${l}`,
      level: l,
      catId: c.id,
      title: l === "over" ? `Over your ${c.name} limit` : `${c.name} at ${pct(spent, c.limit)}% of its limit`,
      body: `${inr(spent)} of ${inr(c.limit)}${l === "over" ? ` (${inr(spent - c.limit)} over)` : ""}.`
    });
  }
  const p = pace(key, now);
  if (state.settings.paceAlert && s.budget > 0 && p.current && p.day >= 5 && lv !== "over") {
    const expected = s.budget * p.frac;
    if (s.spent > expected * 1.15 && s.spent - expected > 200) {
      out.push({
        id: "pace",
        level: "info",
        title: "Spending faster than planned",
        body: `${pct(s.spent, s.budget)}% of your budget is gone, ${Math.round(p.frac * 100)}% of the month has passed.`
      });
    }
  }
  return out;
}

/** Alerts not yet notified this month. */
export function freshAlerts(state, key, now) {
  const fired = (state.alertsFired && state.alertsFired[key]) || {};
  return activeAlerts(state, key, now).filter((a) => !fired[a.id]);
}

export function investSummary(state, key) {
  let month = 0, total = 0, value = 0, valueBase = 0;
  const byType = {};
  for (const i of state.investments) {
    const amt = Number(i.amount) || 0;
    total += amt;
    byType[i.type] = (byType[i.type] || 0) + amt;
    if (String(i.date).slice(0, 7) === key) month += amt;
    if (i.currentValue != null && i.currentValue !== "") {
      value += Number(i.currentValue) || 0;
      valueBase += amt;
    }
  }
  return { month, total, byType, value, valueBase, gain: value - valueBase };
}
