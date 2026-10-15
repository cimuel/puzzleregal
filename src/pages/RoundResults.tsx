import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { rpc, type PuzzleListRow, type RoundOverviewRow, type RoundResultRow } from '../lib/api'
import { teamLabel } from '../lib/rank'
import { formatDate, formatDuration, formatInt } from '../lib/time'
import { useAsync } from '../hooks/useAsync'
import { useMembers } from '../hooks/useMembers'
import { Button, Card, Spinner } from '../components/ui'
import { Chip, ErrorBox } from '../components/Parts'

export function RoundResults() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const members = useMembers()
  const isAdmin = profile?.role === 'admin'
  const [msg, setMsg] = useState<string | null>(null)
  const [puzzleId, setPuzzleId] = useState('')

  const overview = useAsync(() => rpc<RoundOverviewRow[]>('rounds_overview'), [id])
  const results = useAsync(async () => {
    const { data, error } = await supabase.from('official_results')
      .select('id, rank, entry_name, country, status, finish_seconds, pieces_placed, fetched_at, official_result_members(id, member_name, wjpc_slug, profile_id)')
      .eq('round_id', id).order('rank').order('entry_name')
    if (error) throw new Error(friendlyError(error.message))
    return data as unknown as RoundResultRow[]
  }, [id])
  const puzzles = useAsync(() => (isAdmin ? rpc<PuzzleListRow[]>('puzzle_list') : Promise.resolve([] as PuzzleListRow[])), [isAdmin])

  const round = overview.data?.find((r) => r.round_id === id)
  if ((overview.loading && !overview.data) || (results.loading && !results.data)) return <Spinner />
  if (!round) return <div className="flex flex-col gap-3"><ErrorBox message={overview.error} /><p>Diese Runde gibt es nicht.</p><Link className="text-teal-dark underline" to="/meisterschaften">Zurück zu den Meisterschaften</Link></div>

  async function run(fn: () => Promise<unknown>, after?: () => void) {
    try { await fn(); setMsg(null); after?.(); overview.reload(); results.reload() } catch (e) { setMsg(e instanceof Error ? e.message : friendlyError((e as { message?: string })?.message)) }
  }
  const rows = results.data ?? []
  const candidates = (puzzles.data ?? []).filter((p) => !round.piece_count || p.piece_count === round.piece_count)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-ink-soft"><Link className="text-teal-dark underline" to="/meisterschaften">Meisterschaften</Link></p>
        <h1 className="text-3xl font-bold">{round.event_name}, {round.round_name}</h1>
        <p className="text-ink-soft">{teamLabel(round.team_size)}{round.piece_count ? ` · ${formatInt(round.piece_count)} Teile` : ''}{round.time_limit_seconds ? ` · Zeitlimit ${formatDuration(round.time_limit_seconds)}` : ''}</p>
        <p className="mt-1">Puzzle: {round.puzzle_id ? <Link className="text-teal-dark underline" to={`/puzzle/${round.puzzle_id}`}>{round.puzzle_title}</Link> : <span className="text-ink-soft">nicht verknüpft{round.puzzle_name_source ? ` (laut Seite: «${round.puzzle_name_source}»)` : ''}. Ohne Verknüpfung gibt es keine Rangschätzung.</span>}</p>
        <p className="text-sm text-ink-soft">{round.results_url && <><a className="text-teal-dark underline" href={round.results_url} target="_blank" rel="noreferrer noopener">Offizielle Ergebnisliste</a> · </>}{round.fetched_at ? `importiert am ${formatDate(round.fetched_at)}` : 'keine Resultate importiert'}</p>
      </div>
      <ErrorBox message={msg ?? results.error ?? overview.error} />

      {isAdmin && (
        <Card>
          <h2 className="mb-2 text-lg font-bold">Admin</h2>
          <div className="flex flex-wrap items-end gap-3">
            <label className="block"><span className="mb-1 block text-sm font-semibold">Puzzle verknüpfen</span>
              <select value={puzzleId} onChange={(e) => setPuzzleId(e.target.value)} className="min-h-11 rounded-lg border border-line bg-white px-3">
                <option value="">Puzzle wählen{round.piece_count ? ` (${formatInt(round.piece_count)} Teile)` : ''}</option>{candidates.map((p) => <option key={p.puzzle_id} value={p.puzzle_id}>{p.title}{p.brand ? ` (${p.brand})` : ''}</option>)}</select></label>
            <Button variant="secondary" disabled={!puzzleId} onClick={() => run(() => rpc('admin_set_round_puzzle', { p_round: id, p_puzzle: puzzleId }))}>Verknüpfen</Button>
            {round.puzzle_id && <Button variant="secondary" onClick={() => run(() => rpc('admin_set_round_puzzle', { p_round: id, p_puzzle: null }))}>Verknüpfung lösen</Button>}
            <Link to="/admin/import" className="inline-flex min-h-11 items-center rounded-lg border border-line bg-white px-4 font-semibold hover:bg-paper">Neu importieren</Link>
            {rows.length > 0 && <Button variant="danger" onClick={() => { if (window.confirm('Alle Resultate dieser Runde löschen?')) void run(() => rpc('delete_round_results', { p_round: id })) }}>Resultate löschen</Button>}
          </div>
        </Card>)}

      {rows.length === 0 ? <p className="text-ink-soft">Für diese Runde sind keine Resultate importiert.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-left">
            <thead><tr className="border-b border-line text-ink-soft"><th className="py-2 pr-3">Rang</th><th className="pr-3">{round.team_size === 1 ? 'Name' : 'Team'}</th>{round.team_size > 1 && <th className="pr-3">Mitglieder</th>}<th className="pr-3">Land</th><th>Zeit</th></tr></thead>
            <tbody>
              {rows.map((r) => {
                const ours = r.official_result_members.some((m) => m.profile_id)
                return (
                  <tr key={r.id} className={`border-b border-line/60 align-top ${ours ? 'bg-teal/5' : ''}`}>
                    <td className="py-2 pr-3">{r.rank}</td>
                    <td className="pr-3 font-semibold">{r.entry_name}{ours && <> <Chip tone="good">Community</Chip></>}</td>
                    {round.team_size > 1 && <td className="pr-3 text-sm">{r.official_result_members.map((m, i) => (
                      <span key={m.id}>{i > 0 && ', '}{m.profile_id ? <Link className="text-teal-dark underline" to={`/person/${m.profile_id}`}>{m.member_name}</Link> : m.member_name}
                        {isAdmin && !m.profile_id && (
                          <select aria-label={`${m.member_name} einem Mitglied zuordnen`} className="ml-1 max-w-28 rounded border border-line bg-white text-xs" value=""
                            onChange={(e) => e.target.value && void run(async () => { const { error } = await supabase.from('official_result_members').update({ profile_id: e.target.value }).eq('id', m.id); if (error) throw new Error(friendlyError(error.message)) })}>
                            <option value="">zuordnen</option>{members.approved.map((p) => <option key={p.id} value={p.id}>{p.display_name}</option>)}</select>)}
                      </span>))}</td>}
                    <td className="pr-3">{r.country}</td>
                    <td>{r.status === 'finished' ? formatDuration(r.finish_seconds) : <span className="text-ink-soft">nicht fertig ({formatInt(r.pieces_placed)} Teile)</span>}</td>
                  </tr>)
              })}
            </tbody>
          </table>
        </div>)}
      <p className="text-sm text-ink-soft">Gleiche Zeit ergibt gleichen Rang. Nicht fertig gewordene Einträge stehen nach den fertigen, sortiert nach Teilezahl. Bei Paaren und Teams gilt die Zeit der ganzen Gruppe.</p>
    </div>
  )
}
