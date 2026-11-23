import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { refuseTerm, retryTerm, termMode, zoomNow } from "../lib/prefs";
import { useApi } from "../lib/useApi";
import type { Alert } from "../lib/types";
import { fmtStamp, fmtWhen } from "../lib/time";
import type { ReactNode } from "react";
import { fmtPct, fmtSigma, signCls } from "../lib/fmt";
import { openAsset } from "./CompanyCard";
import { openNotify } from "../lib/push";
import { alertFigWord, alertHeadline, sigmaNoteLine } from "../lib/alertline";
import { Sig } from "./Sig";

const SEEN_KEY = "om_alert_seen";
const NEW_FOR_MS = 30 * 60e3;   // an alert nobody has opened stays lit for half an hour after it was raised
const readSeen = (): number => { try { return Number(localStorage.getItem(SEEN_KEY) ?? 0) || 0; } catch { return 0; } };

const KIND_LABEL: Record<Alert["kind"], string> = { stock: "move", index: "index", buyback: "buyback", revision: "guidance", mna: "M&A", sigma: "σ move" };
const isNews = (r: Alert) => r.kind === "buyback" || r.kind === "revision" || r.kind === "mna";
/** A σ move (I-6): a currency, yield, commodity, volatility index, future or coin beyond 2.5σ of its daily changes. */
const isSigma = (r: Alert) => r.kind === "sigma";
const hasPage = (r: Alert) => !!r.symbol && !r.symbol.startsWith("news:");

// ---- the line's fit (the designer's notes of 22 Nov 2026, A.2 point 5 and A.6.4, revision 2; SF-2 of the checks) ----
// The line promises whole parts: the label, the kind, the figure with its word, the time, and the name at its promise:
// in the one-screen header its first 8 characters and "…", or the whole name where that is narrower (so a name of 8
// characters or fewer is never cut: revision 1 promised nothing for one, and "Nintendo" could lose a letter unseen);
// on a phone its first character and "…". It measures what this browser draws, in
// its own letters, with no allowance in the wrong direction. Where a drawing wider than the one the layout was measured
// for cannot hold the promise, whole parts leave in a fixed order, never a cut figure:
//   the one-screen header: (1) the label (a lit line still says "new" by its colour and pulse); (2) all but the label
//     and the time ("NEW ALERT 07:07"); (3) if even that cannot stand whole, or the row's fixed items alone pass the row,
//     or "no excessive moves" cannot stand whole, the one-screen layout is refused for this window size and text size
//     (lib/prefs.ts refuseTerm), only once the page's fonts have loaded, and never while the header is not drawn (FULL);
//   a phone: the label's "NEW", then the time's day ("23 Nov"); only then is the name cut below one letter.
// The whole message is the line's tooltip and the list a click or a tap opens. Classes on #alerts (tokens.css).
let fontsReady = false;
const drawn = (e: Element | null | undefined): e is Element => !!e && e.getClientRects().length > 0 && getComputedStyle(e).display !== "none";
/** The width of a text drawn by a hidden span inside the name (so in its own font, size and spacing). */
function drawnWidth(nm: HTMLElement, text: string): number {
  const s = document.createElement("span");
  s.textContent = text;
  s.style.cssText = "position:absolute;visibility:hidden;white-space:pre;left:0;top:0";
  nm.appendChild(s);
  const w = s.getBoundingClientRect().width;
  s.remove();
  return w;
}
/** The width of the name's first `n` characters and "…"; null when the name has `n` characters or fewer. */
function keepWidth(nm: HTMLElement, n: number): number | null {
  const ch = [...(nm.textContent ?? "")];
  return ch.length <= n ? null : drawnWidth(nm, `${ch.slice(0, n).join("")}…`);
}
/** The name's promise in the one-screen header: its first 8 characters and "…", or the whole name where that is
 *  narrower; a name of 8 characters or fewer: the whole name. */
