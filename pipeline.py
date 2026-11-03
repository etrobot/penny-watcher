#!/usr/bin/env python3
"""
Stock Exploder pipeline (see README.md for the full logic)
Steps: fetch all -> label explosions -> compute MA/MACD signals ->
study signals on DISCOVERY period -> rank combos on discovery ->
backtest winner ONCE on TEST period.
"""
import io, json, time, pickle, warnings, urllib.request, urllib.parse
from pathlib import Path
import numpy as np
import pandas as pd

warnings.filterwarnings("ignore")
ROOT = Path(__file__).parent
OUT = ROOT / "output"; OUT.mkdir(exist_ok=True)
CACHE = ROOT / "data"; CACHE.mkdir(exist_ok=True)

ANALYSIS_YEARS = 1
WARMUP_DAYS = 400
MIN_PRICE = 3.0
MIN_MED_DOLLAR_VOL = 2_000_000
COST_PER_SIDE = 0.002
MAX_POSITIONS = 10
HOLD_DAYS = 20

END = pd.Timestamp.today().normalize()
START = END - pd.DateOffset(years=ANALYSIS_YEARS)
FETCH_START = START - pd.Timedelta(days=WARMUP_DAYS)

# ---------------- universe ----------------
def get_universe():
    f = CACHE / "universe.csv"
    if f.exists(): return pd.read_csv(f, dtype=str, keep_default_na=False)["symbol"].tolist()
    # SEC official exchange-listed tickers file (nasdaqtrader.com's old
    # symdir URLs 404 as of 2026). Includes some ETFs/funds; the price and
    # dollar-volume tradability filters downstream are what define the
    # studied universe, and ETFs essentially never trigger the +30%
    # explosion label, so they don't distort the signal stats.
    req = urllib.request.Request("https://www.sec.gov/files/company_tickers_exchange.json",
                                 headers={"User-Agent": "StockExploder research contact@example.com"})
    data = json.loads(urllib.request.urlopen(req, timeout=30).read())
    syms = set()
    for row in data["data"]:
        ticker, exchange = str(row[2]).strip(), row[3]
        if exchange in ("Nasdaq", "NYSE"):
            s = ticker.replace("/", "-").replace(".", "-")
            if s.replace("-", "").isalnum(): syms.add(s)
    syms = sorted(syms)
    pd.DataFrame({"symbol": syms}).to_csv(f, index=False)
    return syms

# ---------------- indicators, signals, labels ----------------
def add_indicators(d):
    c, v, h, l = d["Close"], d["Volume"], d["High"], d["Low"]
    for n in (5, 10, 20, 50, 100, 200): d[f"ma{n}"] = c.rolling(n).mean()
    d["dif"] = c.ewm(span=12, adjust=False).mean() - c.ewm(span=26, adjust=False).mean()
    d["dea"] = d["dif"].ewm(span=9, adjust=False).mean()
    d["hist"] = d["dif"] - d["dea"]
    delta = c.diff()
    rs = delta.clip(lower=0).ewm(alpha=1/14, adjust=False).mean() / (-delta.clip(upper=0)).ewm(alpha=1/14, adjust=False).mean()
    d["rsi"] = 100 - 100 / (1 + rs)
    tr = pd.concat([h - l, (h - c.shift()).abs(), (l - c.shift()).abs()], axis=1).max(axis=1)
    d["atr_pct"] = tr.ewm(alpha=1/14, adjust=False).mean() / c * 100
    d["avgvol20"] = v.rolling(20).mean(); d["vol_ratio"] = v / d["avgvol20"]
    d["bb_width"] = 4 * c.rolling(20).std() / d["ma20"]
    d["range10"] = h.rolling(10).max() / l.rolling(10).min() - 1
    d["prior_high20"] = c.shift(1).rolling(20).max(); d["prior_high55"] = c.shift(1).rolling(55).max()
    for n in (5, 10, 20, 60): d[f"fwd{n}"] = c.shift(-n) / c - 1
    fut = pd.concat([c.shift(-i) for i in range(1, 21)], axis=1).max(axis=1)
    d["fwd_max20"] = fut / c - 1
    d["prior20_ret"] = c / c.shift(20) - 1
    return d

def cross_up(a, b): return (a > b) & (a.shift() <= b.shift())

