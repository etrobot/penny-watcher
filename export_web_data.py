#!/usr/bin/env python3
"""
Export the Python analysis outputs (output/*.csv, *.json) into a single
JSON file the TanStack web app consumes: web/public/data.json

Architecture: Python = analysis layer (fetch, signals, backtest, sectors).
Web (web/, TanStack) = presentation layer only. It never recomputes a
signal; it renders exactly what this exporter writes.

Usage:  python3 export_web_data.py
"""
import csv
import json
from pathlib import Path

ROOT = Path(__file__).parent
OUT = ROOT / "output"
DEST = ROOT / "web" / "public" / "data.json"


def read_csv(name):
    with open(OUT / name, newline="", encoding="utf-8") as f:
        rows = list(csv.DictReader(f))
    # coerce numeric-looking values to float/int so the UI gets real numbers
    for row in rows:
        for k, v in list(row.items()):
            if v is None or v == "":
                continue
            try:
                if "." in v:
                    row[k] = float(v)
                else:
                    row[k] = int(v)
            except ValueError:
                pass
    return rows


def main():
    data = {
        "summary": json.loads((OUT / "summary.json").read_text()),
        "stage3": json.loads((OUT / "stage3_summary.json").read_text()),
        "signals": read_csv("signal_study_discovery.csv"),
        "preExplosion": read_csv("signal_prevalence_pre_explosion.csv"),
        "combosDiscovery": read_csv("combo_discovery.csv"),
        "combosTest": read_csv("combo_test.csv"),
        "joint": read_csv("joint_backtest.csv"),
        "jointControl": read_csv("joint_control.csv"),
        "hotSectors": read_csv("hot_sectors.csv"),
        "sectorTiming": read_csv("hot_sector_timing.csv"),
        "etfStats": read_csv("etf_year_stats.csv"),
        "explosions": read_csv("explosions.csv"),
        "winnerTrades": read_csv("winner_test_trades.csv"),
        "bestWindows": read_csv("best_windows.csv"),
    }
    DEST.parent.mkdir(parents=True, exist_ok=True)
    DEST.write_text(json.dumps(data, separators=(",", ":")))
    size_kb = DEST.stat().st_size // 1024
    print(f"wrote {DEST} ({size_kb} KB)")
    for k, v in data.items():
        if isinstance(v, list):
            print(f"  {k}: {len(v)} rows")


if __name__ == "__main__":
    main()
