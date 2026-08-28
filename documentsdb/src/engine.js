// Pure data/query engine for the Log Explorer.
// Ported verbatim from the DocumentsDB "Log Explorer" design logic.

export const LIME = "#c2ef4e";
export const PINK = "#fa7faa";
export const MUTED = "rgba(255,255,255,0.72)";
export const REAL_CAP = 4000;

export const pick = (a) => a[Math.floor(Math.random() * a.length)];
export const ri = (a, b) => Math.floor(a + Math.random() * (b - a + 1));

export const GEN = {
  "app.log": () => ({
    type: "app.log",
    level: pick(["info", "info", "debug"]),
    message: pick(["worker started", "config reloaded", "cache warmed", "flush complete", "heartbeat ok"]),
  }),
  "http.request": () => {
    const st = pick([200, 200, 200, 204, 404, 500]);
    const path = pick(["/checkout", "/api/orders", "/api/session", "/pricing", "/api/events"]);
    return {
      type: "http.request",
      level: st >= 500 ? "error" : "info",
      message: pick(["GET", "POST"]) + " " + path + " " + st,
      ip: "203.0.113." + ri(1, 250),
      country: pick(["IN", "US", "DE", "BR", "NG", "JP"]),
      duration: ri(8, 480),
      user: { id: "u_" + ri(10, 99), plan: pick(["free", "free", "pro", "team"]) },
    };
  },
  "auth.login": () => ({
    type: "auth.login",
    level: "info",
    message: pick(["login ok", "session refreshed"]),
    method: pick(["password", "oauth", "magic-link"]),
    mfa: Math.random() > 0.5,
    ip: "198.51.100." + ri(1, 250),
    user: { id: "u_" + ri(10, 99), plan: pick(["free", "pro", "team"]) },
  }),
  "job.completed": () => ({
    type: "job.completed",
    level: "info",
    message: pick(["nightly rollup done", "export finished", "reindex done"]),
    job: pick(["rollup", "export", "reindex"]),
    durationMs: ri(400, 90000),
    records: ri(50, 40000),
  }),
  "queue.retry": () => ({
    type: "queue.retry",
    level: "warn",
    message: "redelivering message",
    queue: pick(["emails", "webhooks", "billing"]),
    attempt: ri(2, 5),
    delayMs: pick([500, 1000, 5000]),
  }),
  "payment.failed": () => ({
    type: "payment.failed",
    level: "error",
    message: pick(["card declined", "3ds challenge failed", "insufficient funds"]),
    provider: pick(["stripe", "adyen"]),
    amount: ri(500, 24999),
    currency: pick(["USD", "EUR", "INR"]),
    innerError: {
      code: pick(["card_declined", "expired_card", "do_not_honor"]),
      network: pick(["visa", "mastercard", "amex"]),
    },
    tags: pick([["billing", "retryable"], ["billing"], ["billing", "fatal"]]),
  }),
};

export const MIX = [
  ["app.log", 54],
  ["http.request", 28],
  ["auth.login", 8],
  ["job.completed", 5],
  ["queue.retry", 2],
  ["payment.failed", 3],
];
export const MIX_TOTAL = MIX.reduce((s, m) => s + m[1], 0);
export const mixPick = () => {
  let n = Math.random() * MIX_TOTAL;
  for (const [t, w] of MIX) {
    n -= w;
    if (n <= 0) return t;
  }
  return "app.log";
};

export const PRESETS = [
  { label: "Errors only", filters: [{ path: "level", op: "eq", value: "error" }] },
  { label: "Card declines", filters: [{ path: "innerError.code", op: "eq", value: "card_declined" }] },
  { label: "Pro & team users", filters: [{ path: "user.plan", op: "neq", value: "free" }] },
  { label: "Slow requests > 200ms", filters: [{ path: "duration", op: "gt", value: 200 }] },
  { label: "Retryable", filters: [{ path: "tags", op: "contains", value: "retryable" }] },
  { label: "Has innerError", filters: [{ path: "innerError.code", op: "exists" }] },
];

export const OPLABEL = { eq: "=", neq: "≠", gt: ">", lt: "<", contains: "has", exists: "exists" };

export function flatten(doc, out, prefix) {
  for (const k in doc) {
    if (k === "_id" || k === "_new") continue;
    const p = prefix ? prefix + "." + k : k;
    const v = doc[k];
    out[p] = v;
    if (v && typeof v === "object" && !Array.isArray(v) && !prefix) flatten(v, out, p);
  }
  return out;
}

export const getPath = (doc, path) =>
  path.split(".").reduce((o, k) => (o == null ? undefined : o[k]), doc);

export const typeOf = (v) =>
  v === null ? "null" : Array.isArray(v) ? "array" : typeof v === "object" ? "object" : typeof v;

export function matchOne(doc, f) {
  const v = getPath(doc, f.path);
  switch (f.op) {
    case "exists":
      return v !== undefined;
    case "eq":
      return v !== undefined && String(v) === String(f.value);
    case "neq":
      return v !== undefined && String(v) !== String(f.value);
    case "gt":
      return typeof v === "number" && v > Number(f.value);
    case "lt":
      return typeof v === "number" && v < Number(f.value);
    case "contains":
      return Array.isArray(v)
        ? v.map(String).includes(String(f.value))
        : typeof v === "string" && v.includes(String(f.value));
    default:
      return true;
  }
}
