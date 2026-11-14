// Re-exports used by every view, plus a stamp formatter that never throws on bad input.
import { fmtStamp } from "../lib/time";
export { fmtNum, fmtPct, fmtChg, isYield, signCls } from "../lib/fmt";
export const fmtStampSafe = (t: string | number | Date | null | undefined): string => { try { return fmtStamp(t); } catch { return "–"; } };