def add_signals(d):
    c = d["Close"]; s = {}
    for n in (5, 10, 20, 50, 100, 200): s[f"above_ma{n}"] = c > d[f"ma{n}"]
    s["stack_5_10_20"] = (d.ma5 > d.ma10) & (d.ma10 > d.ma20)
    s["stack_full"] = (d.ma5 > d.ma10) & (d.ma10 > d.ma20) & (d.ma20 > d.ma50) & (d.ma50 > d.ma200)
    s["trend_20_50_200"] = (d.ma20 > d.ma50) & (d.ma50 > d.ma200)
    s["cross_5_20_up"] = cross_up(d.ma5, d.ma20)
    s["cross_10_50_up"] = cross_up(d.ma10, d.ma50)
    s["cross_20_50_up"] = cross_up(d.ma20, d.ma50)
    s["golden_cross"] = cross_up(d.ma50, d.ma200)
    s["price_cross_ma20_up"] = cross_up(c, d.ma20)
    s["price_cross_ma50_up"] = cross_up(c, d.ma50)
    for n in (20, 50, 200): s[f"ma{n}_slope_up"] = d[f"ma{n}"] > d[f"ma{n}"].shift(5)
    s["near_ma20"] = ((c / d.ma20 - 1).abs() < 0.03) & (c > d.ma20)
    s["near_ma50"] = ((c / d.ma50 - 1).abs() < 0.03) & (c > d.ma50)
    s["extended_ma20"] = c / d.ma20 - 1 > 0.15
    mas = pd.concat([d.ma5, d.ma10, d.ma20, d.ma50], axis=1)
    s["ma_coil_3pct"] = (mas.max(axis=1) - mas.min(axis=1)) / c < 0.03
    s["ma_coil_5pct"] = (mas.max(axis=1) - mas.min(axis=1)) / c < 0.05
    dif, dea, hist = d.dif, d.dea, d["hist"]
    s["macd_bull"] = dif > dea
    s["macd_above_zero"] = dif > 0
    s["macd_cross_up"] = cross_up(dif, dea)
    s["macd_cross_up_below_zero"] = s["macd_cross_up"] & (dif < 0)
    s["macd_cross_up_above_zero"] = s["macd_cross_up"] & (dif >= 0)
    s["macd_zero_cross_up"] = (dif > 0) & (dif.shift() <= 0)
    s["hist_rising"] = hist > hist.shift()
    s["hist_rising_3d"] = (hist > hist.shift()) & (hist.shift() > hist.shift(2)) & (hist.shift(2) > hist.shift(3))
    s["hist_turn_up_below_zero"] = (hist > hist.shift()) & (hist.shift() <= hist.shift(2)) & (dif < 0)
    s["hist_positive"] = hist > 0
    s["dif_slope_up"] = dif > dif.shift(3)
    s["vol_surge_1.5x"] = d.vol_ratio > 1.5
    s["vol_surge_2x"] = d.vol_ratio > 2.0
    s["vol_dryup"] = d.Volume.rolling(5).mean() / d.avgvol20 < 0.7
    s["vol_compression"] = d.bb_width < d.bb_width.rolling(120).quantile(0.25)
    s["tight_range_10d"] = d.range10 < 0.10
    s["rsi_50_70"] = d.rsi.between(50, 70)
    s["rsi_cross_50_up"] = (d.rsi > 50) & (d.rsi.shift() <= 50)
    s["breakout_20d"] = c > d.prior_high20
    s["breakout_55d"] = c > d.prior_high55
    for k, val in s.items(): d[f"sig_{k}"] = val.fillna(False)
    return d

def label_events(d):
    d = d.copy()
    raw_onset = (d.fwd_max20 >= 0.30) & (d.fwd20 >= 0.20) & (d.prior20_ret <= 0.10)
    onset = np.zeros(len(d), bool); pre = np.zeros(len(d), bool); in_boom = np.zeros(len(d), bool)
    last = -10**9
    for i in np.where(raw_onset.fillna(False).values)[0]:
        if i - last <= 20: continue
        last = i; onset[i] = True
        pre[max(0, i-10):i] = True; in_boom[i:min(len(d), i+21)] = True
    d["onset"], d["is_pre"], d["in_boom"] = onset, pre, in_boom
    d["boom20"] = (d.fwd_max20 >= 0.30) & (d.fwd20 >= 0.15)
    return d

