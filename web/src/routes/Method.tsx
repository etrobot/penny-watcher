import { useData } from '../lib/useData'
import { Loading, LoadError, Panel, SectionTitle, Tag } from '../components/ui'

function Step({ n, title, children }: { n: string; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-4">
      <div className="num flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-300/40 bg-emerald-300/10 text-sm font-bold text-emerald-200">
        {n}
      </div>
      <div className="pb-6">
        <div className="font-[family-name:var(--font-display)] text-base font-semibold text-white">{title}</div>
        <p className="mt-1 max-w-2xl text-sm leading-relaxed text-[#d1d4dc]">{children}</p>
      </div>
    </div>
  )
}

export function MethodPage() {
  const { data, isPending, error } = useData()
  if (isPending) return <Loading />
  if (error || !data) return <LoadError message={String(error)} />

  return (
    <div className="space-y-3">
      <div className="rise">
        <Tag color="fog">METHOD · ARCHITECTURE · CAVEATS</Tag>
        <h1 className="font-[family-name:var(--font-display)] mt-2 text-xl font-bold tracking-tight text-white sm:text-2xl">
          Python analyses. This site just shows its work.
        </h1>
        <p className="mt-1.5 max-w-2xl text-[13px] leading-relaxed text-[#d1d4dc]">
          The split is deliberate: all fetching, signal computation and backtesting lives in Python
          (<code className="num text-emerald-200">pipeline.py</code>,{' '}
          <code className="num text-emerald-200">stage3_sectors.py</code>). A small exporter
          (<code className="num text-emerald-200">export_web_data.py</code>) turns the CSV outputs into one
          JSON file, and the TanStack front end — Router, Query, Table — renders it. The UI never
          recomputes a number.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Panel delay={80}>
          <SectionTitle kicker="Pipeline" title="How a number gets here" />
          <Step n="1" title="Fetch everything, filter after">
            SEC ticker list (Nasdaq + NYSE, {data.summary.universe_tickers.toLocaleString()} names) with 400
            days of warmup so MA200/MACD are valid on day one. Tradability filters (≥200 trading days,
            median price ≥ $3, median dollar volume ≥ $2M) apply <em>after</em> fetching — never before —
            so the universe isn't quietly curated.
          </Step>
          <Step n="2" title="Define the explosion before looking">
            Onset labels (+30% peak / +20% close in 20d, quiet prior 20d, de-overlapped) were fixed in
            code before any signal was tested against them.
          </Step>
          <Step n="3" title="Signals at T, trades at T+1">
            All 43 MA/MACD/volume signals are computed from data up to close T. Backtest entries use
            the next open. No lookahead, anywhere.
          </Step>
          <Step n="4" title="Precision over every trigger">
            A winner-derived rule may fire on a thousand losers. So each rule is scored on every
            stock-day it fires: P(explosion | signal), plus net expectancy after all losing trades
            and 0.2%/side costs.
          </Step>
          <Step n="5" title="Discovery / test split, locked">
            Combos were ranked on the first 60% of the year only (split {data.summary.split_date}),
            then run once on the held-out 40%. All 15 results are published, ranked or not.
          </Step>
        </Panel>

        <div className="space-y-3">
          <Panel delay={140}>
            <SectionTitle kicker="Honest limits" title="What this can't claim" />
            <ul className="list-disc space-y-2 pl-5 text-sm leading-relaxed text-[#d1d4dc]">
              <li><strong className="text-white">One year, one regime.</strong> The test period was hostile (unconditional fwd20 −0.55%); a different year may crown a different combo.</li>
              <li><strong className="text-white">Survivorship, reduced not removed.</strong> The universe is the current SEC list; names that delisted mid-year are undercounted.</li>
              <li><strong className="text-white">Position-cap path dependence.</strong> All combos filled the 10 slots, so portfolio totals depend partly on which simultaneous signals got in first. Per-trade expectancy is sturdier.</li>
              <li><strong className="text-white">Holdings are current (stage 3).</strong> Stock→ETF mapping uses Nov-2026 holdings for the whole year — early-year rows carry that caveat.</li>
              <li><strong className="text-white">No stop-loss tested.</strong> Exits are fixed at 20 days. The survivor combo's worst test trade was −12.2%; its discovery worst was −37.1%.</li>
              <li><strong className="text-white">Prices are split-adjusted, not dividend-adjusted</strong> for the stage 1/2 stock data (Nasdaq source); ETF data is forward-adjusted (Sina qfq).</li>
            </ul>
          </Panel>

          <Panel delay={200}>
            <SectionTitle kicker="Reproduce it" title="Run the whole thing" />
            <pre className="num overflow-x-auto rounded-xl border border-[#2a2e39] bg-black/50 p-4 text-xs leading-relaxed text-emerald-100">
{`# analysis (Python)
pip install -r requirements.txt
python3 pipeline.py          # stages 1-2
python3 stage3_sectors.py    # stage 3
python3 export_web_data.py   # -> web/public/data.json

# presentation (TanStack)
cd web && bun install
bun run dev                  # or: bun run build`}
            </pre>
            <p className="mt-3 text-xs leading-relaxed text-[#8b8e96]">
              Source:{' '}
              <a href="https://github.com/etrobot/penny-watcher" target="_blank" rel="noreferrer" className="text-emerald-300 hover:text-emerald-200">
                github.com/etrobot/penny-watcher
              </a>
            </p>
          </Panel>
        </div>
      </div>
    </div>
  )
}
