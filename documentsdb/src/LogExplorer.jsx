import React from "react";
import Hover from "./Hover.jsx";
import {
  LIME,
  PINK,
  MUTED,
  REAL_CAP,
  GEN,
  PRESETS,
  OPLABEL,
  flatten,
  getPath,
  typeOf,
  matchOne,
  mixPick,
} from "./engine.js";
import * as store from "./appwrite.js";

const MONO = "Monaco, Menlo, 'Ubuntu Mono', monospace";
const RUBIK = "Rubik, sans-serif";

// Safe string for rendering any value (DocumentsDB is schemaless — a field that
// is usually scalar may arrive as an object/array).
const asText = (v) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));

export default class LogExplorer extends React.Component {
  static defaultProps = { tailRate: 420, rowLimit: 120 };

  state = {
    docs: [],
    ghost: 0,
    seq: 0,
    filters: [],
    mode: "simple",
    advText: '{\n  "innerError.code": "card_declined"\n}',
    expanded: {},
    selectedId: null,
    aggPath: null,
    tail: false,
    tailPausedNote: false,
    ingestOpen: true,
    pasteText: "",
    pasteMsg: "",
    pasteOk: true,
    inspectorOpen: true,
    limit: 120,
    bulkPct: 0,
    bulkStatus: "idle",
    newFields: {},
    indexing: {},
    dbIndexes: [],
    queryDocs: null,
    queryTotal: 0,
    queryMs: 0,
    querying: false,
    queryErr: null,
    copied: false,
  };
  ver = 0;

  componentDidMount() {
    if (!store.ready) {
      this.setState({ bulkStatus: "DocumentsDB not configured — set .env" });
      return;
    }
    this.setState({ bulkStatus: "loading from DocumentsDB…" });
    store
      .list(REAL_CAP)
      .then((docs) => {
        this.ver += 1;
        this.statCache = null;
        this.qCache = null;
        this.setState({
          docs,
          seq: docs.length,
          bulkStatus: docs.length
            ? docs.length.toLocaleString() + " loaded from DocumentsDB"
            : "idle",
        });
      })
      .catch((err) => this.setState({ bulkStatus: "load failed: " + err.message }));
    this.refreshIndexes();
  }

  refreshIndexes() {
    return store
      .listIndexes()
      .then((idx) => this.setState({ dbIndexes: idx }))
      .catch(() => {});
  }

  createIndexFor(path) {
    this.setState({ bulkStatus: "creating index on " + path + "…" });
    store
      .createIndex(path)
      .then(() => this.refreshIndexes())
      .then(() => this.setState({ bulkStatus: "index created on " + path }))
      .catch((err) => this.setState({ bulkStatus: "index failed: " + err.message }));
  }

  dropIndex(key, path) {
    this.setState({ bulkStatus: "dropping index " + key + "…" });
    store
      .deleteIndex(key)
      .then(() => this.refreshIndexes())
      .then(() => this.setState({ bulkStatus: "index dropped on " + path }))
      .catch((err) => this.setState({ bulkStatus: "drop index failed: " + err.message }));
  }

  componentWillUnmount() {
    clearInterval(this.tailTimer);
    clearTimeout(this.queryTimer);
    clearTimeout(this.copyTimer);
    this.stopFlag = true;
  }

  componentDidUpdate() {
    const rate = this.props.tailRate ?? 420;
    if (this.state.tail && this.tailRate !== rate) {
      clearInterval(this.tailTimer);
      this.tailTimer = null;
    }
    this.tailRate = rate;
    if (this.state.tail && !this.tailTimer)
      this.tailTimer = setInterval(() => this.emit(mixPick(), true), rate);
    if (!this.state.tail && this.tailTimer) {
      clearInterval(this.tailTimer);
      this.tailTimer = null;
    }
  }

  persist(stamped) {
    if (!store.ready || !stamped.length) return;
    store.create(stamped).catch((err) => {
      this.setState({ bulkStatus: "write failed: " + err.message });
    });
  }

  knownPaths() {
    const s = new Set();
    for (const d of this.state.docs) for (const p in flatten(d, {})) s.add(p);
    return s;
  }

  add(list, opts) {
    opts = opts || {};
    const known = opts.skipNew ? null : this.knownPaths();
    let seq = this.state.seq;
    const stamped = list.map((d) => {
      seq += 1;
      const doc = Object.assign({}, d);
      if (!doc.ts) doc.ts = new Date().toISOString();
      doc._id = "ev_" + seq.toString(36).padStart(6, "0");
      return doc;
    });
    let docs = stamped.slice().reverse().concat(this.state.docs);
    let ghost = this.state.ghost;
    if (docs.length > REAL_CAP) {
      ghost += docs.length - REAL_CAP;
      docs = docs.slice(0, REAL_CAP);
    }
    const patch = { docs, ghost, seq };
    if (known) {
      const fresh = {};
      for (const d of stamped)
        for (const p in flatten(d, {})) if (!known.has(p)) fresh[p] = Date.now();
      if (Object.keys(fresh).length) {
        patch.newFields = Object.assign({}, this.state.newFields, fresh);
        patch.indexing = Object.assign({}, this.state.indexing);
        for (const p in fresh) patch.indexing[p] = true;
        setTimeout(() => {
          const idx = Object.assign({}, this.state.indexing);
          for (const p in fresh) delete idx[p];
          this.setState({ indexing: idx });
        }, 900);
      }
    }
    this.ver += 1;
    this.setState(patch, () => {
      this.persist(stamped);
      this.scheduleQuery();
    });
  }

  emit(type, fromTail) {
    const d = GEN[type] ? GEN[type]() : GEN["app.log"]();
    this.add([d], { skipNew: !!fromTail });
  }

  bulk(n) {
    this.stopFlag = false;
    let done = 0;
    const chunk = () => {
      if (this.stopFlag) {
        this.setState({ bulkStatus: "stopped at " + done.toLocaleString() });
        return;
      }
      const size = Math.min(2000, n - done);
      const batch = [];
      for (let i = 0; i < size; i++) batch.push(GEN[mixPick()]());
      done += size;
      this.add(batch, { skipNew: true });
      this.setState({
        bulkPct: Math.round((done / n) * 100),
        bulkStatus: done.toLocaleString() + " / " + n.toLocaleString() + " generated",
      });
      if (done < n) setTimeout(chunk, 0);
    };
    chunk();
  }

