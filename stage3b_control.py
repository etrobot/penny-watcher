#!/usr/bin/env python3
"""Control for stage 3's joint test: the ETF-confirmed variants can only trade
MAPPED stocks (1,388 of 3,259). Run the BASE combo restricted to that same
mapped universe, so 'confirmation hurts' is separated from 'mapped universe
(large/mid caps) just moves less'. Also: base-combo precision on mapped vs
unmapped triggers."""
import json, pickle
import pandas as pd
import pipeline as p
import stage3_sectors as s3

OUT = p.OUT
kept, _ = pickle.loads((p.CACHE / "features.pkl").read_bytes())
kept = {t: p.label_events(d) for t, d in kept.items()}
holdings = json.loads((p.CACHE / "holdings.json").read_text())
member = {}
for etf, syms in holdings.items():
    for s in syms: member.setdefault(s, []).append(etf)
mapped = {t for t in kept if t in member}
split = pd.Timestamp(json.loads((OUT / "summary.json").read_text())["split_date"])
BASE = ["macd_cross_up", "above_ma20"]

rows = []
subsets = {"ALL stocks (stage2 base)": kept,
           "MAPPED only (control)": {t: kept[t] for t in mapped},
           "UNMAPPED only": {t: kept[t] for t in kept if t not in mapped}}
for name, sub in subsets.items():
    for period, (a, b) in {"discovery": (p.START, split), "test": (split, p.END)}.items():
        tr, st = p.backtest(sub, BASE, a, b)
        fires, booms = 0, 0
        for t, d in sub.items():
            s = d[(d.index >= a) & (d.index < b)]
            if not len(s): continue
            m = p.combo_mask(s, BASE); fires += int(m.sum()); booms += int(s.loc[m, "boom20"].sum())
        rows.append({"universe": name, "period": period, "triggers_all": fires,
                     "boom_rate_pct (precision)": round(booms / fires * 100, 2) if fires else None, **st})
        print(rows[-1], flush=True)
pd.DataFrame(rows).to_csv(OUT / "joint_control.csv", index=False)
print("CONTROL DONE")