function promiseWidth(nm: HTMLElement): number {
  const t = nm.textContent ?? "", whole = drawnWidth(nm, t), eight = keepWidth(nm, 8);
  return eight == null ? whole : Math.min(whole, eight);
}
function fitDesk(holder: HTMLElement): void {
  const tb = document.querySelector("#topbar"), al = holder.querySelector<HTMLElement>(".alrt");
  if (!al || !drawn(tb)) return;   // FULL: the header is not drawn; nothing is measured or changed
  holder.classList.remove("a-nolabel", "a-min", "a-refuse");
  if (!termMode()) { holder.dataset.fit = ""; holder.dataset.fitName = ""; holder.dataset.fitCut = ""; return; }
  const z = zoomNow(), R = (e: Element) => e.getBoundingClientRect();
  // a part is whole only when its box lies inside the line's box (less its border), `.one` and `.core`, on their line
  const inside = (e: Element | null): boolean => {
    if (!drawn(e)) return true;
    const r = R(e);
    for (const box of [al, e.closest(".one"), e.closest(".core")]) {
      if (!box || box === e || !drawn(box)) continue;
      const o = R(box), bw = box === al ? parseFloat(getComputedStyle(al).borderRightWidth) * z : 0;
      if (r.right > o.right - bw + 0.01 || r.left < o.left + bw - 0.01 || r.top >= o.bottom - 1) return false;
    }
    return true;
  };
  const nm = al.querySelector<HTMLElement>(".nm");
  // the name is short when its box is narrower than its promise, whatever its length: the steps are then taken as for
  // any other part
  const nameShort = () => !!nm && drawn(nm) && R(nm).width + 0.01 < promiseWidth(nm);
  const cut = (sels: string[]) => sels.some((q) => !inside(al.querySelector(q)));
  const bmq = tb!.querySelector(".bmq");
  const row = () => { const t = R(tb!), pr = parseFloat(getComputedStyle(tb!).paddingRight) * z; return drawn(bmq) && R(bmq).right > t.right - pr + 0.5; };
  // step 3 refuses only once the page's faces have loaded (document.fonts.status "loaded" at this run): a drawing in a
  // fallback face is no reason to give up the layout (break-3 §5.1)
  const refuse = (): string => { if (fontsReady && document.fonts?.status === "loaded") refuseTerm(); holder.classList.add("a-refuse"); return "refuse"; };
  // its trace, for a check that fails to print: what was decided, and at the run's FIRST measure, before any step hides
  // a part, the parts found cut ("fig,q,nm": the name when its box is under its promise) and the name's box over its
  // promise in CSS px (the orchestrator's settlement of break-3 §5.2)
  const first = { name: nm && drawn(nm) ? `${(R(nm).width / z).toFixed(2)}/${(promiseWidth(nm) / z).toFixed(2)}` : "",
    cut: [...[":scope > .k", ".kd", ".fig", ".q", ":scope > .t"].filter((q) => al.querySelector(q) && !inside(al.querySelector(q))).map((q) => q.replace(":scope > ", "").replace(/^\./, "")), ...(nameShort() ? ["nm"] : [])].join(",") };
  const trace = (step: string): void => { holder.dataset.fit = step; holder.dataset.fitName = first.name; holder.dataset.fitCut = first.cut; };
  if (row()) return trace(refuse());
  if (al.classList.contains("none")) return trace(cut([":scope > .k", ":scope > .mut"]) ? refuse() : "");
  if (!cut([":scope > .k", ".kd", ".fig", ".q", ":scope > .t"]) && !nameShort()) return trace("");
  holder.classList.add("a-nolabel");
  if (!cut([".kd", ".fig", ".q", ":scope > .t"]) && !nameShort()) return trace("nolabel");
  holder.classList.remove("a-nolabel"); holder.classList.add("a-min");
  if (!cut([":scope > .k", ":scope > .t"])) return trace("min");
  trace(refuse());
}
/** Whether a part stands past the right edge of the box that hides it (its content box: the line's padding included). */
function past(box: Element, parts: Array<Element | null>): boolean {
  const r = box.getBoundingClientRect(), cs = getComputedStyle(box), z = zoomNow();
  const edge = r.right - (parseFloat(cs.borderRightWidth) + parseFloat(cs.paddingRight)) * z + 0.01;
  return parts.some((e) => { if (!e) return false; const q = e.getBoundingClientRect(); return q.width > 0 && q.right > edge; });
}
function fitPhone(holder: HTMLElement): void {
  holder.classList.remove("a-nonew", "a-noday");
  const al = holder.querySelector<HTMLElement>(".alrt"), one = al?.querySelector(".one");
  if (!al || !one || al.classList.contains("none")) { holder.dataset.fit = ""; holder.dataset.fitName = ""; holder.dataset.fitCut = ""; return; }
  const nm = one.querySelector<HTMLElement>(".nm"), k = al.querySelector(":scope > .k"), t = al.querySelector(":scope > .t"), z = zoomNow();
  // the name's floor: its first letter and "…", a hidden span inside the name (its own face, size and spacing); the
  // phone's check measures it the same way (e2e/phone-first.cjs)
  const floor = () => (nm ? keepWidth(nm, 1) : null);
  const nameShort = () => { const need = floor(); return !!nm && need != null && nm.getBoundingClientRect().width + 0.01 < need; };
  const cut = () => past(one, [...one.querySelectorAll(".kd,.nm,.fig")]) || past(al, [k, t]) || nameShort();
  // its trace, as the one-screen header's (PR #50's run on GitHub, 22 Nov 2026: a line left unfitted said nothing of
  // why): at the first measure the name's box over its floor (CSS px) and the parts found cut; then the steps taken
  const need = floor();
  holder.dataset.fitName = nm ? `${(nm.getBoundingClientRect().width / z).toFixed(2)}/${need == null ? "whole" : (need / z).toFixed(2)}` : "";
  holder.dataset.fitCut = [past(one, [one.querySelector(".kd")]) ? "kd" : "", past(one, [one.querySelector(".fig")]) ? "fig" : "", past(al, [k]) ? "k" : "", past(al, [t]) ? "t" : "", nameShort() ? "nm" : ""].filter(Boolean).join(",");
  const steps: string[] = [];
  const done = () => { holder.dataset.fit = steps.join(" "); };
  if (!cut()) return done();
  if (al.querySelector(".k .kn")) { holder.classList.add("a-nonew"); steps.push("nonew"); if (!cut()) return done(); }
  if (al.querySelector(".t .td")) { holder.classList.add("a-noday"); steps.push("noday"); }
  done();
}
/** Runs the fit after a render that changes what the line draws (`lineKey`: its alert, lit or not, its time's words, the
 *  layout), when its width changes (a ResizeObserver on #alerts), when its words or their drawing change between
 *  renders (a MutationObserver: a style, a class), and once the page's faces are in: on these triggers only, never on a
 *  timer. The header renders every second for its clock, and a fit after every render (a layout effect with no list,
 *  as revision 2 of the designer's A.6.4 read "every render of the line") measured the line twice a second on a page
 *  left alone: 18 forced layouts a second in the one-screen layout, and a long task twice a second on EQUITIES' index
 *  pages (DP-2 and PP-3 of the final review of pull request #50). The watchers follow the line's box: a phone draws
 *  none while there is no alert, and one once there is. */
