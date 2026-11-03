#!/usr/bin/env python3
"""
Stage 3: sectors / themes.
1. Fetch main industry + theme ETF quotes (AKShare/Sina, SAME source and
   SAME window as the stocks: analysis year + warmup).
2. Map each stock to its related ETFs from actual ETF holdings
   (stockanalysis.com embedded holdings data; CURRENT holdings - a
   point-in-time caveat). Primary ETF = narrowest fund holding the stock.
3. Align every explosion onset with its ETFs over the IDENTICAL window
   [T, T+20]: did the sector explode with the stock, or was it solo?
4. Hot sectors: which themes co-exploded, and when.
5. Joint signal: survivor combo (MACD cross + above MA20) with and without
   related-ETF confirmation, on discovery AND held-out test, same engine.
"""
import json, re, time, pickle, urllib.request
from pathlib import Path
import numpy as np
import pandas as pd
import pipeline as p

OUT, CACHE = p.OUT, p.CACHE
UA = {"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/130 Safari/537.36"}

ETFS = {  # ticker: theme
 "XLK": "Tech (broad)", "XLF": "Financials", "XLV": "Healthcare", "XLE": "Energy",
 "XLI": "Industrials", "XLB": "Materials", "XLY": "Consumer Discretionary",
 "XLP": "Consumer Staples", "XLU": "Utilities", "XLRE": "Real Estate", "XLC": "Comm Services",
 "SMH": "Semiconductors", "AIQ": "AI", "BOTZ": "Robotics & AI", "XBI": "Biotech",
 "IBB": "Biotech (large)", "GDX": "Gold Miners", "GDXJ": "Junior Gold Miners",
 "SIL": "Silver Miners", "XME": "Metals & Mining", "COPX": "Copper Miners",
 "LIT": "Lithium & Battery", "URNM": "Uranium", "TAN": "Solar", "HACK": "Cybersecurity",
 "ARKK": "Innovation", "KRE": "Regional Banks", "XOP": "Oil & Gas E&P",
 "JETS": "Airlines", "FINX": "Fintech", "REMX": "Rare Earth", "ITA": "Aerospace & Defense",
 "XSD": "Semiconductors (equal-wt)", "XSW": "Software", "XPH": "Pharma",
 "XHE": "Healthcare Equipment", "XHB": "Homebuilders", "XRT": "Retail",
 "KBE": "Banks", "KIE": "Insurance", "XAR": "Aerospace & Defense (SPDR)",
 "OIH": "Oil Services", "BBH": "Biotech (VanEck)", "ESPO": "Gaming & eSports",
 "MOO": "Agribusiness", "SLX": "Steel",
}
ALL_SERIES = dict(ETFS); ALL_SERIES["SPY"] = "Market"

def fetch_etf_quotes():
    import akshare as ak
    cachef = CACHE / "etf_quotes.pkl"
    if cachef.exists(): return pickle.loads(cachef.read_bytes())
    data = {}
    for t in ALL_SERIES:
        try:
            raw = ak.stock_us_daily(symbol=t, adjust="qfq")
            # .values is essential: passing the Series with an explicit index
            # makes pandas ALIGN by label -> all-NaN (this silently broke the
            # first ETF fetch; in pipeline.py the same bug sent every stock
            # to the Nasdaq fallback, which is why those results still worked)
            d = pd.DataFrame({"Open": raw["open"].values, "High": raw["high"].values,
                              "Low": raw["low"].values, "Close": raw["close"].values,
                              "Volume": raw["volume"].values},
                             index=pd.to_datetime(raw["date"].values)).sort_index()
            d = d.dropna(subset=["Close"])
            d = d[d.index >= p.FETCH_START]
            d = p.add_indicators(d)
            d["trail20"] = d["Close"] / d["Close"].shift(20) - 1
            data[t] = d
            print(f"etf {t}: {len(d)} rows", flush=True)
        except Exception as e:
            print(f"etf {t}: FAIL {str(e)[:80]}", flush=True)
    cachef.write_bytes(pickle.dumps(data))
    return data

