import { useMemo, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { rpc, type AttemptRow, type LeaderRow, type Puzzle, type TeamLeaderRow } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { formatDate, formatDelta, formatDuration, formatInt, formatNumber, piecesPerMinute } from '../lib/time'
import { useAsync } from '../hooks/useAsync'
import { useMembers } from '../hooks/useMembers'
import { Button, Card, Field, Spinner } from '../components/ui'
import { Chip, ErrorBox, PuzzleImage } from '../components/Parts'
import { RequestLoan } from '../components/Loans'
import { useMyLoans } from '../hooks/useMyLoans'

interface CopyRow { id: string; owner_id: string; is_lendable: boolean; holder_id: string; is_on_loan: boolean; is_reserved: boolean; guest_name: string | null; is_with_guest: boolean }
interface RoundRow { id: string; name: string; team_size: number; results_url: string | null; events: { name: string; year: number } | null }

const teamLabel = (n: number) => (n === 1 ? 'Einzel' : n === 2 ? 'Paar' : `Team (${n})`)

export function PuzzleDetail() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const members = useMembers()
  const loans = useMyLoans()
  const [onlyOfficial, setOnlyOfficial] = useState(false)
  const [teamSize, setTeamSize] = useState(1)
  const [showAll, setShowAll] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)
  const [link, setLink] = useState({ eventName: '', year: String(new Date().getFullYear()), round: '', team: '1', url: '' })

  const puzzle = useAsync(async () => {
    const { data, error } = await supabase.from('puzzles').select('id, title, brand, product_no, piece_count, image_path, difficulty, notes, created_by').eq('id', id).maybeSingle()
    if (error) throw new Error(friendlyError(error.message))
    return data as Puzzle | null
  }, [id])
  const attempts = useAsync(() => rpc<AttemptRow[]>('puzzle_attempts', { p_puzzle: id }), [id])
  const copies = useAsync(async () => {
    const [c, s] = await Promise.all([
      supabase.from('copies').select('id, owner_id, is_lendable').eq('puzzle_id', id),
      supabase.from('copy_current_state').select('copy_id, holder_id, is_on_loan, is_reserved, is_with_guest, guest_name').eq('puzzle_id', id),
    ])
    if (c.error || s.error) throw new Error(friendlyError((c.error ?? s.error)?.message))
    const state = new Map((s.data ?? []).map((x) => [x.copy_id as string, x]))
    return (c.data ?? []).map((x) => ({ ...x, holder_id: state.get(x.id)?.holder_id ?? x.owner_id, is_on_loan: !!state.get(x.id)?.is_on_loan, is_reserved: !!state.get(x.id)?.is_reserved, is_with_guest: !!state.get(x.id)?.is_with_guest, guest_name: (state.get(x.id)?.guest_name as string | null) ?? null })) as CopyRow[]
  }, [id])
  const rounds = useAsync(async () => {
    const { data, error } = await supabase.from('rounds').select('id, name, team_size, results_url, events(name, year)').eq('puzzle_id', id)
    if (error) throw new Error(friendlyError(error.message))
    return data as unknown as RoundRow[]
  }, [id])
  const solo = useAsync(() => (teamSize === 1 ? rpc<LeaderRow[]>('puzzle_leaderboard', { p_puzzle: id, p_only_official: onlyOfficial }) : Promise.resolve([] as LeaderRow[])), [id, onlyOfficial, teamSize, attempts.data?.length])
  const team = useAsync(() => (teamSize > 1 ? rpc<TeamLeaderRow[]>('puzzle_team_leaderboard', { p_puzzle: id, p_team_size: teamSize, p_only_official: onlyOfficial }) : Promise.resolve([] as TeamLeaderRow[])), [id, onlyOfficial, teamSize, attempts.data?.length])

  const p = puzzle.data
  const isAdmin = profile?.role === 'admin'
  const sizes = useMemo(() => [...new Set([1, ...(attempts.data ?? []).map((a) => a.team_size)])].sort((a, b) => a - b), [attempts.data])
  const iOwn = (copies.data ?? []).some((c) => c.owner_id === profile?.id)
  const canEdit = !!p && (isAdmin || p.created_by === profile?.id)
  const canLink = canEdit || iOwn

  async function addCopy() {
    if (!profile) return
    const { error } = await supabase.from('copies').insert({ puzzle_id: id, owner_id: profile.id })
    if (error) return setMsg(friendlyError(error.message))
    setMsg(null); copies.reload()
  }

  async function deleteAttempt(a: AttemptRow) {
    if (!window.confirm(`Diesen Versuch (${formatDuration(a.duration_seconds)}) wirklich löschen?`)) return
    const { data, error } = await supabase.from('attempts').delete().eq('id', a.attempt_id).select('id')
    if (error) return setMsg(friendlyError(error.message))
    if (!data?.length) return setMsg('Dafür fehlt dir die Berechtigung.')
    setMsg(null); attempts.reload()
  }

  async function submitLink(e: FormEvent) {
    e.preventDefault()
    try {
      await rpc('link_puzzle_to_round', { p_puzzle: id, p_event_name: link.eventName, p_event_year: Number(link.year), p_round_name: link.round || null, p_round_team_size: Number(link.team), p_results_url: link.url || null })
      setMsg(null); setLink((l) => ({ ...l, eventName: '', round: '', url: '' })); rounds.reload()
    } catch (err) { setMsg(err instanceof Error ? err.message : 'Unbekannter Fehler.') }
  }

  if (puzzle.loading && !p) return <Spinner />
  if (!p) return <div className="flex flex-col gap-3"><ErrorBox message={puzzle.error} /><p>Dieses Puzzle gibt es nicht (mehr).</p><Link className="text-teal-dark underline" to="/puzzles">Zurück zu allen Puzzles</Link></div>

  const visible = (attempts.data ?? []).filter((a) => !onlyOfficial || a.kind === 'official')
  const top = solo.data?.[0]?.best_seconds ?? team.data?.[0]?.best_seconds ?? 0

  return (
    <div className="flex flex-col gap-6">
      <div className="grid gap-5 md:grid-cols-[minmax(0,22rem)_1fr]">
        <PuzzleImage path={p.image_path} alt={p.title} className="aspect-[4/3] w-full rounded-xl border border-line" />
        <div className="flex flex-col gap-3">
          <h1 className="text-3xl font-bold">{p.title}</h1>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
            <dt className="text-ink-soft">Teile</dt><dd>{formatInt(p.piece_count)}</dd>
            {p.brand && <><dt className="text-ink-soft">Marke</dt><dd>{p.brand}</dd></>}
            {p.product_no && <><dt className="text-ink-soft">Produktnummer</dt><dd>{p.product_no}</dd></>}
            {p.difficulty && <><dt className="text-ink-soft">Schwierigkeit</dt><dd>{p.difficulty} von 5</dd></>}
            {p.notes && <><dt className="text-ink-soft">Notizen</dt><dd className="whitespace-pre-line">{p.notes}</dd></>}
            <dt className="text-ink-soft">Erfasst von</dt><dd>{members.names.get(p.created_by) ?? '–'}</dd>
          </dl>
          <div className="mt-1 flex flex-wrap gap-2">
            <Link to={`/versuch-neu?puzzle=${p.id}`} className="inline-flex min-h-11 items-center rounded-lg bg-teal px-4 font-semibold text-white hover:bg-teal-dark">Zeit erfassen</Link>
            {!iOwn && <Button variant="secondary" onClick={addCopy}>Ich besitze dieses Puzzle auch</Button>}
            {canEdit && <Button variant="secondary" onClick={() => navigate(`/puzzle/${p.id}/bearbeiten`)}>Bearbeiten</Button>}
          </div>
        </div>
      </div>
      <ErrorBox message={msg ?? attempts.error ?? copies.error} />

      <Card>
        <h2 className="mb-3 text-xl font-bold">Exemplare ({copies.data?.length ?? 0})</h2>
        {copies.data?.length === 0 && <p className="text-ink-soft">Niemand hat ein Exemplar im Regal.</p>}
        <ul className="divide-y divide-line">
          {(copies.data ?? []).map((c) => (
            <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2">
              <span><Link className="font-semibold text-teal-dark underline" to={`/regal/${c.owner_id}`}>{members.names.get(c.owner_id) ?? '…'}</Link>
                {c.is_on_loan && <span className="text-ink-soft"> · gerade bei {members.names.get(c.holder_id) ?? '…'}</span>}</span>
              <span className="flex flex-wrap items-center gap-2">{c.is_with_guest ? <Chip tone="warn">bei Gast{c.guest_name ? ` (${c.guest_name})` : ''}</Chip> : c.is_on_loan ? <Chip tone="warn">ausgeliehen</Chip> : c.is_reserved ? <Chip tone="warn">reserviert</Chip> : <Chip tone="good">zu Hause</Chip>}{c.is_lendable ? <Chip>ausleihbar</Chip> : <Chip>nicht ausleihbar</Chip>}
                {c.owner_id !== profile?.id && c.is_lendable && !c.is_with_guest && <RequestLoan copyId={c.id} mine={loans.myActiveByCopy.get(c.id)} onDone={() => { copies.reload(); loans.reload() }} />}</span>
            </li>
          ))}
        </ul>
      </Card>

      <Card>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Rangliste</h2>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={onlyOfficial} onChange={(e) => setOnlyOfficial(e.target.checked)} />Nur offizielle Resultate</label>
            <select aria-label="Wettkampfart" value={teamSize} onChange={(e) => setTeamSize(Number(e.target.value))} className="min-h-10 rounded-lg border border-line bg-white px-2">
              {sizes.map((s) => <option key={s} value={s}>{teamLabel(s)}</option>)}
            </select>
          </div>
        </div>
        <ErrorBox message={solo.error ?? team.error} />
        {(teamSize === 1 ? solo.data : team.data)?.length === 0 && <p className="text-ink-soft">{onlyOfficial ? 'Noch keine offiziellen Zeiten.' : 'Noch keine Zeiten. Du kannst die erste erfassen.'}</p>}
        {(teamSize === 1 ? (solo.data?.length ?? 0) : (team.data?.length ?? 0)) > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[34rem] text-left">
              <thead><tr className="border-b border-line text-ink-soft"><th className="py-2 pr-3">Rang</th><th className="pr-3">{teamSize === 1 ? 'Name' : 'Besetzung'}</th><th className="pr-3">Beste Zeit</th><th className="pr-3">Rückstand</th><th className="pr-3">Teile/Min</th><th className="pr-3">Datum</th><th>Versuche</th></tr></thead>
              <tbody>
                {teamSize === 1
                  ? (solo.data ?? []).map((r) => (
                    <tr key={r.profile_id} className={`border-b border-line/60 ${r.profile_id === profile?.id ? 'bg-teal/5 font-semibold' : ''}`}>
                      <td className="py-2 pr-3">{r.rank}</td><td className="pr-3"><Link className="text-teal-dark underline" to={`/person/${r.profile_id}`}>{r.display_name}</Link></td>
                      <td className="pr-3">{formatDuration(r.best_seconds)}</td><td className="pr-3">{formatDelta(r.best_seconds, top)}</td><td className="pr-3">{formatNumber(r.pieces_per_minute)}</td><td className="pr-3">{formatDate(r.best_date)}</td><td>{r.attempts_count}</td></tr>))
                  : (team.data ?? []).map((r, i) => (
                    <tr key={i} className="border-b border-line/60"><td className="py-2 pr-3">{r.rank}</td><td className="pr-3">{r.team_names}</td><td className="pr-3">{formatDuration(r.best_seconds)}</td><td className="pr-3">{formatDelta(r.best_seconds, top)}</td><td className="pr-3">{formatNumber(r.pieces_per_minute)}</td><td className="pr-3">{formatDate(r.best_date)}</td><td>{r.attempts_count}</td></tr>))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-3 text-sm text-ink-soft">Gleiche Zeit ergibt gleichen Rang. Teile pro Minute = Teile ÷ Minuten der besten Zeit.{teamSize > 1 && ' Bei Paaren und Teams ist es die Zeit der ganzen Gruppe.'}</p>
      </Card>

      <Card>
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">Alle Versuche ({visible.length})</h2>
          <Button variant="secondary" aria-expanded={showAll} onClick={() => setShowAll((v) => !v)}>{showAll ? 'Ausblenden' : 'Anzeigen'}</Button>
        </div>
        {showAll && (visible.length === 0 ? <p className="text-ink-soft">Keine Versuche.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[38rem] text-left">
              <thead><tr className="border-b border-line text-ink-soft"><th className="py-2 pr-3">Datum</th><th className="pr-3">Zeit</th><th className="pr-3">Teile/Min</th><th className="pr-3">Wer</th><th className="pr-3">Art</th><th>Notiz</th><th /></tr></thead>
              <tbody>{visible.map((a) => {
                const mine = a.created_by === profile?.id || isAdmin
                return (<tr key={a.attempt_id} className="border-b border-line/60 align-top">
                  <td className="py-2 pr-3">{formatDate(a.solved_on)}</td><td className="pr-3">{formatDuration(a.duration_seconds)}</td>
                  <td className="pr-3">{formatNumber(piecesPerMinute(p.piece_count, a.duration_seconds))}</td><td className="pr-3">{a.participant_names}{a.team_size > 1 && ` (${teamLabel(a.team_size)})`}</td>
                  <td className="pr-3">{a.kind === 'official' ? <Chip tone="good">offiziell</Chip> : <Chip>Training</Chip>}</td><td>{a.notes}</td>
                  <td className="whitespace-nowrap text-right">{mine && <><Link className="mr-3 text-teal-dark underline" to={`/versuch/${a.attempt_id}/bearbeiten`}>Bearbeiten</Link><button className="text-danger underline" onClick={() => deleteAttempt(a)}>Löschen</button></>}</td></tr>)
              })}</tbody>
            </table>
          </div>
        ))}
      </Card>

      <Card>
        <h2 className="mb-3 text-xl font-bold">Meisterschaften</h2>
        {(rounds.data ?? []).length === 0 ? <p className="text-ink-soft">Dieses Puzzle ist noch mit keiner Meisterschaft verknüpft.</p> : (
          <ul className="mb-4 flex flex-col gap-1">{(rounds.data ?? []).map((r) => (
            <li key={r.id}>{r.events ? `${r.events.name} ${r.events.year}` : 'Veranstaltung'}, {r.name} ({teamLabel(r.team_size)}){r.results_url && <> · <a className="text-teal-dark underline" href={r.results_url} target="_blank" rel="noreferrer noopener">Ergebnisliste</a></>}</li>))}</ul>)}
        {canLink && (
          <details><summary className="cursor-pointer font-semibold">Mit einer Meisterschaft verknüpfen</summary>
            <form onSubmit={submitLink} className="mt-3 grid max-w-xl gap-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_7rem]"><Field label="Meisterschaft" required value={link.eventName} onChange={(e) => setLink({ ...link, eventName: e.target.value })} /><Field label="Jahr" type="number" required value={link.year} onChange={(e) => setLink({ ...link, year: e.target.value })} /></div>
              <div className="grid gap-3 sm:grid-cols-2"><Field label="Runde" value={link.round} onChange={(e) => setLink({ ...link, round: e.target.value })} placeholder="z. B. Finale" />
                <label className="block"><span className="mb-1 block font-semibold">Wettkampfart</span><select value={link.team} onChange={(e) => setLink({ ...link, team: e.target.value })} className="min-h-11 w-full rounded-lg border border-line bg-white px-3"><option value="1">Einzel</option><option value="2">Paar</option><option value="4">Team (4)</option></select></label></div>
              <Field label="Link zur Ergebnisliste" type="url" value={link.url} onChange={(e) => setLink({ ...link, url: e.target.value })} />
              <div><Button type="submit">Verknüpfen</Button></div>
            </form></details>)}
      </Card>
    </div>
  )
}
