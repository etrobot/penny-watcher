import { useMemo } from 'react'
import type { ColumnDef } from '@tanstack/react-table'
import { useData } from '../lib/useData'
import { fmtInt, fmtPct, tone, type PreRow, type SignalRow } from '../lib/data'
import { DataTable } from '../components/DataTable'
import { HBar, Loading, LoadError, Panel, SectionTitle, Tag } from '../components/ui'

export function SignalsPage() {
  const { data, isPending, error } = useData()

  const signalCols = useMemo<ColumnDef<SignalRow, any>[]>(
    () => [
      { accessorKey: 'signal', header: 'Signal', cell: ({ getValue }) => <span className="num font-medium text-white">{String(getValue())}</span> },
      { accessorKey: 'fires', header: 'Fires', cell: ({ getValue }) => <span className="num">{fmtInt(Number(getValue()))}</span> },
      { accessorKey: 'boom20_rate_pct', header: 'Boom rate', cell: ({ getValue }) => <span className="num">{Number(getValue()).toFixed(2)}%</span> },
      {
        accessorKey: 'boom_lift',
        header: 'Boom lift',
        cell: ({ getValue }) => {
          const v = Number(getValue())
          return <span className={`num font-semibold ${v >= 1.2 ? 'text-emerald-300' : v < 0.8 ? 'text-rose-300' : 'text-white'}`}>{v.toFixed(2)}×</span>
        },
      },
      { accessorKey: 'pre_explode_rate_pct', header: 'Pre-explode rate', cell: ({ getValue }) => <span className="num">{Number(getValue()).toFixed(2)}%</span> },
      { accessorKey: 'fwd20_mean_pct', header: 'Fwd 20d mean', cell: ({ getValue }) => <span className={`num ${tone(Number(getValue()))}`}>{fmtPct(Number(getValue()), 2)}</span> },
      { accessorKey: 'fwd20_win_pct', header: 'Fwd win', cell: ({ getValue }) => <span className="num">{Number(getValue()).toFixed(1)}%</span> },
    ],
    [],
  )

  const preCols = useMemo<ColumnDef<PreRow, any>[]>(
    () => [
      { accessorKey: 'signal', header: 'Signal', cell: ({ getValue }) => <span className="num font-medium text-white">{String(getValue())}</span> },
      { accessorKey: 'pct_of_pre_explode_days', header: '% of pre-explosion days', cell: ({ getValue }) => <span className="num">{Number(getValue()).toFixed(1)}%</span> },
      { accessorKey: 'pct_of_normal_days', header: '% of normal days', cell: ({ getValue }) => <span className="num">{Number(getValue()).toFixed(1)}%</span> },
      { accessorKey: 'lift', header: 'Prevalence lift', cell: ({ getValue }) => <span className={`num font-semibold ${Number(getValue()) >= 1.2 ? 'text-emerald-300' : 'text-white'}`}>{Number(getValue()).toFixed(2)}×</span> },
    ],
    [],
  )

  if (isPending) return <Loading />
  if (error || !data) return <LoadError message={String(error)} />

  const sorted = [...data.signals].sort((a, b) => b.boom_lift - a.boom_lift)
  const top = sorted.slice(0, 10)
  const bottom = [...sorted].reverse().slice(0, 5)
  const pre = [...data.preExplosion].sort((a, b) => b.lift - a.lift).slice(0, 8)
  const maxPre = Math.max(...pre.map((x) => x.lift))

  return (
    <div className="space-y-3">
      <div className="rise">
        <Tag>SIGNAL STUDY · DISCOVERY PERIOD ONLY</Tag>
        <h1 className="font-[family-name:var(--font-display)] mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
          43 signals, judged by precision — not by winners
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[#d1d4dc]">
          Every signal was applied to <strong className="text-white">every stock-day</strong>. Lift compares its
          explosion rate against the 5.67% base rate, so a signal that fires on a thousand losers for every
          winner gets exposed. Signals computed at close T, no lookahead.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel delay={80}>
          <SectionTitle kicker="Boom lift" title="Top 10 predictors" />
          {top.map((r) => (
            <HBar key={r.signal} label={r.signal} value={r.boom_lift} max={top[0].boom_lift} display={`${r.boom_lift.toFixed(2)}×`} />
          ))}
          <p className="mt-3 text-xs leading-relaxed text-[#8b8e96]">
            extended_ma20 means "already up a lot". Everything else classic — MACD crosses, golden crosses,
            full MA stacks — sits at ≈1.0×, i.e. no better than chance at predicting a boom.
          </p>
        </Panel>
        <Panel delay={140}>
          <SectionTitle kicker="Pre-explosion window" title="What the 10 days before look like" />
          {pre.map((r) => (
            <HBar key={r.signal} label={r.signal} value={r.lift} max={maxPre} display={`${r.lift.toFixed(2)}×`} color="bg-sky-400" />
          ))}
          <p className="mt-3 text-xs leading-relaxed text-[#8b8e96]">
            Prevalence in the 10 days before an onset vs normal days. The strongest tell is a volume
            dry-up (1.42×) — real, but far too weak to trade alone.
          </p>
          <div className="mt-4 rounded-xl border border-rose-300/20 bg-rose-300/[0.06] p-3 text-xs leading-relaxed text-rose-100">
            <span className="num font-semibold tracking-wider">COIL HYPOTHESIS: DEAD.</span> Tight coils
            (ma_coil_3pct, lift 0.28×) and tight 10-day ranges (0.16×) explode <em>less</em> than average.
            The spring everyone draws on charts isn't in this data.
          </div>
        </Panel>
      </div>

      <Panel delay={200}>
        <SectionTitle kicker="Full table" title="All 43 signals — click a column to sort" right={<Tag color="fog">43 SIGNALS</Tag>} />
        <DataTable data={sorted} columns={signalCols} pageSize={15} searchable searchPlaceholder="Filter signals…" />
      </Panel>

      <Panel delay={240}>
        <SectionTitle kicker="Prevalence table" title="Pre-explosion prevalence, all signals" />
        <DataTable data={[...data.preExplosion].sort((a, b) => b.lift - a.lift)} columns={preCols} pageSize={10} />
        <p className="mt-3 text-xs text-[#8b8e96]">
          Bottom of both tables is the anti-signal list: {bottom.map((b) => b.signal).join(', ')} all sit
          below 0.6× boom lift.
        </p>
      </Panel>
    </div>
  )
}
