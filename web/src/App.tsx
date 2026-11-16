import { useCallback, useEffect, useRef, useState } from "react";
import { Topbar, VIEWS, type ViewId } from "./components/Topbar";
import { Gate } from "./auth/Gate";
import { api, apiConfigured, clearToken, getToken, tokenId } from "./lib/api";
import { DEV_MOCK } from "./lib/useApi";
import { anyOpen, setHolidays } from "./lib/sessions";
import { applyPrefs, loadPrefs, savePrefs, type Prefs } from "./lib/prefs";
import type { Health } from "./lib/types";
import { MarketView } from "./views/Market";
import { NewsView } from "./views/News";
import { ResearchView } from "./views/Research";
import { EquitiesView } from "./views/Equities";
import { RatesFxView } from "./views/RatesFx";
import { AssetView } from "./views/Asset";
import { WatchlistView } from "./views/Watchlist";
import { CardLayer } from "./components/CompanyCard";

interface Route { view: ViewId; sub: string }
function parseHash(): Route {
  const [v, ...rest] = location.hash.replace(/^#/, "").split("/");
  const sub = decodeURIComponent(rest.join("/"));
  if (v === "asset") return { view: "asset", sub };
  return { view: VIEWS.some((x) => x.id === v) ? (v as ViewId) : "market", sub };
}
const setHash = (view: ViewId, sub = "") => { location.hash = sub ? `${view}/${sub}` : view; };

// Dev-only preview without a backend: `VITE_DEV_BYPASS=1 npm run dev`. Never set in production builds.
const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS === "1";

const OPEN_INTERVAL = 60, CLOSED_INTERVAL = 60;   // one minute always (Shota): FX is open most of the week and the check is cheap

export default function App() {
  const [route, setRoute] = useState<Route>(parseHash);
  const [token, setTok] = useState<string | null>(() => getToken());
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [full, setFull] = useState(false);
  const [, setTerm] = useState(false);   // re-render when the one-screen layout switches on or off (views read it from <body>)
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [nextIn, setNextIn] = useState<number | null>(null);
  const [hit, setHit] = useState(false);
  const [tick, setTick] = useState(0);
  const nextAt = useRef<number | null>(null);

  const signedIn = DEV_BYPASS || !!token;
  const userId = DEV_BYPASS ? "preview" : tokenId(token);

  useEffect(() => { const f = () => setRoute(parseHash()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  useEffect(() => { const f = () => setTok(null); window.addEventListener("om:unauth", f); return () => window.removeEventListener("om:unauth", f); }, []);
  // The scale and the one-screen layout follow the window: re-applied on every resize (and on monitor changes).
  useEffect(() => {
    const apply = () => setTerm(applyPrefs(prefs, full));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [prefs, full]);
  // FULL is a real full screen (Shota, 15 Nov): the browser's own full-screen mode, so no tab strip or address
  // bar, plus the header hidden. The browser leaves it on Esc by itself; the state follows `fullscreenchange`.
  const goFull = (f: boolean) => {
    setFull(f);
    try {
      if (f && !document.fullscreenElement) void document.documentElement.requestFullscreen?.().catch(() => { /* refused: the header is still hidden */ });
      if (!f && document.fullscreenElement) void document.exitFullscreen?.().catch(() => { /* ignore */ });
    } catch { /* no Fullscreen API: the header is still hidden */ }
  };
  useEffect(() => {
    const f = () => { if (!document.fullscreenElement) setFull(false); };
    document.addEventListener("fullscreenchange", f);
    return () => document.removeEventListener("fullscreenchange", f);
  }, []);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (["INPUT", "SELECT", "TEXTAREA"].includes((e.target as HTMLElement | null)?.tagName ?? "")) return;   // typing in a field or a drop-down (its list jumps to the typed character) is not a shortcut
      if (e.key === "Escape") goFull(false);
      if (e.key >= "1" && e.key <= "6" && e.key.length === 1) { const v = VIEWS[Number(e.key) - 1]; if (v) setHash(v.id); }
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refresh = useCallback(async () => {
    if (!signedIn || !apiConfigured) return;
    try {
      const h = await api<Health>("health");
      setHealth(h); setHealthErr(null);
      if (h.holidays) setHolidays(h.holidays);
    } catch (e) { setHealthErr(e instanceof Error ? e.message : String(e)); }
    setUpdatedAt(new Date()); setTick((t) => t + 1);
    setHit(true); setTimeout(() => setHit(false), 2000);
    nextAt.current = Date.now() + (anyOpen() ? OPEN_INTERVAL : CLOSED_INTERVAL) * 1000;
  }, [signedIn]);

  // The refresh loop: 60 s while any market is open, 10 min otherwise; the countdown chip shows the wait.
  useEffect(() => {
    if (!signedIn || !apiConfigured) { setNextIn(null); return; }
    void refresh();
    const t = setInterval(() => {
      if (nextAt.current == null) return;
      const s = Math.max(0, Math.round((nextAt.current - Date.now()) / 1000));
      setNextIn(s);
      if (s <= 0) void refresh();
    }, 1000);
    return () => clearInterval(t);
  }, [signedIn, refresh]);

  const setPrefs = (p: Prefs) => { setPrefsState(p); savePrefs(p); };
  const signOut = () => { clearToken(); setTok(null); };

  const healthState: "ok" | "warn" | "bad" | "unk" = !apiConfigured ? "unk" : healthErr ? "bad" : !health ? "unk" : health.ok ? (health.tick.ok && health.daily.ok ? "ok" : "warn") : "bad";
  const healthTitle = !apiConfigured ? "DATA HEALTH: API not configured" : healthErr ? `DATA HEALTH: ${healthErr}` : health ? `DATA HEALTH: tick ${health.tick.ageMin ?? "?"} min old (${health.tick.ok ? "ok" : health.tick.note ?? "late"}), daily ${health.daily.ok ? "ok" : health.daily.note ?? "late"}${health.holidaysVerified ? "" : "; holiday calendar unverified"}` : "DATA HEALTH: loading";

  if (!signedIn) return <div className="gatewrap"><Gate onSignedIn={() => setTok(getToken())} /></div>;

  const { view, sub } = route;
  return (
    <>
      {DEV_MOCK && <div id="mockbar">MOCK PREVIEW — synthetic data for layout checks only. Nothing here is real. The live Monitor is at https://shotayng1123.github.io/orrery-market-monitor/</div>}
      <CardLayer />
      <Topbar view={view} tick={tick} onNav={(v) => setHash(v)} userId={userId} onSignOut={signOut} updatedAt={updatedAt} nextIn={nextIn} hit={hit} health={healthState} healthTitle={healthTitle} onRefresh={() => void refresh()} prefs={prefs} onPrefs={setPrefs} onFull={goFull} />
      <div id="fsx" onClick={() => goFull(false)} title="Leave fullscreen (Esc)"><span className="mut">1–6 TABS · ESC</span><span>&#9974;</span></div>
      <div id="wrap">
        <div id="grid" data-view={view}>
          {view === "market" && <MarketView tick={tick} />}
          {view === "news" && <NewsView tick={tick} />}
          {view === "research" && <ResearchView tick={tick} sub={sub} onSub={(s) => setHash("research", s)} />}
          {view === "watch" && <WatchlistView tick={tick} />}
          {view === "equities" && <EquitiesView sub={sub} onSub={(s) => setHash("equities", s)} tick={tick} />}
          {view === "rates" && <RatesFxView sub={sub} onSub={(s) => setHash("rates", s)} tick={tick} />}
          {view === "asset" && <AssetView symbol={sub} tick={tick} />}
        </div>
        <footer>Orrery Monitor shows market data from third-party feeds (Yahoo Finance; US Treasury; Japan MOF; exchange and central-bank publications) that may be delayed or incomplete; every panel states its source and as-of time. Information only; nothing here is investment advice. Default time zone: Singapore.</footer>
      </div>
    </>
  );
}
