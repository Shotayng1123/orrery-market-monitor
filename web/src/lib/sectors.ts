/** Sector names for the short-interest tables (the designer's D-07 and D-45, 19 Nov 2026). */
// JPX reports the short-selling share by its 33 industry groups, in Japanese; English names as JPX publishes them.
export const TSE33: Record<string, string> = {
  "水産・農林業": "Fishery, Agriculture & Forestry", "鉱業": "Mining", "建設業": "Construction", "食料品": "Foods", "繊維製品": "Textiles & Apparels",
  "パルプ・紙": "Pulp & Paper", "化学": "Chemicals", "医薬品": "Pharmaceutical", "石油・石炭製品": "Oil & Coal Products", "ゴム製品": "Rubber Products",
  "ガラス・土石製品": "Glass & Ceramics Products", "鉄鋼": "Iron & Steel", "非鉄金属": "Nonferrous Metals", "金属製品": "Metal Products", "機械": "Machinery",
  "電気機器": "Electric Appliances", "輸送用機器": "Transportation Equipment", "精密機器": "Precision Instruments", "その他製品": "Other Products",
  "電気・ガス業": "Electric Power & Gas", "陸運業": "Land Transportation", "海運業": "Marine Transportation", "空運業": "Air Transportation",
  "倉庫・運輸関連業": "Warehousing & Harbor Transportation Services", "情報・通信業": "Information & Communication", "卸売業": "Wholesale Trade", "小売業": "Retail Trade",
  "銀行業": "Banks", "証券、商品先物取引業": "Securities & Commodity Futures", "保険業": "Insurance", "その他金融業": "Other Financing Business", "不動産業": "Real Estate", "サービス業": "Services",
};
/** A sector's English name (JPX's own for its 33 groups), cut at a word when it is long, with the whole name on
 *  hover: a sector column of at least 9 em, never a sliver of a glyph (the designer's D-07). */
export function sectorShort(s: string | null, cutAt = Infinity): { text: string; full: string } {
  const full = s == null ? "" : TSE33[s] ? `${TSE33[s]} (${s})` : s;
  const en = s == null ? "" : TSE33[s] ?? s;
  if (en.length <= cutAt) return { text: en, full };
  const cut = en.slice(0, cutAt + 1).replace(/\s+\S*$/, "").replace(/[\s,&]+$/, "");
  return { text: `${cut || en.slice(0, cutAt)}…`, full };
}