SSGA_ETFS = ["XLK", "XLF", "XLV", "XLE", "XLI", "XLB", "XLY", "XLP", "XLU", "XLRE", "XLC", "XBI", "XME", "XOP", "KRE",
             "XSD", "XSW", "XPH", "XHE", "XHB", "XRT", "KBE", "KIE", "XAR"]
VANECK_ETFS = ["SMH", "GDX", "GDXJ", "REMX", "OIH", "BBH", "ESPO", "MOO", "SLX"]
FULL_ETFS = set(SSGA_ETFS + VANECK_ETFS)   # full holdings from issuer files
# remaining ETFs: stockanalysis shows only the TOP 25 holdings -> partial

def _tickers_from_xlsx(raw_bytes):
    import io as _io
    df = pd.read_excel(_io.BytesIO(raw_bytes), header=None)
    hdr = None
    for i in range(min(10, len(df))):
        if str(df.iloc[i, 1]).strip() == "Ticker": hdr = i; break
    if hdr is None: return []
    syms = []
    for v in df.iloc[hdr + 1:, 1]:
        s = str(v).strip().replace(".", "-")  # pandas3: astype(str) keeps NaN as float - coerce per-value
        if re.fullmatch(r"[A-Z][A-Z\-]{0,5}", s) and s not in ("CASH", "USD", "OTHER"): syms.append(s)
    return sorted(set(syms))

def fetch_holdings():
    cachef = CACHE / "holdings.json"
    if cachef.exists(): return json.loads(cachef.read_text())
    out = {}
    for t in ETFS:
        out[t] = []
        try:
            if t in SSGA_ETFS:
                url = f"https://www.ssga.com/us/en/intermediary/etfs/library-content/products/fund-data/etfs/us/holdings-daily-us-en-{t.lower()}.xlsx"
                raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
                out[t] = _tickers_from_xlsx(raw)
            elif t in VANECK_ETFS:
                url = f"https://www.vaneck.com/us/en/etf/equity/{t.lower()}/holdings/download/xlsx/"
                raw = urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=40).read()
                out[t] = _tickers_from_xlsx(raw)
        except Exception as e:
            print(f"holdings {t}: full source failed ({str(e)[:60]}), trying partial", flush=True)
        if not out[t]:  # full source failed/empty -> top-25 partial fallback
            try:
                html = urllib.request.urlopen(urllib.request.Request(
                    f"https://stockanalysis.com/etf/{t.lower()}/holdings/", headers=UA), timeout=30).read().decode("utf-8", "ignore")
                syms = sorted(set(re.findall(r'\{no:\d+,s:"\$([A-Z.\-]+)"', html)))
                out[t] = [s.replace(".", "-") for s in syms]
                if t in FULL_ETFS: FULL_ETFS.discard(t)
            except Exception as e:
                out[t] = []; print(f"holdings {t}: FAIL {str(e)[:80]}", flush=True)
        print(f"holdings {t}: {len(out[t])} ({'full' if t in FULL_ETFS else 'top25-partial'})", flush=True)
        time.sleep(0.4)
    cachef.write_text(json.dumps(out))
    return out

def pos_of(idx, ts):
    i = idx.get_indexer([ts], method="pad")[0]
    if i < 0: return None
    if abs((idx[i] - ts).days) > 4: return None
    return i

def window_ret(d, ts, n=20):
    i = pos_of(d.index, ts)
    if i is None or i + n >= len(d): return None
    return float(d["Close"].iloc[i + n] / d["Close"].iloc[i] - 1)

