# Stock Exploder — a screener with an actual backtest

## Stage 3 — sectors & joint signals (done 2026-11-03, stage3_sectors.py + stage3b_control.py)

Question: which themes do the exploding stocks belong to, and does requiring
the signal to fit BOTH the stock and its related ETF improve the survivor
combo? Method: 47 sector/theme ETFs fetched from the SAME source (AKShare/
Sina qfq) over the SAME window as the stocks. Stock→ETF mapping from actual
holdings: full issuer files for 33 ETFs (State Street SPDR xlsx, VanEck xlsx),
top-25 (partial, flagged) for the other 13; primary ETF = narrowest full fund
holding the stock. Coverage: 1,388 / 3,259 tradable stocks mapped (43%).
Holdings are CURRENT (Nov 2026) — a point-in-time caveat for early-year rows.

Every explosion onset was aligned with its primary ETF over the IDENTICAL
20-trading-day window [onset, onset+20]:

- Of 3,434 onsets: 1,920 (56%) are in stocks no tracked ETF holds (mostly
  small caps — the blind spot of this method); of the 1,514 mapped onsets,
  55% were sector-driven (ETF +≥8% in the same window), 23% sector-assisted
  (+3–8%), only 22% solo.
- Explosion factories by onset count: XBI Biotech 319 onsets / 119 stocks
  (all year, peak 2026Q2), XSW Software 221 (peak 2026Q2–Q3), XPH Pharma 88,
  XSD Semis 83, XLK 82, GDX Gold Miners 75.
- Purest sector moves: gold miners — GDX onsets had a median SAME-WINDOW ETF
  return of +23.6% and 96% were sector-driven (GDXJ 90.5%, XME 81.7%,
  SMH 79.2%, XOP 74.4%). When miners exploded, everything exploded together.
- Hottest ETFs of the year by hot-window days (fwd20 ≥ +10%): COPX copper
  miners (80 days, best 20d +30.1%), SIL silver miners (78, +38.9%), GDXJ
  (70, +40.4%), GDX (66, +42.2%), SMH (64; +39.3% year return). Best single
  20d window of any ETF: XSD +52.2%. Year returns: XLE +58.1%, XOP +55.4%.
  The metals complex peaked around 2026-07-28.

Joint-signal test — survivor combo (MACD cross + above MA20) + related-ETF
confirmation (ETF above MA50 / ETF MACD bull / ETF momentum>0 / ETF "hot"),
same engine, both periods, every trigger counted (output/joint_backtest.csv).
Raw result: every confirmed variant earned LESS per trade in the test period
than the unrestricted base (+4.30%/trade, ≈+17.2% portfolio). BUT the
control (stage3b) shows why that headline misleads: confirmed variants can
only trade mapped stocks, and the base combo restricted to the mapped
universe was itself dead in test (+0.19%/trade, 37.5% win, ≈+0.8%) — the
combo's test-period edge lived mostly in unmapped small caps and in which
trades the 10-slot cap happened to admit (unmapped-only test: +1.08%/trade;
neither subset reproduces +17.2%, so treat capped portfolio numbers as
path-dependent). The cap-free comparison — trigger precision within the
mapped universe, test period: base 3.39% vs +ETF-above-MA50 3.38%,
+ETF-MACD-bull 3.12%, +ETF-hot 2.87%, +ETF-momentum 2.81%. Verdict:
**ETF confirmation adds nothing** — it neither rescues nor wrecks the combo;
it just shrinks the trigger set (≈7,986 → 1,047–2,512 test triggers) to the
same precision. "Signal fits stock AND sector" is a good story the data
doesn't pay for, at least with daily MA/MACD-style ETF filters.

Data note found in stage 3: pipeline.py's original AKShare branch built its
DataFrame from Series + explicit index, which aligns by label and yields
all-NaN — so stage 1/2 stock data actually came from the Nasdaq fallback
(split-adjusted by detection, not dividend-adjusted). Fixed in code; the
stage 1/2 results stand (Nasdaq prices cross-checked vs Sina on AAPL).

Built after reviewing `ba1int/stock_screener` and `bmtrnavsky/nanobot-stock-trader`:
both had interesting logic and **zero backtests**. This one is organised so the
backtest can't lie (much):

## The logic (Lin's spec)

