/* Default categories, built-in merchant rules for India, and the categorizer. Pure module. */

export const TONES = ["lilac", "pink", "mint", "sky", "peach", "lemon", "violet", "rose", "sage", "grey"];

export const DEFAULT_CATEGORIES = [
  { id: "food", name: "Food & dining", icon: "food", tone: "lilac", limit: 0, inBudget: true },
  { id: "groceries", name: "Groceries", icon: "basket", tone: "mint", limit: 0, inBudget: true },
  { id: "transport", name: "Travel", icon: "car", tone: "sky", limit: 0, inBudget: true },
  { id: "shopping", name: "Shopping", icon: "bag", tone: "pink", limit: 0, inBudget: true },
  { id: "bills", name: "Bills & recharge", icon: "bolt", tone: "lemon", limit: 0, inBudget: true },
  { id: "entertainment", name: "Entertainment", icon: "film", tone: "violet", limit: 0, inBudget: true },
  { id: "health", name: "Health", icon: "pulse", tone: "rose", limit: 0, inBudget: true },
  { id: "education", name: "Education", icon: "book", tone: "sage", limit: 0, inBudget: true },
  { id: "home", name: "Rent & home", icon: "home", tone: "peach", limit: 0, inBudget: true },
  { id: "people", name: "Sent to people", icon: "user", tone: "sky", limit: 0, inBudget: true },
  { id: "other", name: "Other", icon: "dots", tone: "grey", limit: 0, inBudget: true },
  { id: "investments", name: "Investments", icon: "trend", tone: "mint", limit: 0, inBudget: false, system: true },
  { id: "income", name: "Money in", icon: "arrowDown", tone: "sage", limit: 0, inBudget: false, system: true, kind: "income" }
];

/** Keyword → category. Matched as whole words against the merchant name and UPI ID. */
export const BUILTIN_RULES = {
  investments: ["zerodha", "groww", "upstox", "angel one", "angelone", "kite", "coin", "kuvera", "paytm money", "smallcase", "indmoney", "etmoney", "mutual fund", "bse ltd", "bse", "iccl", "indian clearing", "nse clearing", "cams", "kfintech", "kfin", "nps", "ppf", "dhan"],
  food: ["swiggy", "zomato", "dominos", "domino", "pizza", "mcdonald", "mcdonalds", "kfc", "burger king", "starbucks", "cafe", "coffee", "chai", "chaayos", "tea", "restaurant", "dhaba", "eatsure", "faasos", "behrouz", "haldiram", "haldirams", "subway", "dunkin", "barista", "theobroma", "bakery", "canteen", "mess", "biryani", "kitchen", "foods", "eatclub", "box8", "blue tokai", "third wave"],
  groceries: ["blinkit", "zepto", "bigbasket", "instamart", "dmart", "jiomart", "grofers", "more retail", "reliance fresh", "reliance smart", "nature basket", "spencers", "kirana", "grocery", "supermarket", "milkbasket", "country delight", "swiggy instamart", "bb now", "flipkart minutes", "dunzo"],
  transport: ["uber", "ola", "olacabs", "rapido", "metro", "irctc", "railway", "redbus", "abhibus", "fastag", "petrol", "fuel", "hpcl", "iocl", "bpcl", "indian oil", "shell", "makemytrip", "goibibo", "indigo", "air india", "akasa", "cleartrip", "yatra", "namma yatri", "blusmart", "parking", "toll", "ixigo", "bmtc", "best"],
  shopping: ["amazon", "flipkart", "myntra", "ajio", "meesho", "nykaa", "tata cliq", "croma", "reliance digital", "decathlon", "ikea", "lenskart", "firstcry", "snapdeal", "shoppers stop", "lifestyle", "westside", "zara", "uniqlo", "pantaloons", "trends", "mall", "apple", "boat", "bewakoof", "the souled store"],
  bills: ["airtel", "jio", "vodafone", "vi", "bsnl", "electricity", "bescom", "msedcl", "tata power", "adani electricity", "bses", "tneb", "recharge", "broadband", "act fibernet", "hathway", "excitel", "indane", "bharat gas", "hp gas", "gas", "water bill", "dth", "tata play", "postpaid", "prepaid", "billdesk", "bill"],
  entertainment: ["netflix", "spotify", "hotstar", "disney", "prime video", "primevideo", "sonyliv", "zee5", "jiocinema", "jiohotstar", "youtube", "bookmyshow", "pvr", "inox", "cinepolis", "gaana", "wynk", "steam", "playstation", "district", "paytm insider", "dream11"],
  health: ["pharmeasy", "1mg", "tata 1mg", "netmeds", "apollo", "medplus", "practo", "hospital", "clinic", "pharmacy", "medical", "medicals", "chemist", "diagnostic", "diagnostics", "lab", "cult", "cultfit", "cult fit", "gym", "fitness", "healthify"],
  education: ["udemy", "coursera", "unacademy", "byju", "byjus", "upgrad", "simplilearn", "college", "university", "school", "tuition", "fees", "exam", "books", "book", "kindle", "chegg", "physics wallah", "scaler"],
  home: ["rent", "nobroker", "nestaway", "housing", "society", "maintenance", "pg", "hostel", "urban company", "urbanclap", "furlenco", "rentomojo", "zolo", "stanza"]
};

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
const reCache = new Map();
function kwRe(kw) {
  let re = reCache.get(kw);
  if (!re) {
    re = new RegExp("(^|[^a-z0-9])" + escapeRe(kw.toLowerCase()) + "([^a-z0-9]|$)");
    reCache.set(kw, re);
  }
  return re;
}
export function matchesKeyword(hay, kw) {
  return !!kw && kwRe(kw).test(hay);
}