def main():
    t0 = time.time()
    etfs = fetch_etf_quotes()
    holdings = fetch_holdings()
    kept, dropped = pickle.loads((CACHE / "features.pkl").read_bytes())
    kept = {t: p.label_events(d) for t, d in kept.items()}
    print(f"stocks kept={len(kept)}", flush=True)

    # ---- mapping: stock -> [etfs], primary = narrowest ----
    member = {}
    for etf, syms in holdings.items():
        for s in syms: member.setdefault(s, []).append(etf)
    primary = {}
    for s, lst in member.items():
        # prefer FULL-coverage ETFs (partial top-25 lists have artificially
        # low counts and would fake "narrowest"); among equals, fewest holdings
        primary[s] = min(lst, key=lambda e: (e not in FULL_ETFS, len(holdings[e])))
    map_rows = [{"ticker": s, "primary_etf": primary[s], "theme": ETFS[primary[s]],
                 "all_etfs": ",".join(sorted(lst)), "n_etfs": len(lst)}
                for s, lst in member.items() if s in kept]
    pd.DataFrame(map_rows).to_csv(OUT / "stock_etf_mapping.csv", index=False)
    mapped_tickers = {r["ticker"] for r in map_rows}
    print(f"mapped tickers: {len(mapped_tickers)}/{len(kept)}", flush=True)

    # ---- ETF year stats (same windows as stocks) ----
    rows = []
    for t, d in etfs.items():
        yr = d[d.index >= p.START]
        lab = p.label_events(d)
        yr_lab = lab[lab.index >= p.START]
        best_i = yr["fwd20"].idxmax() if len(yr) and yr["fwd20"].notna().any() else None
        rows.append({"etf": t, "theme": ALL_SERIES[t],
            "year_ret_pct": round(float(yr["Close"].iloc[-1] / yr["Close"].iloc[0] - 1) * 100, 1) if len(yr) else None,
            "best_20d_window_pct": round(float(yr["fwd20"].max()) * 100, 1) if len(yr) else None,
            "best_window_start": str(best_i.date()) if best_i is not None else None,
            "strict_explosions_+30/+20": int(yr_lab["onset"].sum()),
            "hot_windows_fwd20>=10pct_days": int((yr["fwd20"] >= 0.10).sum()),
            "n_holdings_mapped": len(holdings.get(t, []))})
    etf_stats = pd.DataFrame(rows).sort_values("hot_windows_fwd20>=10pct_days", ascending=False)
    etf_stats.to_csv(OUT / "etf_year_stats.csv", index=False)
    print(etf_stats.head(12).to_string(index=False), flush=True)

    # ---- align every explosion onset with its ETFs, identical window ----
    onset_rows = []
    for t, d in kept.items():
        for ts in d.index[d.onset & (d.index >= p.START)]:
            r = {"ticker": t, "onset": str(ts.date()), "stock_fwd20_pct": round(float(d.loc[ts, "fwd20"]) * 100, 1),
                 "primary_etf": primary.get(t), "theme": ETFS.get(primary.get(t), "")}
            pe = primary.get(t)
            if pe and pe in etfs:
                e = etfs[pe]; i = pos_of(e.index, ts)
                wr = window_ret(e, ts)
                r["etf_same_window_ret_pct"] = round(wr * 100, 1) if wr is not None else None
                r["etf_trail20_pct"] = round(float(e["trail20"].iloc[i]) * 100, 1) if i is not None and pd.notna(e["trail20"].iloc[i]) else None
            # best co-moving member ETF (same window)
            best_etf, best_ret = None, None
            for e_t in member.get(t, []):
                if e_t in etfs:
                    wr = window_ret(etfs[e_t], ts)
                    if wr is not None and (best_ret is None or wr > best_ret): best_etf, best_ret = e_t, wr
            r["best_member_etf"] = best_etf
            r["best_member_etf_window_ret_pct"] = round(best_ret * 100, 1) if best_ret is not None else None
            # SPY same window for reference
            spy_wr = window_ret(etfs["SPY"], ts) if "SPY" in etfs else None
            r["spy_same_window_ret_pct"] = round(spy_wr * 100, 1) if spy_wr is not None else None
            onset_rows.append(r)
    on = pd.DataFrame(onset_rows)
    def classify(r):
        v = r["etf_same_window_ret_pct"]
        if v is None or pd.isna(v): return "unmapped"
        if v >= 8: return "sector-driven"
        if v >= 3: return "sector-assisted"
        return "solo"
    on["class"] = on.apply(classify, axis=1)
    on.to_csv(OUT / "onset_sector_alignment.csv", index=False)
    print("\nOnset classification (primary ETF, identical 20d window):")
    print(on["class"].value_counts().to_string(), flush=True)

    # ---- hot sectors aggregation ----
    hot = on[on.primary_etf.notna()].groupby(["primary_etf", "theme"]).agg(
        onsets=("ticker", "size"), stocks=("ticker", "nunique"),
        median_etf_window_ret_pct=("etf_same_window_ret_pct", "median"),
        median_stock_fwd20_pct=("stock_fwd20_pct", "median"),
        sector_driven_share_pct=("class", lambda s: round((s == "sector-driven").mean() * 100, 1))).reset_index()
    hot = hot.sort_values("onsets", ascending=False)
    hot.to_csv(OUT / "hot_sectors.csv", index=False)
    print("\nHot sectors by onset count:"); print(hot.head(15).to_string(index=False), flush=True)
    # timing: onsets per theme per quarter
    on["quarter"] = pd.to_datetime(on["onset"]).dt.to_period("Q").astype(str)
    timing = on[on.primary_etf.notna()].pivot_table(index=["primary_etf", "theme"], columns="quarter",
                                                  values="ticker", aggfunc="size", fill_value=0)
    timing.to_csv(OUT / "hot_sector_timing.csv")
    print("\nTiming (top themes):"); print(timing.loc[hot.head(8)["primary_etf"]].to_string(), flush=True)

    # ---- joint signal test: survivor combo +/- ETF confirmation ----
    for t, d in kept.items():
        pe = primary.get(t)
        for col in ("etf_above_ma50", "etf_macd_bull", "etf_mom_pos", "etf_hot"):
            d[f"sig_{col}"] = False
        if pe and pe in etfs:
            e = etfs[pe]
            state = pd.DataFrame({
                "etf_above_ma50": (e["Close"] > e["ma50"]),
                "etf_macd_bull": (e["dif"] > e["dea"]),
                "etf_mom_pos": (e["trail20"] > 0),
                "etf_hot": (e["trail20"] >= 0.05) & (e["Close"] > e["ma50"])})
            state = state.reindex(d.index, method="ffill").fillna(False)
            for col in state.columns: d[f"sig_{col}"] = state[col].values
    # use the EXACT split of stage 2 so periods are identical
    split = pd.Timestamp(json.loads((OUT / "summary.json").read_text())["split_date"])
    print(f"\nsplit={split.date()}", flush=True)
    VARIANTS = {
        "stock_only (base)": ["macd_cross_up", "above_ma20"],
        "+ETF above MA50": ["macd_cross_up", "above_ma20", "etf_above_ma50"],
        "+ETF MACD bull": ["macd_cross_up", "above_ma20", "etf_macd_bull"],
        "+ETF momentum>0": ["macd_cross_up", "above_ma20", "etf_mom_pos"],
        "+ETF hot (trail20>=5% & >MA50)": ["macd_cross_up", "above_ma20", "etf_hot"],
    }
    jrows = []
    for vname, sigs in VARIANTS.items():
        for period, (a, b) in {"discovery": (p.START, split), "test": (split, p.END)}.items():
            tr, st = p.backtest(kept, sigs, a, b)
            # trigger-level precision: every fire in the period, cap ignored
            fires, booms = 0, 0
            for t, d in kept.items():
                sub = d[(d.index >= a) & (d.index < b)]
                if not len(sub): continue
                m = p.combo_mask(sub, sigs); fires += int(m.sum()); booms += int(sub.loc[m, "boom20"].sum())
            jrows.append({"variant": vname, "period": period, "triggers_all": fires,
                          "boom_rate_pct (precision)": round(booms / fires * 100, 2) if fires else None, **st})
            print(f"{vname} | {period}: {jrows[-1]}", flush=True)
    jdf = pd.DataFrame(jrows)
    jdf.to_csv(OUT / "joint_backtest.csv", index=False)
    summary = {"etfs_fetched": len(etfs), "mapped_tickers": len(mapped_tickers), "kept_tickers": len(kept),
               "onsets_total": int(len(on)), "onset_classes": on["class"].value_counts().to_dict(),
               "split": str(split.date()), "runtime_s": round(time.time() - t0)}
    (OUT / "stage3_summary.json").write_text(json.dumps(summary, indent=2, default=str))
    print(json.dumps(summary, indent=2, default=str), flush=True)
    print("STAGE3 DONE", flush=True)

if __name__ == "__main__":
    main()
