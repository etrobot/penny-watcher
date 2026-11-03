import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useData } from '../lib/useData'
import { fmtInt, fmtPct, PRECISION_KEY, tone, type EtfRow, type SectorRow } from '../lib/data'
import { DataTable } from '../components/DataTable'
import { HBar, Kpi, Loading, LoadError, Panel, SectionTitle, Tag } from '../components/ui'

const QUARTERS = ['2025Q4', '2026Q1', '2026Q2', '2026Q3', '2026Q4'] as const

function heatColor(v: number) {
  // background alpha is set inline; this only picks the text tone
  return v === 0 ? 'bg-white/[0.03] text-[#4c525e]' : 'text-white'
}

export function SectorsPage() {
  const { data, isPending, error } = useData()

  const etfCols = useMemo<ColumnDef<EtfRow, any>[]>(
    () => [
      { accessorKey: 'etf', header: 'ETF', cell: ({ getValue }) => <span className="num font-semibold text-white">{String(getValue())}</span> },
      { accessorKey: 'theme', header: 'Theme', cell: ({ getValue }) => <span className="text-[#d1d4dc]">{String(getValue())}</span> },
      { accessorKey: 'year_ret_pct', header: 'Year return', cell: ({ getValue }) => <span className={`num font-semibold ${tone(Number(getValue()))}`}>{fmtPct(Number(getValue()))}</span> },
      { accessorKey: 'best_20d_window_pct', header: 'Best 20d window', cell: ({ getValue }) => <span className="num text-emerald-300">{fmtPct(Number(getValue()))}</span> },
      { accessorKey: 'best_window_start', header: 'Window start', cell: ({ getValue }) => <span className="num text-[#d1d4dc]">{String(getValue())}</span> },
      { accessorKey: 'hot_windows_fwd20>=10pct_days', header: 'Hot days', cell: ({ getValue }) => <span className="num">{String(getValue())}</span> },
      { accessorKey: 'n_holdings_mapped', header: 'Holdings mapped', cell: ({ getValue }) => <span className="num">{String(getValue())}</span> },
    ],
    [],
  )

  const sectorCols = useMemo<ColumnDef<SectorRow, any>[]>(
    () => [
      { accessorKey: 'primary_etf', header: 'ETF', cell: ({ getValue }) => <span className="num font-semibold text-white">{String(getValue())}</span> },
      { accessorKey: 'theme', header: 'Theme', cell: ({ getValue }) => <span className="text-[#d1d4dc]">{String(getValue())}</span> },
      { accessorKey: 'onsets', header: 'Onsets', cell: ({ getValue }) => <span className="num">{fmtInt(Number(getValue()))}</span> },
      { accessorKey: 'stocks', header: 'Stocks', cell: ({ getValue }) => <span className="num">{String(getValue())}</span> },
      { accessorKey: 'median_etf_window_ret_pct', header: 'Median ETF window', cell: ({ getValue }) => <span className={`num ${tone(Number(getValue()))}`}>{fmtPct(Number(getValue()))}</span> },
      { accessorKey: 'median_stock_fwd20_pct', header: 'Median stock fwd20', cell: ({ getValue }) => <span className="num text-emerald-300">{fmtPct(Number(getValue()))}</span> },
      { accessorKey: 'sector_driven_share_pct', header: 'Sector-driven', cell: ({ getValue }) => <span className="num font-semibold text-white">{Number(getValue()).toFixed(1)}%</span> },
    ],
    [],
  )

  if (isPending) return <Loading />
  if (error || !data) return <LoadError message={String(error)} />

  const s3 = data.stage3
  const topSectors = [...data.hotSectors].slice(0, 10)
  const maxOnsets = Math.max(...topSectors.map((x) => x.onsets))
  const hotEtfs = [...data.etfStats].sort((a, b) => b['hot_windows_fwd20>=10pct_days'] - a['hot_windows_fwd20>=10pct_days']).slice(0, 8)
  const maxHot = Math.max(...hotEtfs.map((x) => x['hot_windows_fwd20>=10pct_days']))
  const timing = [...data.sectorTiming]
    .map((r) => ({ ...r, total: QUARTERS.reduce((a, q) => a + Number(r[q] ?? 0), 0) }))
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total)
    .slice(0, 14)
  const maxCell = Math.max(...timing.flatMap((r) => QUARTERS.map((q) => Number(r[q] ?? 0))))

  const jointTest = data.joint.filter((j) => j.period === 'test')
  const controlTest = data.jointControl.filter((c) => c.period === 'test')

  return (
    <div className="space-y-3">
      <div className="rise">
        <Tag color="sky">STAGE 3 · SECTORS & JOINT SIGNALS</Tag>
        <h1 className="font-[family-name:var(--font-display)] mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
          Explosions are sector events — mostly
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[#d1d4dc]">
          47 sector/theme ETFs, same source, <strong className="text-white">same time windows</strong> as the stocks.
          Each stock mapped to its primary ETF from actual holdings (full issuer files for 33 ETFs).
          Every onset classified by what its ETF did over the identical [onset, onset+20] window.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="ETFs tracked" value={String(s3.etfs_fetched)} sub="sector + theme funds incl. SPY" delay={40} />
        <Kpi label="Stocks mapped" value={`${fmtInt(s3.mapped_tickers)} / ${fmtInt(s3.kept_tickers)}`} sub="43% coverage — rest are mostly small caps" delay={90} />
        <Kpi label="Sector-driven onsets" value={fmtInt(s3.onset_classes['sector-driven'] ?? 0)} sub="ETF ≥ +8% in the same 20d window" accent delay={140} />
        <Kpi label="Solo onsets" value={fmtInt(s3.onset_classes['solo'] ?? 0)} sub="ETF < +3% — the stock moved alone" delay={190} />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel delay={100}>
          <SectionTitle kicker="Explosion factories" title="Onsets by primary ETF" />
          {topSectors.map((r) => (
            <HBar key={r.primary_etf} label={`${r.primary_etf} · ${r.theme}`} value={r.onsets} max={maxOnsets} display={fmtInt(r.onsets)} color="bg-sky-400" labelWidth="w-36 sm:w-44" />
          ))}
          <p className="mt-3 text-xs leading-relaxed text-[#8b8e96]">
            Biotech (XBI) is the year's explosion factory: 319 onsets across 119 stocks. Software (XSW)
            is second, peaking in 2026 Q2–Q3.
          </p>
        </Panel>

        <Panel delay={160}>
          <SectionTitle kicker="Hottest ETFs" title="Hot-window days (fwd20 ≥ +10%)" />
          {hotEtfs.map((r) => (
            <HBar key={r.etf} label={`${r.etf} · ${r.theme}`} value={r['hot_windows_fwd20>=10pct_days']} max={maxHot} display={`${r['hot_windows_fwd20>=10pct_days']}d`} color="bg-amber-400" labelWidth="w-36 sm:w-44" />
          ))}
          <p className="mt-3 text-xs leading-relaxed text-[#8b8e96]">
            The metals complex owned the year: copper, silver and gold miners top the hot-day table,
            and their best windows all ignited around 2026-07-28. Biggest year returns: XLE energy
            +58.1%, XOP oil & gas +55.4%.
          </p>
        </Panel>
      </div>

      <Panel delay={200}>
        <SectionTitle kicker="Same-window alignment" title="Every sector that hosted explosions" />
        <DataTable data={[...data.hotSectors].sort((a, b) => b.onsets - a.onsets)} columns={sectorCols} pageSize={12} searchable searchPlaceholder="Filter sectors…" />
        <p className="mt-3 text-xs leading-relaxed text-[#8b8e96]">
          Purest sector moves: when GDX gold-miner stocks exploded, the ETF itself rose a median +23.6%
          in the same window and 96.0% of those onsets were sector-driven. If the whole sector is
          mooning, stock-picking is decoration.
        </p>
      </Panel>

      <Panel delay={240}>
        <SectionTitle kicker="Timing heatmap" title="Onsets per quarter" right={<Tag color="fog">TOP 14 SECTORS</Tag>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-sm">
            <thead>
              <tr>
                <th className="num px-2 py-2 text-left text-[11px] tracking-[0.12em] text-[#8b8e96] uppercase">Sector</th>
                {QUARTERS.map((q) => (
                  <th key={q} className="num px-2 py-2 text-center text-[11px] tracking-[0.12em] text-[#8b8e96] uppercase">{q}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {timing.map((r) => (
                <tr key={r.primary_etf}>
                  <td className="num px-2 py-1.5 whitespace-nowrap text-xs text-white">
                    {r.primary_etf} <span className="text-[#8b8e96]">· {r.theme}</span>
                  </td>
                  {QUARTERS.map((q) => {
                    const v = Number(r[q] ?? 0)
                    return (
                      <td key={q} className="px-1 py-1">
                        <div
                          className={`num rounded py-1 text-center text-xs ${heatColor(v)}`}
                          style={{ background: v === 0 ? undefined : `rgb(44 232 155 / ${0.1 + (v / maxCell) * 0.65})` }}
                        >
                          {v || '·'}
                        </div>
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-[#8b8e96]">Heat rotates: miners front-run Q4→Q1, software takes Q2→Q3. Nothing stays hot all year.</p>
      </Panel>

      {/* JOINT VERDICT */}
      <Panel delay={280} className="border-amber-300/20">
        <SectionTitle kicker="The joint-signal test" title="Stock signal + ETF confirmation = ?" right={<Tag color="amber">TEST PERIOD</Tag>} />
        <div className="overflow-x-auto">
          <table className="w-full min-w-[620px] border-collapse text-sm">
            <thead>
              <tr className="border-b border-white/10">
                {['Variant', 'Triggers', 'Precision', 'Win', 'Avg / trade'].map((h) => (
                  <th key={h} className="num px-3 py-2 text-left text-[11px] tracking-[0.12em] text-[#8b8e96] uppercase">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {jointTest.map((j) => (
                <tr key={j.variant} className="border-b border-white/[0.04]">
                  <td className="num px-3 py-2 font-medium text-white">{j.variant}</td>
                  <td className="num px-3 py-2">{fmtInt(j.triggers_all)}</td>
                  <td className="num px-3 py-2">{j[PRECISION_KEY].toFixed(2)}%</td>
                  <td className="num px-3 py-2">{j.win_rate_pct.toFixed(1)}%</td>
                  <td className={`num px-3 py-2 font-semibold ${tone(j.avg_ret_pct)}`}>{fmtPct(j.avg_ret_pct, 2)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          {controlTest.map((c) => (
            <div key={c.universe} className="rounded-xl border border-white/[0.07] bg-black/30 p-3">
              <div className="num text-[10px] tracking-[0.18em] text-[#8b8e96] uppercase">{c.universe}</div>
              <div className={`num mt-1 text-xl font-bold ${tone(c.avg_ret_pct)}`}>{fmtPct(c.avg_ret_pct, 2)}<span className="text-xs font-medium text-[#8b8e96]"> /trade</span></div>
              <div className="num mt-0.5 text-[11px] text-[#8b8e96]">precision {c[PRECISION_KEY].toFixed(2)}% · {fmtInt(c.triggers_all)} triggers</div>
            </div>
          ))}
        </div>
        <p className="mt-2.5 text-[13px] leading-relaxed text-[#d7e4ea]">
          The control is the story: restrict the base combo to mapped stocks only and its test edge
          dies (+0.19%/trade) — the edge lived in unmapped small caps. Within the mapped universe,
          ETF confirmation changes precision by <span className="num text-white">≤0.6 pts</span> in either
          direction. <strong className="text-amber-200">Verdict: sector confirmation adds nothing at daily MA/MACD resolution.</strong>
        </p>
      </Panel>

      <Panel delay={320}>
        <SectionTitle kicker="ETF scoreboard" title="All 47 ETFs — year in review" />
        <DataTable data={[...data.etfStats].sort((a, b) => b.year_ret_pct - a.year_ret_pct)} columns={etfCols} pageSize={12} searchable searchPlaceholder="Filter ETFs…" />
      </Panel>
    </div>
  )
}
