import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useData } from '../lib/useData'
import { fmtPct, PORTFOLIO_KEY, tone, type ComboRow, type TradeRow } from '../lib/data'
import { DataTable } from '../components/DataTable'
import { DivBar, Kpi, Loading, LoadError, Panel, SectionTitle, Tag } from '../components/ui'

function ComboSection({
  title,
  kicker,
  rows,
  highlight,
}: {
  title: string
  kicker: string
  rows: ComboRow[]
  highlight?: string
}) {
  const cols = useMemo<ColumnDef<ComboRow, any>[]>(
    () => [
      {
        accessorKey: 'combo',
        header: 'Combo',
        cell: ({ row, getValue }) => (
          <span className="num font-medium text-white">
            {String(getValue())}
            {row.original.combo === highlight && <span className="ml-2 text-emerald-300">★ survivor</span>}
          </span>
        ),
      },
      { accessorKey: 'trades', header: 'Trades', cell: ({ getValue }) => <span className="num">{String(getValue())}</span> },
      { accessorKey: 'win_rate_pct', header: 'Win', cell: ({ getValue }) => <span className="num">{Number(getValue()).toFixed(1)}%</span> },
      { accessorKey: 'avg_ret_pct', header: 'Avg / trade', cell: ({ getValue }) => <span className={`num font-semibold ${tone(Number(getValue()))}`}>{fmtPct(Number(getValue()), 2)}</span> },
      { accessorKey: 'median_ret_pct', header: 'Median', cell: ({ getValue }) => <span className={`num ${tone(Number(getValue()))}`}>{fmtPct(Number(getValue()), 2)}</span> },
      { accessorKey: 'best_pct', header: 'Best', cell: ({ getValue }) => <span className="num text-emerald-300">{fmtPct(Number(getValue()))}</span> },
      { accessorKey: 'worst_pct', header: 'Worst', cell: ({ getValue }) => <span className="num text-rose-300">{fmtPct(Number(getValue()))}</span> },
      { accessorKey: PORTFOLIO_KEY, header: 'Portfolio ≈', cell: ({ getValue }) => <span className={`num font-semibold ${tone(Number(getValue()))}`}>{fmtPct(Number(getValue()))}</span> },
    ],
    [highlight],
  )
  return (
    <Panel>
      <SectionTitle kicker={kicker} title={title} />
      <DataTable data={rows} columns={cols} pageSize={15} />
    </Panel>
  )
}