1. **Get the data.** 1 year of daily quotes for *all* US-listed stocks
   (SEC `company_tickers_exchange.json`: Nasdaq + NYSE, ~7,600 tickers),
   plus ~400 calendar days before the year so MA200 / MACD / RSI are already
   valid on day 1. Source: Nasdaq's own historical API (free, no key).
   Yahoo/yfinance returns 429 on this network and Stooq is behind a JS
   proof-of-work wall, so Nasdaq it is. Prices are as-traded there, so the
   pipeline detects overnight jumps that land on exact split ratios
   (2/3/4/5/8/10/20× or reciprocal) and back-adjusts them.
   Tradability filter *after* fetching everything: ≥200 trading days in the
   year, median price ≥ $3, median dollar volume ≥ $2M/day. Counts of what
   was dropped and why are in `output/summary.json`.

2. **Find the explosions and the best parts.**
   - *Explosion onset* (research label — it looks ahead by design and is
     never a trade signal): in the next 20 trading days the stock reaches
     +30% and still closes +20% at day 20, while the prior 20 days were
     ≤ +10% (it wasn't already running). Onsets de-overlapped by 20 days.
   - *Pre-explosion window*: the 10 trading days before each onset.
   - *Best windows*: every ticker's best forward 20d and 60d window in the
     year → `output/best_windows.csv`, all onsets → `output/explosions.csv`.

3. **List every MA + MACD signal** (computed at each day's close, data
   up to that day only — no lookahead):
   - MA: above MA5/10/20/50/100/200, stacks (5>10>20, full 5>10>20>50>200),
     20>50>200 trend, crossovers (5/20, 10/50, 20/50, golden cross,
     price×MA20/50), MA20/50/200 slope up, near MA20/MA50, extended >15%
     over MA20, MA coil (MA5–MA50 spread <3% / <5% of price).
   - MACD (12,26,9): DIF>DEA, DIF>0, cross up (also split: below-zero
     cross = early reversal, above-zero cross = continuation), zero-line
     cross up, histogram rising / rising 3 days / turning up below zero,
     histogram positive, DIF slope up.
   - Controls: volume surge 1.5×/2×, volume dry-up, Bollinger-width
     compression (own 120d bottom quartile), tight 10d range, RSI 50–70,
     RSI crossing 50, 20d/55d breakout.

4. **Study before picking.** On the *discovery* period (first 60% of the
   year) only:
   - how often each signal appears on pre-explosion days vs normal days
     (`signal_prevalence_pre_explosion.csv`), and
   - forward stats per signal: P(boom in next 20d) and its lift vs base
     rate, mean/median forward 20d return, win rate
     (`signal_study_discovery.csv`).

5. **Pick and backtest honestly.** 15 pre-defined signal *combos* are
   traded on the discovery period; the best (≥20 trades, by avg trade
   return) is then run **once** on the held-out test period (last 40%):
   signal at close T → buy at open T+1 → sell at close T+21, max 10
   concurrent positions, equal weight, 0.2% cost per side. All combos'
   test results are also published (`combo_test.csv`) so the winner
   isn't cherry-picked in secret, plus SPY and the unconditional
   forward-return baseline for the same test window.

## Run

```bash
.venv/bin/python pipeline.py   # ~15-30 min first run (fetches all tickers),
                               # caches to data/features.pkl afterwards
```

Outputs in `output/`: `summary.json`, `explosions.csv`, `best_windows.csv`,
`signal_study_discovery.csv`, `signal_prevalence_pre_explosion.csv`,
`combo_discovery.csv`, `combo_test.csv`, `winner_test_trades.csv`.

## Results (run of 2026-11-03, defaults as above)

- Universe 7,628 → 3,259 tradable tickers; 817,548 stock-days; split 2026-06-10;
  3,434 explosion onsets across 1,629 tickers.
- Best boom predictor was `extended_ma20` (price >15% above MA20, lift 2.90) —
  continuation of stocks already running, not a pre-explosion signal.
  The coil hypothesis failed: MA coil / tight range had lift 0.16–0.40.
- The market flipped regime between periods (unconditional forward-20d mean
  +2.66% in discovery vs −0.55% in test; SPY +4.22% in test). The discovery
  winner (`stack_full + hist_rising`, +6.45%/trade in discovery) collapsed
  out-of-sample (−4.04%/trade). Most consistent combo: MACD cross up +
  price above MA20 (#2 in discovery at +3.99%, #1 in test at +4.30%,
  52.5% win rate). Full tables in `output/`.

## Known limits

- One year, one regime. Anything found here is a hypothesis, not an edge,
  until it survives a second year / different market.
- Prices are split-adjusted by detection, not dividend-adjusted (dividend
  drops are small vs the +30% explosion threshold).
- Survivorship: the SEC file lists *current* tickers, so stocks delisted
  during the year are missing. That biases results up somewhat.
- Fixed 20-day hold, no stop-loss in v1 — stops are the obvious next test.
