import React, { useEffect, useMemo, useState } from "react";
import { ResponsiveContainer, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { Users, MousePointerClick, ShoppingCart, CreditCard, Search, Eye, Instagram, CheckCircle2, AlertTriangle } from "lucide-react";
import { supabase } from "./supabaseClient";

// Same palette as Dashboard.jsx so the tab looks native.
const T = {
  bg: "#0F1E1A", surface: "#152720", surface2: "#1B3128", line: "#2A3F35",
  gold: "#CBA35C", ivory: "#F3EFE6", muted: "#93A89C", clay: "#C08A72", sage: "#7FA98F",
};
const facet = (s = 10) => ({
  clipPath: `polygon(${s}px 0, 100% 0, 100% calc(100% - ${s}px), calc(100% - ${s}px) 100%, 0 100%, 0 ${s}px)`,
});

const METRICS = [
  { key: "shop_visitors", label: "Shopify visitors", icon: Users },
  { key: "shop_sessions", label: "Shopify sessions", icon: MousePointerClick },
  { key: "shop_cart_sessions", label: "Sessions that added to cart", icon: ShoppingCart },
  { key: "shop_checkout_sessions", label: "Sessions that reached checkout", icon: CreditCard },
  { key: "gsc_clicks", label: "Google search clicks", icon: Search },
  { key: "gsc_impressions", label: "Google search impressions", icon: Eye },
  { key: "ig_followers", label: "Instagram followers", icon: Instagram },
];

// "Wed, Oct 28" — weekday included on purpose; that's how Neha tracks dates.
const day = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", weekday: "short", month: "short", day: "numeric" });
const short = (iso) => new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { timeZone: "UTC", month: "short", day: "numeric" });
const n = (v) => (v === null || v === undefined ? null : Number(v));
const fmt = (v) => (v === null || v === undefined ? "—" : Number(v).toLocaleString());

function compare(rows, key) {
  // rows newest-first. Raw change vs the previous report + 4-report average —
  // at Ela's traffic one visitor swings a % a lot, so no percentages.
  const withVal = rows.filter((r) => n(r[key]) !== null);
  const cur = withVal[0] ? n(withVal[0][key]) : null;
  const prev = withVal[1] ? n(withVal[1][key]) : null;
  const last4 = withVal.slice(0, 4).map((r) => n(r[key]));
  return {
    cur, curDate: withVal[0]?.report_date, prev, prevDate: withVal[1]?.report_date,
    diff: cur !== null && prev !== null ? cur - prev : null,
    avg: last4.length >= 2 ? Math.round((last4.reduce((a, b) => a + b, 0) / last4.length) * 10) / 10 : null,
  };
}

function Card({ icon: Icon, label, c }) {
  const color = c.diff > 0 ? T.sage : c.diff < 0 ? T.clay : T.muted;
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "16px 16px 13px", ...facet(11), display: "flex", flexDirection: "column", gap: 6 }}>
      <div style={{ width: 26, height: 26, borderRadius: "50%", background: "rgba(203,163,92,0.12)", display: "flex", alignItems: "center", justifyContent: "center" }}><Icon size={13} color={T.gold} /></div>
      <div style={{ fontSize: 10.5, color: T.muted, textTransform: "uppercase", letterSpacing: "0.06em" }}>{label}</div>
      <div style={{ fontFamily: "'Fraunces', serif", fontSize: 23, color: T.ivory, fontWeight: 500 }}>{fmt(c.cur)}</div>
      <div style={{ fontSize: 11.5, color }}>
        {c.diff === null ? <span style={{ color: T.muted }}>no earlier report</span>
          : <>{c.diff > 0 ? "▲ " : c.diff < 0 ? "▼ " : ""}{c.diff === 0 ? "no change" : Math.abs(c.diff)} <span style={{ color: T.muted }}>vs {day(c.prevDate)} ({fmt(c.prev)})</span></>}
      </div>
      {c.avg !== null && <div style={{ fontSize: 11, color: T.muted }}>4-report avg {fmt(c.avg)}</div>}
    </div>
  );
}

function Tip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: T.surface2, border: `1px solid ${T.gold}`, padding: "7px 10px", fontSize: 11, color: T.ivory }}>
      <div style={{ color: T.muted, marginBottom: 2 }}>{day(label)}</div>
      {fmt(payload[0].value)}
    </div>
  );
}

function Panel({ title, children }) {
  return (
    <div style={{ background: T.surface, border: `1px solid ${T.line}`, padding: "14px 16px", ...facet(10) }}>
      <div style={{ fontSize: 10.5, color: T.gold, textTransform: "uppercase", letterSpacing: "0.12em", marginBottom: 10 }}>{title}</div>
      {children}
    </div>
  );
}

