import React, { createContext, useContext, useEffect, useMemo, useState } from "react";
import {
  ResponsiveContainer, AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
  ScatterChart, Scatter, ZAxis, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, Heart, MessageCircle, Eye, Clock, Gem,
  Calendar, Video, Image as ImageIcon, Search, X, Info, Users,
  Share2, Bookmark, ChevronRight, ChevronDown,
  Pencil, Plus, Check, Sliders, Columns, Save, Trash2, RotateCcw, FolderOpen, ExternalLink,
  EyeOff, Flame, Award, AlertTriangle,
} from "lucide-react";
import { supabase } from "./supabaseClient";

const T = {
  bg: "#0F1E1A", surface: "#152720", surface2: "#1B3128", line: "#2A3F35",
  gold: "#CBA35C", ivory: "#F3EFE6", muted: "#93A89C", clay: "#C08A72", sage: "#7FA98F",
};
const facet = (s = 10) => ({
  clipPath: `polygon(${s}px 0, 100% 0, 100% calc(100% - ${s}px), calc(100% - ${s}px) 100%, 0 100%, 0 ${s}px)`,
});
// Validated categorical palette (CVD-safe, fixed order — never cycled/re-sorted per instance).
const PALETTE = ["#3987e5", "#d95926", "#199e70", "#c98500", "#d55181", "#008300", "#9085e9", "#e66767"];

/* ============ METRIC / DIMENSION REGISTRY ============
   Everything here is genuinely live now — data comes from the real
   Graph API ingestion pipeline, not placeholders. */
const METRICS = [
  { key: "likes", label: "Likes", agg: "sum", icon: Heart, description: "Number of likes on this post/reel." },
  { key: "comments", label: "Comments", agg: "sum", icon: MessageCircle, description: "Number of comments on this post/reel." },
  { key: "plays", label: "Plays", agg: "sum", icon: Eye, description: "Times this content was played or displayed." },
  { key: "shares", label: "Shares", agg: "sum", icon: Share2, description: "Times this content was shared to Stories, DMs, or externally." },
  { key: "saves", label: "Saves", agg: "sum", icon: Bookmark, description: "Times this content was bookmarked/saved." },
  { key: "reach", label: "Reach", agg: "sum", icon: Users, description: "Unique accounts that saw this content at least once." },
  { key: "avgWatchTimeMs", label: "Avg watch time (ms)", agg: "avg", icon: Clock, description: "Average milliseconds watched per view. Reels only. Graph API returns this in milliseconds, not a percentage." },
  { key: "totalWatchTimeMs", label: "Total watch time (ms)", agg: "sum", icon: Clock, description: "Cumulative milliseconds watched across all viewers, including replays. Reels only — a stronger 'held attention' signal than the average when comparing reels with very different view counts." },
  { key: "reelsSkipRate", label: "Skip rate (%, first 3s)", agg: "avg", icon: TrendingDown, description: "Percentage of views that skipped this reel within the first 3 seconds, out of all initial views. Reels only — a hook-quality signal: lower is better." },
  { key: "profileVisits", label: "Profile visits", agg: "sum", icon: Users, description: "Number of times the profile was visited after engaging with this post. Posts only — Reels don't support this metric." },
  { key: "profileActivity", label: "Profile actions", agg: "sum", icon: ExternalLink, description: "Combined total of all actions taken on the profile after visiting from this post (bio-link taps, calls, emails, direction requests). Meta's documented per-action breakdown doesn't actually return broken-out data for this account, so this is the combined total, not bio-link clicks specifically. Posts only." },
  { key: "newFollowers", label: "New followers", agg: "sum", icon: TrendingUp, description: "New followers attributed to this specific post. Posts only — Reels don't support this metric." },
  { key: "engagement", label: "Total interactions", agg: "sum", icon: TrendingUp, description: "Likes + saves + comments + shares, minus unlikes/unsaves/deleted comments. Graph API's native total_interactions field." },
];
// ISO 3166-1 alpha-2 -> display name, for the audience_snapshots country breakdown.
// Not exhaustive — falls back to the raw code for anything not listed here.
// Monday-start week bucket key for a "YYYY-MM-DD" date string, computed via
// getUTCDay() (not getDay()) so it's timezone-safe like fmtDate.
function weekStartOf(dateStr) {
  const d = new Date(dateStr + "T00:00:00Z");
  const dow = d.getUTCDay(); // 0=Sun..6=Sat
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}
const COUNTRY_NAMES = {
  US: "United States", IN: "India", GB: "United Kingdom", CA: "Canada", AU: "Australia",
  DE: "Germany", FR: "France", NO: "Norway", NL: "Netherlands", SE: "Sweden",
  BR: "Brazil", MX: "Mexico", ES: "Spain", IT: "Italy", AE: "UAE", SG: "Singapore",
  PK: "Pakistan", BD: "Bangladesh", PH: "Philippines", ID: "Indonesia", NG: "Nigeria",
  ZA: "South Africa", RO: "Romania",
};
const DIMENSION_FIELDS = [
  { key: "topic", label: "Topic" },
  { key: "hashtags", label: "Hashtags" },
  { key: "date", label: "Date" },
];
// Client-only starter presets — shown until the user has saved their own views.
const SUGGESTED_VIEWS = [
  {
    name: "Top Reels — last 30 days",
    config: { search: "", topicFilter: [], typeFilter: "Reel", preset: "30d", explorerDims: ["topic"], explorerMetrics: ["likes", "comments", "plays", "engagement"], explorerSort: { key: "engagement", dir: "desc" } },
  },
  {
    name: "All posts by topic",
    config: { search: "", topicFilter: [], typeFilter: "All", preset: "all", explorerDims: ["topic", "date"], explorerMetrics: ["likes", "comments", "engagement"], explorerSort: { key: "topic", dir: "asc" } },
  },
  {
    name: "This week's activity",
    config: { search: "", topicFilter: [], typeFilter: "All", preset: "7d", explorerDims: ["date", "topic"], explorerMetrics: ["likes", "comments", "shares", "saves"], explorerSort: { key: "date", dir: "desc" } },
  },
];
// Every hideable visual, for the "Manage hidden" restore panel — the
// single source of truth for id -> human label across both tabs.
const VISUAL_REGISTRY = [
  { id: "follower-history", tab: "Overview", label: "Follower count history" },
  { id: "posting-streak", tab: "Overview", label: "Posting consistency" },
  { id: "whos-following", tab: "Overview", label: "Who's following" },
  { id: "topics-table", tab: "Content", label: "Topics" },
  { id: "top-performing-content", tab: "Content", label: "Top performing content" },
  { id: "skip-rate-leaderboard", tab: "Content", label: "Skip rate leaderboard" },
  { id: "hashtag-performance", tab: "Content", label: "Hashtag performance" },
  { id: "duration-scatter", tab: "Content", label: "Reel duration vs. performance" },
  { id: "category-sparklines", tab: "Content", label: "Category trend sparklines (Topics table column)" },
  { id: "category-momentum", tab: "Content", label: "Category momentum (Topics table column)" },
  { id: "underperformer-flag", tab: "Content", label: "Under performers" },
  { id: "category-matrix", tab: "Content", label: "Category × content type matrix" },
];

/* ============ HELPERS ============ */
const MONTH_ABBR = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
// Parses "YYYY-MM-DD" manually (no Date object) so display never shifts a day from timezone conversion.
const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function fmtDate(iso, { year = true } = {}) {
  if (!iso) return "—";
  if (!ISO_DATE_RE.test(iso)) return iso; // not a date string (e.g. a chart category label) — pass through
  const [y, m, d] = iso.split("-").map(Number);
  const day = `${MONTH_ABBR[m - 1]} ${d}`;
  return year ? `${day}, ${y}` : day;
}
// Full timestamps (e.g. updated_at) carry real time-of-day info, so — unlike
// pure "YYYY-MM-DD" dates — converting via Date to the viewer's local time is correct here.
function fmtDateTime(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}
function presetRange(p, minDate, maxDate) {
  const end = new Date(maxDate), start = new Date(maxDate);
  if (p === "7d") start.setDate(end.getDate() - 6);
  else if (p === "30d") start.setDate(end.getDate() - 29);
  else if (p === "3m") start.setMonth(end.getMonth() - 3);
  else return { start: minDate, end: maxDate };
  const s = start.toISOString().slice(0, 10);
  return { start: s < minDate ? minDate : s, end: maxDate };
}
function agg(rows, key, mode) {
  const v = rows.map((r) => r[key]).filter((x) => x !== null && x !== undefined);
  if (!v.length) return 0;
  if (mode === "sum") return v.reduce((a, b) => a + b, 0);
  if (mode === "last") return v[v.length - 1];
  return +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1);
}
const fmt = (n) => (n === null || n === undefined ? "—" : typeof n === "number" ? n.toLocaleString(undefined, { maximumFractionDigits: 1 }) : n);
function compareVals(a, b, type) {
  if (type === "string") return (a ?? "").toString().localeCompare((b ?? "").toString());
  const av = a === null || a === undefined ? -Infinity : a;
  const bv = b === null || b === undefined ? -Infinity : b;
  return av - bv;
}
function sortRows(rows, sort, columnTypes) {
  if (!sort) return rows;
  const type = columnTypes[sort.key] || "number";
  const sorted = [...rows].sort((a, b) => compareVals(a[sort.key], b[sort.key], type));
  return sort.dir === "asc" ? sorted : sorted.reverse();
}
// Maps a Supabase `content` row (snake_case) to the shape the UI uses (camelCase).
function mapContentRow(row, categories) {
  const category = categories.find((c) => c.id === row.category_id) || categories[0] || { name: "Uncategorized", color: T.muted };
  return {
    id: row.id,
    contentType: row.content_type,
    date: row.post_date,
    caption: row.caption ?? "",
    hashtags: row.hashtags ?? [],
    catId: row.category_id,
    topic: category.name,
    topicColor: category.color,
    likes: row.likes ?? 0,
    comments: row.comments ?? 0,
    shares: row.shares ?? 0,
    saves: row.saves ?? 0,
    reach: row.reach ?? 0,
    plays: row.plays,
    avgWatchTimeMs: row.avg_watch_time_ms,
    totalWatchTimeMs: row.total_watch_time_ms,
    reelsSkipRate: row.reels_skip_rate,
    durationS: row.duration_s,
    profileVisits: row.profile_visits,
    profileActivity: row.profile_activity,
    newFollowers: row.new_followers,
    engagement: row.total_interactions ?? 0,
    cover: row.cover_url,
    permalink: row.permalink,
  };
}
function mapDailyRow(row) {
  return {
    date: row.metric_date,
    followers: row.followers,
    following: row.following,
  };
}