function useFit(box: RefObject<HTMLDivElement | null>, phone: boolean, lineKey: string): void {
  const onPhone = useRef(phone);
  onPhone.current = phone;
  const st = useRef<{ el: HTMLDivElement | null; run: () => void; off: () => void }>({ el: null, run: () => undefined, off: () => undefined });
  useLayoutEffect(() => {
    const el = box.current;
    if (st.current.el !== el) {
      st.current.off();
      st.current = { el, run: () => undefined, off: () => undefined };
      if (el) {
        const mo = typeof MutationObserver === "undefined" ? null : new MutationObserver(() => run());
        const run = () => {
          mo?.disconnect();   // the fit's own probe of the name's width is not a change of the line
          if (onPhone.current) { el.classList.remove("a-nolabel", "a-min", "a-refuse"); fitPhone(el); } else { el.classList.remove("a-nonew", "a-noday"); fitDesk(el); }
          mo?.takeRecords(); mo?.observe(el, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ["class", "style"] });
        };
        // and once more on the next animation frame after each of these (one frame, not a loop: the run in that frame
        // schedules none): a layout that settles a frame late is measured as drawn (A.6.4, revision 2)
        let inFrame = false, live = true;
        const again = () => { if (!live) return; run(); if (!inFrame) { inFrame = true; requestAnimationFrame(() => { try { if (live) run(); } finally { inFrame = false; } }); } };
        const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(() => again());
        ro?.observe(el);
        void document.fonts?.ready.then(() => { fontsReady = true; again(); });
        // every font load that ends later; and a refusal made while a face was loading is taken back once (prefs)
        const loaded = () => { if (!onPhone.current) retryTerm(); again(); };
        document.fonts?.addEventListener?.("loadingdone", loaded);
        st.current = { el, run: again, off: () => { live = false; ro?.disconnect(); mo?.disconnect(); document.fonts?.removeEventListener?.("loadingdone", loaded); } };
      }
    }
    st.current.run();
  }, [lineKey]);
  // on unmount the watchers stop, and the next mount sets them up again (React's StrictMode, in development, unmounts
  // and mounts once more at once: a watcher left stopped would leave the line unfitted)
  useEffect(() => () => { st.current.off(); st.current = { el: null, run: () => undefined, off: () => undefined }; }, []);
}