export default function WeeklyTab() {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    (async () => {
      const { data, error } = await supabase.from("weekly_metrics").select("*").order("report_date", { ascending: true });
      if (error) setError(error.message); else setRows(data ?? []);
    })();
  }, []);

  const newestFirst = useMemo(() => (rows ? [...rows].reverse() : []), [rows]);
  if (error) return <div style={{ color: T.clay, fontSize: 13 }}>Couldn't load weekly numbers: {error}. Has the setup SQL been run in Supabase?</div>;
  if (!rows) return <div style={{ color: T.muted, fontSize: 13 }}>Loading weekly numbers…</div>;
  if (!rows.length) return <div style={{ color: T.muted, fontSize: 13 }}>No weekly reports yet — the first one runs Wednesday at 8am Pacific.</div>;

  const latest = newestFirst[0];
  const checks = latest.site_checks ?? [];
  const queries = latest.gsc_top_queries ?? [];
  const products = [...(latest.checkout_products ?? []), ...(latest.order_products ?? [])];

  return (
    <div>
      <div style={{ fontSize: 12, color: T.muted, marginBottom: 14 }}>
        Latest report: <span style={{ color: T.ivory }}>{day(latest.report_date)}</span>
        {latest.shop_start && <> · Shopify {day(latest.shop_start)} – {day(latest.shop_end)}</>}
        {latest.gsc_start && <> · Search Console {day(latest.gsc_start)} – {day(latest.gsc_end)}</>}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12, marginBottom: 28 }}>
        {METRICS.map((m) => <Card key={m.key} icon={m.icon} label={m.label} c={compare(newestFirst, m.key)} />)}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12, marginBottom: 28 }}>
        {METRICS.map((m) => {
          const data = rows.filter((r) => n(r[m.key]) !== null).map((r) => ({ d: r.report_date, v: n(r[m.key]) }));
          return (
            <Panel key={m.key} title={m.label}>
              {data.length < 2 ? (
                <div style={{ fontSize: 11.5, color: T.muted, height: 150, display: "flex", alignItems: "center" }}>
                  {data.length ? `Trend line appears after the next report (${fmt(data[0].v)} so far).` : "No data yet."}
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={150}>
                  <LineChart data={data} margin={{ top: 6, right: 8, left: -18, bottom: 0 }}>
                    <CartesianGrid stroke={T.line} vertical={false} />
                    <XAxis dataKey="d" tickFormatter={short} tick={{ fill: T.muted, fontSize: 10 }} axisLine={{ stroke: T.line }} tickLine={false} />
                    <YAxis allowDecimals={false} tick={{ fill: T.muted, fontSize: 10 }} axisLine={false} tickLine={false} />
                    <Tooltip content={<Tip />} />
                    <Line type="monotone" dataKey="v" stroke={T.gold} strokeWidth={2} dot={{ r: 3, fill: T.gold }} />
                  </LineChart>
                </ResponsiveContainer>
              )}
            </Panel>
          );
        })}
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))", gap: 12 }}>
        <Panel title={`Top Google searches · ${latest.gsc_start ? day(latest.gsc_start) + " – " + day(latest.gsc_end) : "latest"}`}>
          {queries.length ? (
            <table style={{ fontSize: 12, width: "100%", borderCollapse: "collapse" }}>
              <thead><tr style={{ color: T.muted, fontSize: 10, textTransform: "uppercase" }}>
                <th style={{ textAlign: "left", padding: "4px 0" }}>Query</th><th style={{ textAlign: "right" }}>Clicks</th><th style={{ textAlign: "right" }}>Impr.</th>
              </tr></thead>
              <tbody>{queries.map((q) => (
                <tr key={q.query} style={{ borderTop: `1px solid ${T.line}` }}>
                  <td style={{ padding: "6px 0", color: T.ivory }}>{q.query}</td>
                  <td style={{ textAlign: "right" }}>{fmt(q.clicks)}</td><td style={{ textAlign: "right" }}>{fmt(q.impressions)}</td>
                </tr>))}
              </tbody>
            </table>
          ) : <div style={{ fontSize: 11.5, color: T.muted }}>No queries recorded.</div>}
        </Panel>

        <Panel title="Products that reached checkout">
          {products.length
            ? products.map((p, i) => <div key={i} style={{ fontSize: 12, color: T.ivory, padding: "4px 0" }}>{p.title}{p.qty > 1 ? ` ×${p.qty}` : ""}</div>)
            : <div style={{ fontSize: 11.5, color: T.muted }}>None this week.</div>}
          {latest.shop_orders !== null && latest.shop_orders !== undefined && <div style={{ fontSize: 11.5, color: T.muted, marginTop: 8 }}>Orders: {fmt(latest.shop_orders)}</div>}
        </Panel>

        <Panel title="Website checks">
          {checks.length ? checks.map((c) => (
            <div key={c.name} style={{ display: "flex", alignItems: "center", gap: 7, fontSize: 12, padding: "4px 0", color: T.ivory }}>
              {c.ok ? <CheckCircle2 size={13} color={T.sage} /> : <AlertTriangle size={13} color={T.clay} />}
              {c.name} <span style={{ color: T.muted }}>— {c.detail}</span>
            </div>
          )) : <div style={{ fontSize: 11.5, color: T.muted }}>No checks recorded for this report.</div>}
        </Panel>
      </div>
    </div>
  );
}
