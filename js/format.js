/* Formatting and small shared helpers. Pure functions, safe to import in Node tests. */

export function inr(n, opts = {}) {
  const v = Number(n) || 0;
  const abs = Math.abs(v);
  const paise = opts.paise && Math.round(abs * 100) % 100 !== 0;
  const body = abs.toLocaleString("en-IN", {
    minimumFractionDigits: paise ? 2 : 0,
    maximumFractionDigits: paise ? 2 : 0
  });
  const sign = v < 0 ? "−" : opts.sign && v > 0 ? "+" : "";
  return sign + "₹" + body;
}

export const pad = (n) => String(n).padStart(2, "0");

/** Local date-time as "YYYY-MM-DDTHH:mm" (no zone). All transaction dates use this. */
export function localISO(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function monthKey(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
}
export function parseLocal(iso) {
  const [date, time = "00:00"] = String(iso).split("T");
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  return new Date(y, (m || 1) - 1, d || 1, hh || 0, mm || 0);
}
export function monthDate(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1);
}
export function shiftMonth(key, delta) {
  const d = monthDate(key);
  return monthKey(new Date(d.getFullYear(), d.getMonth() + delta, 1));
}
export function monthName(key) {
  return monthDate(key).toLocaleDateString("en-IN", { month: "long" });
}
export function monthLabel(key) {
  return monthDate(key).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}
export function daysInMonth(key) {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
export function dayLabel(iso, now = new Date()) {
  const d = parseLocal(iso);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const that = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const diff = Math.round((today - that) / 86400000);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}
export function timeLabel(iso) {
  return parseLocal(iso).toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit" }).toLowerCase();
}
export function shortDate(iso) {
  return parseLocal(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
export function relTime(ts, now = Date.now()) {
  if (!ts) return "never";
  const s = Math.round((now - ts) / 1000);
  if (s < 45) return "just now";
  if (s < 3600) return Math.round(s / 60) + " min ago";
  if (s < 86400) return Math.round(s / 3600) + " h ago";
  return Math.round(s / 86400) + " d ago";
}

export function esc(s) {
  return String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}
export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}
export function pct(a, b) {
  return b > 0 ? Math.round((a / b) * 100) : 0;
}
