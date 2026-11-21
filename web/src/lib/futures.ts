// A future's contract and its changes of contract on the page (B-27, 20 Nov 2026): the month a named contract is for, by
// CME's month codes (supabase/functions/_shared/futures.ts contractName, the server's own rule). Pure.
const MON = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const CODES = "FGHJKMNQUVXZ";
/** "Jan 2027" for CLF27.NYM; the symbol itself for anything that is not a named contract; "–" for none. */
export function monthOf(contract: string | null | undefined): string {
  const m = /^([A-Z0-9]+?)([FGHJKMNQUVXZ])(\d{2})(?:\.[A-Z]+)?$/.exec(contract ?? "");
  return m ? `${MON[CODES.indexOf(m[2])]} ${2000 + Number(m[3])}` : contract ?? "–";
}
/** The contract's code without its exchange: "CLF27". */
export const codeOf = (contract: string | null | undefined): string => (contract ?? "–").replace(/\.[A-Z]+$/, "");
/** "roll from Dec to Jan": the months alone, as B wrote it. */
export const rollWords = (from: string | null | undefined, to: string): string => `roll ${from ? `from ${monthOf(from).slice(0, 3)} ` : ""}to ${monthOf(to).slice(0, 3)}`;
