-- Orrery Monitor — seeds: instrument master (accepted by Shota 2026-11-07), policy-rate skeleton, holidays.

insert into instruments (ord, symbol, name, cls, grp, market, tz, currency, decimals, proxy_for, provider, provider_symbol, notes) values
  -- Equities
  ( 1, '^N225',     'Nikkei 225',                 'Equities', 'equity', 'TSE',   'Asia/Tokyo',       'JPY', 2, null,    'yahoo', null, null),
  ( 2, '1306.T',    'TOPIX via 1306.T',           'Equities', 'equity', 'TSE',   'Asia/Tokyo',       'JPY', 1, 'TOPIX', 'yahoo', null, 'NEXT FUNDS TOPIX ETF stands in for the index (no Yahoo ticker for TOPIX); official JPX close to follow'),
  ( 3, '^GSPC',     'S&P 500',                    'Equities', 'equity', 'NYSE',  'America/New_York', 'USD', 2, null,    'yahoo', null, null),
  ( 4, '^IXIC',     'NASDAQ Composite',           'Equities', 'equity', 'NYSE',  'America/New_York', 'USD', 2, null,    'yahoo', null, null),
  ( 5, '^SOX',      'PHLX Semiconductor (SOX)',   'Equities', 'equity', 'NYSE',  'America/New_York', 'USD', 2, null,    'yahoo', null, null),
  ( 6, '^DJI',      'Dow Jones Industrial',       'Equities', 'equity', 'NYSE',  'America/New_York', 'USD', 2, null,    'yahoo', null, null),
  ( 7, '^RUT',      'Russell 2000',               'Equities', 'equity', 'NYSE',  'America/New_York', 'USD', 2, null,    'yahoo', null, null),
  ( 8, '^KS11',     'KOSPI',                      'Equities', 'equity', 'KRX',   'Asia/Seoul',       'KRW', 2, null,    'yahoo', null, null),
  ( 9, '^HSI',      'Hang Seng',                  'Equities', 'equity', 'HKEX',  'Asia/Hong_Kong',   'HKD', 2, null,    'yahoo', null, null),
  (10, '000001.SS', 'Shanghai Composite',         'Equities', 'equity', 'SSE',   'Asia/Shanghai',    'CNY', 2, null,    'yahoo', null, null),
  (11, '^TWII',     'TAIEX',                      'Equities', 'equity', 'TWSE',  'Asia/Taipei',      'TWD', 2, null,    'yahoo', null, null),
  (12, '^NSEI',     'Nifty 50',                   'Equities', 'equity', 'NSE',   'Asia/Kolkata',     'INR', 2, null,    'yahoo', null, null),
  (13, '^STI',      'Straits Times',              'Equities', 'equity', 'SGX',   'Asia/Singapore',   'SGD', 2, null,    'yahoo', null, null),
  (14, '^STOXX50E', 'Euro Stoxx 50',              'Equities', 'equity', 'XETRA', 'Europe/Berlin',    'EUR', 2, null,    'yahoo', null, null),
  (15, '^GDAXI',    'DAX',                        'Equities', 'equity', 'XETRA', 'Europe/Berlin',    'EUR', 2, null,    'yahoo', null, null),
  (16, '^FTSE',     'FTSE 100',                   'Equities', 'equity', 'LSE',   'Europe/London',    'GBP', 2, null,    'yahoo', null, null),
  -- Volatility
  (17, '^VIX',      'VIX',                        'Volatility', 'equity', 'NYSE', 'America/Chicago', 'USD', 2, null,    'yahoo', null, 'CBOE'),
  -- Futures
  (18, 'NKD=F',     'Nikkei 225 future (CME)',    'Futures', 'equity', 'CME',    'America/New_York', 'USD', 0, null,    'yahoo', null, null),
  (19, 'ES=F',      'S&P 500 E-mini',             'Futures', 'equity', 'CME',    'America/New_York', 'USD', 2, null,    'yahoo', null, null),
  (20, 'NQ=F',      'Nasdaq 100 E-mini',          'Futures', 'equity', 'CME',    'America/New_York', 'USD', 2, null,    'yahoo', null, null),
  -- Currency
  (21, 'USDJPY=X',  'USD/JPY',                    'Currency', 'fx', 'FX', 'Europe/London', 'JPY', 3, null, 'yahoo', null, null),
  (22, 'EURUSD=X',  'EUR/USD',                    'Currency', 'fx', 'FX', 'Europe/London', 'USD', 4, null, 'yahoo', null, null),
  (23, 'GBPUSD=X',  'GBP/USD',                    'Currency', 'fx', 'FX', 'Europe/London', 'USD', 4, null, 'yahoo', null, null),
  (24, 'AUDUSD=X',  'AUD/USD',                    'Currency', 'fx', 'FX', 'Europe/London', 'USD', 4, null, 'yahoo', null, null),
  (25, 'CNH=X',     'USD/CNH',                    'Currency', 'fx', 'FX', 'Europe/London', 'CNH', 4, null, 'yahoo', null, null),
  (26, 'KRW=X',     'USD/KRW',                    'Currency', 'fx', 'FX', 'Europe/London', 'KRW', 2, null, 'yahoo', null, null),
  (27, 'SGD=X',     'USD/SGD',                    'Currency', 'fx', 'FX', 'Europe/London', 'SGD', 4, null, 'yahoo', null, null),
  (28, 'EURJPY=X',  'EUR/JPY',                    'Currency', 'fx', 'FX', 'Europe/London', 'JPY', 3, null, 'yahoo', null, null),
  (29, 'DX-Y.NYB',  'US Dollar Index (DXY)',      'Currency', 'fx', 'NYSE', 'America/New_York', 'USD', 3, null, 'yahoo', null, 'ICE'),
  -- Fixed income (yields in %, changes shown in bp)
  (30, 'UST2Y',     'UST 2Y yield',               'Fixed income', 'rates', 'NYSE', 'America/New_York', 'USD', 3, null, 'treasury', '2 Yr', 'US Treasury daily par yield curve; daily only'),
  (31, '^FVX',      'UST 5Y yield',               'Fixed income', 'rates', 'NYSE', 'America/Chicago',  'USD', 3, null, 'yahoo', null, 'CBOE'),
  (32, '^TNX',      'UST 10Y yield',              'Fixed income', 'rates', 'NYSE', 'America/Chicago',  'USD', 3, null, 'yahoo', null, 'CBOE'),
  (33, '^TYX',      'UST 30Y yield',              'Fixed income', 'rates', 'NYSE', 'America/Chicago',  'USD', 3, null, 'yahoo', null, 'CBOE'),
  (34, 'JGB10Y',    'JGB 10Y yield',              'Fixed income', 'rates', 'TSE',  'Asia/Tokyo',       'JPY', 3, null, 'mof', '10Y', 'Japan MOF reference yields; daily only'),
  (35, 'ZN=F',      '10Y T-Note future',          'Fixed income', 'rates', 'CME',  'America/New_York', 'USD', 3, null, 'yahoo', null, null),
  -- Commodities
  (36, 'CL=F',      'WTI crude',                  'Commodities', 'cmdty', 'CME', 'America/New_York', 'USD', 2, null, 'yahoo', null, 'NYMEX'),
  (37, 'BZ=F',      'Brent crude',                'Commodities', 'cmdty', 'CME', 'America/New_York', 'USD', 2, null, 'yahoo', null, 'ICE via Yahoo'),
  (38, 'GC=F',      'Gold',                       'Commodities', 'cmdty', 'CME', 'America/New_York', 'USD', 2, null, 'yahoo', null, 'COMEX'),
  (39, 'SI=F',      'Silver',                     'Commodities', 'cmdty', 'CME', 'America/New_York', 'USD', 3, null, 'yahoo', null, 'COMEX'),
  (40, 'HG=F',      'Copper',                     'Commodities', 'cmdty', 'CME', 'America/New_York', 'USD', 4, null, 'yahoo', null, 'COMEX'),
  (41, 'NG=F',      'Natural gas',                'Commodities', 'cmdty', 'CME', 'America/New_York', 'USD', 3, null, 'yahoo', null, 'NYMEX')
