// Data layer — the Python pipeline is the analysis engine.
// export_web_data.py turns output/*.csv into public/data.json and
// TanStack Query fetches it. The web app renders; it never recomputes.

export interface SignalRow {
  signal: string
  fires: number
  pre_explode_rate_pct: number
  lift_vs_base_pre: number
  boom20_rate_pct: number
  boom_lift: number
  fwd20_mean_pct: number
  fwd20_median_pct: number
  fwd20_win_pct: number
}

export interface PreRow {
  signal: string
  pct_of_pre_explode_days: number
  pct_of_normal_days: number
  lift: number
}

export interface ComboRow {
  combo: string
  signals: string
  period: string
  trades: number
  win_rate_pct: number
  avg_ret_pct: number
  median_ret_pct: number
  best_pct: number
  worst_pct: number
  'portfolio_ret_pct (10 slots, equal weight, approx)': number
}

export interface JointRow {
  variant: string
  period: string
  triggers_all: number
  'boom_rate_pct (precision)': number
  trades: number
  win_rate_pct: number
  avg_ret_pct: number
  median_ret_pct: number
  best_pct: number
  worst_pct: number
  'portfolio_ret_pct (10 slots, equal weight, approx)': number
}

export interface ControlRow {
  universe: string
  period: string
  triggers_all: number
  'boom_rate_pct (precision)': number
  trades: number
  win_rate_pct: number
  avg_ret_pct: number
  'portfolio_ret_pct (10 slots, equal weight, approx)': number
}

export interface SectorRow {
  primary_etf: string
  theme: string
  onsets: number
  stocks: number
  median_etf_window_ret_pct: number
  median_stock_fwd20_pct: number
  sector_driven_share_pct: number
}

export interface EtfRow {
  etf: string
  theme: string
  year_ret_pct: number
  best_20d_window_pct: number
  best_window_start: string
  'strict_explosions_+30/+20': number
  'hot_windows_fwd20>=10pct_days': number
  n_holdings_mapped: number
}

export interface ExplosionRow {
  ticker: string
  onset: string
  price: number
  fwd20_pct: number
  fwd_max20_pct: number
}

export interface TradeRow {
  ticker: string
  signal_date: string
  entry_date: string
  exit_date: string
  entry: number
  exit: number
  ret_pct: number
}

export interface TimingRow {
  primary_etf: string
  theme: string
  '2025Q4': number
  '2026Q1': number
  '2026Q2': number
  '2026Q3': number
  '2026Q4': number
  [k: string]: string | number
}

export interface AppData {
  summary: {
    analysis_year: string
    universe_tickers: number
    tradable_tickers: number
    dropped: Record<string, number>
    stock_days: number
    split_date: string
    explosions_in_year: number
    discovery_winner: string
    baseline_test: {
      spy_test_ret_pct: number
      unconditional_fwd20_mean_pct: number
      unconditional_boom20_rate_pct: number
      discovery_base_pre_rate_pct: number
      discovery_base_boom_rate_pct: number
    }
  }
  stage3: {
    etfs_fetched: number
    mapped_tickers: number
    kept_tickers: number
    onsets_total: number
    onset_classes: Record<string, number>
    split: string
  }
  signals: SignalRow[]
  preExplosion: PreRow[]
  combosDiscovery: ComboRow[]
  combosTest: ComboRow[]
  joint: JointRow[]
  jointControl: ControlRow[]
  hotSectors: SectorRow[]
  sectorTiming: TimingRow[]
  etfStats: EtfRow[]
  explosions: ExplosionRow[]
  winnerTrades: TradeRow[]
  bestWindows: unknown[]
}

export async function fetchData(): Promise<AppData> {
  const res = await fetch(`${import.meta.env.BASE_URL}data.json`)
  if (!res.ok) throw new Error(`data.json: ${res.status}`)
  return res.json()
}

// ---------- formatting ----------
export const fmtInt = (n: number) => n.toLocaleString('en-US')
export const fmtPct = (n: number, digits = 1) =>
  `${n > 0 ? '+' : ''}${n.toFixed(digits)}%`
export const fmtPctPlain = (n: number, digits = 1) => `${n.toFixed(digits)}%`
export const tone = (n: number) => (n >= 0 ? 'text-emerald-300' : 'text-rose-400')
export const PORTFOLIO_KEY = 'portfolio_ret_pct (10 slots, equal weight, approx)' as const
export const PRECISION_KEY = 'boom_rate_pct (precision)' as const
