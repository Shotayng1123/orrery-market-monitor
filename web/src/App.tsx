import { pageHash } from "./lib/indices";
import { lazy, Suspense, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Topbar, VIEWS, type ViewId } from "./components/Topbar";
import { CrashSwitch, TabGuard } from "./components/TabGuard";
import { Gate } from "./auth/Gate";
import { takeVerifyLink } from "./lib/verify";
import { api, apiConfigured, getToken, signOutHere, tokenId, type Me } from "./lib/api";
import { keepClear } from "./lib/keep";
import { AccountModal, ChangePassword } from "./auth/Account";
import { Logo } from "./components/Logo";
import { DEV_MOCK } from "./lib/useApi";
import { anyOpen, noHolidays, setHolidays } from "./lib/sessions";
import { clockIsNow, clockSet, mockHolidays } from "./lib/mock";
import { applyPrefs, loadPrefs, savePrefs, type Prefs } from "./lib/prefs";
import type { Health } from "./lib/types";
import { feedFrom, lateText } from "./lib/feed";
import { fmtStamp } from "./lib/time";
import { MarketView } from "./views/Market";
import { MarketPhone } from "./views/MarketPhone";
import { NewsPhone } from "./views/NewsPhone";
import { ResearchPhone } from "./views/ResearchPhone";
import { EquitiesPhone } from "./views/EquitiesPhone";
import { RatesPhone } from "./views/RatesPhone";
import { WatchlistPhone } from "./views/WatchlistPhone";
import { AssetPhone } from "./views/AssetPhone";
import { PhoneNav } from "./components/PhoneNav";
import { InstallSheet } from "./components/InstallHint";
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
import { navChanged, navDrawn, navPopped, navStart } from "./lib/nav";

// The paper portfolio's screens (P-1) are a file of their own, asked for when the tab is first opened, and only where
// the build carries the paper book (lib/paper.ts): a build with the switch off does not make that file.
const PortfolioView = __PAPER_BUILD__ ? lazy(() => import("./views/Portfolio")) : null;