on conflict (symbol) do update set name = excluded.name, cls = excluded.cls, grp = excluded.grp, market = excluded.market, tz = excluded.tz,
  currency = excluded.currency, decimals = excluded.decimals, proxy_for = excluded.proxy_for, provider = excluded.provider,
  provider_symbol = excluded.provider_symbol, ord = excluded.ord, notes = excluded.notes;

-- Policy rates: labels and sources now, values when a job or a person fills them (no guessed numbers).
insert into policy_rates (bank, name, rate_label, source_url, source_note) values
  ('FED',  'Federal Reserve',        'Fed funds target range, upper bound',  'https://www.federalreserve.gov/monetarypolicy/openmarket.htm', 'filled by the fred job (DFEDTARU)'),
  ('BOJ',  'Bank of Japan',          'Uncollateralised overnight call rate', 'https://www.boj.or.jp/en/mopo/mpmdeci/index.htm', null),
  ('ECB',  'European Central Bank',  'Deposit facility rate',                'https://www.ecb.europa.eu/stats/policy_and_exchange_rates/key_ecb_interest_rates/html/index.en.html', null),
  ('BOE',  'Bank of England',        'Bank Rate',                            'https://www.bankofengland.co.uk/monetary-policy/the-interest-rate-bank-rate', null),
  ('RBA',  'Reserve Bank of Australia','Cash rate target',                   'https://www.rba.gov.au/statistics/cash-rate/', null),
  ('BOK',  'Bank of Korea',          'Base rate',                            'https://www.bok.or.kr/eng/main/contents.do?menuNo=400069', null),
  ('PBOC', 'People''s Bank of China','1-year loan prime rate',               'http://www.pbc.gov.cn/en/3688229/index.html', null),
  ('HKMA', 'Hong Kong Monetary Authority','Base rate',                       'https://www.hkma.gov.hk/eng/key-functions/money/monetary-stability/', null),
  ('MAS',  'Monetary Authority of Singapore','S$NEER policy band (no rate)', 'https://www.mas.gov.sg/monetary-policy', 'MAS steers the exchange rate; the slope, width and centre are stated in words')