/** Alerts: the latest one as a single line next to the tabs, refreshed with every load; click for the last
 *  twenty. Excessive moves (a single stock beyond ±5% intraday if it is a large company, ±7% otherwise; an index beyond ±3%) and news alerts: buybacks
 *  and guidance revisions at companies worth USD 5bn or more, M&A with a stated size of USD 1bn or more.
 *  A new alert lights the line up (bright, pulsing) until it is opened or half an hour has passed (Shota, 15 Nov). */
/** `phone`: the phone layout is on. Its list is rows, not a table (the designer's D-63, 21 Nov 2026). */
export function Alerts({ tick, phone = false }: { tick: number; phone?: boolean }) {
  const a = useApi<{ rows: Alert[] }>("alerts", { n: 20 }, tick);
  const [open, setOpen] = useState(false);
  const [seen, setSeen] = useState<number>(readSeen);
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (box.current && !box.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);
  const rows = a.data?.rows ?? [];
  // On a computer the list hangs from the alert line's left edge. Where the line stands near the window's right edge
  // (text size XL or L, a narrow window) the list is moved left until it is inside the window: it reached past the
  // edge there, with its figures out of sight (the designer's D-63). Layout is in zoomed CSS px, the window in
  // visual px (lib/prefs.ts), as for WATCHLIST's candidates.
  const drop = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = drop.current;
    if (!open || !el || phone) return;
    const place = () => { el.style.left = "0px"; const r = el.getBoundingClientRect(), over = r.right - (document.documentElement.clientWidth - 8); if (over > 0) el.style.left = `${-Math.max(0, Math.min(over, r.left - 8)) / zoomNow()}px`; };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open, phone, rows.length]);
  const latest = rows[0];
  const newest = rows.reduce((m, r) => Math.max(m, r.id), 0);
  const fresh = latest ? Date.now() - Date.parse(latest.upd ?? latest.at) < 15 * 60e3 : false;   // shown time = when the alert was first raised; freshness = last confirmation
  const isNew = (r: Alert) => r.id > seen && Date.now() - Date.parse(r.at) < NEW_FOR_MS;
  const lit = !!latest && isNew(latest);
  const toggle = () => {
    if (!open && newest > seen) { setSeen(newest); try { localStorage.setItem(SEEN_KEY, String(newest)); } catch { /* ignore */ } }
    setOpen(!open);
  };
  const RULES = "Excessive moves (stock beyond ±5% intraday for a large company, ±7% for the rest; index beyond ±3%), σ moves (a currency, yield, commodity, volatility index, future or coin beyond 2.5σ of its own daily changes over 63 sessions) and news: buybacks and guidance revisions at companies of USD 5bn+, M&A of USD 1bn+. Click for the last twenty";
  // On a computer the line is the label, the name, the figure and the time, and only the name is ever cut (the
  // designer's I-9 note; the layout guard found the time cut off on every screen, 19 Nov 2026). The figure says what
  // it is ("intraday", "at close", "1D": lib/alertline.ts), from the server's own words. A news alert shows its kind
  // and its company; one that names no company with a page here shows the first words of its headline in the name's
  // place and the publisher it came from, so a publisher never reads as a party to the news (R2A-05). The sentence is
  // in the tooltip and the list (`.msg` is kept in the page for both layouts and shown by neither).
  const word = latest ? alertFigWord(latest) : null, orphan = !!latest && isNews(latest) && !hasPage(latest);
  // A phone's line is one line of 40 px (the designer's D-14 and note (b) of 21 Nov 2026): the same parts, without the
  // word after the figure and without a publisher (the stylesheet's: tokens.css, body.pv2), and with no line at all
  // when there is no alert (a new server, or none raised yet): "no excessive moves" took the height of a list row.
  // While the answer is on its way the line says so, and "unavailable" when it does not come.
  const when = latest ? fmtWhen(latest.at) : "", cut = when.lastIndexOf(" "), day = cut > 0 ? when.slice(0, cut + 1) : "";
  // what the line draws: the fit runs after a render only when this changes (above)
  const drawnKey = [phone ? 1 : 0, termMode() ? 1 : 0, latest?.id ?? "", lit ? 1 : 0, fresh ? 1 : 0, latest?.kind ?? "", latest?.msg ?? "", latest?.name ?? "", latest?.pct ?? "", latest?.sigma ?? "", latest?.market ?? "", when, word ?? "", orphan ? 1 : 0, a.error ? 1 : 0, a.data ? 1 : 0, rows.length].join("|");
  useFit(box, phone, drawnKey);
  if (phone && a.data && !rows.length) return null;
  return (
    <div id="alerts" ref={box}>
      <span className={`alrt${latest ? (lit ? " new" : fresh ? " fresh" : "") : " none"}`} onClick={toggle} title={latest ? `${latest.msg}${isNews(latest) && latest.market ? ` (${latest.market})` : ""}${isSigma(latest) && latest.note ? ` · ${latest.note}` : ""} · ${fmtStamp(latest.at)}\n\n${RULES}` : RULES}>
        <span className="k">{lit ? <><span className="kn">NEW </span>ALERT</> : "ALERT"}</span>
        {latest ? <>
          <span className={`msg ${signCls(isSigma(latest) ? latest.sigma : latest.pct, 1)}`}>{latest.msg}</span>
          <span className="one">
            {/* the kind, the name, the figure and its word in one box, so that in the one-screen header the name is
                what gives way and "via <publisher>" stands only beside a whole name (outside it the box is not drawn) */}
            <span className="core">
              {(isNews(latest) || isSigma(latest)) && <span className="kd"><Sig>{KIND_LABEL[latest.kind]}</Sig></span>}
              <span className="nm">{orphan ? alertHeadline(latest.msg) : latest.name}</span>
              {isSigma(latest) && latest.sigma != null && <span className={`fig ${signCls(latest.sigma, 1)}`}>{fmtSigma(latest.sigma)}</span>}
              {!isNews(latest) && !isSigma(latest) && latest.pct != null && <span className={`fig ${signCls(latest.pct, 1)}`}>{fmtPct(latest.pct, 1)}</span>}
              {!isNews(latest) && !isSigma(latest) && latest.pct != null && word && <span className="q">{word}</span>}
            </span>
            {orphan && latest.market && <span className="src">via {latest.market}</span>}
          </span>
          <span className="t">{day && <span className="td">{day}</span>}{when.slice(day.length)}</span>
        </> : <span className="mut">{phone ? (a.error ? "· unavailable" : "· loading…") : a.error ? "unavailable" : a.data ? "no excessive moves" : "loading…"}</span>}
      </span>
      {/* The list (the designer's D-63, 21 Nov 2026; B-34). It was a table whose cells did not wrap in a box that scrolled
          sideways: on a phone every message was cut at the box's edge and a σ move's source was off the screen; on a
          computer the kind and the figure lay outside the box once the messages had the feed's length.
          A phone: the rows of WATCHLIST's "Alerts on my names": the time and, at the right, the figure in its sign's
          colour; the message, wrapping; for a σ move its kind, window and source under it. A tap opens the page (the
          article for a news alert, whose company keeps its own button). The rules are a note under the list.
          A computer: the message wraps; the time, the kind and the figure never leave the box.
          The head says once that the times are in SGT. */}
      {open && (phone ? (
        <div className="aldrop ph">
          <div className="minih"><Sig>{`Last ${rows.length} alerts · times in SGT`}</Sig><span className="lnk alntf" title="Get these alerts as notifications on this device" onClick={() => { setOpen(false); openNotify(); }}>Notifications…</span></div>
          {rows.length ? rows.map((r) => {
            const sg = isSigma(r), v = sg ? r.sigma ?? null : isNews(r) ? null : r.pct;
            const body: ReactNode = <>
              <span className="nw-meta"><span className="al-t">{fmtWhen(r.at)}</span>{v != null && <b className={`al-fig ${signCls(v, 1)}`}>{sg ? fmtSigma(v) : fmtPct(v, 1)}</b>}</span>
              <span className="nw-title al-msg">{r.msg}</span>
              {sg && <span className="nw-note al-note">{sigmaNoteLine(r)}</span>}
            </>;
            const go = () => { setOpen(false); openAsset(r.symbol); };
            if (isNews(r) && r.url) return <a className="nw-row" key={r.id} data-kind={r.kind} href={r.url} target="_blank" rel="noreferrer" title="Open the article">{body}{hasPage(r) && <span className="nw-tk"><button type="button" title={`Open ${r.name}`} onClick={(e) => { e.preventDefault(); e.stopPropagation(); go(); }}>{r.name}</button></span>}</a>;
            return hasPage(r) ? <div className="nw-row" key={r.id} data-kind={r.kind} role="button" tabIndex={0} title={`Open ${r.name}`} onClick={go}>{body}</div> : <div className="nw-row plain" key={r.id} data-kind={r.kind}>{body}</div>;
          }) : <div className="empty">No excessive moves recorded yet.</div>}
          <p className="mp-note alrules">Stock moves beyond ±5% intraday (large companies) or ±7%, index moves beyond ±3%, σ moves from 2.5σ (a currency, yield, commodity, volatility index, future or coin against its own daily changes over 63 sessions), buybacks and guidance changes (USD 5bn+ companies), M&A (USD 1bn+).</p>
        </div>
      ) : (
        <div className="aldrop" ref={drop}>
          {/* the head is upper-cased (.minih): every σ in it stays σ, never the sum sign Σ (the designer's D-11) */}
          <div className="minih"><Sig>{`Last ${rows.length} alerts · times in SGT · stock ±5% intraday (large companies) or ±7% · index ±3% · σ moves from 2.5σ · buybacks and guidance (USD 5bn+ companies) · M&A (USD 1bn+)`}</Sig><span className="lnk alntf" title="Get these alerts as notifications on this device" onClick={() => { setOpen(false); openNotify(); }}>Notifications…</span></div>
          {rows.length ? (
            <table className="secT"><tbody>{rows.map((r) => <tr key={r.id} data-kind={r.kind} title={fmtStamp(r.at)}><td className="l mut num al-t">{fmtWhen(r.at)}</td><td className="l al-msg">{isNews(r) && r.url ? <><a href={r.url} target="_blank" rel="noreferrer" title="Open the article">{r.msg}</a>{hasPage(r) && <span className="lnk alpg" title={`Open ${r.name}`} onClick={() => { setOpen(false); openAsset(r.symbol); }}> ›</span>}</> : hasPage(r) ? <span className="lnk" title={`Open ${r.name}`} onClick={() => { setOpen(false); openAsset(r.symbol); }}>{r.msg}</span> : r.msg}{isSigma(r) && r.note && <small className="alnote">{r.note}</small>}</td><td className="l mut al-kind">{isNews(r) || isSigma(r) ? KIND_LABEL[r.kind] : r.kind === "index" ? "index" : r.market}</td><td className={`num al-fig ${signCls(isSigma(r) ? r.sigma : r.pct, 1)}`}>{isNews(r) ? "" : isSigma(r) ? fmtSigma(r.sigma) : r.pct == null ? "" : fmtPct(r.pct, 1)}</td></tr>)}</tbody></table>
          ) : <div className="empty">No excessive moves recorded yet.</div>}
        </div>
      ))}
    </div>
  );
}