# ---------------- fetch (Nasdaq API; Yahoo returns 429 on this network) ----------------
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36",
      "Accept": "application/json"}

def _num(x):
    try: return float(str(x).replace("$", "").replace(",", ""))
    except Exception: return np.nan

def split_adjust(d):
    """Nasdaq prices are as-traded (not split-adjusted). Detect overnight
    jumps landing within 1.5% of an exact split ratio (2,3,4,5,8,10,20 or
    reciprocal) with a normal intraday move, and back-adjust history."""
    if len(d) < 2: return d
    o, c, v = d["Open"].values.copy(), d["Close"].values.copy(), d["Volume"].values.copy()
    h, l = d["High"].values.copy(), d["Low"].values.copy()
    ratios = [20, 10, 8, 5, 4, 3, 2]
    for i in range(1, len(d)):
        if c[i-1] <= 0 or o[i] <= 0: continue
        r = o[i] / c[i-1]
        k = None
        for cand in ratios:
            if abs(r - cand) / cand < 0.015: k = cand; break
            if abs(r - 1/cand) * cand < 0.015: k = 1/cand; break
        if k and abs(c[i] / o[i] - 1) < 0.25:
            for arr in (o, c, h, l): arr[:i] *= k
            v[:i] /= k
    d["Open"], d["Close"], d["High"], d["Low"], d["Volume"] = o, c, h, l, v
    return d

def fetch_one(t):
    """Per-ticker disk cache (data/ticker_cache/): a killed run resumes
    instead of restarting - learned the hard way 2026-11-03 when a runtime
    restart killed the process at 4000/7628 with everything in RAM only.
    'error' results are NOT cached (they may be transient)."""
    t = str(t)
    cf = CACHE / "ticker_cache" / f"{t}.pkl"
    if cf.exists():
        try:
            kind, payload = pickle.loads(cf.read_bytes())
            return (t, payload, None) if kind == "kept" else (t, None, payload)
        except Exception: pass
    try:
        result = _fetch_one_network(t)
    except Exception:
        return t, None, "error"  # one bad ticker must never kill the batch (2026-11-03: a NaN-parsed symbol crashed the whole run at #4609)
    if result[1] is not None or result[2] in ("few_days", "illiquid"):
        try:
            cf.parent.mkdir(exist_ok=True)
            cf.write_bytes(pickle.dumps(("kept", result[1]) if result[1] is not None else ("drop", result[2])))
        except Exception: pass
    return result

def _fetch_one_network(t):
    """Primary source: AKShare's Sina interface (ak.stock_us_daily, qfq =
    forward-adjusted, so no split-adjust hack needed, no key, no rate limit
    hit in testing). Eastmoney-backed AKShare interfaces rate-limit this
    network's IP instantly - do not use them. Nasdaq API kept as fallback."""
    try:
        import akshare as ak
        raw = ak.stock_us_daily(symbol=t, adjust="qfq")
        d = pd.DataFrame({"Open": raw["open"].values, "High": raw["high"].values, "Low": raw["low"].values,
                          "Close": raw["close"].values, "Volume": raw["volume"].values},
                         index=pd.to_datetime(raw["date"].values))  # .values: Series+index aligns by label -> all-NaN (found 2026-11-03 via ETF fetch; features.pkl was built by the Nasdaq fallback because of this)
        d = d.sort_index().dropna(subset=["Close"])
        d = d[d.index >= FETCH_START]
    except Exception:
        d = None
    if d is None or len(d) == 0:
        # fallback: Nasdaq API (as-traded prices -> split_adjust)
        fromdate = FETCH_START.strftime("%Y-%m-%d"); rows = None
        for asset in ("stocks", "etf"):
            url = f"https://api.nasdaq.com/api/quote/{urllib.parse.quote(t)}/historical?assetclass={asset}&fromdate={fromdate}&limit=9999"
            try:
                data = json.loads(urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=25).read())
                rows = (data.get("data") or {}).get("tradesTable", {}).get("rows")
                if rows: break
            except Exception: rows = None
        if not rows: return t, None, "error"
        try:
            d = pd.DataFrame([{"Open": _num(r["open"]), "High": _num(r["high"]), "Low": _num(r["low"]),
                               "Close": _num(r["close"]), "Volume": _num(r["volume"])} for r in rows],
                             index=[pd.to_datetime(r["date"]) for r in rows])
            d = split_adjust(d.sort_index().dropna(subset=["Close"]))
        except Exception: return t, None, "error"
    try:
        yr = d[d.index >= START]
        if len(yr) < 200: return t, None, "few_days"
        if yr["Close"].median() < MIN_PRICE or (yr["Close"] * yr["Volume"]).median() < MIN_MED_DOLLAR_VOL:
            return t, None, "illiquid"
        return t, add_signals(add_indicators(d)), None
    except Exception: return t, None, "error"