on conflict (bank) do nothing;

-- Holidays 2026, from public calendars, UNVERIFIED until checked against each exchange's own page.
insert into sessions_cal (market, d, name, verified) values
  ('TSE', '2026-01-01', 'New Year''s Day', false), ('TSE', '2026-01-02', 'Exchange holiday', false),
  ('TSE', '2026-01-12', 'Coming of Age Day', false), ('TSE', '2026-02-11', 'National Foundation Day', false),
  ('TSE', '2026-02-23', 'Emperor''s Birthday', false), ('TSE', '2026-03-20', 'Vernal Equinox Day', false),
  ('TSE', '2026-04-29', 'Showa Day', false), ('TSE', '2026-05-04', 'Greenery Day', false),
  ('TSE', '2026-05-05', 'Children''s Day', false), ('TSE', '2026-05-06', 'Substitute holiday', false),
  ('TSE', '2026-07-20', 'Marine Day', false), ('TSE', '2026-08-11', 'Mountain Day', false),
  ('TSE', '2026-09-21', 'Respect for the Aged Day', false), ('TSE', '2026-09-22', 'Citizens'' holiday', false),
  ('TSE', '2026-09-23', 'Autumnal Equinox Day', false), ('TSE', '2026-10-12', 'Sports Day', false),
  ('TSE', '2026-11-03', 'Culture Day', false), ('TSE', '2026-11-23', 'Labour Thanksgiving Day', false),
  ('TSE', '2026-12-31', 'Exchange holiday', false),
  ('NYSE', '2026-01-01', 'New Year''s Day', false), ('NYSE', '2026-01-19', 'Martin Luther King Jr. Day', false),
  ('NYSE', '2026-02-16', 'Presidents'' Day', false), ('NYSE', '2026-04-03', 'Good Friday', false),
  ('NYSE', '2026-05-25', 'Memorial Day', false), ('NYSE', '2026-06-19', 'Juneteenth', false),
  ('NYSE', '2026-07-03', 'Independence Day (observed)', false), ('NYSE', '2026-09-07', 'Labor Day', false),
  ('NYSE', '2026-11-26', 'Thanksgiving Day', false), ('NYSE', '2026-12-25', 'Christmas Day', false)
on conflict (market, d) do nothing;
