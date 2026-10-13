import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { friendlyError } from '../lib/errors'
import { partsToSeconds, secondsToParts, todayIso } from '../lib/time'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, Field, Spinner } from '../components/ui'
import { DurationInput, ErrorBox } from '../components/Parts'

interface Row { id: string; puzzle_id: string; solved_on: string; duration_seconds: number; kind: 'official' | 'training'; team_size: number; notes: string | null; round_id: string | null; puzzles: { title: string; piece_count: number } | null }

export function AttemptEdit() {
  const { id = '' } = useParams()
  const navigate = useNavigate()
  const loaded = useAsync(async () => {
    const { data, error } = await supabase.from('attempts').select('id, puzzle_id, solved_on, duration_seconds, kind, team_size, notes, round_id, puzzles(title, piece_count)').eq('id', id).maybeSingle()
    if (error) throw new Error(friendlyError(error.message))
    return data as unknown as Row | null
  }, [id])
  const [date, setDate] = useState('')
  const [t, setT] = useState({ h: '', m: '', s: '' })
  const [kind, setKind] = useState<'official' | 'training'>('training')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const a = loaded.data

  useEffect(() => {
    if (!a) return
    const p = secondsToParts(a.duration_seconds)
    setDate(a.solved_on); setT({ h: p.h ? String(p.h) : '', m: String(p.m), s: String(p.s) }); setKind(a.kind); setNotes(a.notes ?? '')
  }, [a])

  if (loaded.loading && !a) return <Spinner />
  if (!a) return <ErrorBox message={loaded.error ?? 'Diesen Versuch gibt es nicht.'} />
  const seconds = partsToSeconds(Number(t.h || 0), Number(t.m || 0), Number(t.s || 0))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!a) return
    if (seconds === null) return setError('Bitte eine gültige Lösungszeit eingeben.')
    setBusy(true); setError(null)
    const { data, error: err } = await supabase.from('attempts').update({ solved_on: date, duration_seconds: seconds, kind: a.round_id ? 'official' : kind, notes: notes.trim() || null }).eq('id', a.id).select('id')
    if (err) { setError(friendlyError(err.message)); setBusy(false); return }
    if (!data?.length) { setError('Dafür fehlt dir die Berechtigung.'); setBusy(false); return }
    navigate(`/puzzle/${a.puzzle_id}`)
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Versuch bearbeiten</h1>
      <p className="text-ink-soft">{a.puzzles?.title}{a.team_size > 1 && ` · Team mit ${a.team_size} Personen`}. Puzzle und Teilnehmende lassen sich nicht ändern: Lösche den Versuch und erfasse ihn neu.</p>
      <form onSubmit={save} className="flex max-w-2xl flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <Field label="Datum" type="date" required max={todayIso()} value={date} onChange={(e) => setDate(e.target.value)} />
          <DurationInput h={t.h} m={t.m} s={t.s} onChange={setT} pieces={a.puzzles?.piece_count} />
          <fieldset><legend className="mb-1 font-semibold">Art des Versuchs</legend>
            <div className="flex flex-wrap gap-5">
              <label className="flex items-center gap-2"><input type="radio" name="kind" className="size-5" disabled={!!a.round_id} checked={kind === 'training'} onChange={() => setKind('training')} />Privat / Training</label>
              <label className="flex items-center gap-2"><input type="radio" name="kind" className="size-5" checked={kind === 'official'} onChange={() => setKind('official')} />Offizieller Wettkampf</label>
            </div>{a.round_id && <p className="mt-1 text-sm text-ink-soft">Der Versuch gehört zu einer Meisterschaftsrunde und bleibt offiziell.</p>}</fieldset>
          <label className="block"><span className="mb-1 block font-semibold">Notizen</span><textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} className="w-full rounded-lg border border-line bg-white px-3 py-2" /></label>
        </Card>
        <ErrorBox message={error} />
        <div className="flex gap-3"><Button type="submit" disabled={busy}>{busy ? 'Speichern …' : 'Änderungen speichern'}</Button><Button type="button" variant="secondary" onClick={() => navigate(-1)}>Abbrechen</Button></div>
      </form>
    </div>
  )
}
