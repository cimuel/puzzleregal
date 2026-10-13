import { useMemo, useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { rpc, type AttemptKind, type PuzzleListRow } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { partsToSeconds, todayIso } from '../lib/time'
import { useAsync } from '../hooks/useAsync'
import { useMembers } from '../hooks/useMembers'
import { Button, Card, Field } from '../components/ui'
import { DurationInput, ErrorBox } from '../components/Parts'

interface RoundOpt { id: string; name: string; team_size: number; events: { name: string; year: number } | null }

export function AttemptNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const members = useMembers()
  const puzzles = useAsync(() => rpc<PuzzleListRow[]>('puzzle_list'), [])
  const [puzzleId, setPuzzleId] = useState(params.get('puzzle') ?? '')
  const [filter, setFilter] = useState('')
  const [date, setDate] = useState(todayIso())
  const [t, setT] = useState({ h: '', m: '', s: '' })
  const [kind, setKind] = useState<AttemptKind>('training')
  const [teamSize, setTeamSize] = useState(1)
  const [others, setOthers] = useState<string[]>([])
  const [roundId, setRoundId] = useState('')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const rounds = useAsync(async () => {
    if (!puzzleId) return [] as RoundOpt[]
    const { data, error: err } = await supabase.from('rounds').select('id, name, team_size, events(name, year)').eq('puzzle_id', puzzleId)
    if (err) throw new Error(friendlyError(err.message))
    return data as unknown as RoundOpt[]
  }, [puzzleId])

  const puzzle = puzzles.data?.find((p) => p.puzzle_id === puzzleId)
  const options = useMemo(() => {
    const needle = filter.trim().toLowerCase()
    return (puzzles.data ?? []).filter((p) => p.puzzle_id === puzzleId || !needle || [p.title, p.brand].some((v) => v?.toLowerCase().includes(needle)))
  }, [puzzles.data, filter, puzzleId])
  const matchingRounds = (rounds.data ?? []).filter((r) => r.team_size === teamSize)
  const seconds = partsToSeconds(Number(t.h || 0), Number(t.m || 0), Number(t.s || 0))
  const field = 'min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2'

  function changeTeam(n: number) {
    setTeamSize(n); setRoundId(''); setOthers((o) => o.slice(0, Math.max(0, n - 1)))
  }
  function toggle(id: string) {
    setOthers((o) => (o.includes(id) ? o.filter((x) => x !== id) : o.length < teamSize - 1 ? [...o, id] : o))
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!puzzleId) return setError('Bitte ein Puzzle auswählen.')
    if (seconds === null) return setError('Bitte eine gültige Lösungszeit eingeben.')
    setBusy(true)
    try {
      await rpc('add_attempt', {
        p_puzzle: puzzleId, p_solved_on: date, p_duration_seconds: seconds, p_kind: roundId ? 'official' : kind, p_team_size: teamSize,
        p_round: roundId || null, p_notes: notes || null, p_participants: teamSize > 1 && profile ? [profile.id, ...others] : null,
      })
      navigate(`/puzzle/${puzzleId}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.'); setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Neuen Versuch erfassen</h1>
      <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <div>
            <label htmlFor="pz" className="mb-1 block font-semibold">Puzzle</label>
            <input type="search" aria-label="Puzzle suchen" placeholder="Suchen …" value={filter} onChange={(e) => setFilter(e.target.value)} className={`${field} mb-2`} />
            <select id="pz" required value={puzzleId} onChange={(e) => { setPuzzleId(e.target.value); setRoundId('') }} className={field}>
              <option value="">Bitte wählen</option>
              {options.map((p) => <option key={p.puzzle_id} value={p.puzzle_id}>{p.title} ({[p.brand, `${p.piece_count} Teile`].filter(Boolean).join(', ')})</option>)}
            </select>
            {puzzles.data?.length === 0 && <p className="mt-1 text-sm text-ink-soft">Es gibt noch keine Puzzles. Erfasse zuerst eines unter «Neues Puzzle erfassen».</p>}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Datum" type="date" required value={date} max={todayIso()} onChange={(e) => setDate(e.target.value)} />
            <label className="block"><span className="mb-1 block font-semibold">Wer hat gepuzzelt?</span>
              <select value={teamSize} onChange={(e) => changeTeam(Number(e.target.value))} className={field}>
                <option value={1}>Nur ich (Einzel)</option><option value={2}>Zu zweit (Paar)</option><option value={3}>Zu dritt</option><option value={4}>Zu viert (Team)</option>
              </select></label>
          </div>
          <DurationInput h={t.h} m={t.m} s={t.s} onChange={setT} pieces={puzzle?.piece_count} />
          {teamSize > 1 && (
            <fieldset><legend className="mb-1 font-semibold">Wer war dabei? (du bist immer dabei)</legend>
              <div className="flex flex-wrap gap-x-5 gap-y-1">
                {members.approved.filter((m) => m.id !== profile?.id).map((m) => (
                  <label key={m.id} className="flex items-center gap-2"><input type="checkbox" className="size-5" checked={others.includes(m.id)} onChange={() => toggle(m.id)} />{m.display_name}</label>))}
              </div>
              <p className="mt-1 text-sm text-ink-soft">Du kannst weniger Personen auswählen als die Teamgrösse, falls nicht alle ein Konto haben. Die Zeit zählt nicht für die persönlichen Einzelstatistiken.</p>
            </fieldset>)}
          <fieldset><legend className="mb-1 font-semibold">Art des Versuchs</legend>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2"><input type="radio" name="kind" className="size-5" checked={kind === 'training' && !roundId} onChange={() => { setKind('training'); setRoundId('') }} />Privat / Training</label>
              <label className="flex items-center gap-2"><input type="radio" name="kind" className="size-5" checked={kind === 'official' || !!roundId} onChange={() => setKind('official')} />Offizieller Wettkampf</label>
            </div></fieldset>
          {matchingRounds.length > 0 && (
            <label className="block"><span className="mb-1 block font-semibold">Meisterschaftsrunde (optional)</span>
              <select value={roundId} onChange={(e) => { setRoundId(e.target.value); if (e.target.value) setKind('official') }} className={field}>
                <option value="">keine Zuordnung</option>
                {matchingRounds.map((r) => <option key={r.id} value={r.id}>{r.events ? `${r.events.name} ${r.events.year}, ` : ''}{r.name}</option>)}
              </select></label>)}
          <label className="block"><span className="mb-1 block font-semibold">Notizen (optional)</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className={field} /></label>
        </Card>
        <ErrorBox message={error ?? puzzles.error} />
        <div><Button type="submit" disabled={busy}>{busy ? 'Speichern …' : 'Versuch speichern'}</Button></div>
      </form>
    </div>
  )
}
