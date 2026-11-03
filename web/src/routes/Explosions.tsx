import { useMemo, useState } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useData } from '../lib/useData'
import { fmtInt, fmtPct, tone, type ExplosionRow } from '../lib/data'
import { DataTable } from '../components/DataTable'
import { HBar, Kpi, Loading, LoadError, Panel, SectionTitle, Tag } from '../components/ui'

export function ExplosionsPage() {
  const { data, isPending, error } = useData()
  const [minFwd, setMinFwd] = useState(20)

  const cols = useMemo<ColumnDef<ExplosionRow, any>[]>(
    () => [
      { accessorKey: 'ticker', header: 'Ticker', cell: ({ getValue }) => <span className="num font-semibold text-white">{String(getValue())}</span> },
      { accessorKey: 'onset', header: 'Onset date', cell: ({ getValue }) => <span className="num text-[#d1d4dc]">{String(getValue())}</span> },
      { accessorKey: 'price', header: 'Price at onset', cell: ({ getValue }) => <span className="num">${Number(getValue()).toFixed(2)}</span> },
      { accessorKey: 'fwd20_pct', header: 'Close at +20d', cell: ({ getValue }) => <span className={`num font-semibold ${tone(Number(getValue()))}`}>{fmtPct(Number(getValue()))}</span> },
      { accessorKey: 'fwd_max20_pct', header: 'Peak within 20d', cell: ({ getValue }) => <span className="num text-emerald-300">{fmtPct(Number(getValue()))}</span> },
    ],
    [],
  )

  if (isPending) return <Loading />
  if (error || !data) return <LoadError message={String(error)} />

  const rows = data.explosions.filter((e) => e.fwd20_pct >= minFwd)
  const byTicker = new Map<string, number>()
  for (const e of data.explosions) byTicker.set(e.ticker, (byTicker.get(e.ticker) ?? 0) + 1)
  const repeat = [...byTicker.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8)
  const maxRepeat = repeat[0]?.[1] ?? 1
  const byMonth = new Map<string, number>()
  for (const e of data.explosions) byMonth.set(e.onset.slice(0, 7), (byMonth.get(e.onset.slice(0, 7)) ?? 0) + 1)
  const months = [...byMonth.entries()].sort()
  const maxMonth = Math.max(...months.map((m) => m[1]))
  const median = [...data.explosions].sort((a, b) => a.fwd20_pct - b.fwd20_pct)[Math.floor(data.explosions.length / 2)]

  return (
    <div className="space-y-3">
      <div className="rise">
        <Tag>THE RAW MATERIAL</Tag>
        <h1 className="font-[family-name:var(--font-display)] mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
          {fmtInt(data.explosions.length)} explosions, on the record
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[#d1d4dc]">
          An onset = next-20d peak ≥ +30% <em>and</em> day-20 close ≥ +20%, with the prior 20 days quiet
          (≤ +10%), de-overlapped so one run counts once. Defined before any signal was looked at.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Total onsets" value={fmtInt(data.explosions.length)} sub={`across ${fmtInt(byTicker.size)} tickers`} accent delay={40} />
        <Kpi label="Median outcome" value={fmtPct(median.fwd20_pct)} sub="day-20 close after a typical onset" delay={90} />
        <Kpi label="Repeat offenders" value={fmtInt([...byTicker.values()].filter((v) => v >= 3).length)} sub="tickers with ≥3 separate onsets" delay={140} />
        <Kpi label="Busiest month" value={months.reduce((a, b) => (b[1] > a[1] ? b : a))[0]} sub={`${fmtInt(months.reduce((a, b) => (b[1] > a[1] ? b : a))[1])} onsets`} delay={190} />
      </div>

      <div className="grid gap-3 lg:grid-cols-5">
        <Panel delay={120} className="lg:col-span-3">
          <SectionTitle kicker="Cadence" title="Onsets per month" />
          <div className="flex h-36 items-end gap-1.5 pt-1">
            {months.map(([m, v]) => (
              <div key={m} className="group flex flex-1 flex-col items-center gap-2">
                <div className="num text-[10px] text-[#8b8e96] opacity-0 transition group-hover:opacity-100">{v}</div>
                <div
                  className="bar-grow-y w-full rounded-t-md bg-gradient-to-t from-[#089981]/80 to-[#26a69a]"
                  style={{ height: `${(v / maxMonth) * 120}px` }}
                />
                <div className="num text-[9px] whitespace-nowrap text-[#8b8e96]">{m.slice(2)}</div>
              </div>
            ))}
          </div>
        </Panel>
        <Panel delay={180} className="lg:col-span-2">
          <SectionTitle kicker="Serial exploders" title="Most onsets per ticker" />
          {repeat.map(([t, v]) => (
            <HBar key={t} label={t} value={v} max={maxRepeat} display={`${v}×`} labelWidth="w-20" />
          ))}
        </Panel>
      </div>

      <Panel delay={220}>
        <SectionTitle
          kicker="Browse"
          title="Every onset"
          right={
            <label className="flex items-center gap-3">
              <span className="num text-[11px] tracking-wider text-[#8b8e96] uppercase">Min +20d close ≥ {minFwd}%</span>
              <input type="range" min={20} max={150} step={5} value={minFwd} onChange={(e) => setMinFwd(Number(e.target.value))} className="w-36 accent-emerald-400" />
            </label>
          }
        />
        <DataTable data={rows} columns={cols} pageSize={15} searchable searchPlaceholder="Search ticker…" />
        <p className="mt-3 text-xs leading-relaxed text-[#8b8e96]">
          A few records show extreme percentages (low-priced names, corporate actions the split-adjustment
          may not fully clean). They're kept in — deleting outliers after the fact is how backtests learn to lie.
        </p>
      </Panel>
    </div>
  )
}
