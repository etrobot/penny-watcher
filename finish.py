#!/usr/bin/env python3
"""Stage 2: load the durable features.pkl (fetch already done) and run
labeling -> signal study -> combo ranking -> held-out backtest -> summary.
Each output is written as soon as it is computed, so a runtime restart
mid-stage loses minutes, not the whole run. Reuses pipeline.py's logic."""
import json, time, pickle, sys
import numpy as np
import pandas as pd
import pipeline as p

t0 = time.time()
OUT, CACHE = p.OUT, p.CACHE
kept, dropped = pickle.loads((CACHE / "features.pkl").read_bytes())
print(f"loaded {len(kept)} tickers, dropped={dropped}", flush=True)
kept = {t: p.label_events(d) for t, d in kept.items()}
signals = [c[4:] for c in next(iter(kept.values())).columns if c.startswith("sig_")]
print(f"{len(signals)} signals", flush=True)

frames = []
for t, d in kept.items():
    yr = d[d.index >= p.START].copy(); yr["ticker"] = t; yr["date"] = yr.index; frames.append(yr)
big = pd.concat(frames, ignore_index=True)
days = sorted(big["date"].unique()); split = pd.Timestamp(days[int(len(days) * 0.6)])
print(f"stock-days={len(big)} split={split.date()}", flush=True)

# ---- signal study on DISCOVERY (every trigger across all stock-days) ----
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
study_df = pd.DataFrame(study).sort_values("boom_lift", ascending=False)
study_df.to_csv(OUT / "signal_study_discovery.csv", index=False)
print("signal study written", flush=True)

pre_days = disc[disc["is_pre"]]; base_days = disc[~disc["is_pre"] & ~disc["in_boom"]]
prev = []
for sig in signals:
    a = pre_days[f"sig_{sig}"].mean(); b = base_days[f"sig_{sig}"].mean()
    prev.append({"signal": sig, "pct_of_pre_explode_days": round(a*100, 1),
                 "pct_of_normal_days": round(b*100, 1), "lift": round(a / b, 2) if b > 0 else None})
prev_df = pd.DataFrame(prev).sort_values("lift", ascending=False)
prev_df.to_csv(OUT / "signal_prevalence_pre_explosion.csv", index=False)
print("prevalence written", flush=True)

# ---- combos: rank on discovery ----
combo_rows = []
for name, sigs in p.COMBOS.items():
    tr, st = p.backtest(kept, sigs, p.START, split)
    combo_rows.append({"combo": name, "signals": "+".join(sigs), "period": "discovery", **st})
    print(f"discovery {name}: {st}", flush=True)
combo_df = pd.DataFrame(combo_rows).sort_values("avg_ret_pct", ascending=False)
combo_df.to_csv(OUT / "combo_discovery.csv", index=False)
eligible = combo_df[combo_df["trades"] >= 20]
winner = eligible.iloc[0]["combo"] if len(eligible) else combo_df.iloc[0]["combo"]
print(f"Discovery winner: {winner}", flush=True)

# ---- test period: winner + all combos for transparency ----
test_rows, winner_trades = [], None
for name, sigs in p.COMBOS.items():
    tr, st = p.backtest(kept, sigs, split, p.END)
    test_rows.append({"combo": name, "signals": "+".join(sigs), "period": "test", **st})
    if name == winner: winner_trades = tr
    print(f"test {name}: {st}", flush=True)
test_df = pd.DataFrame(test_rows).sort_values("avg_ret_pct", ascending=False)
test_df.to_csv(OUT / "combo_test.csv", index=False)
if winner_trades is not None: winner_trades.to_csv(OUT / "winner_test_trades.csv", index=False)

# ---- baselines + summary ----
try:
    import akshare as ak
    spy_df = ak.stock_us_daily(symbol="SPY", adjust="qfq")
    spy_df = spy_df[(spy_df["date"] >= split) & (spy_df["date"] <= p.END)]
    spy_ret = float(spy_df["close"].iloc[-1] / spy_df["close"].iloc[0] - 1) * 100
except Exception: spy_ret = None
test_big = big[big["date"] >= split]
on_df = pd.read_csv(OUT / "explosions.csv")
baseline = {"spy_test_ret_pct": round(spy_ret, 2) if spy_ret is not None else None,
            "unconditional_fwd20_mean_pct": round(test_big["fwd20"].mean()*100, 2),
            "unconditional_boom20_rate_pct": round(test_big["boom20"].mean()*100, 2),
            "discovery_base_pre_rate_pct": round(base_pre*100, 2),
            "discovery_base_boom_rate_pct": round(base_boom*100, 2)}
summary = {"analysis_year": f"{p.START.date()}..{p.END.date()}", "universe_tickers": 7628,
           "tradable_tickers": len(kept), "dropped": dropped, "stock_days": int(len(big)),
           "split_date": str(split.date()), "explosions_in_year": int(len(on_df)),
           "discovery_winner": winner, "baseline_test": baseline,
           "winner_test_stats": test_df[test_df.combo == winner].to_dict("records"),
           "runtime_s_stage2": round(time.time() - t0)}
(OUT / "summary.json").write_text(json.dumps(summary, indent=2, default=str))
print(json.dumps(summary, indent=2, default=str), flush=True)
print("\nTOP signals by boom lift (discovery):"); print(study_df.head(15).to_string(index=False))
print("\nTOP signals in pre-explosion windows:"); print(prev_df.head(15).to_string(index=False))
print("\nCombos DISCOVERY:"); print(combo_df.to_string(index=False))
print("\nCombos TEST:"); print(test_df.to_string(index=False))
print("STAGE2 DONE", flush=True)
