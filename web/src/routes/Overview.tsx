import { Link } from '@tanstack/react-router'
import { useData } from '../lib/useData'
import { fmtInt, fmtPct, PORTFOLIO_KEY, tone } from '../lib/data'
import { DivBar, HBar, Kpi, Loading, LoadError, Panel, SectionTitle, Tag } from '../components/ui'

export function OverviewPage() {
  const { data, isPending, error } = useData()
  if (isPending) return <Loading />
  if (error || !data) return <LoadError message={String(error)} />

  const s = data.summary
  const test = Object.fromEntries(data.combosTest.map((c) => [c.combo, c]))
  const disc = Object.fromEntries(data.combosDiscovery.map((c) => [c.combo, c]))
  const survivor = test['macd_cross+above_ma20']
  const winner = test[s.discovery_winner]
  const sectors = [...data.hotSectors].slice(0, 8)
  const maxOnsets = Math.max(...sectors.map((x) => x.onsets))
  const classes = data.stage3.onset_classes
  const mappedTotal = data.stage3.onsets_total - (classes['unmapped'] ?? 0)
  const topSignals = [...data.signals].sort((a, b) => b.boom_lift - a.boom_lift).slice(0, 6)
  const maxLift = Math.max(...topSignals.map((x) => x.boom_lift))

  const donut = [
    { label: 'Sector-driven', value: classes['sector-driven'] ?? 0, color: '#2ce89b' },
    { label: 'Sector-assisted', value: classes['sector-assisted'] ?? 0, color: '#59c2ff' },
    { label: 'Solo', value: classes['solo'] ?? 0, color: '#ffc24b' },
    { label: 'Unmapped', value: classes['unmapped'] ?? 0, color: '#4c525e' },
  ]
  const donutTotal = donut.reduce((a, b) => a + b.value, 0)
  let acc = 0
  const arcs = donut.map((d) => {
    const start = (acc / donutTotal) * 360
    acc += d.value
    const end = (acc / donutTotal) * 360
    return { ...d, start, end }
  })

  return (
    <div className="space-y-3">
      {/* HERO */}
      <div className="rise">
        <div className="flex flex-wrap items-center gap-2">
          <Tag>BACKTESTED · NO CHERRY-PICKING</Tag>
          <Tag color="fog">{s.analysis_year}</Tag>
          <Tag color="sky">SPLIT {s.split_date}</Tag>
        </div>
        <h1 className="font-[family-name:var(--font-display)] mt-2.5 max-w-3xl text-[26px] leading-[1.12] font-bold tracking-tight text-white sm:text-[30px]">
          Which penny stocks{' '}
          <span className="bg-gradient-to-r from-[#26a69a] via-[#4db6ac] to-[#5b8cff] bg-clip-text text-transparent">
            explode
          </span>
          — and what actually predicts it?
        </h1>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-[#d1d4dc]">
          One year, every US stock, every trigger counted — winners <em>and</em> false alarms.
          Most signals are noise. One combo survived out-of-sample. Sector heat, it turns out,
          adds nothing. Here's the evidence.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Universe scanned" value={fmtInt(s.universe_tickers)} sub="Nasdaq + NYSE, point-in-time list" delay={40} />
        <Kpi label="Tradable after filters" value={fmtInt(s.tradable_tickers)} sub="≥200 days · ≥$3 median · ≥$2M/day" delay={90} />
        <Kpi label="Explosion onsets" value={fmtInt(s.explosions_in_year)} sub="≥+30% peak & ≥+20% close in 20d" accent delay={140} />
        <Kpi label="Stock-days analysed" value={fmtInt(s.stock_days)} sub="43 MA / MACD signals per day" delay={190} />
      </div>

      {/* SURVIVOR vs WINNER */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel delay={120} className="glow-mint">
          <SectionTitle kicker="The survivor" title="MACD cross ↑ + above MA20" />
          <div className="flex items-end gap-6">
            <div>
              <div className="num text-4xl font-bold text-emerald-300">{fmtPct(survivor.avg_ret_pct, 2)}</div>
              <div className="mt-1 text-xs text-[#8b8e96]">avg return / trade · held-out test</div>
            </div>
            <div className="pb-1">
              <div className="num text-xl font-semibold text-white">{fmtPct(survivor.win_rate_pct, 1).replace('+', '')}</div>
              <div className="text-xs text-[#8b8e96]">win rate</div>
            </div>
            <div className="pb-1">
              <div className="num text-xl font-semibold text-white">{fmtPct(survivor[PORTFOLIO_KEY])}</div>
              <div className="text-xs text-[#8b8e96]">portfolio ≈ vs SPY {fmtPct(s.baseline_test.spy_test_ret_pct)}</div>
            </div>
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-[#d1d4dc]">
            Ranked #2 in discovery ({fmtPct(disc['macd_cross+above_ma20'].avg_ret_pct, 2)}/trade) and
            #1 in the test period it had never seen. The only combo of 15 that improved out-of-sample.
          </p>
          <Link to="/combos" className="num mt-2.5 inline-block text-xs font-semibold tracking-wider text-emerald-300 hover:text-emerald-200">
            SEE ALL 15 COMBOS →
          </Link>
        </Panel>

        <Panel delay={180}>
          <SectionTitle kicker="The cautionary tale" title="Discovery winner, test loser" />
          <div className="space-y-1">
            <DivBar label={`${s.discovery_winner} · discovery`} value={disc[s.discovery_winner].avg_ret_pct} maxAbs={7} />
            <DivBar label={`${s.discovery_winner} · test`} value={winner.avg_ret_pct} maxAbs={7} />
            <DivBar label="Unconditional · test" value={s.baseline_test.unconditional_fwd20_mean_pct} maxAbs={7} />
            <DivBar label="SPY · test" value={s.baseline_test.spy_test_ret_pct} maxAbs={7} />
          </div>
          <p className="mt-2.5 text-[13px] leading-relaxed text-[#d1d4dc]">
            Best-in-discovery (+6.45%/trade, 61.3% win) collapsed to{' '}
            <span className="num text-rose-300">{fmtPct(winner.avg_ret_pct, 2)}/trade</span> out-of-sample —
            portfolio ≈ {fmtPct(winner[PORTFOLIO_KEY])}. The regime flipped too: unconditional forward-20d
            went from +2.66% in discovery to −0.55% in test. This is why the split exists.
          </p>
          <Link to="/method" className="num mt-2.5 inline-block text-xs font-semibold tracking-wider text-sky-300 hover:text-sky-200">
            HOW THE TEST STAYS HONEST →
          </Link>
        </Panel>
      </div>

      {/* SIGNALS + SECTORS */}
      <div className="grid gap-3 lg:grid-cols-2">
        <Panel delay={200}>
          <SectionTitle kicker="Signal study · discovery" title="What lifts explosion odds?" right={<Tag color="fog">base boom rate 5.67%</Tag>} />
          {topSignals.map((r) => (
            <HBar key={r.signal} label={r.signal} value={r.boom_lift} max={maxLift} display={`${r.boom_lift.toFixed(2)}×`} />
          ))}
          <p className="mt-3 text-sm leading-relaxed text-[#d1d4dc]">
            The top "predictor" is just a stock already running (price &gt;15% above MA20) — continuation,
            not foresight. The classic coil setup <span className="text-rose-300">failed</span>: lift 0.28×.
          </p>
          <Link to="/signals" className="num mt-3 inline-block text-xs font-semibold tracking-wider text-emerald-300 hover:text-emerald-200">
            ALL 43 SIGNALS →
          </Link>
        </Panel>

        <Panel delay={240}>
          <SectionTitle kicker="Stage 3 · sectors" title="Where explosions cluster" />
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              {sectors.map((r) => (
                <HBar key={r.primary_etf} label={`${r.primary_etf} · ${r.theme}`} value={r.onsets} max={maxOnsets} display={fmtInt(r.onsets)} color="bg-sky-400" labelWidth="w-40 sm:w-52" />
              ))}
            </div>
            <div className="flex shrink-0 flex-col items-center justify-center gap-3">
              <svg width="132" height="132" viewBox="0 0 132 132" className="-rotate-90">
                {arcs.map((a) => {
                  const r = 52
                  const c = 2 * Math.PI * r
                  const len = ((a.end - a.start) / 360) * c
                  return (
                    <circle key={a.label} cx="66" cy="66" r={r} fill="none" stroke={a.color} strokeWidth="15"
                      strokeDasharray={`${Math.max(0, len - 2)} ${c - len + 2}`}
                      strokeDashoffset={-((a.start / 360) * c)} />
                  )
                })}
                <text x="66" y="62" textAnchor="middle" className="rotate-90 fill-white" transform="rotate(90 66 66)" fontSize="17" fontWeight="700" fontFamily="JetBrains Mono">
                  {Math.round(((classes['sector-driven'] ?? 0) / Math.max(1, mappedTotal)) * 100)}%
                </text>
                <text x="66" y="80" textAnchor="middle" transform="rotate(90 66 66)" fontSize="8.5" fill="#8b8e96" fontFamily="JetBrains Mono">
                  SECTOR-DRIVEN*
                </text>
              </svg>
              <div className="space-y-1">
                {donut.map((d) => (
                  <div key={d.label} className="flex items-center gap-2 text-[11px] text-[#d1d4dc]">
                    <span className="h-2 w-2 rounded-sm" style={{ background: d.color }} />
                    <span className="num">{d.label} · {fmtInt(d.value)}</span>
                  </div>
                ))}
              </div>
              <div className="num text-[10px] text-[#787b86]">*of {fmtInt(mappedTotal)} mapped onsets</div>
            </div>
          </div>
          <Link to="/sectors" className="num mt-3 inline-block text-xs font-semibold tracking-wider text-sky-300 hover:text-sky-200">
            SECTOR BREAKDOWN →
          </Link>
        </Panel>
      </div>

      {/* VERDICT STRIP */}
      <Panel delay={280} className="border-amber-300/20">
        <div className="flex flex-wrap items-start gap-4">
          <Tag color="amber">STAGE 3 VERDICT</Tag>
          <p className="min-w-[260px] flex-1 text-sm leading-relaxed text-[#d7e4ea]">
            Requiring the signal to fit <strong className="text-white">both the stock and its sector ETF</strong>{' '}
            sounds right — and the data doesn't pay for it. Within the mapped universe, test precision was{' '}
            <span className="num text-white">3.39%</span> with no ETF filter vs{' '}
            <span className="num text-white">3.38% / 3.12% / 2.87%</span> with one. It just shrinks 7,986 triggers
            to ~1,000–2,500 of the same quality.{' '}
            <Link to="/sectors" className="font-semibold text-amber-200 hover:text-amber-100">Read the control test →</Link>
          </p>
          <div className="num text-right">
            <div className={`text-2xl font-bold ${tone(-1)}`}>+0.00</div>
            <div className="text-[10px] tracking-widest text-[#8b8e96] uppercase">edge added</div>
          </div>
        </div>
      </Panel>
    </div>
  )
}
