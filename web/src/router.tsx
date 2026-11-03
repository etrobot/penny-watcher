import { Link, Outlet, createRootRoute, createRoute, createRouter } from '@tanstack/react-router'
import { useData } from './lib/useData'
import { fmtPct } from './lib/data'
import { OverviewPage } from './routes/Overview'
import { SignalsPage } from './routes/Signals'
import { CombosPage } from './routes/Combos'
import { SectorsPage } from './routes/Sectors'
import { ExplosionsPage } from './routes/Explosions'
import { MethodPage } from './routes/Method'

const NAV = [
  { to: '/', label: 'Overview' },
  { to: '/signals', label: 'Signals' },
  { to: '/combos', label: 'Combos' },
  { to: '/sectors', label: 'Sectors' },
  { to: '/explosions', label: 'Explosions' },
  { to: '/method', label: 'Method' },
] as const

function TickerTape() {
  const { data } = useData()
  if (!data) return <div className="h-[33px] border-b border-[#1b2831] bg-black/40" />
  const items = [...data.etfStats]
    .sort((a, b) => Math.abs(b.year_ret_pct) - Math.abs(a.year_ret_pct))
    .slice(0, 18)
  const tape = [...items, ...items]
  return (
    <div className="overflow-hidden border-b border-[#1b2831] bg-black/40">
      <div className="tape-track flex w-max items-center gap-8 px-4 py-2">
        {tape.map((e, i) => (
          <span key={i} className="num flex items-center gap-2 text-[11px] whitespace-nowrap">
            <span className="font-semibold text-white">{e.etf}</span>
            <span className={e.year_ret_pct >= 0 ? 'text-emerald-300' : 'text-rose-400'}>
              {fmtPct(e.year_ret_pct)} <span className="text-[#5d7180]">1Y</span>
            </span>
          </span>
        ))}
      </div>
    </div>
  )
}

function Shell() {
  return (
    <div className="min-h-screen">
      <div className="grid-bg pointer-events-none fixed inset-0" />
      <div className="relative">
        <header className="sticky top-0 z-40 border-b border-[#1b2831] bg-[#05080a]/85 backdrop-blur-md">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-3 sm:px-6">
            <Link to="/" className="flex items-center gap-2.5">
              <span className="live-dot flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-400 font-[family-name:var(--font-display)] text-base font-bold text-black">
                P
              </span>
              <span className="font-[family-name:var(--font-display)] text-lg font-bold tracking-tight text-white">
                PENNY<span className="text-emerald-300">WATCHER</span>
              </span>
              <span className="num hidden text-[10px] tracking-[0.2em] text-[#5d7180] uppercase sm:inline">
                explosion lab
              </span>
            </Link>
            <nav className="flex flex-wrap items-center gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.to}
                  to={n.to}
                  className="num rounded-lg px-3 py-1.5 text-xs font-medium tracking-wide text-[#aebfca] transition hover:bg-white/5 hover:text-white"
                  activeProps={{ className: 'num rounded-lg px-3 py-1.5 text-xs font-semibold tracking-wide bg-emerald-300/10 text-emerald-200' }}
                  activeOptions={{ exact: n.to === '/' }}
                >
                  {n.label}
                </Link>
              ))}
            </nav>
            <div className="num ml-auto hidden items-center gap-2 text-[11px] text-[#8fa3b0] md:flex">
              <span className="live-dot h-2 w-2 rounded-full bg-emerald-300" />
              ANALYSIS: PYTHON · UI: TANSTACK
            </div>
          </div>
          <TickerTape />
        </header>

        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 sm:py-8">
          <Outlet />
        </main>

        <footer className="border-t border-[#1b2831] py-6">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 sm:px-6">
            <div className="num text-[11px] text-[#5d7180]">
              PENNY WATCHER — a backtest with the receipts. Not financial advice; past explosions
              don't schedule future ones.
            </div>
            <a
              href="https://github.com/etrobot/penny-watcher"
              target="_blank"
              rel="noreferrer"
              className="num text-[11px] text-[#8fa3b0] hover:text-emerald-200"
            >
              github.com/etrobot/penny-watcher ↗
            </a>
          </div>
        </footer>
      </div>
    </div>
  )
}

const rootRoute = createRootRoute({ component: Shell })

const routes = [
  createRoute({ getParentRoute: () => rootRoute, path: '/', component: OverviewPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/signals', component: SignalsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/combos', component: CombosPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/sectors', component: SectorsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/explosions', component: ExplosionsPage }),
  createRoute({ getParentRoute: () => rootRoute, path: '/method', component: MethodPage }),
]

const routeTree = rootRoute.addChildren(routes)

export const router = createRouter({ routeTree, scrollRestoration: true })

declare module '@tanstack/react-router' {
  interface Register {
    router: typeof router
  }
}
