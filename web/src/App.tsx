import { useCallback, useEffect, useRef, useState } from "react";
import { Topbar, VIEWS, type ViewId } from "./components/Topbar";
import { Gate } from "./auth/Gate";
import { takeVerifyLink } from "./lib/verify";
import { api, apiConfigured, clearToken, getToken, tokenId, type Me } from "./lib/api";
import { AccountModal, ChangePassword } from "./auth/Account";
import { Logo } from "./components/Logo";
import { DEV_MOCK } from "./lib/useApi";
import { anyOpen, setHolidays } from "./lib/sessions";
import { applyPrefs, loadPrefs, savePrefs, type Prefs } from "./lib/prefs";
import type { Health } from "./lib/types";
import { MarketView } from "./views/Market";
import { MarketPhone } from "./views/MarketPhone";
import { NewsPhone } from "./views/NewsPhone";
import { ResearchPhone } from "./views/ResearchPhone";
import { EquitiesPhone } from "./views/EquitiesPhone";
import { RatesPhone } from "./views/RatesPhone";
import { WatchlistPhone } from "./views/WatchlistPhone";
import { AssetPhone } from "./views/AssetPhone";
import { PhoneNav } from "./components/PhoneNav";
import { InstallHint } from "./components/InstallHint";
import { FootBars } from "./components/FootBars";
import { Notify } from "./components/Notify";
import { NOTIFY_EVENT, pushOff } from "./lib/push";
import { usePhone, usePhoneV2 } from "./lib/phone";
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