def fetch_all(symbols):
    from concurrent.futures import ThreadPoolExecutor
    kept, dropped = {}, {"few_days": 0, "illiquid": 0, "error": 0}
    done = 0
    with ThreadPoolExecutor(max_workers=12) as ex:
        for t, d, why in ex.map(fetch_one, symbols):
            done += 1
            if d is not None: kept[t] = d
            else: dropped[why] += 1
            if done % 500 == 0: print(f"{done}/{len(symbols)} kept={len(kept)} dropped={dropped}", flush=True)
    return kept, dropped

# ---------------- signal combos to test ----------------
COMBOS = {
  "macd_cross_only":        ["macd_cross_up"],
  "macd_cross+above_ma20":  ["macd_cross_up", "above_ma20"],
  "macd_cross_below0+coil": ["macd_cross_up_below_zero", "ma_coil_5pct"],
  "hist_turn_below0+coil+dryup": ["hist_turn_up_below_zero", "ma_coil_5pct", "vol_dryup"],
  "coil+vol_surge+above_ma20":   ["ma_coil_5pct", "vol_surge_1.5x", "above_ma20"],
  "stack+macd_bull":        ["stack_5_10_20", "macd_bull", "above_ma50"],
  "full_trend+hist_rising": ["stack_full", "hist_rising"],
  "breakout55+macd_above0": ["breakout_55d", "macd_above_zero", "macd_bull"],
  "breakout20+vol_surge":   ["breakout_20d", "vol_surge_1.5x"],
  "price_cross_ma50+macd_cross": ["price_cross_ma50_up", "macd_cross_up"],
  "golden_cross_recent_trend":   ["trend_20_50_200", "macd_cross_up"],
  "coil+tight+hist_turn":   ["ma_coil_3pct", "tight_range_10d", "hist_turn_up_below_zero"],
  "near_ma50+hist_rising3": ["near_ma50", "hist_rising_3d", "trend_20_50_200"],
  "rsi_cross+cross_5_20":   ["rsi_cross_50_up", "cross_5_20_up"],
  "vol_compression+breakout20": ["vol_compression", "breakout_20d"],
}

def combo_mask(df, names):
    m = pd.Series(True, index=df.index)
    for n in names: m &= df[f"sig_{n}"]
    return m

# ---------------- backtest (one rule, one period) ----------------
def backtest(kept, sig_names, period_start, period_end):
    """Signal at close T -> buy open T+1 -> sell close T+1+HOLD_DAYS. Max 10 concurrent, equal weight."""
    trades = []
    open_slots = []  # (exit_date, ticker)
    cands = []
    for t, d in kept.items():
        sub = d[(d.index >= period_start) & (d.index <= period_end)]
        if not len(sub): continue
        m = combo_mask(sub, sig_names)
        for ts in sub.index[m]: cands.append((ts, t))
    cands.sort()
    for ts, t in cands:
        open_slots = [(e, x) for e, x in open_slots if e > ts]
        if True:
            if len(open_slots) >= MAX_POSITIONS: continue
            if any(t == x[1] for x in open_slots): continue
            d = kept[t]; i = d.index.get_loc(ts)
            if i + 1 + HOLD_DAYS >= len(d): continue
            entry = d["Open"].iloc[i+1]; exit_ = d["Close"].iloc[i+1+HOLD_DAYS]
            if not (entry > 0): continue
            ret = exit_ / entry - 1 - 2 * COST_PER_SIDE
            trades.append({"ticker": t, "signal_date": str(ts.date()), "entry_date": str(d.index[i+1].date()),
                           "exit_date": str(d.index[i+1+HOLD_DAYS].date()), "entry": round(float(entry), 2),
                           "exit": round(float(exit_), 2), "ret_pct": round(float(ret)*100, 2)})
            open_slots.append((d.index[i+1+HOLD_DAYS], t))
    tr = pd.DataFrame(trades)
    if not len(tr): return tr, {}
    stats = {"trades": len(tr), "win_rate_pct": round((tr.ret_pct > 0).mean()*100, 1),
             "avg_ret_pct": round(tr.ret_pct.mean(), 2), "median_ret_pct": round(tr.ret_pct.median(), 2),
             "best_pct": round(tr.ret_pct.max(), 1), "worst_pct": round(tr.ret_pct.min(), 1),
             "portfolio_ret_pct (10 slots, equal weight, approx)": round(tr.ret_pct.sum() / MAX_POSITIONS, 1)}
    return tr, stats