/* ============ UI PRIMITIVES (unchanged from the design system) ============ */
function Delta({ value }) {
  if (value === null || !isFinite(value)) return <span style={{ fontSize: 11, color: T.muted }}>no prior data</span>;
  const up = value >= 0, Icon = up ? TrendingUp : TrendingDown;
  return <span style={{ display: "inline-flex", alignItems: "center", gap: 4, color: up ? T.sage : T.clay, fontSize: 12, fontWeight: 600 }}><Icon size={12} strokeWidth={2.5} />{up ? "+" : ""}{value}%</span>;
}
const TooltipCtx = createContext(null);
function TooltipProvider({ children }) {
  const [tip, setTip] = useState(null);
  return (
    <TooltipCtx.Provider value={{ show: (text, x, y) => setTip({ text, x, y }), hide: () => setTip(null) }}>
      {children}
      {tip && (
        <span style={{
          position: "fixed", left: tip.x + 14, top: tip.y + 16, zIndex: 2000,
          background: T.surface2, border: `1px solid ${T.gold}`, color: T.ivory,
          fontSize: 11, padding: "7px 10px", borderRadius: 4, maxWidth: 230,
          pointerEvents: "none", lineHeight: 1.4, fontFamily: "Inter, sans-serif", fontWeight: 400,
          whiteSpace: "normal", boxShadow: "0 4px 14px rgba(0,0,0,0.4)",
        }}>{tip.text}</span>
      )}
    </TooltipCtx.Provider>
  );
}
function HoverInfo({ text, children }) {
  const ctx = useContext(TooltipCtx);
  if (!text) return children;
  return (
    <span
      onMouseEnter={(e) => ctx.show(text, e.clientX, e.clientY)}
      onMouseMove={(e) => ctx.show(text, e.clientX, e.clientY)}
      onMouseLeave={() => ctx.hide()}
      style={{ position: "relative", display: "inline-flex", alignItems: "center" }}
    >
      {children}
    </span>
  );
}
function InfoDot({ text }) {
  if (!text) return null;
  return <HoverInfo text={text}><Info size={11} color={T.muted} style={{ flexShrink: 0 }} /></HoverInfo>;
}
function KpiCard({ icon: Icon, label, value, delta, description }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "16px 16px 13px", ...facet(11), display: "flex", flexDirection: "column", gap: 7 }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(203,163,92,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={13} color={T.gold} /></div>
      <div style={{ fontSize: 10.5, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em", display: "flex", alignItems: "center", gap: 5 }}>{label}<InfoDot text={description} /></div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 23, color: T.ivory, fontWeight: 500 }}>{value}</div>
      {delta !== undefined && <Delta value={delta} />}
    </div>
  );
}
function SectionHeader({ eyebrow, title, note, right }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 14, gap: 12, flexWrap: "wrap" }}>
      <div>
        <div style={{ fontSize: 10.5, letterSpacing: "0.14em", textTransform: "uppercase", color: T.gold, marginBottom: 4, display: "flex", alignItems: "center", gap: 8 }}><span style={{ width: 14, height: 1, background: T.gold }} />{eyebrow}</div>
        <h2 style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 20, color: T.ivory, margin: 0 }}>{title}</h2>
      </div>
      <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
        {note && <div style={{ fontSize: 11.5, color: T.muted, maxWidth: 340, textAlign: "right" }}>{note}</div>}
        {right}
      </div>
    </div>
  );
}
// The hide/confirm affordance, usable standalone (e.g. for a single table
// column) or inside Section's header (for a full section).
function HideControl({ id, confirmHideId, onRequestHide, onConfirmHide, onCancelHide, label = "this" }) {
  const confirming = confirmHideId === id;
  if (confirming) {
    return (
      <span style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 11, color: T.clay, whiteSpace: "nowrap" }}>
        Hide {label}?
        <button onClick={() => onConfirmHide(id)} style={{ background: T.clay, border: "none", color: T.bg, padding: "3px 8px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", borderRadius: 3 }}>Yes</button>
        <button onClick={onCancelHide} style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.muted, padding: "3px 8px", fontSize: 10.5, cursor: "pointer", borderRadius: 3 }}>Cancel</button>
      </span>
    );
  }
  return (
    <button onClick={() => onRequestHide(id)} title={`Hide ${label}`} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.muted, display: "flex", alignItems: "center", padding: 2 }}>
      <EyeOff size={13} />
    </button>
  );
}
// Lets every visual's description be self-edited in place rather than
// hard-coded — DescCtx holds the saved overrides plus which id (if any)
// is mid-edit, so any EditableInsight anywhere in the tree can read/write
// without prop-drilling through Section/SubBlock call sites.
const DescCtx = createContext(null);
function DescProvider({ customDescriptions, onSave, children }) {
  const [editingId, setEditingId] = useState(null);
  const [draft, setDraft] = useState("");
  const startEdit = (id, current) => { setEditingId(id); setDraft(current ?? ""); };
  const cancel = () => { setEditingId(null); setDraft(""); };
  const save = (id) => { onSave(id, draft.trim()); setEditingId(null); };
  return (
    <DescCtx.Provider value={{ customDescriptions, editingId, draft, setDraft, startEdit, cancel, save }}>
      {children}
    </DescCtx.Provider>
  );
}
// Renders a visual's description as plain text with an edit pencil next
// to it; clicking swaps it for a textarea + Save/Cancel. `fallback` is the
// built-in copy, shown until the user saves their own override.
function EditableInsight({ id, fallback }) {
  const ctx = useContext(DescCtx);
  if (!ctx) return fallback ? <div style={{ fontSize: 11.5, color: T.muted, maxWidth: 340, textAlign: "right" }}>{fallback}</div> : null;
  const { customDescriptions, editingId, draft, setDraft, startEdit, cancel, save } = ctx;
  const text = customDescriptions[id] ?? fallback ?? "";
  if (editingId === id) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6, width: 280 }}>
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          autoFocus
          placeholder="Describe this visual…"
          style={{ width: "100%", background: T.surface2, border: `1px solid ${T.gold}`, color: T.ivory, fontSize: 11.5, fontFamily: "inherit", padding: "6px 8px", resize: "vertical", borderRadius: 3 }}
        />
        <div style={{ display: "flex", gap: 6 }}>
          <button onClick={() => save(id)} style={{ background: T.gold, border: "none", color: T.bg, padding: "3px 10px", fontSize: 10.5, fontWeight: 600, cursor: "pointer", borderRadius: 3 }}>Save</button>
          <button onClick={cancel} style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.muted, padding: "3px 10px", fontSize: 10.5, cursor: "pointer", borderRadius: 3 }}>Cancel</button>
        </div>
      </div>
    );
  }
  return (
    <span style={{ display: "inline-flex", alignItems: "flex-end", gap: 6, maxWidth: 340 }}>
      {text && <span style={{ fontSize: 11.5, color: T.muted, textAlign: "right" }}>{text}</span>}
      <button onClick={() => startEdit(id, text)} title="Edit description" style={{ background: "transparent", border: "none", cursor: "pointer", color: T.muted, display: "flex", alignItems: "center", padding: 2, flexShrink: 0 }}>
        <Pencil size={11} />
      </button>
    </span>
  );
}
// Every new/optional visual is wrapped in this so it can be explained
// (self-editable via EditableInsight) and hidden/restored without
// touching the section's own layout code.
function Section({ id, eyebrow, title, insight, noEdit, hiddenVisuals, confirmHideId, onRequestHide, onConfirmHide, onCancelHide, children }) {
  if (hiddenVisuals.includes(id)) return null;
  return (
    <div style={{ marginBottom: 30 }}>
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        note={noEdit ? insight : <EditableInsight id={id} fallback={insight} />}
        right={<HideControl id={id} confirmHideId={confirmHideId} onRequestHide={onRequestHide} onConfirmHide={onConfirmHide} onCancelHide={onCancelHide} label="this section" />}
      />
      {children}
    </div>
  );
}
// Lighter-weight than Section: a small inline label instead of a full
// SectionHeader, for visuals nested under a shared parent title (e.g. the
// follower history chart living under "Follower activity").
// Still hideable; description is self-editable unless noEdit is set.
function SubBlock({ id, label, insight, noEdit, hiddenVisuals, confirmHideId, onRequestHide, onConfirmHide, onCancelHide, children }) {
  if (hiddenVisuals.includes(id)) return null;
  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 8, gap: 12, flexWrap: "wrap" }}>
        <div style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 20, color: T.ivory }}>{label}</div>
        <div style={{ display: "flex", alignItems: "flex-end", gap: 10 }}>
          {!noEdit && <EditableInsight id={id} fallback={insight} />}
          <HideControl id={id} confirmHideId={confirmHideId} onRequestHide={onRequestHide} onConfirmHide={onConfirmHide} onCancelHide={onCancelHide} label="this chart" />
        </div>
      </div>
      {children}
    </div>
  );
}
function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.gold}`, padding: "9px 11px", fontSize: 11.5, color: T.ivory }}>
      <div style={{ color: T.gold, marginBottom: 5, fontWeight: 600 }}>{fmtDate(label)}</div>
      {payload.map((p, i) => <div key={i} style={{ display: "flex", justifyContent: "space-between", gap: 14, color: T.muted }}><span>{p.name}</span><span style={{ color: T.ivory }}>{fmt(p.value)}</span></div>)}
    </div>
  );
}
function Th({ label, sortKey, sort, setSort, align = "left", infoText }) {
  const active = sort?.key === sortKey;
  const inner = (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, flexDirection: align === "right" ? "row-reverse" : "row" }}>
      {label}
      <span style={{ fontSize: 9, opacity: active ? 1 : 0.35 }}>{active && sort.dir === "asc" ? "▲" : "▼"}</span>
    </span>
  );
  return (
    <th
      onClick={() => setSort((s) => (s?.key === sortKey ? { key: sortKey, dir: s.dir === "asc" ? "desc" : "asc" } : { key: sortKey, dir: "desc" }))}
      style={{ padding: "10px 13px", textAlign: align, cursor: "pointer", userSelect: "none", color: active ? T.gold : T.muted, whiteSpace: "nowrap" }}
    >
      {infoText ? <HoverInfo text={infoText}>{inner}</HoverInfo> : inner}
    </th>
  );
}
function Chip({ active, onClick, children, infoText }) {
  const btn = (
    <button onClick={onClick} style={{ border: `1px solid ${active ? T.gold : T.line}`, cursor: "pointer", background: active ? "rgba(203,163,92,0.14)" : "transparent", color: active ? T.gold : T.muted, padding: "5px 11px", fontSize: 11.5, fontWeight: 500, borderRadius: 3 }}>{children}</button>
  );
  return infoText ? <HoverInfo text={infoText}>{btn}</HoverInfo> : btn;
}
function Cover({ url, color }) {
  const [err, setErr] = useState(false);
  if (!url || err) return <div style={{ width: "100%", height: "100%", background: `linear-gradient(135deg, ${color}55, ${color}18)`, display: "flex", alignItems: "center", justifyContent: "center" }}><Gem size={22} color={color} /></div>;
  return <img src={url} onError={() => setErr(true)} style={{ width: "100%", height: "100%", objectFit: "cover" }} />;
}
function TypeIcon({ type, size = 10 }) { return type === "Reel" ? <Video size={size} /> : <ImageIcon size={size} />; }
// Shared card used everywhere a piece of content needs a visual preview
// (Top performing content, Skip rate leaderboard, Under performers) — cover
// image, rank badge, type badge, topic (editable via onReassign, or a
// static pill without it), and a one-line stat footer that each caller
// controls via `footer`.
function ContentCard({ p, rank, categories, onReassign, footer }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, ...facet(9), overflow: "hidden" }}>
      <div style={{ height: 100, position: "relative", borderBottom: `1px solid ${T.line}` }}>
        <Cover url={p.cover} color={p.topicColor} />
        {rank != null && <span style={{ position: "absolute", top: 7, left: 7, fontSize: 10, fontWeight: 700, color: T.bg, background: T.gold, padding: "1px 6px" }}>#{rank}</span>}
        <span style={{ position: "absolute", top: 7, right: 7, display: "flex", alignItems: "center", gap: 3, fontSize: 10, color: T.ivory, background: "rgba(0,0,0,0.5)", padding: "2px 6px" }}><TypeIcon type={p.contentType} size={9} />{p.contentType}</span>
        {p.permalink && (
          <a href={p.permalink} target="_blank" rel="noopener noreferrer" title="View on Instagram" style={{ position: "absolute", bottom: 7, right: 7, display: "flex", alignItems: "center", justifyContent: "center", width: 20, height: 20, borderRadius: "50%", background: "rgba(0,0,0,0.55)", color: T.ivory }}>
            <ExternalLink size={10} />
          </a>
        )}
      </div>
      <div style={{ padding: "10px 11px 12px" }}>
        <div style={{ fontSize: 11.5, color: T.ivory, marginBottom: 5, lineHeight: 1.35, height: 45, overflow: "hidden" }}>{p.caption}</div>
        <div style={{ marginBottom: 8 }}>
          {onReassign ? (
            <select value={p.catId ?? ""} onChange={(e) => onReassign(p.id, e.target.value)} style={{ fontSize: 10.5, padding: "2px 6px", borderRadius: 3, background: `${p.topicColor}22`, color: p.topicColor, border: `1px solid ${p.topicColor}55`, cursor: "pointer" }}>
              {categories.map((c) => <option key={c.id} value={c.id} style={{ background: T.surface, color: T.ivory }}>{c.name}</option>)}
            </select>
          ) : (
            <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 3, background: `${p.topicColor}22`, color: p.topicColor }}>{p.topic}</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 9, fontSize: 10.5, color: T.muted, flexWrap: "wrap" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Heart size={10} color={T.gold} />{p.likes}</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3 }}><MessageCircle size={10} />{p.comments}</span>
          {p.plays && <span style={{ display: "flex", alignItems: "center", gap: 3 }}><Eye size={10} />{fmt(p.plays)}</span>}
        </div>
        <div style={{ fontSize: 10, color: T.muted, marginTop: 7, paddingTop: 7, borderTop: `1px solid ${T.line}` }}>{fmtDate(p.date)} · {footer}</div>
      </div>
    </div>
  );
}

/* ============ URL STATE (shareable/bookmarkable filters) ============ */
function readUrlParams() {
  return new URLSearchParams(window.location.search);
}

/* ============ MAIN ============ */
export default function Dashboard() {
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const [rawContent, setRawContent] = useState([]);
  const [dailyRows, setDailyRows] = useState([]);
  const [categories, setCategories] = useState([]);
  const [savedViews, setSavedViews] = useState([]);
  const [audienceSnapshot, setAudienceSnapshot] = useState(null);

  const [range, setRange] = useState(null);
  const [preset, setPreset] = useState(() => readUrlParams().get("range") || "all");
  const [tab, setTab] = useState(() => readUrlParams().get("tab") || "overview");
  const [typeFilter, setTypeFilter] = useState(() => readUrlParams().get("type") || "All");
  const [search, setSearch] = useState(() => readUrlParams().get("q") || "");
  const [topicFilter, setTopicFilter] = useState(() => {
    const t = readUrlParams().get("topics");
    return t ? t.split(",") : [];
  });
  const [expandedTopics, setExpandedTopics] = useState([]);
  const [explorerMetrics, setExplorerMetrics] = useState(["likes", "comments", "plays", "engagement"]);
  const [explorerDims, setExplorerDims] = useState(["topic"]);
  const [topicSort, setTopicSort] = useState({ key: "avgEngagement", dir: "desc" });
  const [explorerSort, setExplorerSort] = useState({ key: "date", dir: "desc" });
  const [editingCat, setEditingCat] = useState(null);
  const [newCatName, setNewCatName] = useState("");
  const [showManage, setShowManage] = useState(false);
  const [viewsOpen, setViewsOpen] = useState(false);
  const [newViewName, setNewViewName] = useState("");
  const [editingView, setEditingView] = useState(null);
  const [activeViewId, setActiveViewId] = useState(null);
  const [confirmDeleteView, setConfirmDeleteView] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkCatId, setBulkCatId] = useState("");
  const [activeSuggestion, setActiveSuggestion] = useState(null);
  const [hiddenVisuals, setHiddenVisuals] = useState([]);
  const [confirmHideId, setConfirmHideId] = useState(null);
  const [manageHiddenOpen, setManageHiddenOpen] = useState(false);
  const [customDescriptions, setCustomDescriptions] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const [contentRes, dailyRes, catRes, viewsRes] = await Promise.all([
          supabase.from("content").select("*").order("post_date", { ascending: false }),
          supabase.from("daily_metrics").select("*").order("metric_date", { ascending: true }),
          supabase.from("categories").select("*"),
          supabase.from("saved_views").select("*"),
        ]);
        if (contentRes.error) throw contentRes.error;
        if (dailyRes.error) throw dailyRes.error;
        if (catRes.error) throw catRes.error;
        if (viewsRes.error) throw viewsRes.error;

        setRawContent(contentRes.data ?? []);
        setDailyRows((dailyRes.data ?? []).map(mapDailyRow));
        setCategories(catRes.data ?? []);
        setSavedViews(viewsRes.data ?? []);

        const params = readUrlParams();
        const viewId = params.get("view");
        const view = viewId ? (viewsRes.data ?? []).find((v) => v.id === viewId) : null;
        let effectivePreset = view?.config?.preset || params.get("range") || "all";
        if (view) {
          const cfg = view.config ?? {};
          setSearch(cfg.search ?? "");
          setTopicFilter(cfg.topicFilter ?? []);
          setTypeFilter(cfg.typeFilter ?? "All");
          setExplorerDims(cfg.explorerDims ?? ["topic"]);
          setExplorerMetrics(cfg.explorerMetrics ?? ["likes", "comments", "plays", "engagement"]);
          setExplorerSort(cfg.explorerSort ?? { key: "date", dir: "desc" });
          setActiveViewId(view.id);
        }

        const dates = (contentRes.data ?? []).map((r) => r.post_date);
        if (dates.length) {
          const minDate = dates.reduce((a, b) => (b < a ? b : a));
          const maxDate = dates.reduce((a, b) => (b > a ? b : a));
          const urlStart = params.get("start"), urlEnd = params.get("end");
          if (!view && urlStart && urlEnd) {
            setRange({ start: urlStart, end: urlEnd });
            setPreset("custom");
          } else {
            setPreset(effectivePreset);
            setRange(presetRange(effectivePreset, minDate, maxDate));
          }
        }
      } catch (e) {
        setLoadError(e.message || "Failed to load dashboard data");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  // Isolated on purpose: audience_snapshots is a newer table that may not
  // exist yet in every environment. A failure here (e.g. migration not run
  // yet) should never take down the rest of the dashboard.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase
        .from("audience_snapshots")
        .select("*")
        .order("snapshot_date", { ascending: false })
        .limit(90);
      if (error) { console.warn("audience_snapshots unavailable:", error.message); return; }
      setAudienceSnapshot(data?.[0] ?? null);
    })();
  }, []);

  // Isolated for the same reason — hidden_visuals is a newer table too.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("hidden_visuals").select("visual_id");
      if (error) { console.warn("hidden_visuals unavailable:", error.message); return; }
      setHiddenVisuals((data ?? []).map((r) => r.visual_id));
    })();
  }, []);

  const requestHide = (id) => setConfirmHideId(id);
  const cancelHide = () => setConfirmHideId(null);
  const confirmHide = async (id) => {
    setHiddenVisuals((v) => [...v, id]);
    setConfirmHideId(null);
    const { error } = await supabase.from("hidden_visuals").insert({ visual_id: id });
    if (error) console.error("Failed to hide visual:", error.message);
  };
  const unhideVisual = async (id) => {
    setHiddenVisuals((v) => v.filter((x) => x !== id));
    const { error } = await supabase.from("hidden_visuals").delete().eq("visual_id", id);
    if (error) console.error("Failed to restore visual:", error.message);
  };

  // Isolated for the same reason — visual_descriptions is a newer table
  // too, and lets each visual's built-in copy be overridden per-user.
  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("visual_descriptions").select("visual_id, description");
      if (error) { console.warn("visual_descriptions unavailable:", error.message); return; }
      const map = {};
      (data ?? []).forEach((r) => { map[r.visual_id] = r.description; });
      setCustomDescriptions(map);
    })();
  }, []);

  const saveDescription = async (id, text) => {
    setCustomDescriptions((m) => {
      const next = { ...m };
      if (text) next[id] = text; else delete next[id];
      return next;
    });
    if (text) {
      const { error } = await supabase.from("visual_descriptions").upsert({ visual_id: id, description: text });
      if (error) console.error("Failed to save description:", error.message);
    } else {
      const { error } = await supabase.from("visual_descriptions").delete().eq("visual_id", id);
      if (error) console.error("Failed to reset description:", error.message);
    }
  };

  // Keep the URL in sync so filters/tab/view are shareable and survive a refresh.
  useEffect(() => {
    if (!range) return;
    const params = new URLSearchParams();
    if (tab !== "overview") params.set("tab", tab);
    if (typeFilter !== "All") params.set("type", typeFilter);
    if (preset === "custom") {
      params.set("start", range.start);
      params.set("end", range.end);
    } else if (preset !== "all") {
      params.set("range", preset);
    }
    if (activeViewId) params.set("view", activeViewId);
    if (search) params.set("q", search);
    if (topicFilter.length) params.set("topics", topicFilter.join(","));
    const qs = params.toString();
    const url = qs ? `${window.location.pathname}?${qs}` : window.location.pathname;
    window.history.replaceState(null, "", url);
  }, [tab, typeFilter, preset, range, activeViewId, search, topicFilter]);

  const content = useMemo(() => rawContent.map((r) => mapContentRow(r, categories)), [rawContent, categories]);
  const lastSynced = useMemo(() => {
    const stamps = rawContent.map((r) => r.updated_at).filter(Boolean);
    return stamps.length ? stamps.reduce((a, b) => (b > a ? b : a)) : null;
  }, [rawContent]);
  const MIN_DATE = useMemo(() => (content.length ? content.reduce((a, p) => (p.date < a ? p.date : a), content[0].date) : null), [content]);
  const MAX_DATE = useMemo(() => (content.length ? content.reduce((a, p) => (p.date > a ? p.date : a), content[0].date) : null), [content]);

  const reassign = async (contentId, catId) => {
    setRawContent((rows) => rows.map((r) => (r.id === contentId ? { ...r, category_id: catId } : r)));
    const { error } = await supabase.from("content").update({ category_id: catId }).eq("id", contentId);
    if (error) console.error("Failed to reassign category:", error.message);
  };
  const bulkReassign = async (ids, catId) => {
    if (!ids.length || !catId) return;
    setRawContent((rows) => rows.map((r) => (ids.includes(r.id) ? { ...r, category_id: catId } : r)));
    const { error } = await supabase.from("content").update({ category_id: catId }).in("id", ids);
    if (error) console.error("Failed to bulk reassign category:", error.message);
    setSelectedIds([]);
    setBulkCatId("");
  };
  const renameCategory = async (id, name) => {
    setCategories((cats) => cats.map((c) => (c.id === id ? { ...c, name } : c)));
    const { error } = await supabase.from("categories").update({ name }).eq("id", id);
    if (error) console.error("Failed to rename category:", error.message);
  };
  const addCategory = async (name) => {
    if (!name.trim()) return;
    const id = `cat_${Date.now()}`;
    const color = PALETTE[categories.length % PALETTE.length];
    const newCat = { id, name: name.trim(), color };
    setCategories((cats) => [...cats, newCat]);
    const { error } = await supabase.from("categories").insert(newCat);
    if (error) console.error("Failed to add category:", error.message);
    setNewCatName("");
  };

  const currentExplorerConfig = () => ({ search, topicFilter, typeFilter, preset, explorerDims, explorerMetrics, explorerSort });
  const applyExplorerConfig = (cfg) => {
    setSearch(cfg.search ?? "");
    setTopicFilter(cfg.topicFilter ?? []);
    setTypeFilter(cfg.typeFilter ?? "All");
    setExplorerDims(cfg.explorerDims ?? ["topic"]);
    setExplorerMetrics(cfg.explorerMetrics ?? ["likes", "comments", "plays", "engagement"]);
    setExplorerSort(cfg.explorerSort ?? { key: "date", dir: "desc" });
    if (cfg.preset) { setPreset(cfg.preset); setRange(presetRange(cfg.preset, MIN_DATE, MAX_DATE)); }
  };
  const createView = async (name) => {
    if (!name.trim()) return;
    const { data, error } = await supabase.from("saved_views").insert({ name: name.trim(), config: currentExplorerConfig() }).select().single();
    if (error) { console.error("Failed to save view:", error.message); return; }
    setSavedViews((v) => [...v, data]);
    setActiveViewId(data.id);
    setNewViewName("");
  };
  const loadView = (view) => { applyExplorerConfig(view.config); setActiveViewId(view.id); setActiveSuggestion(null); };
  const loadSuggestion = (sv) => { applyExplorerConfig(sv.config); setActiveViewId(null); setActiveSuggestion(sv.name); };
  const updateView = async (id) => {
    const config = currentExplorerConfig();
    setSavedViews((v) => v.map((sv) => (sv.id === id ? { ...sv, config } : sv)));
    const { error } = await supabase.from("saved_views").update({ config }).eq("id", id);
    if (error) console.error("Failed to update view:", error.message);
  };
  const renameView = async (id, name) => {
    setSavedViews((v) => v.map((sv) => (sv.id === id ? { ...sv, name } : sv)));
    const { error } = await supabase.from("saved_views").update({ name }).eq("id", id);
    if (error) console.error("Failed to rename view:", error.message);
  };
  const deleteView = async (id) => {
    setSavedViews((v) => v.filter((sv) => sv.id !== id));
    if (activeViewId === id) setActiveViewId(null);
    setConfirmDeleteView(null);
    const { error } = await supabase.from("saved_views").delete().eq("id", id);
    if (error) console.error("Failed to delete view:", error.message);
  };

  const posts = useMemo(() => {
    if (!range) return [];
    return content.filter((p) => {
      if (p.date < range.start || p.date > range.end) return false;
      if (typeFilter !== "All" && p.contentType !== typeFilter) return false;
      return true;
    });
  }, [content, range, typeFilter]);

  const daily = useMemo(() => (range ? dailyRows.filter((d) => d.date >= range.start && d.date <= range.end) : []), [dailyRows, range]);

  const spanMs = range ? new Date(range.end) - new Date(range.start) : 0;
  const prevStart = range ? new Date(new Date(range.start).getTime() - spanMs - 86400000).toISOString().slice(0, 10) : null;
  const prevEnd = range ? new Date(new Date(range.start).getTime() - 86400000).toISOString().slice(0, 10) : null;
  const prevDaily = useMemo(() => (prevStart ? dailyRows.filter((d) => d.date >= prevStart && d.date <= prevEnd) : []), [dailyRows, prevStart, prevEnd]);
  const prevPosts = useMemo(() => (prevStart ? content.filter((p) => p.date >= prevStart && p.date <= prevEnd && (typeFilter === "All" || p.contentType === typeFilter)) : []), [content, prevStart, prevEnd, typeFilter]);

  const pct = (a, b) => (b ? +(((a - b) / b) * 100).toFixed(1) : (a ? null : 0));
  const accVal = (key) => ({ now: agg(daily, key, "last"), prev: agg(prevDaily, key, "last") });

  const filtered = useMemo(() => posts.filter((p) => {
    if (topicFilter.length && !topicFilter.includes(p.catId)) return false;
    if (search) {
      const q = search.toLowerCase();
      if (!p.caption.toLowerCase().includes(q) && !p.hashtags.join(" ").toLowerCase().includes(q) && !p.topic.toLowerCase().includes(q)) return false;
    }
    return true;
  }), [posts, topicFilter, search]);

  const postsOnly = useMemo(() => posts.filter((p) => p.contentType === "Post"), [posts]);
  const reelsOnly = useMemo(() => posts.filter((p) => p.contentType === "Reel"), [posts]);

  // Item 20 dependency: same-length prior-period average engagement per
  // category, for a momentum delta next to each Topics row.
  const prevTopicAvg = useMemo(() => {
    const g = {};
    prevPosts.forEach((p) => (g[p.catId] = g[p.catId] || []).push(p));
    const map = {};
    Object.entries(g).forEach(([catId, arr]) => { map[catId] = arr.reduce((a, p) => a + p.engagement, 0) / arr.length; });
    return map;
  }, [prevPosts]);

  const topicRows = useMemo(() => {
    const g = {};
    posts.forEach((p) => (g[p.catId] = g[p.catId] || []).push(p));
    return categories.filter((c) => g[c.id]?.length).map((c) => {
      const arr = g[c.id];
      // Item 13 dependency: weekly engagement totals for a sparkline.
      const byWeek = {};
      arr.forEach((p) => { const wk = weekStartOf(p.date); byWeek[wk] = (byWeek[wk] || 0) + p.engagement; });
      const sparkline = Object.entries(byWeek).sort(([a], [b]) => a.localeCompare(b)).map(([week, engagement]) => ({ week, engagement }));
      const avgEngagement = +(arr.reduce((a, p) => a + p.engagement, 0) / arr.length).toFixed(1);
      return {
        catId: c.id, name: c.name, color: c.color, count: arr.length,
        likes: agg(arr, "likes", "sum"), comments: agg(arr, "comments", "sum"),
        shares: agg(arr, "shares", "sum"), saves: agg(arr, "saves", "sum"),
        avgEngagement,
        prevAvgEngagement: prevTopicAvg[c.id] ?? null,
        sparkline,
        items: arr.slice().sort((a, b) => b.engagement - a.engagement),
      };
    }).sort((a, b) => b.avgEngagement - a.avgEngagement);
  }, [posts, categories, prevTopicAvg]);
  const sortedTopicRows = useMemo(() => sortRows(topicRows, topicSort, { name: "string" }), [topicRows, topicSort]);

  // Item 8: skip-rate leaderboard (Reels only).
  const skipRateRanked = useMemo(() => {
    const withRate = reelsOnly.filter((p) => p.reelsSkipRate !== null && p.reelsSkipRate !== undefined);
    const sorted = withRate.slice().sort((a, b) => a.reelsSkipRate - b.reelsSkipRate);
    return { best: sorted.slice(0, 5), worst: sorted.slice(-5).reverse() };
  }, [reelsOnly]);

  // Item 11: hashtag performance — explode hashtags, average engagement per tag.
  const hashtagPerformance = useMemo(() => {
    const g = {};
    posts.forEach((p) => (p.hashtags ?? []).forEach((tag) => (g[tag] = g[tag] || []).push(p.engagement)));
    return Object.entries(g)
      .map(([tag, vals]) => ({ tag, count: vals.length, avgEngagement: +(vals.reduce((a, b) => a + b, 0) / vals.length).toFixed(1) }))
      .filter((r) => r.count >= 2)
      .sort((a, b) => b.avgEngagement - a.avgEngagement)
      .slice(0, 10);
  }, [posts]);

  // Item 12: Reel duration vs. performance scatter.
  const durationScatter = useMemo(() => {
    return reelsOnly.filter((p) => p.durationS != null).map((p) => ({ x: p.durationS, y: p.engagement, caption: p.caption }));
  }, [reelsOnly]);

  // Item 22: underperformers — items below half their category's average
  // engagement, so it's relative to a comparable baseline, not a global one.
  const underperformers = useMemo(() => {
    const avgByCategory = Object.fromEntries(topicRows.map((r) => [r.catId, r.avgEngagement]));
    return posts
      .filter((p) => avgByCategory[p.catId] && p.engagement < avgByCategory[p.catId] * 0.5)
      .map((p) => ({ ...p, categoryAvg: avgByCategory[p.catId] }))
      .sort((a, b) => (a.engagement / a.categoryAvg) - (b.engagement / b.categoryAvg))
      .slice(0, 8);
  }, [posts, topicRows]);

  // Item 23: category x content-type matrix — avg engagement per cell.
  const categoryTypeMatrix = useMemo(() => {
    return categories.map((c) => {
      const reelsArr = posts.filter((p) => p.catId === c.id && p.contentType === "Reel");
      const postsArr = posts.filter((p) => p.catId === c.id && p.contentType === "Post");
      return {
        catId: c.id, name: c.name, color: c.color,
        reelAvg: reelsArr.length ? +(agg(reelsArr, "engagement", "sum") / reelsArr.length).toFixed(1) : null,
        postAvg: postsArr.length ? +(agg(postsArr, "engagement", "sum") / postsArr.length).toFixed(1) : null,
        reelCount: reelsArr.length, postCount: postsArr.length,
      };
    }).filter((r) => r.reelCount || r.postCount);
  }, [posts, categories]);

  const sortedFiltered = useMemo(() => {
    const dimTypes = { topic: "string", hashtags: "string", date: "string", caption: "string", contentType: "string" };
    return sortRows(filtered, explorerSort, dimTypes);
  }, [filtered, explorerSort]);
  const visibleIds = useMemo(() => sortedFiltered.map((p) => p.id), [sortedFiltered]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  const toggleSelectAllVisible = () => setSelectedIds(allVisibleSelected ? [] : visibleIds);
  const toggleSelectRow = (id) => setSelectedIds((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const topContent = useMemo(() => [...filtered].sort((a, b) => b.engagement - a.engagement).slice(0, 8), [filtered]);
  const presets = [["7d", "Last week"], ["30d", "Last month"], ["3m", "Last 3 months"], ["all", "All time"]];

  const followerNow = accVal("followers"), followingNow = accVal("following");

  const ageGenderChartData = useMemo(() => {
    const rows = audienceSnapshot?.age_gender ?? [];
    const byAge = {};
    for (const r of rows) {
      const [age, gender] = r.dimension_values ?? [];
      if (!age) continue;
      byAge[age] = byAge[age] || { age };
      byAge[age][gender] = r.value;
    }
    const order = ["13-17", "18-24", "25-34", "35-44", "45-54", "55-64", "65+"];
    return order.filter((a) => byAge[a]).map((a) => byAge[a]);
  }, [audienceSnapshot]);

  const topCountries = useMemo(() => {
    const rows = audienceSnapshot?.country ?? [];
    return rows
      .map((r) => [r.dimension_values?.[0], r.value])
      .filter(([code]) => code)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
  }, [audienceSnapshot]);

  // Item 24: posting streak — consecutive weeks (not days; this account
  // doesn't post daily) with at least one item, walking back from the most
  // recent. Deliberately uses ALL content, not the range-filtered `posts`,
  // same reasoning as "Data last synced" — it should reflect today's real
  // streak regardless of what date range happens to be selected.
  // startDate is the earliest post date within the oldest week of the
  // streak — the actual day the current unbroken run began.
  const postingStreak = useMemo(() => {
    if (!content.length) return { count: 0, startDate: null };
    const weeks = [...new Set(content.map((p) => weekStartOf(p.date)))].sort().reverse();
    if (!weeks.length) return { count: 0, startDate: null };
    let streak = 1;
    let cursor = new Date(weeks[0] + "T00:00:00Z");
    for (let i = 1; i < weeks.length; i++) {
      cursor.setUTCDate(cursor.getUTCDate() - 7);
      if (weeks[i] === cursor.toISOString().slice(0, 10)) streak++;
      else break;
    }
    const startWeek = weeks[streak - 1];
    const startDate = content.filter((p) => weekStartOf(p.date) === startWeek).map((p) => p.date).sort()[0];
    return { count: streak, startDate };
  }, [content]);

  if (loading) {
    return (
      <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontFamily: "Inter, sans-serif" }}>
        Loading dashboard…
      </div>
    );
  }
  if (loadError) {
    return (
      <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: T.clay, fontFamily: "Inter, sans-serif", padding: 24, textAlign: "center" }}>
        Couldn't load dashboard data: {loadError}<br />Check that VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY are set correctly.
      </div>
    );
  }
  if (!range) {
    return (
      <div style={{ background: T.bg, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontFamily: "Inter, sans-serif" }}>
        No content found yet — run the ingestion workflow first.
      </div>
    );
  }

  return (
    <DescProvider customDescriptions={customDescriptions} onSave={saveDescription}>
    <TooltipProvider>
    <div style={{ background: T.bg, minHeight: "100%", padding: "32px 26px 60px", fontFamily: "Inter, sans-serif", color: T.ivory }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500&family=Inter:wght@400;500;600;700&display=swap');
        * { box-sizing: border-box; }
        input[type="date"], input[type="text"] { color-scheme: dark; }
        ::-webkit-scrollbar { height: 7px; width: 7px; }
        ::-webkit-scrollbar-thumb { background: ${T.line}; }
        table { border-collapse: collapse; width: 100%; }
        body { margin: 0; background: ${T.bg}; }
      `}</style>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: 14, marginBottom: 16 }}>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 5 }}><Gem size={13} color={T.gold} /><span style={{ fontSize: 10.5, letterSpacing: "0.16em", textTransform: "uppercase", color: T.gold }}>Ela Eternal Jewels</span></div>
          <h1 style={{ fontFamily: "'Fraunces', serif", fontWeight: 500, fontSize: 28, margin: 0 }}>@neha_thefinejeweler</h1>
          <div style={{ color: T.muted, fontSize: 12, marginTop: 3 }}>{posts.length} items · {fmtDate(range.start)} → {fmtDate(range.end)}</div>
          {lastSynced && <div style={{ color: T.muted, fontSize: 10.5, marginTop: 3 }}>Data last synced {fmtDateTime(lastSynced)}</div>}
        </div>
        <div style={{ display: "flex", gap: 3, background: T.surface, border: `1px solid ${T.line}`, padding: 3, ...facet(6) }}>
          {[["overview", "Overview"], ["content", "Content"], ["explore", "Content Explorer"]].map(([k, l]) => (
            <button key={k} onClick={() => setTab(k)} style={{ border: "none", cursor: "pointer", padding: "7px 15px", fontSize: 12, fontWeight: 600, background: tab === k ? T.gold : "transparent", color: tab === k ? T.bg : T.muted }}>{l}</button>
          ))}
        </div>
      </div>

      {hiddenVisuals.length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <button onClick={() => setManageHiddenOpen((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${T.line}`, color: T.muted, padding: "5px 10px", fontSize: 11, cursor: "pointer", borderRadius: 3 }}>
            <EyeOff size={11} /> {hiddenVisuals.length} hidden — {manageHiddenOpen ? "Hide" : "Manage"}
          </button>
          {manageHiddenOpen && (
            <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "12px 14px", marginTop: 8, ...facet(8) }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {VISUAL_REGISTRY.filter((v) => hiddenVisuals.includes(v.id)).map((v) => (
                  <div key={v.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, color: T.ivory }}>{v.label} <span style={{ color: T.muted, fontSize: 10.5 }}>({v.tab})</span></span>
                    <button onClick={() => unhideVisual(v.id)} style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.gold, padding: "3px 10px", fontSize: 11, cursor: "pointer", borderRadius: 3 }}>Show</button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {tab !== "overview" && (
        <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 26 }}>
          <span style={{ fontSize: 11, color: T.muted }}>Content type:</span>
          {["All", "Reel", "Post"].map((t) => <Chip key={t} active={typeFilter === t} onClick={() => setTypeFilter(t)}>{t}</Chip>)}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 26, background: T.surface, border: `1px solid ${T.line}`, padding: "11px 14px", ...facet(8) }}>
        <Calendar size={13} color={T.gold} />
        {presets.map(([k, l]) => <Chip key={k} active={preset === k} onClick={() => { setPreset(k); setRange(presetRange(k, MIN_DATE, MAX_DATE)); }}>{l}</Chip>)}
        <div style={{ width: 1, height: 18, background: T.line, margin: "0 4px" }} />
        <input type="date" value={range.start} min={MIN_DATE} max={range.end} onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, start: e.target.value })); }} style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.ivory, padding: "5px 7px", fontSize: 11.5, fontFamily: "inherit" }} />
        <span style={{ color: T.muted, fontSize: 11.5 }}>to</span>
        <input type="date" value={range.end} min={range.start} max={MAX_DATE} onChange={(e) => { setPreset("custom"); setRange((r) => ({ ...r, end: e.target.value })); }} style={{ background: T.surface2, border: `1px solid ${T.line}`, color: T.ivory, padding: "5px 7px", fontSize: 11.5, fontFamily: "inherit" }} />
      </div>

      {tab === "overview" && (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 12, marginBottom: 30 }}>
            <Section id="posting-streak" eyebrow="Audience" title="Posting consistency" noEdit hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "16px 16px 13px", ...facet(11) }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <Flame size={18} color={T.gold} />
                  <div style={{ fontFamily: "'Fraunces', serif", fontSize: 23, color: T.ivory }}>{postingStreak.count}</div>
                </div>
                <div style={{ fontSize: 11.5, color: T.muted, marginTop: 4 }}>consecutive week{postingStreak.count === 1 ? "" : "s"} with a post</div>
                {postingStreak.startDate && <div style={{ fontSize: 10.5, color: T.muted, marginTop: 2 }}>Since {fmtDate(postingStreak.startDate)}</div>}
              </div>
            </Section>
          </div>

          <SectionHeader eyebrow="Audience" title="Follower activity" />
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12, marginBottom: 24 }}>
            <KpiCard icon={Users} label="Followers" value={fmt(followerNow.now)} delta={pct(followerNow.now, followerNow.prev)} />
            <KpiCard icon={Users} label="Following" value={fmt(followingNow.now)} />
          </div>

          <div style={{ marginBottom: 10 }}>
            <SubBlock id="follower-history" label="Follower count history" noEdit hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
              <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "16px 16px 6px", ...facet(10) }}>
                {daily.length < 2 ? (
                  <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12, textAlign: "center", padding: "0 20px" }}>
                    Not enough history yet — check back after a few more days of data.
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={200}>
                    <AreaChart data={daily}>
                      <defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor={T.gold} stopOpacity={0.35} /><stop offset="100%" stopColor={T.gold} stopOpacity={0} /></linearGradient></defs>
                      <CartesianGrid stroke={T.line} vertical={false} />
                      <XAxis dataKey="date" tickFormatter={(d) => fmtDate(d, { year: false })} tick={{ fontSize: 10, fill: T.muted }} axisLine={{ stroke: T.line }} tickLine={false} minTickGap={40} />
                      <YAxis tick={{ fontSize: 10, fill: T.muted }} axisLine={false} tickLine={false} width={44} domain={["dataMin - 20", "dataMax + 20"]} />
                      <Tooltip content={<Tip />} />
                      <Area type="monotone" dataKey="followers" name="Followers" stroke={T.gold} fill="url(#fg)" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                )}
              </div>
            </SubBlock>
          </div>

          {audienceSnapshot && (
            <Section id="whos-following" eyebrow="Audience" title="Who's following" noEdit hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
              <div style={{ display: "grid", gridTemplateColumns: "1.3fr 1fr", gap: 12 }}>
                <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "16px 16px 6px", ...facet(10) }}>
                  <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.05em" }}>Age &amp; gender</div>
                  <ResponsiveContainer width="100%" height={220}>
                    <BarChart data={ageGenderChartData} layout="vertical" margin={{ left: 4, right: 12 }}>
                      <CartesianGrid stroke={T.line} horizontal={false} />
                      <XAxis type="number" tick={{ fontSize: 10, fill: T.muted }} axisLine={{ stroke: T.line }} tickLine={false} />
                      <YAxis type="category" dataKey="age" tick={{ fontSize: 10, fill: T.muted }} axisLine={false} tickLine={false} width={40} />
                      <Tooltip content={<Tip />} />
                      <Bar dataKey="F" name="Female" fill={T.gold} radius={2} />
                      <Bar dataKey="M" name="Male" fill={T.sage} radius={2} />
                      <Bar dataKey="U" name="Unspecified" fill={T.muted} radius={2} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "16px 16px", ...facet(10) }}>
                  <div style={{ fontSize: 10.5, color: T.muted, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Top countries</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                    {topCountries.map(([code, count]) => (
                      <div key={code} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: T.ivory }}>
                        <span style={{ color: T.muted }}>{COUNTRY_NAMES[code] || code}</span>
                        <span>{fmt(count)}</span>
                      </div>
                    ))}
                    {!topCountries.length && <div style={{ fontSize: 11.5, color: T.muted }}>No country data in this snapshot.</div>}
                  </div>
                </div>
              </div>
            </Section>
          )}

        </>
      )}

      {tab === "content" && (
        <>
          <Section id="topics-table" eyebrow="Content strategy" title="Topics" insight="Avg engagement = total interactions (likes + saves + comments + shares)/number of content. Click a topic to see individual content." hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
          <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 10 }}>
            <button onClick={() => setShowManage((s) => !s)} style={{ display: "flex", alignItems: "center", gap: 6, background: "transparent", border: `1px solid ${T.line}`, color: T.muted, padding: "6px 11px", fontSize: 11.5, cursor: "pointer", borderRadius: 3 }}>
              <Pencil size={11} /> Manage categories
            </button>
          </div>

          {showManage && (
            <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "14px 16px", marginBottom: 16, ...facet(9) }}>
              <div style={{ fontSize: 11.5, color: T.muted, marginBottom: 10 }}>Renaming or adding a category updates it for everyone viewing this dashboard.</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                {categories.map((c) => (
                  <div key={c.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span style={{ width: 9, height: 9, borderRadius: "50%", background: c.color, flexShrink: 0 }} />
                    {editingCat === c.id ? (
                      <>
                        <input autoFocus defaultValue={c.name} onKeyDown={(e) => { if (e.key === "Enter") { renameCategory(c.id, e.target.value); setEditingCat(null); } }} style={{ background: T.surface2, border: `1px solid ${T.gold}`, color: T.ivory, padding: "4px 7px", fontSize: 12, fontFamily: "inherit" }} />
                        <button onClick={(e) => { const input = e.target.parentElement.querySelector("input"); renameCategory(c.id, input.value); setEditingCat(null); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.sage }}><Check size={14} /></button>
                      </>
                    ) : (
                      <>
                        <span style={{ fontSize: 12.5, color: T.ivory, flex: 1 }}>{c.name}</span>
                        <button onClick={() => setEditingCat(c.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.muted }}><Pencil size={12} /></button>
                      </>
                    )}
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <input value={newCatName} onChange={(e) => setNewCatName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addCategory(newCatName); }} placeholder="New category name…" style={{ flex: 1, background: T.surface2, border: `1px solid ${T.line}`, color: T.ivory, padding: "6px 9px", fontSize: 12, fontFamily: "inherit" }} />
                <button onClick={() => addCategory(newCatName)} style={{ display: "flex", alignItems: "center", gap: 5, background: T.gold, border: "none", color: T.bg, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}><Plus size={13} /> Add</button>
              </div>
            </div>
          )}

          <div style={{ background: T.surface, border: `1px solid ${T.line}`, marginBottom: 32, overflowX: "auto", ...facet(10) }}>
            <table style={{ fontSize: 12 }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.line}`, color: T.muted, fontSize: 10, textTransform: "uppercase" }}>
                <th style={{ padding: "10px 13px" }}></th>
                <Th label="Topic" sortKey="name" sort={topicSort} setSort={setTopicSort} />
                <Th label="Content" sortKey="count" sort={topicSort} setSort={setTopicSort} align="right" />
                <Th label="Likes" sortKey="likes" sort={topicSort} setSort={setTopicSort} align="right" infoText={METRICS.find((m) => m.key === "likes").description} />
                <Th label="Comments" sortKey="comments" sort={topicSort} setSort={setTopicSort} align="right" infoText={METRICS.find((m) => m.key === "comments").description} />
                <Th label="Shares" sortKey="shares" sort={topicSort} setSort={setTopicSort} align="right" infoText={METRICS.find((m) => m.key === "shares").description} />
                <Th label="Saves" sortKey="saves" sort={topicSort} setSort={setTopicSort} align="right" infoText={METRICS.find((m) => m.key === "saves").description} />
                <Th label="Avg engagement" sortKey="avgEngagement" sort={topicSort} setSort={setTopicSort} align="right" infoText={METRICS.find((m) => m.key === "engagement").description} />
                {!hiddenVisuals.includes("category-momentum") && (
                  <th style={{ padding: "10px 13px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Momentum <HideControl id="category-momentum" confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide} label="the momentum column" /></span>
                  </th>
                )}
                {!hiddenVisuals.includes("category-sparklines") && (
                  <th style={{ padding: "10px 13px", textAlign: "right", whiteSpace: "nowrap" }}>
                    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>Trend <HideControl id="category-sparklines" confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide} label="the trend column" /></span>
                  </th>
                )}
              </tr></thead>
              <tbody>
                {sortedTopicRows.map((row) => {
                  const isOpen = expandedTopics.includes(row.catId);
                  const momentum = pct(row.avgEngagement, row.prevAvgEngagement);
                  return (
                    <React.Fragment key={row.catId}>
                      <tr style={{ borderBottom: `1px solid ${T.line}`, cursor: "pointer" }} onClick={() => setExpandedTopics((s) => s.includes(row.catId) ? s.filter((x) => x !== row.catId) : [...s, row.catId])}>
                        <td style={{ padding: "9px 13px" }}>{isOpen ? <ChevronDown size={13} color={T.muted} /> : <ChevronRight size={13} color={T.muted} />}</td>
                        <td style={{ padding: "9px 13px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: row.color }} />{row.name}</span></td>
                        <td style={{ padding: "9px 13px", textAlign: "right", color: T.muted }}>{row.count}</td>
                        <td style={{ padding: "9px 13px", textAlign: "right" }}>{fmt(row.likes)}</td>
                        <td style={{ padding: "9px 13px", textAlign: "right" }}>{fmt(row.comments)}</td>
                        <td style={{ padding: "9px 13px", textAlign: "right" }}>{fmt(row.shares)}</td>
                        <td style={{ padding: "9px 13px", textAlign: "right" }}>{fmt(row.saves)}</td>
                        <td style={{ padding: "9px 13px", textAlign: "right", color: T.gold, fontWeight: 600 }}>{fmt(row.avgEngagement)}</td>
                        {!hiddenVisuals.includes("category-momentum") && (
                          <td style={{ padding: "9px 13px", textAlign: "right" }}><Delta value={momentum} /></td>
                        )}
                        {!hiddenVisuals.includes("category-sparklines") && (
                          <td style={{ padding: "9px 13px", width: 90 }}>
                            {row.sparkline.length >= 2 ? (
                              <ResponsiveContainer width="100%" height={28}>
                                <AreaChart data={row.sparkline}>
                                  <Area type="monotone" dataKey="engagement" stroke={row.color} fill={row.color} fillOpacity={0.25} strokeWidth={1.5} isAnimationActive={false} />
                                </AreaChart>
                              </ResponsiveContainer>
                            ) : <span style={{ fontSize: 10, color: T.muted }}>—</span>}
                          </td>
                        )}
                      </tr>
                      {isOpen && row.items.map((it) => (
                        <tr key={it.id} style={{ borderBottom: `1px solid ${T.line}`, background: T.surface2 }}>
                          <td style={{ padding: "7px 13px" }}></td>
                          <td style={{ padding: "7px 13px", color: T.muted, fontSize: 11.5, display: "flex", alignItems: "center", gap: 6 }}>
                            <TypeIcon type={it.contentType} size={10} />
                            <span style={{ maxWidth: 260, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{it.caption}</span>
                            {it.permalink && (
                              <a href={it.permalink} target="_blank" rel="noopener noreferrer" title="View on Instagram" style={{ color: T.muted, flexShrink: 0 }}>
                                <ExternalLink size={10} />
                              </a>
                            )}
                          </td>
                          <td style={{ padding: "7px 13px", textAlign: "right", color: T.muted, fontSize: 11 }}>{fmtDate(it.date)}</td>
                          <td style={{ padding: "7px 13px", textAlign: "right", fontSize: 11.5 }}>{it.likes}</td>
                          <td style={{ padding: "7px 13px", textAlign: "right", fontSize: 11.5 }}>{it.comments}</td>
                          <td style={{ padding: "7px 13px", textAlign: "right", fontSize: 11.5 }}>{it.shares}</td>
                          <td style={{ padding: "7px 13px", textAlign: "right", fontSize: 11.5 }}>{it.saves}</td>
                          <td style={{ padding: "7px 13px", textAlign: "right", fontSize: 11.5, color: T.gold }}>{it.engagement}</td>
                          {!hiddenVisuals.includes("category-momentum") && <td style={{ padding: "7px 13px" }}></td>}
                          {!hiddenVisuals.includes("category-sparklines") && <td style={{ padding: "7px 13px" }}></td>}
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          </Section>

          <Section id="top-performing-content" eyebrow="Content" title="Top performing content" insight="Ranked by engagement score. Click a topic pill on any card to reassign it." hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: 12 }}>
              {topContent.map((p, i) => (
                <ContentCard key={p.id} p={p} rank={i + 1} categories={categories} onReassign={reassign} footer={`Engagement ${p.engagement}`} />
              ))}
            </div>
          </Section>

          <Section id="skip-rate-leaderboard" eyebrow="Reels" title="Skip rate leaderboard" insight="Reels only. Lowest skip rate = best hooks (fewest people leaving in the first 3 seconds); highest = openings worth revisiting." hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 10.5, color: T.sage, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Best hooks</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {skipRateRanked.best.map((p) => (
                    <ContentCard key={p.id} p={p} categories={categories} footer={`Skip rate ${p.reelsSkipRate}%`} />
                  ))}
                </div>
                {!skipRateRanked.best.length && <div style={{ fontSize: 11.5, color: T.muted }}>No skip-rate data yet.</div>}
              </div>
              <div>
                <div style={{ fontSize: 10.5, color: T.clay, marginBottom: 10, textTransform: "uppercase", letterSpacing: "0.05em" }}>Needs work</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))", gap: 10 }}>
                  {skipRateRanked.worst.map((p) => (
                    <ContentCard key={p.id} p={p} categories={categories} footer={`Skip rate ${p.reelsSkipRate}%`} />
                  ))}
                </div>
                {!skipRateRanked.worst.length && <div style={{ fontSize: 11.5, color: T.muted }}>No skip-rate data yet.</div>}
              </div>
            </div>
          </Section>

          <Section id="hashtag-performance" eyebrow="Content strategy" title="Hashtag performance" insight="Average engagement of posts/reels using each hashtag (tags used only once are excluded — not enough samples to mean anything)." hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
            <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "14px 16px", ...facet(9) }}>
              <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
                {hashtagPerformance.map((h) => (
                  <div key={h.tag} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                    <span style={{ color: T.ivory }}>{h.tag} <span style={{ color: T.muted, fontSize: 10.5 }}>({h.count})</span></span>
                    <span style={{ color: T.gold, fontWeight: 600 }}>{fmt(h.avgEngagement)}</span>
                  </div>
                ))}
                {!hashtagPerformance.length && <div style={{ fontSize: 11.5, color: T.muted }}>No hashtag used more than once in this range yet.</div>}
              </div>
            </div>
          </Section>

          <Section id="duration-scatter" eyebrow="Reels" title="Reel duration vs. performance" insight="Duration in seconds (x) vs. engagement (y) per Reel — a way to see whether shorter or longer reels tend to perform better for this account." hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
            <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "16px 16px 6px", ...facet(10) }}>
              {durationScatter.length < 2 ? (
                <div style={{ height: 200, display: "flex", alignItems: "center", justifyContent: "center", color: T.muted, fontSize: 12, textAlign: "center", padding: "0 20px" }}>No duration data yet — this needs a fresh ingestion run after the duration_s column exists.</div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <ScatterChart margin={{ left: 4, right: 12, bottom: 4 }}>
                    <CartesianGrid stroke={T.line} />
                    <XAxis type="number" dataKey="x" name="Duration" unit="s" tick={{ fontSize: 10, fill: T.muted }} axisLine={{ stroke: T.line }} tickLine={false} />
                    <YAxis type="number" dataKey="y" name="Engagement" tick={{ fontSize: 10, fill: T.muted }} axisLine={false} tickLine={false} width={40} />
                    <ZAxis range={[60, 60]} />
                    <Tooltip cursor={{ stroke: T.line }} content={({ active, payload }) => active && payload?.length ? (
                      <div style={{ background: T.surface2, border: `1px solid ${T.gold}`, padding: "8px 10px", fontSize: 11, color: T.ivory, maxWidth: 200 }}>{payload[0].payload.caption}</div>
                    ) : null} />
                    <Scatter data={durationScatter} fill={T.sage} fillOpacity={0.7} />
                  </ScatterChart>
                </ResponsiveContainer>
              )}
            </div>
          </Section>

          <Section id="underperformer-flag" eyebrow="Content strategy" title="Under performers" insight="Content sitting below half its own category's average engagement — a relative bar, not a global one, so it's comparable across very different topics." hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(215px, 1fr))", gap: 12 }}>
              {underperformers.map((p) => (
                <ContentCard key={p.id} p={p} categories={categories} footer={`Engagement ${p.engagement} vs. ${p.categoryAvg} avg`} />
              ))}
            </div>
            {!underperformers.length && <div style={{ fontSize: 11.5, color: T.muted }}>Nothing sitting notably below its category average right now.</div>}
          </Section>

          <Section id="category-matrix" eyebrow="Content strategy" title="Category × content type" insight="Average engagement per category, split by Reel vs. Post — shows which topics work better in which format." hiddenVisuals={hiddenVisuals} confirmHideId={confirmHideId} onRequestHide={requestHide} onConfirmHide={confirmHide} onCancelHide={cancelHide}>
            <div style={{ background: T.surface, border: `1px solid ${T.line}`, overflowX: "auto", ...facet(10) }}>
              <table style={{ fontSize: 12 }}>
                <thead><tr style={{ borderBottom: `1px solid ${T.line}`, color: T.muted, fontSize: 10, textTransform: "uppercase" }}>
                  <th style={{ padding: "10px 13px", textAlign: "left" }}>Topic</th>
                  <th style={{ padding: "10px 13px", textAlign: "right" }}>Reels avg</th>
                  <th style={{ padding: "10px 13px", textAlign: "right" }}>Posts avg</th>
                </tr></thead>
                <tbody>
                  {categoryTypeMatrix.map((r) => (
                    <tr key={r.catId} style={{ borderBottom: `1px solid ${T.line}` }}>
                      <td style={{ padding: "9px 13px" }}><span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}><span style={{ width: 8, height: 8, borderRadius: "50%", background: r.color }} />{r.name}</span></td>
                      <td style={{ padding: "9px 13px", textAlign: "right" }}>{r.reelAvg !== null ? <>{fmt(r.reelAvg)} <span style={{ color: T.muted, fontSize: 10.5 }}>({r.reelCount})</span></> : <span style={{ color: T.muted }}>—</span>}</td>
                      <td style={{ padding: "9px 13px", textAlign: "right" }}>{r.postAvg !== null ? <>{fmt(r.postAvg)} <span style={{ color: T.muted, fontSize: 10.5 }}>({r.postCount})</span></> : <span style={{ color: T.muted }}>—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>
        </>
      )}

      {tab === "explore" && (
        <>
          <SectionHeader eyebrow="Self serve" title="Content Explorer" note="Search, filter, and configure exactly which columns you want to see." />

          <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "14px 16px", marginBottom: 14, ...facet(9) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, background: T.surface2, border: `1px solid ${T.line}`, padding: "7px 11px" }}>
              <Search size={13} color={T.gold} />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search captions, hashtags, topics…" style={{ background: "transparent", border: "none", outline: "none", color: T.ivory, fontSize: 12, fontFamily: "inherit", flex: 1 }} />
              {search && <X size={13} color={T.muted} style={{ cursor: "pointer" }} onClick={() => setSearch("")} />}
            </div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {categories.map((c) => <Chip key={c.id} active={topicFilter.includes(c.id)} onClick={() => setTopicFilter((s) => s.includes(c.id) ? s.filter((x) => x !== c.id) : [...s, c.id])}>{c.name}</Chip>)}
            </div>
          </div>

          <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "14px 16px", marginBottom: 14, ...facet(9) }}>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9, fontSize: 11.5, color: T.muted }}><Columns size={13} color={T.gold} /> Dimensions</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap", marginBottom: 10 }}>
              {DIMENSION_FIELDS.map((d) => (
                <Chip key={d.key} active={explorerDims.includes(d.key)} onClick={() => setExplorerDims((s) => s.includes(d.key) ? s.filter((x) => x !== d.key) : [...s, d.key])}>{d.label}</Chip>
              ))}
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 7, marginBottom: 9, fontSize: 11.5, color: T.muted }}><Sliders size={13} color={T.gold} /> Metrics</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {METRICS.map((m) => (
                <Chip key={m.key} active={explorerMetrics.includes(m.key)} infoText={m.description} onClick={() => setExplorerMetrics((s) => s.includes(m.key) ? s.filter((x) => x !== m.key) : [...s, m.key])}>
                  {m.label}
                </Chip>
              ))}
            </div>
          </div>

          <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "14px 16px", marginBottom: 14, ...facet(9) }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: viewsOpen ? 12 : 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 11.5, color: T.muted }}>
                <FolderOpen size={13} color={T.gold} /> Saved views
                {activeViewId && ` — viewing "${savedViews.find((v) => v.id === activeViewId)?.name}"`}
                {!activeViewId && activeSuggestion && ` — viewing "${activeSuggestion}"`}
              </div>
              <button onClick={() => setViewsOpen((s) => !s)} style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.muted, padding: "5px 10px", fontSize: 11, cursor: "pointer", borderRadius: 3 }}>
                {viewsOpen ? "Hide" : "Manage views"}
              </button>
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: 7, flexWrap: "wrap", marginTop: 10 }}>
              <span style={{ fontSize: 10.5, color: T.muted, textTransform: "uppercase", letterSpacing: "0.05em" }}>Quick views</span>
              {SUGGESTED_VIEWS.map((sv) => (
                <Chip key={sv.name} active={activeSuggestion === sv.name} onClick={() => loadSuggestion(sv)}>{sv.name}</Chip>
              ))}
            </div>

            {viewsOpen && (
              <>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 12 }}>
                  {savedViews.length === 0 && <div style={{ fontSize: 11.5, color: T.muted }}>No saved views yet — configure the filters and columns above, then save the current setup.</div>}
                  {savedViews.map((v) => (
                    <div key={v.id} style={{ display: "flex", alignItems: "center", gap: 8, background: v.id === activeViewId ? "rgba(203,163,92,0.08)" : "transparent", padding: "4px 6px", borderRadius: 3 }}>
                      {editingView === v.id ? (
                        <>
                          <input autoFocus defaultValue={v.name} onKeyDown={(e) => { if (e.key === "Enter") { renameView(v.id, e.target.value); setEditingView(null); } }} style={{ flex: 1, background: T.surface2, border: `1px solid ${T.gold}`, color: T.ivory, padding: "4px 7px", fontSize: 12, fontFamily: "inherit" }} />
                          <button onClick={(e) => { const input = e.target.parentElement.querySelector("input"); renameView(v.id, input.value); setEditingView(null); }} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.sage }}><Check size={14} /></button>
                        </>
                      ) : confirmDeleteView === v.id ? (
                        <>
                          <span style={{ flex: 1, fontSize: 12, color: T.clay }}>Delete "{v.name}"? This can't be undone.</span>
                          <button onClick={() => deleteView(v.id)} style={{ background: T.clay, border: "none", color: T.bg, padding: "4px 10px", fontSize: 11.5, fontWeight: 600, cursor: "pointer", borderRadius: 3 }}>Delete</button>
                          <button onClick={() => setConfirmDeleteView(null)} style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.muted, padding: "4px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 3 }}>Cancel</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => loadView(v)} style={{ flex: 1, textAlign: "left", background: "transparent", border: "none", color: v.id === activeViewId ? T.gold : T.ivory, fontSize: 12.5, cursor: "pointer", padding: "3px 0" }}>{v.name}</button>
                          <button onClick={() => updateView(v.id)} title="Update this view with the current setup" style={{ background: "transparent", border: "none", cursor: "pointer", color: T.muted }}><RotateCcw size={13} /></button>
                          <button onClick={() => setEditingView(v.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.muted }}><Pencil size={13} /></button>
                          <button onClick={() => setConfirmDeleteView(v.id)} style={{ background: "transparent", border: "none", cursor: "pointer", color: T.clay }}><Trash2 size={13} /></button>
                        </>
                      )}
                    </div>
                  ))}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <input value={newViewName} onChange={(e) => setNewViewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") createView(newViewName); }} placeholder="Name this view (e.g. 'Reels this month')…" style={{ flex: 1, background: T.surface2, border: `1px solid ${T.line}`, color: T.ivory, padding: "6px 9px", fontSize: 12, fontFamily: "inherit" }} />
                  <button onClick={() => createView(newViewName)} style={{ display: "flex", alignItems: "center", gap: 5, background: T.gold, border: "none", color: T.bg, padding: "6px 12px", fontSize: 12, fontWeight: 600, cursor: "pointer" }}><Save size={13} /> Save current view</button>
                </div>
              </>
            )}
          </div>

          {selectedIds.length > 0 && (
            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "rgba(203,163,92,0.1)", border: `1px solid ${T.gold}`, padding: "9px 14px", marginBottom: 10, ...facet(7) }}>
              <span style={{ fontSize: 12, color: T.ivory, fontWeight: 600 }}>{selectedIds.length} selected</span>
              <select value={bulkCatId} onChange={(e) => setBulkCatId(e.target.value)} style={{ fontSize: 11.5, padding: "5px 8px", background: T.surface2, color: T.ivory, border: `1px solid ${T.line}`, borderRadius: 3 }}>
                <option value="">Move to…</option>
                {categories.map((c) => <option key={c.id} value={c.id} style={{ background: T.surface, color: T.ivory }}>{c.name}</option>)}
              </select>
              <button onClick={() => bulkReassign(selectedIds, bulkCatId)} disabled={!bulkCatId} style={{ background: bulkCatId ? T.gold : T.line, border: "none", color: T.bg, padding: "5px 12px", fontSize: 11.5, fontWeight: 600, cursor: bulkCatId ? "pointer" : "not-allowed", borderRadius: 3 }}>Apply</button>
              <button onClick={() => setSelectedIds([])} style={{ background: "transparent", border: `1px solid ${T.line}`, color: T.muted, padding: "5px 10px", fontSize: 11.5, cursor: "pointer", borderRadius: 3 }}>Clear</button>
            </div>
          )}

          <div style={{ background: T.surface, border: `1px solid ${T.line}`, overflowX: "auto", ...facet(10) }}>
            <table style={{ fontSize: 11.5 }}>
              <thead><tr style={{ borderBottom: `1px solid ${T.line}`, color: T.muted, fontSize: 10, textTransform: "uppercase" }}>
                <th style={{ padding: "10px 12px" }}><input type="checkbox" checked={allVisibleSelected} onChange={toggleSelectAllVisible} style={{ cursor: "pointer" }} /></th>
                <Th label="Type" sortKey="contentType" sort={explorerSort} setSort={setExplorerSort} />
                {explorerDims.map((dk) => <Th key={dk} label={DIMENSION_FIELDS.find((d) => d.key === dk)?.label} sortKey={dk} sort={explorerSort} setSort={setExplorerSort} />)}
                <Th label="Caption" sortKey="caption" sort={explorerSort} setSort={setExplorerSort} />
                {explorerMetrics.map((mk) => { const m = METRICS.find((x) => x.key === mk); return <Th key={mk} label={m.label} sortKey={mk} sort={explorerSort} setSort={setExplorerSort} align="right" />; })}
              </tr></thead>
              <tbody>{sortedFiltered.map((p) => (
                <tr key={p.id} style={{ borderBottom: `1px solid ${T.line}`, background: selectedIds.includes(p.id) ? "rgba(203,163,92,0.06)" : "transparent" }}>
                  <td style={{ padding: "8px 12px" }}><input type="checkbox" checked={selectedIds.includes(p.id)} onChange={() => toggleSelectRow(p.id)} style={{ cursor: "pointer" }} /></td>
                  <td style={{ padding: "8px 12px", color: T.muted, whiteSpace: "nowrap" }}><span style={{ display: "flex", alignItems: "center", gap: 4 }}><TypeIcon type={p.contentType} size={10} />{p.contentType}</span></td>
                  {explorerDims.map((dk) => (
                    <td key={dk} style={{ padding: "8px 12px", color: T.muted, whiteSpace: "nowrap" }}>
                      {dk === "topic" && <span style={{ fontSize: 10.5, padding: "2px 7px", borderRadius: 3, background: `${p.topicColor}22`, color: p.topicColor }}>{p.topic}</span>}
                      {dk === "hashtags" && <span style={{ fontSize: 10.5 }}>{p.hashtags.join(" ") || "—"}</span>}
                      {dk === "date" && fmtDate(p.date)}
                    </td>
                  ))}
                  <td style={{ padding: "8px 12px", color: T.ivory, maxWidth: 280 }}>
                    <span style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                      <span>{p.caption}</span>
                      {p.permalink && (
                        <a href={p.permalink} target="_blank" rel="noopener noreferrer" title="View on Instagram" style={{ color: T.muted, flexShrink: 0, marginTop: 1 }}>
                          <ExternalLink size={11} />
                        </a>
                      )}
                    </span>
                  </td>
                  {explorerMetrics.map((mk) => <td key={mk} style={{ padding: "8px 12px", textAlign: "right" }}>{fmt(p[mk])}</td>)}
                </tr>))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
    </TooltipProvider>
    </DescProvider>
  );
}