  fieldStats() {
    if (this.statCache && this.statCache.v === this.ver) return this.statCache.s;
    const map = new Map();
    for (const d of this.state.docs) {
      const flat = flatten(d, {});
      for (const p in flat) {
        let e = map.get(p);
        if (!e) {
          e = { count: 0, types: {}, values: new Map() };
          map.set(p, e);
        }
        e.count += 1;
        const t = typeOf(flat[p]);
        e.types[t] = (e.types[t] || 0) + 1;
        if (e.values.size < 60 && t !== "object") {
          const k = Array.isArray(flat[p]) ? flat[p].join(",") : String(flat[p]);
          e.values.set(k, (e.values.get(k) || 0) + 1);
        }
      }
    }
    this.statCache = { v: this.ver, s: map };
    return map;
  }

  runQuery() {
    const key = this.ver + "|" + JSON.stringify(this.state.filters);
    if (this.qCache && this.qCache.k === key) return this.qCache.r;
    const t0 = performance.now();
    const fs = this.state.filters;
    const out = fs.length
      ? this.state.docs.filter((d) => fs.every((f) => matchOne(d, f)))
      : this.state.docs;
    const ms = performance.now() - t0;
    const r = { docs: out, ms };
    this.qCache = { k: key, r };
    return r;
  }

  setFilters(filters) {
    this.setState({ filters, aggPath: null, limit: 120 }, () => this.runServerQuery());
  }

  addFilter(f) {
    const has = this.state.filters.some(
      (x) => x.path === f.path && x.op === f.op && String(x.value) === String(f.value)
    );
    if (has) return;
    this.setFilters(this.state.filters.concat([f]));
  }

  // Run the filter as a real DocumentsDB query (server-side), not JS filtering.
  runServerQuery() {
    const filters = this.state.filters;
    this.queryToken = (this.queryToken || 0) + 1;
    const token = this.queryToken;
    if (!filters.length) {
      this.setState({ queryDocs: null, queryErr: null, querying: false });
      return;
    }
    this.setState({ querying: true, queryErr: null });
    store
      .query(filters, this.state.limit)
      .then((r) => {
        if (token !== this.queryToken) return; // a newer query superseded this one
        this.setState({
          queryDocs: r.documents,
          queryTotal: r.total,
          queryMs: r.ms,
          querying: false,
          queryErr: null,
        });
      })
      .catch((err) => {
        if (token !== this.queryToken) return;
        this.setState({ querying: false, queryErr: err.message, queryDocs: [] });
      });
  }

