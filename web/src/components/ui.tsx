import type { ReactNode } from 'react'
import { fmtPct, tone } from '../lib/data'

export function Panel({
  children,
  className = '',
  delay = 0,
}: {
  children: ReactNode
  className?: string
  delay?: number
}) {
  return (
    <section
      className={`glass rise p-3 sm:p-4 ${className}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      {children}
    </section>
  )
}

export function SectionTitle({
  kicker,
  title,
  right,
}: {
  kicker: string
  title: string
  right?: ReactNode
}) {
  return (
    <div className="mb-2.5 flex flex-wrap items-end justify-between gap-2">
      <div>
        <div className="num text-[11px] font-medium tracking-[0.22em] text-emerald-300/80 uppercase">
          {kicker}
        </div>
        <h2 className="font-[family-name:var(--font-display)] mt-0.5 text-[15px] font-semibold tracking-tight text-white sm:text-base">
          {title}
        </h2>
      </div>
      {right}
    </div>
  )
}

export function Kpi({
  label,
  value,
  sub,
  accent = false,
  delay = 0,
}: {
  label: string
  value: string
  sub?: string
  accent?: boolean
  delay?: number
}) {
  return (
    <div
      className={`glass rise px-3 py-2.5 ${accent ? 'glow-mint' : ''}`}
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="num text-[10px] font-medium tracking-[0.18em] text-[#8b8e96] uppercase">
        {label}
      </div>
      <div
        className={`num mt-1 text-lg leading-none font-bold tracking-tight sm:text-xl ${
          accent ? 'text-emerald-300' : 'text-white'
        }`}
      >
        {value}
      </div>
      {sub && <div className="mt-0.5 text-[11px] leading-snug text-[#8b8e96]">{sub}</div>}
    </div>
  )
}

/** Horizontal bar with animated grow; value positioned as a % of max. */
export function HBar({
  label,
  value,
  max,
  display,
  color = 'bg-emerald-400',
  labelWidth = 'w-44 sm:w-60',
}: {
  label: string
  value: number
  max: number
  display: string
  color?: string
  labelWidth?: string
}) {
  const pct = Math.max(1.5, Math.min(100, (Math.abs(value) / max) * 100))
  return (
    <div className="group flex items-center gap-2.5 py-[3px]">
      <div className={`num ${labelWidth} shrink-0 truncate text-xs text-[#d1d4dc]`} title={label}>
        {label}
      </div>
      <div className="h-[13px] flex-1 overflow-hidden rounded-sm bg-white/[0.04]">
        <div
          className={`bar-grow h-full rounded-md ${color} opacity-90 transition-opacity group-hover:opacity-100`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="num w-16 shrink-0 text-right text-xs font-semibold text-white">{display}</div>
    </div>
  )
}

/** Center-zero diverging bar for returns that can be negative. */
export function DivBar({
  label,
  value,
  maxAbs,
  display,
}: {
  label: string
  value: number
  maxAbs: number
  display?: string
}) {
  const half = Math.min(50, (Math.abs(value) / maxAbs) * 50)
  const positive = value >= 0
  return (
    <div className="flex items-center gap-2.5 py-[3px]">
      <div className="num w-52 shrink-0 truncate text-xs text-[#d1d4dc] sm:w-64" title={label}>
        {label}
      </div>
      <div className="relative h-[13px] flex-1 rounded-sm bg-white/[0.04]">
        <div className="absolute top-0 bottom-0 left-1/2 w-px bg-white/20" />
        <div
          className={`bar-grow absolute top-[2px] h-[9px] rounded-sm ${
            positive ? 'bg-emerald-400' : 'bg-rose-400'
          }`}
          style={{
            left: positive ? '50%' : `${50 - half}%`,
            width: `${half}%`,
            transformOrigin: positive ? 'left' : 'right',
          }}
        />
      </div>
      <div className={`num w-16 shrink-0 text-right text-xs font-semibold ${tone(value)}`}>
        {display ?? fmtPct(value)}
      </div>
    </div>
  )
}

export function Tag({ children, color = 'mint' }: { children: ReactNode; color?: string }) {
  const styles: Record<string, string> = {
    mint: 'border-emerald-300/30 bg-emerald-300/10 text-emerald-200',
    rose: 'border-rose-300/30 bg-rose-300/10 text-rose-200',
    amber: 'border-amber-300/30 bg-amber-300/10 text-amber-200',
    sky: 'border-sky-300/30 bg-sky-300/10 text-sky-200',
    fog: 'border-white/15 bg-white/5 text-[#d1d4dc]',
  }
  return (
    <span
      className={`num inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-medium ${styles[color] ?? styles.mint}`}
    >
      {children}
    </span>
  )
}

export function Loading() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center gap-4">
      <div className="live-dot h-3 w-3 rounded-full bg-emerald-300" />
      <div className="num text-xs tracking-[0.25em] text-[#8b8e96] uppercase">
        Loading analysis…
      </div>
    </div>
  )
}

export function LoadError({ message }: { message: string }) {
  return (
    <div className="glass mx-auto mt-16 max-w-lg p-6 text-center">
      <div className="font-[family-name:var(--font-display)] text-lg font-semibold text-rose-300">
        Couldn't load the analysis data
      </div>
      <p className="mt-2 text-sm text-[#8b8e96]">
        {message}. Run <code className="num text-emerald-200">python3 export_web_data.py</code> in
        the project root to regenerate <code className="num text-emerald-200">web/public/data.json</code>{' '}
        from the Python outputs.
      </p>
    </div>
  )
}