export function CombosPage() {
  const { data, isPending, error } = useData()

  const tradeCols = useMemo<ColumnDef<TradeRow, any>[]>(
    () => [
      { accessorKey: 'ticker', header: 'Ticker', cell: ({ getValue }) => <span className="num font-semibold text-white">{String(getValue())}</span> },
      { accessorKey: 'signal_date', header: 'Signal', cell: ({ getValue }) => <span className="num text-[#aebfca]">{String(getValue())}</span> },
      { accessorKey: 'entry_date', header: 'Entry', cell: ({ getValue }) => <span className="num text-[#aebfca]">{String(getValue())}</span> },
      { accessorKey: 'exit_date', header: 'Exit', cell: ({ getValue }) => <span className="num text-[#aebfca]">{String(getValue())}</span> },
      { accessorKey: 'entry', header: 'Entry $', cell: ({ getValue }) => <span className="num">${Number(getValue()).toFixed(2)}</span> },
      { accessorKey: 'exit', header: 'Exit $', cell: ({ getValue }) => <span className="num">${Number(getValue()).toFixed(2)}</span> },
      { accessorKey: 'ret_pct', header: 'Return', cell: ({ getValue }) => <span className={`num font-semibold ${tone(Number(getValue()))}`}>{fmtPct(Number(getValue()), 2)}</span> },
    ],
    [],
  )

  if (isPending) return <Loading />
  if (error || !data) return <LoadError message={String(error)} />

  // paired discovery vs test avg return per combo
  const testMap = Object.fromEntries(data.combosTest.map((c) => [c.combo, c]))
  const paired = data.combosDiscovery
    .map((d) => ({ combo: d.combo, disc: d.avg_ret_pct, test: testMap[d.combo]?.avg_ret_pct ?? 0 }))
    .sort((a, b) => b.test - a.test)

  const survivor = testMap['macd_cross+above_ma20']

  return (
    <div className="space-y-5">
      <div className="rise pt-2">
        <Tag>BACKTEST · 15 PRE-DEFINED COMBOS</Tag>
        <h1 className="font-[family-name:var(--font-display)] mt-3 text-3xl font-bold tracking-tight text-white sm:text-4xl">
          Ranked on discovery. Judged on test.
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-relaxed text-[#aebfca]">
          Signal at close T → buy next open → sell at close T+21, 0.2% cost per side, max 10 concurrent
          positions, equal weight. The split at {data.summary.split_date} was locked before any combo ran.
          Every combo's test result is published — including the embarrassing ones.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Survivor · test avg" value={fmtPct(survivor.avg_ret_pct, 2)} sub="macd_cross + above_ma20" accent delay={40} />
        <Kpi label="Survivor · win rate" value={`${survivor.win_rate_pct.toFixed(1)}%`} sub={`${survivor.trades} test trades`} delay={90} />
        <Kpi label="SPY · same window" value={fmtPct(data.summary.baseline_test.spy_test_ret_pct, 2)} sub="buy & hold benchmark" delay={140} />
        <Kpi label="Combos that beat SPY" value={`${data.combosTest.filter((c) => c[PORTFOLIO_KEY] > data.summary.baseline_test.spy_test_ret_pct).length} / 15`} sub="on portfolio return in test" delay={190} />
      </div>

      <Panel delay={120}>
        <SectionTitle kicker="Discovery → test" title="Avg return per trade, both periods" right={<Tag color="fog">SORTED BY TEST</Tag>} />
        <div className="grid gap-x-10 lg:grid-cols-2">
          <div>
            <div className="num mb-1 text-[10px] tracking-[0.2em] text-[#8fa3b0] uppercase">Discovery (in-sample)</div>
            {paired.map((p) => (
              <DivBar key={p.combo} label={p.combo} value={p.disc} maxAbs={7} />
            ))}
          </div>
          <div>
            <div className="num mb-1 text-[10px] tracking-[0.2em] text-emerald-300/80 uppercase">Test (held-out)</div>
            {paired.map((p) => (
              <DivBar key={p.combo} label={p.combo} value={p.test} maxAbs={7} />
            ))}
          </div>
        </div>
        <p className="mt-4 text-xs leading-relaxed text-[#8fa3b0]">
          Watch the left column's champion (full_trend+hist_rising, +6.45%) fall to last on the right
          (−4.04%). In-sample rank is almost anti-information; the survivor is the one that was merely
          good in both.
        </p>
      </Panel>

      <ComboSection title="Test period — the verdict" kicker="Held-out · last 40% of the year" rows={[...data.combosTest].sort((a, b) => b.avg_ret_pct - a.avg_ret_pct)} highlight="macd_cross+above_ma20" />
      <ComboSection title="Discovery period — where the ranking came from" kicker="In-sample · first 60% of the year" rows={[...data.combosDiscovery].sort((a, b) => b.avg_ret_pct - a.avg_ret_pct)} highlight="macd_cross+above_ma20" />

      <Panel delay={120}>
        <SectionTitle kicker="Audit trail" title="The survivor's actual test trades" right={<Tag>{data.winnerTrades.length} TRADES</Tag>} />
        <DataTable data={data.winnerTrades} columns={tradeCols} pageSize={10} searchable searchPlaceholder="Filter tickers…" />
        <p className="mt-3 text-xs leading-relaxed text-[#8fa3b0]">
          Heads-up: all combos saturated the 10-position cap (80 discovery / 40 test trades), so which
          simultaneous signals got a slot is partly first-come order — treat portfolio figures as
          approximate, per-trade expectancy is the sturdier number.
        </p>
      </Panel>
    </div>
  )
}
