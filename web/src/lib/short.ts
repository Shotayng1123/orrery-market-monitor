// Short names for the MARKET table (Shota, 16 Nov 2026: the long names pushed the figures off a phone screen).
// Keyed by symbol so a renamed instrument keeps its short form; the full name stays in the row's tooltip.
const SHORT: Record<string, string> = {
  "^N225": "Nikkei 225", "1306.T": "TOPIX", "^GSPC": "S&P 500", "^IXIC": "Nasdaq", "^NDX": "Nasdaq 100", "^SOX": "SOX",
  "^DJI": "Dow", "^RUT": "Russell 2K", "^KS11": "KOSPI", "^KQ11": "KOSDAQ", "^HSI": "Hang Seng", "^HSCE": "HSCEI",
  "000001.SS": "Shanghai", "000300.SS": "CSI 300", "399001.SZ": "Shenzhen", "^TWII": "TAIEX", "^NSEI": "Nifty 50", "^STI": "STI",
  "^AXJO": "ASX 200", "^STOXX50E": "Stoxx 50", "^STOXX": "Stoxx 600", "^GDAXI": "DAX", "^FTSE": "FTSE 100", "^FCHI": "CAC 40",
  "^SSMI": "SMI", "^BVSP": "Bovespa", "^MXX": "IPC", "^VIX": "VIX", "^VXN": "VXN",
  "NKD=F": "NK225 fut", "ES=F": "S&P fut", "NQ=F": "NDX fut", "YM=F": "Dow fut", "RTY=F": "RTY fut",
  "DX-Y.NYB": "DXY",
  "UST3M": "UST 3M", "UST2Y": "UST 2Y", "^FVX": "UST 5Y", "^TNX": "UST 10Y", "^TYX": "UST 30Y", "ZN=F": "10Y fut",
  "JGB2Y": "JGB 2Y", "JGB10Y": "JGB 10Y", "JGB30Y": "JGB 30Y", "DE2Y": "Bund 2Y", "DE10Y": "Bund 10Y", "GB10Y": "Gilt 10Y",
  "EA10Y": "Euro 10Y", "CA10Y": "Canada 10Y",
  "CL=F": "WTI", "BZ=F": "Brent", "NG=F": "Nat gas", "TIO=F": "Iron ore", "ALI=F": "Aluminium",
  "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum",
};

/** The short table name of an instrument; names without an entry lose only a trailing " yield". */
export const shortName = (symbol: string, name: string): string => SHORT[symbol] ?? name.replace(/ yield$/i, "");
