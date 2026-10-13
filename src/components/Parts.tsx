import { Link } from 'react-router-dom'
import { imageUrl } from '../lib/image'
import { formatDuration, formatInt, formatNumber, partsToSeconds } from '../lib/time'
import type { PuzzleListRow } from '../lib/api'

export function PuzzleImage({ path, alt, className = '' }: { path: string | null | undefined; alt: string; className?: string }) {
  const url = imageUrl(path)
  if (!url) {
    return (
      <div role="img" aria-label="Kein Foto vorhanden" className={`flex items-center justify-center bg-ink/90 text-teal-light ${className}`}>
        <svg width="40%" viewBox="0 0 32 32" aria-hidden="true"><path d="M9 11h5.2a3 3 0 1 1 5.6 0H25v5.2a3 3 0 1 0 0 5.6V25H9z" fill="currentColor" /></svg>
      </div>
    )
  }
  return <img src={url} alt={alt} loading="lazy" className={`object-cover ${className}`} />
}

export function Chip({ children, tone = 'neutral' }: { children: React.ReactNode; tone?: 'neutral' | 'good' | 'warn' }) {
  const tones = { neutral: 'bg-paper text-ink-soft border-line', good: 'bg-teal/10 text-teal-dark border-teal/30', warn: 'bg-mustard/20 text-ink border-mustard/60' }
  return <span className={`inline-block rounded-full border px-2.5 py-0.5 text-sm ${tones[tone]}`}>{children}</span>
}

export function PuzzleCard({ p }: { p: PuzzleListRow }) {
  return (
    <Link to={`/puzzle/${p.puzzle_id}`} className="group flex flex-col overflow-hidden rounded-xl border border-line bg-card hover:border-teal">
      <PuzzleImage path={p.image_path} alt={p.title} className="aspect-[4/3] w-full" />
      <div className="flex flex-1 flex-col gap-1 p-3">
        <h2 className="text-lg font-bold leading-tight group-hover:text-teal-dark">{p.title}</h2>
        <p className="text-ink-soft">{[p.brand, `${formatInt(p.piece_count)} Teile`].filter(Boolean).join(', ')}</p>
        <p className="mt-auto pt-2 text-sm text-ink-soft">
          {p.copies_count} {p.copies_count === 1 ? 'Exemplar' : 'Exemplare'}, {p.solvers_count} {p.solvers_count === 1 ? 'Person hat' : 'Personen haben'} es gelöst
          {p.best_seconds !== null && <> · Bestzeit {formatDuration(p.best_seconds)}</>}
        </p>
      </div>
    </Link>
  )
}

/** Eingabe der Lösungszeit in Stunden, Minuten und Sekunden. Meldet die Gesamtzeit in Sekunden (oder null). */
export function DurationInput({ h, m, s, onChange, pieces }: {
  h: string; m: string; s: string; onChange: (v: { h: string; m: string; s: string }) => void; pieces?: number
}) {
  const total = partsToSeconds(Number(h || 0), Number(m || 0), Number(s || 0))
  const box = 'min-h-11 w-20 rounded-lg border border-line bg-white px-3 py-2 text-center text-lg'
  return (
    <fieldset>
      <legend className="mb-1 font-semibold">Lösungszeit</legend>
      <div className="flex flex-wrap items-end gap-2">
        {([['h', 'Std.', h], ['m', 'Min.', m], ['s', 'Sek.', s]] as const).map(([key, label, val]) => (
          <label key={key} className="flex flex-col text-sm text-ink-soft">
            {label}
            <input inputMode="numeric" type="number" min={0} max={key === 'h' ? 47 : 59} value={val} placeholder="0"
              onChange={(e) => onChange({ h, m, s, [key]: e.target.value })} className={box} />
          </label>
        ))}
      </div>
      <p className="mt-1 text-sm text-ink-soft" aria-live="polite">
        {total === null
          ? 'Minuten und Sekunden 0 bis 59. Stunden dürfen leer bleiben.'
          : `${formatDuration(total)}${pieces ? ` · ${formatNumber(pieces / (total / 60))} Teile pro Minute` : ''}`}
      </p>
    </fieldset>
  )
}

/** Einfaches Liniendiagramm ohne Zusatzbibliothek. */
export function LineChart({ points, yLabel }: { points: { label: string; y: number }[]; yLabel: string }) {
  if (points.length < 2) return <p className="text-ink-soft">Für ein Diagramm braucht es mindestens zwei Versuche.</p>
  const W = 640, H = 220, L = 44, R = 12, T = 12, B = 28
  const ys = points.map((p) => p.y)
  const min = Math.min(...ys), max = Math.max(...ys)
  const lo = Math.max(0, min - (max - min) * 0.15), hi = max + (max - min) * 0.15 || max + 1
  const x = (i: number) => L + (i / (points.length - 1)) * (W - L - R)
  const y = (v: number) => T + (1 - (v - lo) / (hi - lo)) * (H - T - B)
  const path = points.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.y).toFixed(1)}`).join(' ')
  const ticks = [lo, (lo + hi) / 2, hi]
  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${yLabel} über die Zeit, ${points.length} Versuche`} className="w-full">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke="var(--color-line)" />
            <text x={L - 6} y={y(t) + 4} textAnchor="end" fontSize="12" fill="var(--color-ink-soft)">{formatNumber(t, 1)}</text>
          </g>
        ))}
        <path d={path} fill="none" stroke="var(--color-teal)" strokeWidth="2.5" strokeLinejoin="round" />
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.y)} r="3.5" fill="var(--color-teal-dark)"><title>{`${p.label}: ${formatNumber(p.y)}`}</title></circle>
        ))}
        <text x={L} y={H - 6} fontSize="12" fill="var(--color-ink-soft)">{points[0].label}</text>
        <text x={W - R} y={H - 6} textAnchor="end" fontSize="12" fill="var(--color-ink-soft)">{points[points.length - 1].label}</text>
      </svg>
      <figcaption className="text-sm text-ink-soft">{yLabel}</figcaption>
    </figure>
  )
}

export function ErrorBox({ message }: { message: string | null }) {
  return message ? <p role="alert" className="rounded-lg border border-danger/40 bg-danger/5 px-3 py-2 text-danger">{message}</p> : null
}

export function ScopeToggle({ value, onChange }: { value: 'solo' | 'team' | 'all'; onChange: (v: 'solo' | 'team' | 'all') => void }) {
  const opts = [['solo', 'Einzelversuche'], ['team', 'Paar- und Teamversuche'], ['all', 'Alle']] as const
  return (
    <div role="group" aria-label="Versuche auswählen" className="inline-flex flex-wrap gap-1 rounded-lg border border-line bg-white p-1">
      {opts.map(([v, label]) => (
        <button key={v} type="button" aria-pressed={value === v} onClick={() => onChange(v)}
          className={`min-h-10 rounded-md px-3 ${value === v ? 'bg-ink font-semibold text-white' : 'hover:bg-paper'}`}>{label}</button>
      ))}
    </div>
  )
}
