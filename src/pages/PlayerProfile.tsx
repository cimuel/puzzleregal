import { useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { rpc, type OfficialResultRow, type PlayerAttemptRow, type PuzzleBestRow, type Scope, type SummaryRow } from '../lib/api'
import { teamLabel } from '../lib/rank'
import { formatDate, formatDuration, formatInt, formatNumber } from '../lib/time'
import { useAsync } from '../hooks/useAsync'
import { useMembers } from '../hooks/useMembers'
import { Card, Spinner } from '../components/ui'
import { Chip, ErrorBox, LineChart, ScopeToggle } from '../components/Parts'
import { NameCard, PasswordCard } from './Profile'
import { attemptsToCsv, downloadText, todayStamp } from '../lib/export'
import { Button } from '../components/ui'

function Tile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-line bg-card p-4">
      <p className="text-sm text-ink-soft">{label}</p>
      <p className="font-display text-2xl font-bold">{value}</p>
      {note && <p className="mt-1 text-sm text-ink-soft">{note}</p>}
    </div>
  )
}

export function PlayerProfile({ own = false }: { own?: boolean }) {
  const params = useParams()
  const { profile } = useAuth()
  const members = useMembers()
  const personId = own ? profile?.id : params.id
  const [scope, setScope] = useState<Scope>('solo')
  const summary = useAsync(() => (personId ? rpc<SummaryRow[]>('player_summary', { p_profile: personId, p_scope: scope }) : Promise.resolve([])), [personId, scope])
  const bests = useAsync(() => (personId ? rpc<PuzzleBestRow[]>('player_puzzle_bests', { p_profile: personId, p_scope: scope }) : Promise.resolve([])), [personId, scope])
  const attempts = useAsync(() => (personId ? rpc<PlayerAttemptRow[]>('player_attempts', { p_profile: personId, p_scope: scope }) : Promise.resolve([])), [personId, scope])

  const official = useAsync(() => (personId ? rpc<OfficialResultRow[]>('player_official_results', { p_profile: personId }) : Promise.resolve([])), [personId])
  const [exportError, setExportError] = useState<string | null>(null)
  async function exportMine() {
    if (!personId) return
    try {
      const all = await rpc<PlayerAttemptRow[]>('player_attempts', { p_profile: personId, p_scope: 'all' })
      downloadText(`meine-puzzlezeiten-${todayStamp()}.csv`, attemptsToCsv(all), 'text/csv')
      setExportError(null)
    } catch (e) { setExportError(e instanceof Error ? e.message : 'Unbekannter Fehler.') }
  }
  const name = own ? profile?.display_name : members.names.get(personId ?? '')
  const s = summary.data?.[0]
  const n = s?.attempts_count ?? 0
  const topAttempts = useMemo(() => [...(attempts.data ?? [])].sort((a, b) => Number(b.ppm) - Number(a.ppm)).slice(0, 5), [attempts.data])
  const points = (attempts.data ?? []).map((a) => ({ label: `${formatDate(a.solved_on)}, ${a.title}`, y: Number(a.ppm) }))
  const latest = [...(attempts.data ?? [])].reverse().slice(0, 15)

  if (!personId || (summary.loading && !summary.data)) return <Spinner />
  const nLabel = `Basis: ${n} ${n === 1 ? 'Versuch' : 'Versuche'}`
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-3xl font-bold">{own ? 'Mein Profil' : (name ?? '…')}</h1>
          <p className="text-ink-soft"><Link className="text-teal-dark underline" to={own ? '/mein-regal' : `/regal/${personId}`}>{own ? 'Mein Regal' : 'Regal ansehen'}</Link></p></div>
        <ScopeToggle value={scope} onChange={setScope} />
      </div>
      <ErrorBox message={summary.error ?? bests.error ?? attempts.error} />
      {scope !== 'solo' && <p className="max-w-prose rounded-lg border border-mustard/60 bg-mustard/15 px-3 py-2">Bei Paar- und Teamversuchen gilt die Zeit der ganzen Gruppe. Die Teile pro Minute sind dort keine persönliche Geschwindigkeit.</p>}

      {n === 0 ? (
        <Card><p className="text-ink-soft">Noch keine {scope === 'solo' ? 'Einzelversuche' : scope === 'team' ? 'Paar- oder Teamversuche' : 'Versuche'} erfasst.{own && <> <Link className="text-teal-dark underline" to="/versuch-neu">Erfasse deine erste Zeit.</Link></>}</p></Card>
      ) : (
        <>
          <section aria-label="Kennzahlen" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Tile label="Erfasste Versuche" value={formatInt(s?.attempts_count)} />
            <Tile label="Verschiedene Puzzles gelöst" value={formatInt(s?.distinct_puzzles)} />
            <Tile label="Durchschnittliche Teilezahl" value={formatInt(s?.avg_pieces)} note={nLabel} />
            <Tile label="Durchschnittliche Lösungszeit" value={formatDuration(s?.avg_seconds)} note={`${nLabel}. Mischt Puzzles verschiedener Grösse, darum ist Teile/Min aussagekräftiger.`} />
            <Tile label="Durchschnittliche Geschwindigkeit" value={`${formatNumber(s?.avg_speed_ppm)} Teile/Min`} note={`${formatNumber(Number(s?.avg_speed_ppm) * 60, 0)} Teile pro Stunde. Summe aller Teile ÷ Summe aller Minuten. ${nLabel}.`} />
            <Tile label="Schnellster einzelner Versuch" value={`${formatNumber(s?.best_attempt_ppm)} Teile/Min`} note={topAttempts[0] ? `${topAttempts[0].title}, ${formatDate(topAttempts[0].solved_on)}` : undefined} />
          </section>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Beste Zeit pro Puzzle</h2>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] text-left">
                <thead><tr className="border-b border-line text-ink-soft"><th className="py-2 pr-3">Puzzle</th><th className="pr-3">Teile</th><th className="pr-3">Bestzeit</th><th className="pr-3">Teile/Min</th><th className="pr-3">Datum</th><th className="pr-3">Versuche</th>{scope === 'solo' && <th>Vergleich</th>}</tr></thead>
                <tbody>{(bests.data ?? []).map((b) => (
                  <tr key={b.puzzle_id} className="border-b border-line/60">
                    <td className="py-2 pr-3"><Link className="text-teal-dark underline" to={`/puzzle/${b.puzzle_id}`}>{b.title}</Link></td>
                    <td className="pr-3">{formatInt(b.piece_count)}</td><td className="pr-3 font-semibold">{formatDuration(b.best_seconds)}</td>
                    <td className="pr-3">{formatNumber(b.best_ppm)}</td><td className="pr-3">{formatDate(b.best_date)}</td><td className="pr-3">{b.attempts_count}</td>
                    {scope === 'solo' && <td>{b.members_count && b.members_count > 1 ? <Chip tone={b.rank === 1 ? 'good' : 'neutral'}>Rang {b.rank} von {b.members_count}</Chip> : <span className="text-ink-soft">als Einzige/r</span>}</td>}
                  </tr>))}</tbody>
              </table>
            </div>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Persönliche Bestleistungen</h2>
            <p className="mb-2 text-sm text-ink-soft">Die fünf schnellsten Einzelversuche nach Teilen pro Minute.</p>
            <ol className="flex flex-col gap-1">{topAttempts.map((a, i) => (
              <li key={a.attempt_id}>{i + 1}. <strong>{formatNumber(a.ppm)} Teile/Min</strong> · {a.title} ({formatInt(a.piece_count)} Teile in {formatDuration(a.duration_seconds)}), {formatDate(a.solved_on)}</li>))}</ol>
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Entwicklung über die Zeit</h2>
            <LineChart points={points} yLabel="Teile pro Minute je Versuch" />
          </Card>

          <Card>
            <h2 className="mb-3 text-xl font-bold">Letzte Versuche</h2>
            <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left">
              <thead><tr className="border-b border-line text-ink-soft"><th className="py-2 pr-3">Datum</th><th className="pr-3">Puzzle</th><th className="pr-3">Zeit</th><th className="pr-3">Teile/Min</th><th>Art</th></tr></thead>
              <tbody>{latest.map((a) => (
                <tr key={a.attempt_id} className="border-b border-line/60"><td className="py-2 pr-3">{formatDate(a.solved_on)}</td>
                  <td className="pr-3"><Link className="text-teal-dark underline" to={`/puzzle/${a.puzzle_id}`}>{a.title}</Link></td><td className="pr-3">{formatDuration(a.duration_seconds)}</td>
                  <td className="pr-3">{formatNumber(a.ppm)}</td><td>{a.kind === 'official' ? <Chip tone="good">offiziell</Chip> : <Chip>Training</Chip>}{a.team_size > 1 && <> <Chip>Team {a.team_size}</Chip></>}</td></tr>))}</tbody>
            </table></div>
          </Card>
        </>
      )}
      {(official.data ?? []).length > 0 && (
        <Card>
          <h2 className="mb-1 text-xl font-bold">Offizielle Resultate</h2>
          <p className="mb-3 text-sm text-ink-soft">Aus importierten Ergebnislisten. Bei Paaren und Teams gilt die Zeit der ganzen Gruppe.</p>
          <ul className="divide-y divide-line">{(official.data ?? []).map((r) => (
            <li key={r.result_id} className="py-2">
              <Link className="font-semibold text-teal-dark underline" to={`/runde/${r.round_id}`}>{r.event_name}, {r.round_name}</Link> <span className="text-ink-soft">({teamLabel(r.team_size)}{r.entry_name && r.team_size > 1 ? `, ${r.entry_name}` : ''})</span><br />
              Rang <strong>{r.rank}</strong> von {r.entries_count} · {r.status === 'finished' ? formatDuration(r.finish_seconds) : `nicht fertig (${formatInt(r.pieces_placed)} Teile)`}
              {r.puzzle_id && <> · <Link className="text-teal-dark underline" to={`/puzzle/${r.puzzle_id}`}>{r.puzzle_title}</Link></>}
            </li>))}</ul>
        </Card>)}
      {own && (
        <Card className="max-w-md">
          <h2 className="mb-2 text-xl font-bold">Meine Zeiten exportieren</h2>
          <p className="mb-3 text-sm text-ink-soft">Alle deine erfassten Versuche (auch Paar- und Teamzeiten) als CSV-Datei, zum Beispiel für Excel.</p>
          <Button variant="secondary" onClick={exportMine}>Als CSV herunterladen</Button>
          <ErrorBox message={exportError} />
        </Card>)}
      {own && <NameCard />}
      {own && <PasswordCard />}
    </div>
  )
}