  // Copy text to the clipboard, with a fallback and brief "copied" feedback.
  copyText(text) {
    const done = () => {
      this.setState({ copied: true });
      clearTimeout(this.copyTimer);
      this.copyTimer = setTimeout(() => this.setState({ copied: false }), 1300);
    };
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done, () => this.fallbackCopy(text, done));
        return;
      }
    } catch (e) {}
    this.fallbackCopy(text, done);
  }

  fallbackCopy(text, done) {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      document.body.removeChild(ta);
      done && done();
    } catch (e) {}
  }

  // Debounced re-query, e.g. while live-tailing with an active filter.
  scheduleQuery() {
    if (!this.state.filters.length) return;
    clearTimeout(this.queryTimer);
    this.queryTimer = setTimeout(() => this.runServerQuery(), 200);
  }

  renderVals() {
    const st = this.state;
    const stats = this.fieldStats();
    const real = st.docs.length;
    const total = real + st.ghost;
    const scale = real ? total / real : 1;
    const step = this.props.rowLimit ?? 120;
    const now = Date.now();

    // map each indexed attribute -> its index (from DocumentsDB)
    const idxByAttr = {};
    for (const ix of st.dbIndexes) for (const a of ix.attributes || []) idxByAttr[a] = ix;
    const indexedSet = new Set();
    for (const ix of st.dbIndexes)
      for (const a of ix.attributes || []) if (ix.status === "available") indexedSet.add(a);

    // RESULTS: when filters are set, use the real DocumentsDB query results
    // (server-side). With no filters, show the loaded documents.
    const hasFilters = st.filters.length > 0;
    const serverDocs = st.queryDocs || [];
    const q = { docs: hasFilters ? serverDocs : st.docs, ms: hasFilters ? st.queryMs : 0 };
    const shown = hasFilters ? serverDocs : q.docs.slice(0, Math.max(st.limit, step));
    const indexUsed = hasFilters && st.filters.every((f) => indexedSet.has(f.path));
    const matchScaled = hasFilters ? st.queryTotal : total;

    // left panel rows

    const tops = [];
    for (const [p, e] of stats) if (p.indexOf(".") === -1) tops.push([p, e]);
    tops.sort((a, b) => b[1].count - a[1].count);
    const fieldRows = [];
    const mkRow = (p, e, depth) => {
      const pct = real ? (e.count / real) * 100 : 0;
      const t = Object.keys(e.types).sort((a, b) => e.types[b] - e.types[a])[0] || "—";
      const isNew = st.newFields[p] && now - st.newFields[p] < 20000;
      const children = [];
      for (const [cp, ce] of stats)
        if (cp.indexOf(p + ".") === 0 && cp.slice(p.length + 1).indexOf(".") === -1)
          children.push([cp, ce]);
      const open = !!st.expanded[p];
      const active = st.filters.some((f) => f.path === p);
      fieldRows.push({
        path: p,
        leaf: depth ? p.slice(p.lastIndexOf(".") + 1) : p,
        pad: 14 + depth * 16,
        pct: Math.max(pct, 1.5),
        pctLabel: pct >= 10 ? Math.round(pct) + "%" : pct.toFixed(1) + "%",
        pctColor: pct < 12 ? LIME : MUTED,
        barColor: pct < 12 ? LIME : "#79628c",
        nameColor: isNew ? LIME : "#ffffff",
        mark: active ? LIME : "transparent",
        type: st.indexing[p] ? "indexing…" : t,
        anim: isNew ? "fieldIn 2.4s ease-out" : "none",
        caret: children.length ? (open ? "▾" : "▸") : "·",
        dbIndexed: !!idxByAttr[p],
        dbIndexStatus: idxByAttr[p] ? idxByAttr[p].status : null,
        onIndex: (ev) => {
          ev.stopPropagation();
          this.createIndexFor(p);
        },
        onUnindex: idxByAttr[p]
          ? (ev) => {
              ev.stopPropagation();
              this.dropIndex(idxByAttr[p].key, p);
            }
          : null,
        onToggle: children.length
          ? (ev) => {
              ev.stopPropagation();
              this.setState({ expanded: Object.assign({}, st.expanded, { [p]: !open }) });
            }
          : null,
        onClick: () => this.addFilter({ path: p, op: "exists" }),
      });
      if (open) {
        children.sort((a, b) => b[1].count - a[1].count);
        children.forEach(([cp, ce]) => mkRow(cp, ce, depth + 1));
      }
    };
    tops.forEach(([p, e]) => mkRow(p, e, 0));

    // result rows
    const badge = (lvl) =>
      lvl === "error"
        ? { bg: "rgba(250,127,170,0.18)", fg: PINK }
        : lvl === "warn"
        ? { bg: "rgba(194,239,78,0.14)", fg: LIME }
        : lvl === "debug"
        ? { bg: "rgba(255,255,255,0.06)", fg: MUTED }
        : { bg: "rgba(121,98,140,0.28)", fg: "#ffffff" };
    const rows = shown.map((d) => {
      const flat = flatten(d, {});
      const chips = [];
      for (const p in flat) {
        if (["type", "level", "message", "ts"].indexOf(p) !== -1) continue;
        const v = flat[p];
        if (v && typeof v === "object" && !Array.isArray(v)) continue;
        chips.push({
          k: p,
          v: Array.isArray(v) ? "[" + v.map(asText).join(", ") + "]" : asText(v),
          keyColor: st.filters.some((f) => f.path === p) ? LIME : MUTED,
        });
      }
      const b = badge(d.level);
      const tsStr = typeof d.ts === "string" ? d.ts : "";
      const fresh = tsStr && now - new Date(tsStr).getTime() < 2500;
      return {
        id: d._id,
        time: tsStr.slice(11, 19) || "—",
        level: asText(d.level) || "—",
        badgeBg: b.bg,
        badgeFg: b.fg,
        type: asText(d.type) || "untyped",
        message: asText(d.message),
        chips,
        bg: st.selectedId === d._id ? "rgba(66,32,130,0.55)" : "transparent",
        anim: fresh ? "rowIn 2.2s ease-out" : "none",
        onClick: () => this.setState({ selectedId: d._id }),
        onCopy: (ev) => {
          ev.stopPropagation();
          const c = Object.assign({}, d);
          delete c._id;
          this.copyText(JSON.stringify(c, null, 2));
        },
      };
    });

    // inspector
    const sel = st.selectedId ? st.docs.find((d) => d._id === st.selectedId) : null;
    const jsonLines = [];
    const aggActions = [];
    if (sel) {
      const clean = Object.assign({}, sel);
      delete clean._id;
      const stack = [];
      JSON.stringify(clean, null, 2)
        .split("\n")
        .forEach((line) => {
          const m = line.match(/^(\s*)(?:"([^"]+)":\s*)?(.*)$/);
          const indent = m[1],
            key = m[2],
            rest = m[3];
          const depth = indent.length / 2;
          const toks = [];
          if (indent)
            toks.push({ v: indent, color: MUTED, cursor: "default", underline: "none", onClick: null });
          if (key) {
            stack[depth] = key;
            const path = stack.slice(1, depth + 1).join(".");
            toks.push({
              v: '"' + key + '"',
              color: LIME,
              cursor: "pointer",
              underline: "1px dotted rgba(194,239,78,0.5)",
              onClick: () => this.addFilter({ path, op: "exists" }),
            });
            toks.push({ v: ": ", color: MUTED, cursor: "default", underline: "none", onClick: null });
            const val = getPath(clean, path);
            if (val !== null && typeof val !== "object") {
              const vt = rest.replace(/,$/, "");
              toks.push({
                v: vt,
                color: typeof val === "number" ? "#ffffff" : "#bdb8c0",
                cursor: "pointer",
                underline: "1px dotted rgba(255,255,255,0.3)",
                onClick: () => this.addFilter({ path, op: "eq", value: val }),
              });
              if (/,$/.test(rest))
                toks.push({ v: ",", color: MUTED, cursor: "default", underline: "none", onClick: null });
            } else {
              toks.push({ v: rest, color: MUTED, cursor: "default", underline: "none", onClick: null });
            }
          } else if (rest) {
            toks.push({ v: rest, color: "#bdb8c0", cursor: "default", underline: "none", onClick: null });
          }
          jsonLines.push({ tokens: toks });
        });
      const flat = flatten(clean, {});
      for (const p in flat) {
        const e = stats.get(p);
        const v = flat[p];
        if (v && typeof v === "object" && !Array.isArray(v)) continue;
        if (p === "ts" || p === "message") continue;
        if (typeof v === "number" || (e && e.values.size <= 12))
          aggActions.push({ path: p, onClick: () => this.setState({ aggPath: p }) });
      }
    }

    // aggregation
    let aggRows = [];
    if (st.aggPath) {
      const buckets = new Map();
      let missing = 0;
      const numeric = (() => {
        const e = stats.get(st.aggPath);
        return e && Object.keys(e.types)[0] === "number" && e.values.size > 12;
      })();
      for (const d of q.docs) {
        const v = getPath(d, st.aggPath);
        if (v === undefined) {
          missing += 1;
          continue;
        }
        let k;
        if (Array.isArray(v)) k = v.join(", ");
        else if (numeric) {
          const step2 = Math.pow(10, Math.max(1, String(Math.round(v)).length - 2));
          const lo = Math.floor(v / step2) * step2;
          k = lo + "–" + (lo + step2 - 1);
        } else k = String(v);
        buckets.set(k, (buckets.get(k) || 0) + 1);
      }
      const list = Array.from(buckets.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 9);
      const max = Math.max(missing, ...list.map((l) => l[1]), 1);
      aggRows = list.map(([k, c]) => ({
        label: k,
        count: Math.round(c * scale).toLocaleString(),
        pct: (c / max) * 100,
        barBg: "#79628c",
        barBorder: "none",
        labelColor: "#ffffff",
      }));
      if (missing)
        aggRows.push({
          label: "(field absent)",
          count: Math.round(missing * scale).toLocaleString(),
          pct: (missing / max) * 100,
          barBg:
            "repeating-linear-gradient(135deg, rgba(250,127,170,0.35) 0 6px, transparent 6px 12px)",
          barBorder: "1px dashed " + PINK,
          labelColor: PINK,
        });
    }

    const empty = real === 0;
    return {
      totalLabel: total.toLocaleString(),
      fieldCount: stats.size,
      noFields: stats.size === 0,
      fieldRows,
      gridCols: st.inspectorOpen ? "300px minmax(560px,1fr) 400px" : "300px minmax(560px,1fr) 44px",
      inspectorOpen: st.inspectorOpen,
      inspectorClosed: !st.inspectorOpen,
      toggleInspector: () => this.setState({ inspectorOpen: !st.inspectorOpen }),

      tailOn: st.tail,
      tailLabel: st.tail ? "pause tail" : "live tail",
      tailPausedNote: st.tailPausedNote && !st.tail,
      toggleTail: () => this.setState({ tail: !st.tail, tailPausedNote: false }),
      ingestOpen: st.ingestOpen,
      ingestLabel: st.ingestOpen ? "hide ingest" : "ingest",
      toggleIngest: () => this.setState({ ingestOpen: !st.ingestOpen }),

      pasteText: st.pasteText,
      pasteMsg: st.pasteMsg,
      pasteMsgColor: st.pasteOk ? LIME : PINK,
      onPasteChange: (e) => this.setState({ pasteText: e.target.value }),
      onPasteStore: () => {
        try {
          const parsed = JSON.parse(st.pasteText);
          const list = Array.isArray(parsed) ? parsed : [parsed];
          if (!list.length) throw new Error("empty");
          this.add(list);
          this.setState({
            pasteMsg: "stored " + list.length + " document" + (list.length > 1 ? "s" : ""),
            pasteOk: true,
            pasteText: "",
          });
        } catch (err) {
          this.setState({ pasteMsg: "not valid JSON", pasteOk: false });
        }
      },
      emitters: Object.keys(GEN).map((t) => ({ type: t, onClick: () => this.emit(t) })),
      bulkOptions: [10, 20, 30].map((n) => ({
        label: "+" + (n >= 1000 ? n / 1000 + "k" : n),
        onClick: () => this.bulk(n),
      })),
      onStop: () => {
        this.stopFlag = true;
      },
      bulkPct: st.bulkPct,
      bulkStatus: st.bulkStatus,
      onReset: () => {
        this.stopFlag = true;
        this.ver += 1;
        this.setState({
          docs: [],
          ghost: 0,
          seq: 0,
          filters: [],
          selectedId: null,
          aggPath: null,
          newFields: {},
          bulkPct: 0,
          bulkStatus: store.ready ? "clearing DocumentsDB…" : "idle",
          tail: false,
        });
        if (store.ready)
          store
            .clear()
            .then(() => this.setState({ bulkStatus: "idle" }))
            .catch((err) => this.setState({ bulkStatus: "clear failed: " + err.message }));
      },

      simpleMode: st.mode === "simple",
      advancedMode: st.mode === "advanced",
      setSimple: () => this.setState({ mode: "simple" }),
      setAdvanced: () => this.setState({ mode: "advanced" }),
      simpleBg: st.mode === "simple" ? "#ffffff" : "transparent",
      simpleFg: st.mode === "simple" ? "#1f1633" : "#ffffff",
      advBg: st.mode === "advanced" ? "#ffffff" : "transparent",
      advFg: st.mode === "advanced" ? "#1f1633" : "#ffffff",
      advText: st.advText,
      onAdvChange: (e) => this.setState({ advText: e.target.value }),
      onAdvRun: () => {
        try {
          const obj = JSON.parse(st.advText);
          const filters = [];
          for (const k in obj) {
            const v = obj[k];
            if (v && typeof v === "object" && !Array.isArray(v)) {
              for (const op in v) filters.push({ path: k, op: op.replace("$", ""), value: v[op] });
            } else filters.push({ path: k, op: "eq", value: v });
          }
          this.setFilters(filters);
        } catch (e) {}
      },
      chips: st.filters.map((f, i) => ({
        path: f.path,
        op: OPLABEL[f.op] || f.op,
        value: f.op === "exists" ? "" : String(f.value),
        onRemove: () => this.setFilters(st.filters.filter((_, j) => j !== i)),
      })),
      noFilters: st.filters.length === 0,
      hasFilters: st.filters.length > 0,
      clearFilters: () => this.setFilters([]),
      presets: PRESETS.map((p) => ({
        label: p.label,
        onClick: () => this.setFilters(p.filters.map((f) => Object.assign({}, f))),
      })),

      matchLabel: st.querying ? "…" : matchScaled.toLocaleString(),
      scannedLabel: (hasFilters ? (indexUsed ? matchScaled : total) : total).toLocaleString(),
      msLabel: (hasFilters ? Math.max(q.ms, 0.04) : 0.04).toFixed(2) + " ms",
      indexLabel: !hasFilters
        ? "no query"
        : st.querying
        ? "querying…"
        : indexUsed
        ? "used · " + st.filters.map((f) => f.path).join(", ")
        : "full scan — not indexed",
      indexColor: !hasFilters ? MUTED : st.querying ? MUTED : indexUsed ? LIME : PINK,

      aggregating: !!st.aggPath,
      aggPath: st.aggPath || "",
      aggRows,
      clearAgg: () => this.setState({ aggPath: null }),
      showResults: !st.aggPath,
      rows,
      hasMore: hasFilters ? st.queryTotal > shown.length : q.docs.length > shown.length,
      moreLabel:
        "load " + step + " more — showing " + shown.length.toLocaleString() + " of " + matchScaled.toLocaleString(),
      loadMore: () =>
        this.setState({ limit: shown.length + step }, () => {
          if (hasFilters) this.runServerQuery();
        }),
      emptyState:
        empty || (hasFilters && !st.querying && (serverDocs.length === 0 || !!st.queryErr)),
      emptyTitle: empty
        ? "The collection is empty."
        : st.queryErr
        ? "Query error"
        : "No documents match this query.",
      emptyBody: empty
        ? "Emit a preset event, paste raw JSON of any shape, or bulk generate. Fields appear on the left as they are discovered — nothing is declared anywhere."
        : st.queryErr
        ? st.queryErr + " — adjust the filter, or index the field with “+ index”."
        : "The query ran against DocumentsDB; no stored document matches. Drop a chip to widen it.",
      onResultsScroll: (e) => {
        if (e.target.scrollTop > 24 && st.tail) this.setState({ tail: false, tailPausedNote: true });
      },

      hasSelection: !!sel,
      noSelection: !sel,
      selectedId: sel ? sel._id : "",
      jsonLines,
      aggActions,
      copied: st.copied,
      copyDoc: () => {
        if (!sel) return;
        const c = Object.assign({}, sel);
        delete c._id;
        this.copyText(JSON.stringify(c, null, 2));
      },
    };
  }

  render() {
    const v = this.renderVals();
    return (
      <div
        style={{
          height: "100vh",
          minHeight: 800,
          display: "grid",
          gridTemplateRows: "auto auto 1fr",
          background: "#150f23",
          color: "#ffffff",
          fontFamily: "Rubik, -apple-system, system-ui, sans-serif",
          overflow: "auto",
        }}
      >
        {/* ---- top bar ---- */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 24,
            padding: "12px 20px",
            borderBottom: "1px solid #362d59",
            background: "#1f1633",
            minWidth: 1260,
          }}
        >
          <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
            <span style={{ fontSize: 20, fontWeight: 600, letterSpacing: "0.2px" }}>DocumentsDb</span>
            <span style={{ fontFamily: MONO, fontSize: 14, color: MUTED }}>events</span>
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 8,
              paddingLeft: 24,
              borderLeft: "1px solid #362d59",
            }}
          >
            <span style={{ fontFamily: MONO, fontSize: 30, fontWeight: 700, color: "#ffffff" }}>
              {v.totalLabel}
            </span>
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.25px",
                textTransform: "uppercase",
                color: MUTED,
              }}
            >
              documents
            </span>
          </div>
          <div style={{ flex: 1 }} />
          {v.tailOn && (
            <span
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.25px",
                textTransform: "uppercase",
                color: LIME,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: 9999,
                  background: LIME,
                  animation: "blink 1.1s infinite",
                }}
              />
              streaming
            </span>
          )}
          {v.tailPausedNote && (
            <span
              style={{
                fontSize: 10,
                fontWeight: 600,
                letterSpacing: "0.25px",
                textTransform: "uppercase",
                color: PINK,
              }}
            >
              tail paused — scrolled
            </span>
          )}
          <Hover
            as="button"
            onClick={v.toggleTail}
            style={{
              fontFamily: RUBIK,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.2px",
              textTransform: "uppercase",
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #362d59",
              background: "rgba(255,255,255,0.18)",
              color: "#ffffff",
              cursor: "pointer",
            }}
            hover={{ background: "rgba(255,255,255,0.28)" }}
          >
            {v.tailLabel}
          </Hover>
          <Hover
            as="button"
            onClick={v.toggleIngest}
            style={{
              fontFamily: RUBIK,
              fontSize: 14,
              fontWeight: 700,
              letterSpacing: "0.2px",
              textTransform: "uppercase",
              padding: "10px 14px",
              borderRadius: 8,
              border: "none",
              background: "#ffffff",
              color: "#1f1633",
              cursor: "pointer",
            }}
            hover={{ background: "#f0f0f0" }}
          >
            {v.ingestLabel}
          </Hover>
        </div>

        {/* ---- ingest panel ---- */}
        {v.ingestOpen && (
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.2fr 1fr 1fr",
              gap: 1,
              background: "#362d59",
              borderBottom: "1px solid #362d59",
              minWidth: 1260,
            }}
          >
            {/* paste raw json */}
            <div
              style={{
                background: "#1f1633",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.25px",
                    textTransform: "uppercase",
                    color: "#ffffff",
                  }}
                >
                  paste raw json
                </span>
                <span style={{ fontSize: 14, color: MUTED }}>any shape · no validation · no mapping</span>
              </div>
              <textarea
                onChange={v.onPasteChange}
                value={v.pasteText}
                spellCheck={false}
                placeholder={
                  '{ "type": "device.telemetry", "level": "warn", "message": "battery low", "deviceId": "dev_44", "battery": 7 }'
                }
                style={{
                  height: 92,
                  resize: "none",
                  padding: "10px 12px",
                  borderRadius: 6,
                  border: "1px solid #362d59",
                  background: "#150f23",
                  color: "#ffffff",
                  fontFamily: MONO,
                  fontSize: 13,
                  lineHeight: 1.5,
                }}
              />
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <Hover
                  as="button"
                  onClick={v.onPasteStore}
                  style={{
                    fontFamily: RUBIK,
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.2px",
                    textTransform: "uppercase",
                    padding: "10px 14px",
                    borderRadius: 8,
                    border: "none",
                    background: "#ffffff",
                    color: "#1f1633",
                    cursor: "pointer",
                  }}
                  hover={{ background: "#f0f0f0" }}
                >
                  store document
                </Hover>
                <span style={{ fontFamily: MONO, fontSize: 13, color: v.pasteMsgColor }}>{v.pasteMsg}</span>
              </div>
            </div>

            {/* emit preset event */}
            <div
              style={{
                background: "#1f1633",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.25px",
                    textTransform: "uppercase",
                    color: "#ffffff",
                  }}
                >
                  emit preset event
                </span>
                <span style={{ fontSize: 14, color: MUTED }}>one realistic document</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {v.emitters.map((e, i) => (
                  <Hover
                    key={i}
                    as="button"
                    onClick={e.onClick}
                    style={{
                      fontFamily: MONO,
                      fontSize: 13,
                      padding: "7px 11px",
                      borderRadius: 12,
                      border: "1px solid #362d59",
                      background: "#79628c",
                      color: "#ffffff",
                      cursor: "pointer",
                    }}
                    hover={{ background: "#8f77a3" }}
                  >
                    {e.type}
                  </Hover>
                ))}
              </div>
            </div>

            {/* bulk generate */}
            <div
              style={{
                background: "#1f1633",
                padding: "16px 20px",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <span
                  style={{
                    fontSize: 10,
                    fontWeight: 600,
                    letterSpacing: "0.25px",
                    textTransform: "uppercase",
                    color: "#ffffff",
                  }}
                >
                  bulk generate
                </span>
                <span style={{ fontSize: 14, color: MUTED }}>mixed event types</span>
              </div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {v.bulkOptions.map((b, i) => (
                  <Hover
                    key={i}
                    as="button"
                    onClick={b.onClick}
                    style={{
                      fontFamily: MONO,
                      fontSize: 13,
                      padding: "7px 11px",
                      borderRadius: 8,
                      border: "1px solid #362d59",
                      background: "#150f23",
                      color: "#ffffff",
                      cursor: "pointer",
                    }}
                    hover={{ borderColor: LIME }}
                  >
                    {b.label}
                  </Hover>
                ))}
                <button
                  onClick={v.onStop}
                  style={{
                    fontFamily: RUBIK,
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.2px",
                    textTransform: "uppercase",
                    padding: "7px 11px",
                    borderRadius: 8,
                    border: "1px solid #fa7faa",
                    background: "transparent",
                    color: PINK,
                    cursor: "pointer",
                  }}
                >
                  stop
                </button>
              </div>
              <div style={{ height: 6, borderRadius: 9999, background: "#150f23", overflow: "hidden" }}>
                <div style={{ height: "100%", background: LIME, width: v.bulkPct + "%" }} />
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  fontFamily: MONO,
                  fontSize: 12,
                  color: MUTED,
                }}
              >
                <span>{v.bulkStatus}</span>
                <span onClick={v.onReset} style={{ cursor: "pointer", color: PINK }}>
                  reset collection
                </span>
              </div>
            </div>
          </div>
        )}

        {/* ---- main 3-column area ---- */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: v.gridCols,
            gap: 1,
            background: "#362d59",
            minHeight: 0,
            minWidth: 1260,
          }}
        >
          {/* left: fields */}
          <div style={{ background: "#1f1633", display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0 }}>
            <div style={{ padding: "14px 16px", borderBottom: "1px solid #362d59" }}>
              <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
                <span style={{ fontSize: 20, fontWeight: 600 }}>Fields</span>
                <span style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: LIME }}>
                  {v.fieldCount}
                </span>
              </div>
              <div
                style={{
                  fontSize: 10,
                  fontWeight: 600,
                  letterSpacing: "0.25px",
                  textTransform: "uppercase",
                  color: MUTED,
                  marginTop: 2,
                }}
              >
                discovered from data · no schema configured
              </div>
            </div>
            <div style={{ overflowY: "auto", minHeight: 0, padding: "6px 0" }}>
              {v.fieldRows.map((f, i) => (
                <Hover
                  key={f.path}
                  onClick={f.onClick}
                  style={{
                    display: "grid",
                    gridTemplateColumns: "1fr auto",
                    alignItems: "center",
                    gap: 8,
                    cursor: "pointer",
                    borderLeft: "2px solid " + f.mark,
                    padding: "7px 14px 7px " + f.pad + "px",
                    animation: f.anim,
                  }}
                  hover={{ background: "rgba(255,255,255,0.06)" }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span
                        onClick={f.onToggle || undefined}
                        style={{ fontFamily: MONO, fontSize: 11, width: 10, color: LIME }}
                      >
                        {f.caret}
                      </span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 14,
                          color: f.nameColor,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {f.leaf}
                      </span>
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: 8, marginLeft: 16, marginTop: 3 }}>
                      <div
                        style={{
                          width: 54,
                          height: 4,
                          borderRadius: 9999,
                          background: "rgba(255,255,255,0.12)",
                          overflow: "hidden",
                        }}
                      >
                        <div style={{ height: "100%", background: f.barColor, width: f.pct + "%" }} />
                      </div>
                      <span style={{ fontFamily: MONO, fontSize: 11, color: f.pctColor }}>{f.pctLabel}</span>
                    </div>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
                    <span
                      style={{
                        fontFamily: MONO,
                        fontSize: 11,
                        padding: "2px 6px",
                        borderRadius: 4,
                        background: "#150f23",
                        color: MUTED,
                      }}
                    >
                      {f.type}
                    </span>
                    {f.dbIndexed ? (
                      <span
                        onClick={f.onUnindex}
                        title={"index " + f.dbIndexStatus + " — click to drop"}
                        style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          border: "1px solid " + LIME,
                          color: LIME,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        ◆ {f.dbIndexStatus === "available" ? "indexed" : f.dbIndexStatus}
                      </span>
                    ) : (
                      <Hover
                        as="span"
                        onClick={f.onIndex}
                        title="create an index on this field"
                        style={{
                          fontFamily: MONO,
                          fontSize: 10,
                          padding: "2px 6px",
                          borderRadius: 4,
                          border: "1px solid #362d59",
                          color: MUTED,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                        hover={{ borderColor: LIME, color: LIME }}
                      >
                        + index
                      </Hover>
                    )}
                  </div>
                </Hover>
              ))}
              {v.noFields && (
                <div style={{ padding: "20px 16px", fontSize: 14, lineHeight: 1.5, color: MUTED }}>
                  Nothing discovered yet. Emit or paste a document and its fields appear here.
                </div>
              )}
            </div>
          </div>

          {/* center: query + results */}
          <div
            style={{ background: "#1f1633", display: "grid", gridTemplateRows: "auto auto 1fr", minHeight: 0 }}
          >
            {/* query bar */}
            <div
              style={{
                padding: "12px 18px",
                borderBottom: "1px solid #362d59",
                display: "flex",
                flexDirection: "column",
                gap: 10,
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                <button
                  onClick={v.setSimple}
                  style={{
                    fontFamily: RUBIK,
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.2px",
                    textTransform: "uppercase",
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1px solid #362d59",
                    background: v.simpleBg,
                    color: v.simpleFg,
                    cursor: "pointer",
                  }}
                >
                  simple
                </button>
                <button
                  onClick={v.setAdvanced}
                  style={{
                    fontFamily: RUBIK,
                    fontSize: 14,
                    fontWeight: 700,
                    letterSpacing: "0.2px",
                    textTransform: "uppercase",
                    padding: "7px 12px",
                    borderRadius: 8,
                    border: "1px solid #362d59",
                    background: v.advBg,
                    color: v.advFg,
                    cursor: "pointer",
                  }}
                >
                  advanced
                </button>
                <div style={{ flex: 1 }} />
                {v.hasFilters && (
                  <span onClick={v.clearFilters} style={{ fontFamily: MONO, fontSize: 12, color: PINK, cursor: "pointer" }}>
                    clear query
                  </span>
                )}
              </div>

              {v.simpleMode && (
                <div
                  style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: 8,
                    alignItems: "center",
                    minHeight: 34,
                  }}
                >
                  {v.chips.map((c, i) => (
                    <span
                      key={i}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "6px 8px 6px 10px",
                        borderRadius: 8,
                        background: "#422082",
                        fontFamily: MONO,
                        fontSize: 13,
                      }}
                    >
                      <span style={{ color: LIME }}>{c.path}</span>
                      <span style={{ color: MUTED }}>{c.op}</span>
                      <span style={{ color: "#ffffff" }}>{c.value}</span>
                      <span onClick={c.onRemove} style={{ cursor: "pointer", color: MUTED, padding: "0 2px" }}>
                        ×
                      </span>
                    </span>
                  ))}
                  {v.noFilters && (
                    <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED }}>
                      no filters — click a field on the left, or run a preset
                    </span>
                  )}
                </div>
              )}
              {v.advancedMode && (
                <div style={{ display: "flex", gap: 10, alignItems: "stretch" }}>
                  <textarea
                    onChange={v.onAdvChange}
                    value={v.advText}
                    spellCheck={false}
                    style={{
                      flex: 1,
                      height: 84,
                      resize: "none",
                      padding: "10px 12px",
                      borderRadius: 6,
                      border: "1px solid #362d59",
                      background: "#150f23",
                      color: "#ffffff",
                      fontFamily: MONO,
                      fontSize: 13,
                      lineHeight: 1.5,
                    }}
                  />
                  <button
                    onClick={v.onAdvRun}
                    style={{
                      fontFamily: RUBIK,
                      fontSize: 14,
                      fontWeight: 700,
                      letterSpacing: "0.2px",
                      textTransform: "uppercase",
                      padding: "10px 14px",
                      borderRadius: 8,
                      border: "none",
                      background: "#ffffff",
                      color: "#1f1633",
                      cursor: "pointer",
                      alignSelf: "flex-start",
                    }}
                  >
                    run
                  </button>
                </div>
              )}

              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {v.presets.map((p, i) => (
                  <Hover
                    key={i}
                    as="button"
                    onClick={p.onClick}
                    style={{
                      fontFamily: RUBIK,
                      fontSize: 14,
                      fontWeight: 500,
                      letterSpacing: "0.2px",
                      padding: "7px 12px",
                      borderRadius: 12,
                      border: "1px solid #362d59",
                      background: "#150f23",
                      color: "#ffffff",
                      cursor: "pointer",
                    }}
                    hover={{ borderColor: LIME, color: LIME }}
                  >
                    {p.label}
                  </Hover>
                ))}
              </div>
            </div>

            {/* stats strip */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(4, 1fr)",
                gap: 1,
                background: "#362d59",
                borderBottom: "1px solid #362d59",
              }}
            >
              <div style={{ background: "#150f23", padding: "12px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.25px", textTransform: "uppercase", color: MUTED }}>
                  matches
                </div>
                <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: LIME, lineHeight: 1.15 }}>
                  {v.matchLabel}
                </div>
              </div>
              <div style={{ background: "#150f23", padding: "12px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.25px", textTransform: "uppercase", color: MUTED }}>
                  documents scanned
                </div>
                <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: "#ffffff", lineHeight: 1.15 }}>
                  {v.scannedLabel}
                </div>
              </div>
              <div style={{ background: "#150f23", padding: "12px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.25px", textTransform: "uppercase", color: MUTED }}>
                  query time
                </div>
                <div style={{ fontFamily: MONO, fontSize: 34, fontWeight: 700, color: "#ffffff", lineHeight: 1.15 }}>
                  {v.msLabel}
                </div>
              </div>
              <div style={{ background: "#150f23", padding: "12px 18px" }}>
                <div style={{ fontSize: 10, fontWeight: 600, letterSpacing: "0.25px", textTransform: "uppercase", color: MUTED }}>
                  index
                </div>
                <div style={{ fontFamily: MONO, fontSize: 20, fontWeight: 700, color: v.indexColor, lineHeight: 1.4, marginTop: 4 }}>
                  {v.indexLabel}
                </div>
              </div>
            </div>

            {/* results / aggregation */}
            <div onScroll={v.onResultsScroll} style={{ overflowY: "auto", minHeight: 0 }}>
              {v.aggregating && (
                <div style={{ padding: 18 }}>
                  <div style={{ display: "flex", alignItems: "baseline", gap: 10, marginBottom: 16 }}>
                    <span style={{ fontSize: 20, fontWeight: 600 }}>Count by</span>
                    <span style={{ fontFamily: MONO, fontSize: 20, color: LIME }}>{v.aggPath}</span>
                    <span onClick={v.clearAgg} style={{ fontFamily: MONO, fontSize: 12, color: PINK, cursor: "pointer" }}>
                      back to documents
                    </span>
                  </div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    {v.aggRows.map((a, i) => (
                      <div
                        key={i}
                        style={{ display: "grid", gridTemplateColumns: "190px 1fr 110px", alignItems: "center", gap: 14 }}
                      >
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 15,
                            color: a.labelColor,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {a.label}
                        </span>
                        <div style={{ height: 26, background: "rgba(255,255,255,0.06)", borderRadius: 4, overflow: "hidden" }}>
                          <div
                            style={{
                              height: "100%",
                              background: a.barBg,
                              border: a.barBorder,
                              borderRadius: 4,
                              width: a.pct + "%",
                            }}
                          />
                        </div>
                        <span
                          style={{
                            fontFamily: MONO,
                            fontSize: 20,
                            fontWeight: 700,
                            color: a.labelColor,
                            textAlign: "right",
                          }}
                        >
                          {a.count}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {v.showResults && (
                <div>
                  {v.rows.map((r) => (
                    <Hover
                      key={r.id}
                      onClick={r.onClick}
                      style={{
                        display: "grid",
                        gridTemplateColumns: "84px 68px 1fr",
                        gap: 12,
                        alignItems: "start",
                        padding: "10px 18px",
                        borderBottom: "1px solid rgba(54,45,89,0.6)",
                        cursor: "pointer",
                        background: r.bg,
                        animation: r.anim,
                      }}
                      hover={{ background: "rgba(255,255,255,0.05)" }}
                    >
                      <span style={{ fontFamily: MONO, fontSize: 13, color: MUTED, paddingTop: 2 }}>{r.time}</span>
                      <span
                        style={{
                          fontFamily: MONO,
                          fontSize: 11,
                          fontWeight: 700,
                          letterSpacing: "0.25px",
                          textTransform: "uppercase",
                          textAlign: "center",
                          padding: "3px 0",
                          borderRadius: 4,
                          background: r.badgeBg,
                          color: r.badgeFg,
                        }}
                      >
                        {r.level}
                      </span>
                      <div style={{ minWidth: 0 }}>
                        <div style={{ display: "flex", alignItems: "baseline", gap: 10, flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontFamily: MONO,
                              fontSize: 11,
                              padding: "2px 6px",
                              borderRadius: 4,
                              background: "#150f23",
                              color: MUTED,
                            }}
                          >
                            {r.type}
                          </span>
                          <span style={{ fontFamily: MONO, fontSize: 15, color: "#ffffff" }}>{r.message}</span>
                          <Hover
                            as="span"
                            onClick={r.onCopy}
                            title="copy document JSON"
                            style={{
                              marginLeft: "auto",
                              fontFamily: MONO,
                              fontSize: 12,
                              color: MUTED,
                              cursor: "pointer",
                              padding: "0 2px",
                            }}
                            hover={{ color: LIME }}
                          >
                            ⧉
                          </Hover>
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 7 }}>
                          {r.chips.map((c, ci) => (
                            <span
                              key={ci}
                              style={{
                                display: "flex",
                                gap: 5,
                                fontFamily: MONO,
                                fontSize: 12,
                                padding: "2px 7px",
                                borderRadius: 4,
                                border: "1px solid #362d59",
                                background: "rgba(121,98,140,0.18)",
                              }}
                            >
                              <span style={{ color: c.keyColor }}>{c.k}</span>
                              <span style={{ color: "#ffffff" }}>{c.v}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    </Hover>
                  ))}
                  {v.hasMore && (
                    <div
                      onClick={v.loadMore}
                      style={{
                        padding: "16px 18px",
                        textAlign: "center",
                        fontFamily: MONO,
                        fontSize: 13,
                        color: LIME,
                        cursor: "pointer",
                      }}
                    >
                      {v.moreLabel}
                    </div>
                  )}
                  {v.emptyState && (
                    <div style={{ padding: "40px 24px", maxWidth: 560 }}>
                      <div style={{ fontSize: 27, fontWeight: 500, lineHeight: 1.25, marginBottom: 12 }}>
                        {v.emptyTitle}
                      </div>
                      <div style={{ fontSize: 16, fontWeight: 400, lineHeight: 1.6, color: MUTED }}>{v.emptyBody}</div>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* right: inspector */}
          {v.inspectorOpen && (
            <div style={{ background: "#1f1633", display: "grid", gridTemplateRows: "auto 1fr", minHeight: 0 }}>
              <div
                style={{
                  padding: "14px 16px",
                  borderBottom: "1px solid #362d59",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 10,
                }}
              >
                <span style={{ fontSize: 20, fontWeight: 600 }}>Document</span>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  {v.hasSelection && (
                    <Hover
                      as="span"
                      onClick={v.copyDoc}
                      title="copy document JSON"
                      style={{
                        fontFamily: MONO,
                        fontSize: 12,
                        color: v.copied ? LIME : MUTED,
                        cursor: "pointer",
                      }}
                      hover={{ color: LIME }}
                    >
                      {v.copied ? "copied ✓" : "⧉ copy"}
                    </Hover>
                  )}
                  <span onClick={v.toggleInspector} style={{ fontFamily: MONO, fontSize: 12, color: MUTED, cursor: "pointer" }}>
                    collapse →
                  </span>
                </div>
              </div>
              <div style={{ overflowY: "auto", minHeight: 0, padding: "14px 16px" }}>
                {v.hasSelection && (
                  <div>
                    <div style={{ fontFamily: MONO, fontSize: 12, color: MUTED, marginBottom: 10 }}>{v.selectedId}</div>
                    <div style={{ background: "#150f23", border: "1px solid #362d59", borderRadius: 8, padding: 14 }}>
                      {v.jsonLines.map((l, li) => (
                        <div key={li} style={{ fontFamily: MONO, fontSize: 13, lineHeight: 1.65, whiteSpace: "pre" }}>
                          {l.tokens.map((t, ti) => (
                            <span
                              key={ti}
                              onClick={t.onClick || undefined}
                              style={{ color: t.color, cursor: t.cursor, borderBottom: t.underline }}
                            >
                              {t.v}
                            </span>
                          ))}
                        </div>
                      ))}
                    </div>
                    <div
                      style={{
                        fontSize: 10,
                        fontWeight: 600,
                        letterSpacing: "0.25px",
                        textTransform: "uppercase",
                        color: MUTED,
                        margin: "18px 0 8px",
                      }}
                    >
                      aggregate by this field
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {v.aggActions.map((a, i) => (
                        <Hover
                          key={i}
                          as="button"
                          onClick={a.onClick}
                          style={{
                            fontFamily: MONO,
                            fontSize: 12,
                            padding: "6px 10px",
                            borderRadius: 8,
                            border: "1px solid #362d59",
                            background: "#150f23",
                            color: "#ffffff",
                            cursor: "pointer",
                          }}
                          hover={{ borderColor: LIME, color: LIME }}
                        >
                          {a.path}
                        </Hover>
                      ))}
                    </div>
                    <div style={{ fontSize: 14, lineHeight: 1.5, color: MUTED, marginTop: 12 }}>
                      Click any key to filter on its presence. Click a value to filter on equality.
                    </div>
                  </div>
                )}
                {v.noSelection && (
                  <div style={{ fontSize: 16, lineHeight: 1.6, color: MUTED }}>
                    Select a row to inspect its raw document.
                  </div>
                )}
              </div>
            </div>
          )}
          {v.inspectorClosed && (
            <div
              onClick={v.toggleInspector}
              style={{
                background: "#1f1633",
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                width: 44,
              }}
            >
              <span style={{ fontFamily: MONO, fontSize: 12, color: MUTED, writingMode: "vertical-rl" }}>
                ← document
              </span>
            </div>
          )}
        </div>
      </div>
    );
  }
}