interface Route { view: ViewId; sub: string }
function parseHash(): Route {
  const [v, ...rest] = location.hash.replace(/^#/, "").split("/");
  const sub = decodeURIComponent(rest.join("/"));
  if (v === "asset") {
    // an address of the single-name page for an index that has its page on EQUITIES (an older link, a bookmark) goes there
    const [to, id] = pageHash(sub).split("/");
    if (to === "equities") { history.replaceState(history.state, "", `#equities/${id}`); return { view: "equities", sub: id }; }   // the entry keeps its key (lib/nav.ts)
    return { view: "asset", sub };
  }
  return { view: VIEWS.some((x) => x.id === v) ? (v as ViewId) : "market", sub };
}
const setHash = (view: ViewId, sub = "") => { location.hash = sub ? `${view}/${sub}` : view; };

// Opened by the "Verify my email" button of the Monitor's email? Read once, before the address is used for the tab.
const VERIFY = takeVerifyLink();

// Dev-only preview without a backend: `VITE_DEV_BYPASS=1 npm run dev`. Never set in production builds.
const DEV_BYPASS = import.meta.env.DEV && import.meta.env.VITE_DEV_BYPASS === "1";

const OPEN_INTERVAL = 60, CLOSED_INTERVAL = 60;   // one minute always (Shota): FX is open most of the week and the check is cheap

// The local copy asks no server for its holiday calendar: it takes the mock's (the Monitor's own rows), before
// anything is drawn, so "opens …" beside a CLOSED passes over the same holidays as on the live Monitor.
if (DEV_MOCK) setHolidays(mockHolidays());

export default function App() {
  // the entry the Monitor opens on is marked before anything is drawn, so a list's kept state has its entry (lib/nav.ts)
  const [route, setRoute] = useState<Route>(() => { const r = parseHash(); navStart(r); return r; });
  const [token, setTok] = useState<string | null>(() => getToken());
  const [prefs, setPrefsState] = useState<Prefs>(loadPrefs);
  const [full, setFull] = useState(false);
  const [, setTerm] = useState(false);   // re-render when the one-screen layout switches on or off (views read it from <body>)
  const [health, setHealth] = useState<Health | null>(null);
  const [healthErr, setHealthErr] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const [polling, setPolling] = useState(false);   // whether the refresh loop is running (the countdown itself lives in the top bar)
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

  // B-28: a page opened from a list starts at its top, and Back returns the list to where it stood (lib/nav.ts)
  useEffect(() => { const f = () => { const r = parseHash(); navChanged(r); setRoute(r); }; window.addEventListener("hashchange", f); return () => window.removeEventListener("hashchange", f); }, []);
  useEffect(() => { window.addEventListener("popstate", navPopped); return () => window.removeEventListener("popstate", navPopped); }, []);
  useLayoutEffect(() => { navDrawn(); }, [route]);
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
      if (e.key.length === 1 && e.key >= "1" && e.key <= String(VIEWS.length)) { const v = VIEWS[Number(e.key) - 1]; if (v) setHash(v.id); }   // 1 to 6; 1 to 7 where the paper portfolio's tab is drawn
    };
    window.addEventListener("keydown", onKey); return () => window.removeEventListener("keydown", onKey);
  }, []);

  const refreshing = useRef(false);
  const refresh = useCallback(async () => {
    if (!signedIn || !apiConfigured) return;
    // one at a time: the loop asks again every second while a refresh is due, and a slow answer must not start a second one
    if (refreshing.current) return;
    refreshing.current = true;
    try {
      const h = await api<Health>("health");
      setHealth(h); setHealthErr(null); feedFrom(h);
      if (h.holidays) setHolidays(h.holidays); else noHolidays();   // an answer without a calendar: a next open is then the scheduled one
    } catch (e) { setHealthErr(e instanceof Error ? e.message : String(e)); feedFrom(null); noHolidays(); }   // no calendar: a next open is then the scheduled one (lib/opens.ts)
    finally { refreshing.current = false; }
    setUpdatedAt(new Date()); setTick((t) => t + 1);
    setHit(true); setTimeout(() => setHit(false), 2000);
    nextAt.current = Date.now() + (anyOpen() ? OPEN_INTERVAL : CLOSED_INTERVAL) * 1000;
  }, [signedIn]);

  // The refresh loop: 60 s while any market is open, 10 min otherwise; the countdown chip shows the wait.
  // The loop only looks at the clock: it changes no state until a refresh is due. Until 19 Nov 2026 it stored the
  // seconds left every second, which drew the whole Monitor again every second: every table and every chart on
  // the tab in view, on a phone's battery (and it rebuilt the stock page's chart each time, see SigmaChart).
  // The top bar, which already ticks for its clock, works the countdown out from `nextAt` itself.
  useEffect(() => {
    if (!signedIn || !apiConfigured) { setPolling(false); return; }
    setPolling(true);
    void refresh();
    const t = setInterval(() => {
      if (nextAt.current != null && Math.round((nextAt.current - Date.now()) / 1000) <= 0) void refresh();
    }, 1000);
    return () => clearInterval(t);
  }, [signedIn, refresh]);

  // back on a connection: ask again at once instead of waiting out the minute
  useEffect(() => { const f = () => void refresh(); window.addEventListener("online", f); return () => window.removeEventListener("online", f); }, [refresh]);

  const setPrefs = (p: Prefs) => { setPrefsState(p); savePrefs(p); };
  // signing out also ends this device's notifications: they belong to the account, and it is leaving this browser
  const signOut = () => { void pushOff().catch(() => undefined).finally(() => { signOutHere(); setTok(null); setAcct(false); setNotify(false); }); };
  // A start that finds no sign-in: one that was not to be remembered ended with its tab, or one ran out. What the page
  // kept on this device for opening without a connection belongs to nobody who is here now, and goes (lib/keep.ts).
  useEffect(() => { if (!DEV_BYPASS && !getToken()) void keepClear(); }, []);

  // a feed that has stopped is the worst reading there is: every price on screen is old, whatever the jobs say
  const feedStopped = !!health?.feed && health.feed.expected && !health.feed.ok;
  // prices current, but only because the second path is writing them (the relay on GitHub): said, in amber
  const relayed = !!health?.relay && !feedStopped;
  const healthState: "ok" | "warn" | "bad" | "unk" = !apiConfigured ? "unk" : healthErr ? "bad" : !health ? "unk" : feedStopped ? "bad" : health.ok ? (health.tick.ok && health.daily.ok && !relayed ? "ok" : "warn") : "bad";
  const healthTitle = !apiConfigured ? "DATA HEALTH: API not configured" : healthErr ? `DATA HEALTH: ${healthErr}` : health ? `DATA HEALTH: ${feedStopped ? `NO NEW PRICES since ${health.feed!.newest ? fmtStamp(health.feed!.newest) : "?"} (${lateText(health.feed!.lateMin ?? 0)} behind): the source has stopped sending new prices; ` : ""}${relayed ? `PRICES THROUGH THE SECOND PATH since ${health.relay!.since ? fmtStamp(health.relay!.since) : "?"}: the source has stopped answering the Monitor's server${health.relay!.ownLateMin != null ? ` (its own answers are ${lateText(health.relay!.ownLateMin)} behind)` : ""}, so a job on GitHub is pulling the prices and they are current; ` : ""}tick ${health.tick.ageMin ?? "?"} min old (${health.tick.ok ? "ok" : health.tick.note ?? "late"}), daily ${health.daily.ok ? "ok" : health.daily.note ?? "late"}${health.holidaysVerified ? "" : "; holiday calendar unverified"}` : "DATA HEALTH: loading";

  if (!signedIn) return <div className="gatewrap"><Gate verify={verify} onSignedIn={() => { setVerify(null); setTok(getToken()); }} /><FootBars /></div>;
  if (me?.mustChange) return (
    <div className="gatewrap"><FootBars /><div className="modal-bg"><div className="modal">
      <h3><Logo />Choose a new password</h3>
      <div className="sub2">You signed in as <b>{me.email}</b> with a password that was set for you. Replace it with your own before the Monitor opens.</div>
      <ChangePassword forced onDone={() => setTok(getToken())} />
      <button type="button" className="go ghost" onClick={signOut}>SIGN OUT</button>
    </div></div></div>
  );

  // development only: how often the whole Monitor has been drawn. The browser checks read it to see that a second
  // in which nothing happens draws nothing (e2e/phone-rates-watchlist-stock.cjs).
  if (import.meta.env.DEV) { const w = window as unknown as { __appRenders?: number }; w.__appRenders = (w.__appRenders ?? 0) + 1; }
  const { view, sub } = route;
  return (
    <>
      {DEV_MOCK && <div id="mockbar">MOCK PREVIEW — synthetic data for layout checks only. Nothing here is real. The live Monitor is at https://shotayng1123.github.io/orrery-market-monitor/{clockSet() && <span id="mockclock"> · {clockIsNow() ? "rows by the session table at the machine's clock" : "clock set"} (om_mock_now): {fmtStamp(new Date())}</span>}</div>}
      <CardLayer />
      {acct && me && <AccountModal me={me} onClose={() => setAcct(false)} onSignOut={signOut} onChanged={() => setTok(getToken())} />}
      {notify && <Notify onClose={() => setNotify(false)} />}
      {/* "Add Orrery to your Home Screen": its steps open in a sheet, from the line on MARKETS or from the menu on any tab */}
      {pv2 && <InstallSheet />}
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
      <Topbar view={view} tick={tick} onNav={(v) => setHash(v)} userId={me?.email ?? userId} onSignOut={() => (me ? setAcct(true) : signOut())} updatedAt={updatedAt} nextAt={nextAt} polling={polling} hit={hit} health={healthState} healthTitle={healthTitle} onRefresh={() => void refresh()} prefs={prefs} onPrefs={setPrefs} onFull={goFull} pv2={pv2} canPreview={phone} />
      <div id="fsx" onClick={() => goFull(false)} title="Leave fullscreen (Esc)"><span className="mut">1–{VIEWS.length} TABS · ESC</span><span>&#9974;</span></div>
      <div id="wrap">
        <div id="grid" data-view={view}>
          <TabGuard key={`${view}/${pv2 ? "p" : "d"}`} resetKey={sub ?? ""}>
          {import.meta.env.DEV && <CrashSwitch view={view} />}
          {view === "market" && (pv2 ? <MarketPhone tick={tick} /> : <MarketView tick={tick} />)}
          {view === "news" && (pv2 ? <NewsPhone tick={tick} /> : <NewsView tick={tick} />)}
          {view === "research" && (pv2 ? <ResearchPhone tick={tick} sub={sub} onSub={(s) => setHash("research", s)} /> : <ResearchView tick={tick} sub={sub} onSub={(s) => setHash("research", s)} />)}
          {view === "watch" && (pv2 ? <WatchlistPhone tick={tick} /> : <WatchlistView tick={tick} />)}
          {view === "equities" && (pv2 ? <EquitiesPhone sub={sub} onSub={(s) => setHash("equities", s)} tick={tick} /> : <EquitiesView sub={sub} onSub={(s) => setHash("equities", s)} tick={tick} />)}
          {view === "rates" && (pv2 ? <RatesPhone tick={tick} /> : <RatesFxView sub={sub} onSub={(s) => setHash("rates", s)} tick={tick} />)}
          {view === "asset" && (pv2 ? <AssetPhone symbol={sub} tick={tick} /> : <AssetView symbol={sub} tick={tick} />)}
          {view === "portfolio" && PortfolioView && <Suspense fallback={<div className="c12 mut" id="pf-wait">loading…</div>}><PortfolioView sub={sub} tick={tick} phone={pv2} classic={phone && !pv2} /></Suspense>}
          </TabGuard>
        </div>
        <footer>Orrery Monitor shows market data from third-party feeds (Yahoo Finance; US Treasury; Japan MOF; exchange and central-bank publications) that may be delayed or incomplete; every panel states its source and as-of time. Information only; nothing here is investment advice. Default time zone: Singapore.</footer>
      </div>
      {pv2 && <PhoneNav view={view} onNav={(v) => setHash(v)} />}
      <FootBars />
    </>
  );
}