function haystack(txn) {
  return `${txn.merchant || ""} ${txn.vpa || ""}`.toLowerCase();
}

/** Returns a category id for a transaction. User rules win over built-in rules. */
export function categorize(txn, userRules = []) {
  const hay = haystack(txn);
  for (const r of userRules) {
    if (r.type && r.type !== txn.type) continue;
    if (matchesKeyword(hay, r.match)) return r.category;
  }
  if (txn.type === "credit") return "income";
  for (const [cat, kws] of Object.entries(BUILTIN_RULES)) {
    for (const kw of kws) if (matchesKeyword(hay, kw)) return cat;
  }
  const raw = String(txn.raw || "");
  if (/\b(nach|ach d|bse ltd|iccl|indian clearing|mutual fund)\b/i.test(raw)) return "investments";
  if (txn.p2a || /^upi ••\d{4}$/i.test(txn.merchant || "")) return "people";
  return "other";
}

/** A short, stable key for "always categorize this merchant as X" rules. */
export function ruleKeyFor(txn) {
  const m = String(txn.merchant || "").toLowerCase().trim();
  if (m && !/^(payment|money received|upi payment)$/.test(m) && !/^upi ••/.test(m)) return m;
  return txn.vpa ? txn.vpa.split("@")[0] : "";
}

/** All rules as a flat list for the server-side notifier: [{k, c}], user rules first. */
export function flatRules(userRules = []) {
  const out = userRules.filter((r) => r.type !== "credit").map((r) => ({ k: r.match, c: r.category }));
  for (const [c, kws] of Object.entries(BUILTIN_RULES)) for (const k of kws) out.push({ k, c });
  return out;
}

export const INVESTMENT_TYPES = [
  { id: "mf", name: "Mutual fund", icon: "pie", tone: "lilac" },
  { id: "stock", name: "Stocks", icon: "trend", tone: "mint" },
  { id: "etf", name: "ETF", icon: "layers", tone: "sky" },
  { id: "gold", name: "Gold", icon: "coin", tone: "lemon" },
  { id: "fd", name: "FD / RD", icon: "bank", tone: "peach" },
  { id: "ppf", name: "PPF / EPF", icon: "shield", tone: "sage" },
  { id: "nps", name: "NPS", icon: "umbrella", tone: "violet" },
  { id: "savings", name: "Savings", icon: "piggy", tone: "pink" },
  { id: "other", name: "Other", icon: "dots", tone: "grey" }
];