// Opened by the "Verify my email" button of the Monitor's email? Read once, before the address is used for the tab.
const VERIFY = takeVerifyLink();

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
  // Who is signed in (role, and whether a manager-set password still has to be replaced)
  const [me, setMe] = useState<Me | null>(null);
  const [acct, setAcct] = useState(false);
  // the email button's link, until it has been dealt with; one for the address already signed in here has nothing left to do
  const [verify, setVerify] = useState(VERIFY);
  useEffect(() => { if (verify && userId && userId === verify.email) setVerify(null); }, [verify, userId]);
  const [notify, setNotify] = useState(false);
  useEffect(() => { const f = () => setNotify(true); window.addEventListener(NOTIFY_EVENT, f); return () => window.removeEventListener(NOTIFY_EVENT, f); }, []);
  useEffect(() => {
    if (!token || DEV_BYPASS) { setMe(null); return; }
    if (DEV_MOCK) { setMe({ email: "preview@mock.local", role: "manager", mustChange: false }); return; }
    let live = true;
    api<Me>("me").then((m) => { if (live) setMe(m); }).catch(() => { /* a 401 signs out through om:unauth */ });
    return () => { live = false; };
  }, [token]);

  useEffect(() => { const f = () => setRoute(parseHash()); window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  useEffect(() => { const f = () => setTok(null); window.addEventListener("om:unauth", f); return () => window.removeEventListener("om:unauth", f); }, []);
  // The scale and the one-screen layout follow the window: re-applied on every resize (and on monitor changes).
  const phone = usePhone(), pv2 = usePhoneV2();   // pv2: a phone in the layout made for phones (lib/phone.ts), the default there
  useEffect(() => {
    const apply = () => setTerm(applyPrefs(prefs, full, pv2));
    apply();
    window.addEventListener("resize", apply);
    return () => window.removeEventListener("resize", apply);
  }, [prefs, full, pv2]);
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

  // back on a connection: ask again at once instead of waiting out the minute
  useEffect(() => { const f = () => void refresh(); window.addEventListener("online", f); return () => window.removeEventListener("online", f); }, [refresh]);

  const setPrefs = (p: Prefs) => { setPrefsState(p); savePrefs(p); };
  // signing out also ends this device's notifications: they belong to the account, and it is leaving this browser
  const signOut = () => { void pushOff().catch(() => undefined).finally(() => { clearToken(); setTok(null); setAcct(false); setNotify(false); }); };

  const healthState: "ok" | "warn" | "bad" | "unk" = !apiConfigured ? "unk" : healthErr ? "bad" : !health ? "unk" : health.ok ? (health.tick.ok && health.daily.ok ? "ok" : "warn") : "bad";
  const healthTitle = !apiConfigured ? "DATA HEALTH: API not configured" : healthErr ? `DATA HEALTH: ${healthErr}` : health ? `DATA HEALTH: tick ${health.tick.ageMin ?? "?"} min old (${health.tick.ok ? "ok" : health.tick.note ?? "late"}), daily ${health.daily.ok ? "ok" : health.daily.note ?? "late"}${health.holidaysVerified ? "" : "; holiday calendar unverified"}` : "DATA HEALTH: loading";

  if (!signedIn) return <div className="gatewrap"><Gate verify={verify} onSignedIn={() => { setVerify(null); setTok(getToken()); }} /><FootBars /></div>;
  if (me?.mustChange) return (
    <div className="gatewrap"><FootBars /><div className="modal-bg"><div className="modal">
      <h3><Logo />Choose a new password</h3>
      <div className="sub2">You signed in as <b>{me.email}</b> with a password that was set for you. Replace it with your own before the Monitor opens.</div>
      <ChangePassword forced onDone={() => setTok(getToken())} />
      <button type="button" className="go ghost" onClick={signOut}>SIGN OUT</button>
    </div></div></div>
  );

  const { view, sub } = route;
  return (
    <>
      {DEV_MOCK && <div id="mockbar">MOCK PREVIEW — synthetic data for layout checks only. Nothing here is real. The live Monitor is at https://shotayng1123.github.io/orrery-market-monitor/</div>}
      <CardLayer />
      {acct && me && <AccountModal me={me} onClose={() => setAcct(false)} onSignOut={signOut} onChanged={() => setTok(getToken())} />}
      {notify && <Notify onClose={() => setNotify(false)} />}
      {verify && !DEV_BYPASS && userId !== verify.email && (
        <div className="modal-bg confirm"><div className="modal" role="alertdialog" aria-modal="true" aria-labelledby="vf-title" aria-describedby="vf-text">
          <h3 id="vf-title">Verification link</h3>
          <div className="cf-who">{verify.email}</div>
          <div className="sub2" id="vf-text">This link finishes creating an account for the address above, but this browser is signed in as <b>{me?.email ?? userId}</b>. Sign out here to carry on with the new account, or stay signed in and press the email's button in another browser.</div>
          <div className="cf-btns">
            <button type="button" className="go ghost" id="vf-stay" onClick={() => setVerify(null)} autoFocus>STAY SIGNED IN</button>
            <button type="button" className="go" id="vf-out" onClick={signOut}>SIGN OUT AND CONTINUE</button>
          </div>
        </div></div>
      )}
      <Topbar view={view} tick={tick} onNav={(v) => setHash(v)} userId={me?.email ?? userId} onSignOut={() => (me ? setAcct(true) : signOut())} updatedAt={updatedAt} nextIn={nextIn} hit={hit} health={healthState} healthTitle={healthTitle} onRefresh={() => void refresh()} prefs={prefs} onPrefs={setPrefs} onFull={goFull} pv2={pv2} canPreview={phone} />
      <div id="fsx" onClick={() => goFull(false)} title="Leave fullscreen (Esc)"><span className="mut">1–6 TABS · ESC</span><span>&#9974;</span></div>
      <div id="wrap">
        {pv2 && <InstallHint home={view === "market"} />}
        <div id="grid" data-view={view}>
          {view === "market" && (pv2 ? <MarketPhone tick={tick} /> : <MarketView tick={tick} />)}
          {view === "news" && (pv2 ? <NewsPhone tick={tick} /> : <NewsView tick={tick} />)}
          {view === "research" && (pv2 ? <ResearchPhone tick={tick} sub={sub} onSub={(s) => setHash("research", s)} /> : <ResearchView tick={tick} sub={sub} onSub={(s) => setHash("research", s)} />)}
          {view === "watch" && (pv2 ? <WatchlistPhone tick={tick} /> : <WatchlistView tick={tick} />)}
          {view === "equities" && (pv2 ? <EquitiesPhone sub={sub} onSub={(s) => setHash("equities", s)} tick={tick} /> : <EquitiesView sub={sub} onSub={(s) => setHash("equities", s)} tick={tick} />)}
          {view === "rates" && (pv2 ? <RatesPhone tick={tick} /> : <RatesFxView sub={sub} onSub={(s) => setHash("rates", s)} tick={tick} />)}
          {view === "asset" && (pv2 ? <AssetPhone symbol={sub} tick={tick} /> : <AssetView symbol={sub} tick={tick} />)}
        </div>
        <footer>Orrery Monitor shows market data from third-party feeds (Yahoo Finance; US Treasury; Japan MOF; exchange and central-bank publications) that may be delayed or incomplete; every panel states its source and as-of time. Information only; nothing here is investment advice. Default time zone: Singapore.</footer>
      </div>
      {pv2 && <PhoneNav view={view} onNav={(v) => setHash(v)} />}
      <FootBars />
    </>
  );
}