def main():
    t0 = time.time()
    print(f"Analysis year: {START.date()} .. {END.date()} (fetch from {FETCH_START.date()})", flush=True)
    symbols = get_universe(); print(f"Universe: {len(symbols)} tickers", flush=True)
    cachef = CACHE / "features.pkl"
    if cachef.exists():
        kept, dropped = pickle.loads(cachef.read_bytes()); print(f"cache: {len(kept)} tickers", flush=True)
    else:
        kept, dropped = fetch_all(symbols); cachef.write_bytes(pickle.dumps((kept, dropped)))
    kept = {t: label_events(d) for t, d in kept.items()}
    signals = [c[4:] for c in next(iter(kept.values())).columns if c.startswith("sig_")]

    frames = []
    for t, d in kept.items():
        yr = d[d.index >= START].copy(); yr["ticker"] = t; yr["date"] = yr.index; frames.append(yr)
    big = pd.concat(frames, ignore_index=True)
    days = sorted(big["date"].unique()); split = pd.Timestamp(days[int(len(days)*0.6)])
    print(f"Tradable tickers: {len(kept)} dropped={dropped} | stock-days={len(big)} | split={split.date()} | {time.time()-t0:.0f}s", flush=True)

    # ---- best windows + explosions ----
    best = []
    for t, d in kept.items():
        yr = d[d.index >= START]
        for n, col in ((20, "fwd20"), (60, "fwd60")):
            s = yr[col].dropna()
            if len(s):
                i = s.idxmax(); best.append({"ticker": t, "window_d": n, "start": str(i.date()),
                    "ret_pct": round(float(s.max())*100, 1), "start_price": round(float(yr.loc[i, "Close"]), 2)})
    pd.DataFrame(best).sort_values("ret_pct", ascending=False).head(100).to_csv(OUT / "best_windows.csv", index=False)
    onsets = [{"ticker": t, "onset": str(ts.date()), "price": round(float(d.loc[ts, "Close"]), 2),
               "fwd20_pct": round(float(d.loc[ts, "fwd20"])*100, 1), "fwd_max20_pct": round(float(d.loc[ts, "fwd_max20"])*100, 1)}
              for t, d in kept.items() for ts in d.index[d.onset & (d.index >= START)]]
    on_df = pd.DataFrame(onsets).sort_values("onset"); on_df.to_csv(OUT / "explosions.csv", index=False)
    print(f"Explosions: {len(on_df)} onsets, {on_df.ticker.nunique()} tickers", flush=True)

    # ---- signal study on DISCOVERY ----
    disc = big[big["date"] < split]
    base_pre = disc["is_pre"].mean(); base_boom = disc["boom20"].mean()
    study = []
    for sig in signals:
        col = disc[f"sig_{sig}"]; f = disc[col]
        study.append({"signal": sig, "fires": int(col.sum()),
            "pre_explode_rate_pct": round(f["is_pre"].mean()*100, 2) if len(f) else None,
            "lift_vs_base_pre": round(f["is_pre"].mean() / base_pre, 2) if len(f) and base_pre else None,
            "boom20_rate_pct": round(f["boom20"].mean()*100, 2) if len(f) else None,
            "boom_lift": round(f["boom20"].mean() / base_boom, 2) if len(f) and base_boom else None,
            "fwd20_mean_pct": round(f["fwd20"].mean()*100, 2) if len(f) else None,
            "fwd20_median_pct": round(f["fwd20"].median()*100, 2) if len(f) else None,
            "fwd20_win_pct": round((f["fwd20"] > 0).mean()*100, 1) if len(f) else None})
    # prevalence IN pre-explosion windows vs baseline (the "what did it look like before" view)
    pre_days = disc[disc["is_pre"]]; base_days = disc[~disc["is_pre"] & ~disc["in_boom"]]
    prev = []
    for sig in signals:
        p = pre_days[f"sig_{sig}"].mean(); b = base_days[f"sig_{sig}"].mean()
        prev.append({"signal": sig, "pct_of_pre_explode_days": round(p*100, 1),
                     "pct_of_normal_days": round(b*100, 1), "lift": round(p / b, 2) if b > 0 else None})
    study_df = pd.DataFrame(study).sort_values("boom_lift", ascending=False)
    prev_df = pd.DataFrame(prev).sort_values("lift", ascending=False)
    study_df.to_csv(OUT / "signal_study_discovery.csv", index=False)
    prev_df.to_csv(OUT / "signal_prevalence_pre_explosion.csv", index=False)

    # ---- combos: rank on discovery (trade-level, next-open, 20d hold) ----
    combo_rows = []
    for name, sigs in COMBOS.items():
        tr, st = backtest(kept, sigs, START, split)
        combo_rows.append({"combo": name, "signals": "+".join(sigs), "period": "discovery", **st})
    combo_df = pd.DataFrame(combo_rows).sort_values("avg_ret_pct", ascending=False)
    combo_df.to_csv(OUT / "combo_discovery.csv", index=False)
    eligible = combo_df[combo_df["trades"] >= 20]
    winner = eligible.iloc[0]["combo"] if len(eligible) else combo_df.iloc[0]["combo"]
    print(f"Discovery winner: {winner}", flush=True)

    # ---- backtest winner + all combos on TEST (reported for transparency) ----
    test_rows, winner_trades = [], None
    for name, sigs in COMBOS.items():
        tr, st = backtest(kept, sigs, split, END)
        test_rows.append({"combo": name, "signals": "+".join(sigs), "period": "test", **st})
        if name == winner: winner_trades = tr
    test_df = pd.DataFrame(test_rows).sort_values("avg_ret_pct", ascending=False)
    test_df.to_csv(OUT / "combo_test.csv", index=False)
    if winner_trades is not None: winner_trades.to_csv(OUT / "winner_test_trades.csv", index=False)

    # ---- baselines on test: SPY + unconditional forward return ----
    try:
        import akshare as ak
        spy_df = ak.stock_us_daily(symbol="SPY", adjust="qfq")
        spy_df = spy_df[(spy_df["date"] >= split) & (spy_df["date"] <= END)]
        spy_ret = float(spy_df["close"].iloc[-1] / spy_df["close"].iloc[0] - 1) * 100
    except Exception: spy_ret = None
    test_big = big[big["date"] >= split]
    baseline = {"spy_test_ret_pct": round(spy_ret, 2) if spy_ret else None,
                "unconditional_fwd20_mean_pct": round(test_big["fwd20"].mean()*100, 2),
                "unconditional_boom20_rate_pct": round(test_big["boom20"].mean()*100, 2),
                "discovery_base_pre_rate_pct": round(base_pre*100, 2), "discovery_base_boom_rate_pct": round(base_boom*100, 2)}
    summary = {"analysis_year": f"{START.date()}..{END.date()}", "universe_tickers": len(symbols),
               "tradable_tickers": len(kept), "dropped": dropped, "stock_days": len(big),
               "split_date": str(split.date()), "explosions_in_year": len(on_df),
               "discovery_winner": winner, "baseline_test": baseline,
               "winner_test_stats": test_df[test_df.combo == winner].to_dict("records"),
               "runtime_s": round(time.time() - t0)}
    (OUT / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
    print(json.dumps(summary, indent=2, default=str), flush=True)
    print("\nTOP signals by boom lift (discovery):"); print(study_df.head(12).to_string(index=False))
    print("\nTOP signals in pre-explosion windows:"); print(prev_df.head(12).to_string(index=False))
    print("\nCombos TEST:"); print(test_df.to_string(index=False))

if __name__ == "__main__":
    main()
