import { useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { rpc, type SimilarRow } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { removeImage, uploadImage } from '../lib/image'
import { formatInt } from '../lib/time'
import { Button, Card, Field } from '../components/ui'
import { ErrorBox, PuzzleImage } from '../components/Parts'

export function PuzzleNew() {
  const { profile } = useAuth()
  const navigate = useNavigate()
  const [f, setF] = useState({ title: '', brand: '', productNo: '', pieces: '', difficulty: '', notes: '', addCopy: true,
    eventName: '', eventYear: String(new Date().getFullYear()), roundName: '', teamSize: '1', resultsUrl: '' })
  const [file, setFile] = useState<File | null>(null)
  const [preview, setPreview] = useState<string | null>(null)
  const [similar, setSimilar] = useState<SimilarRow[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const set = (k: keyof typeof f, v: string | boolean) => setF((o) => ({ ...o, [k]: v }))
  const field = 'min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2'

  function pick(e: React.ChangeEvent<HTMLInputElement>) {
    const next = e.target.files?.[0] ?? null
    setFile(next)
    setPreview((old) => { if (old) URL.revokeObjectURL(old); return next ? URL.createObjectURL(next) : null })
  }

  async function create() {
    if (!profile) return
    setBusy(true); setError(null)
    let path: string | null = null
    try {
      if (file) path = await uploadImage(profile.id, file)
      const id = await rpc<string>('add_puzzle', {
        p_title: f.title, p_brand: f.brand || null, p_product_no: f.productNo || null, p_piece_count: Number(f.pieces),
        p_image_path: path, p_difficulty: f.difficulty ? Number(f.difficulty) : null, p_notes: f.notes || null,
        p_add_copy: f.addCopy, p_event_name: f.eventName || null, p_event_year: f.eventName ? Number(f.eventYear) : null,
        p_round_name: f.roundName || null, p_round_team_size: f.eventName ? Number(f.teamSize) : null, p_results_url: f.resultsUrl || null,
      })
      navigate(`/puzzle/${id}`)
    } catch (e) {
      if (path) await removeImage(path)
      setError(e instanceof Error ? e.message : 'Unbekannter Fehler.')
      setBusy(false)
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    if (!Number.isInteger(Number(f.pieces)) || Number(f.pieces) <= 0) return setError('Bitte die Anzahl Teile als ganze Zahl grösser als 0 angeben.')
    setBusy(true)
    try {
      const found = await rpc<SimilarRow[]>('find_similar_puzzles', { p_title: f.title, p_brand: f.brand || null, p_product_no: f.productNo || null, p_piece_count: Number(f.pieces) })
      if (found.length > 0) { setSimilar(found); setBusy(false); return }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unbekannter Fehler.'); setBusy(false); return
    }
    await create()
  }

  async function addCopyTo(puzzleId: string) {
    if (!profile) return
    setBusy(true); setError(null)
    const { error: err } = await supabase.from('copies').insert({ puzzle_id: puzzleId, owner_id: profile.id })
    if (err) { setError(friendlyError(err.message)); setBusy(false); return }
    navigate(`/puzzle/${puzzleId}`)
  }

  if (similar) {
    const exact = similar.some((s) => s.reason === 'same_product_no')
    return (
      <div className="flex flex-col gap-4">
        <h1 className="text-3xl font-bold">Gibt es dieses Puzzle schon?</h1>
        <p className="max-w-prose text-ink-soft">
          {exact ? 'Ein Puzzle mit gleicher Marke und Produktnummer ist bereits erfasst. Füge stattdessen dein Exemplar hinzu, dann teilt ihr Rangliste und Zeiten.'
                 : 'Diese Puzzles sehen ähnlich aus. Falls eines deines ist, füge dein Exemplar hinzu, statt es doppelt zu erfassen.'}
        </p>
        <ErrorBox message={error} />
        <ul className="flex flex-col gap-3">
          {similar.map((s) => (
            <li key={s.puzzle_id}><Card className="flex flex-wrap items-center gap-4">
              <PuzzleImage path={s.image_path} alt={s.title} className="h-20 w-28 rounded-lg" />
              <div className="min-w-48 flex-1">
                <p className="font-bold">{s.title}</p>
                <p className="text-ink-soft">{[s.brand, s.product_no, `${formatInt(s.piece_count)} Teile`].filter(Boolean).join(', ')}</p>
                <Link className="text-teal-dark underline" to={`/puzzle/${s.puzzle_id}`} target="_blank">Ansehen</Link>
              </div>
              <Button disabled={busy} onClick={() => addCopyTo(s.puzzle_id)}>Das ist es, Exemplar hinzufügen</Button>
            </Card></li>
          ))}
        </ul>
        <div className="flex flex-wrap gap-3">
          {!exact && <Button variant="secondary" disabled={busy} onClick={create}>Nein, trotzdem neu anlegen</Button>}
          <Button variant="secondary" onClick={() => setSimilar(null)}>Zurück zum Formular</Button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Neues Puzzle erfassen</h1>
      <form onSubmit={submit} className="flex max-w-2xl flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <div>
            <label className="mb-1 block font-semibold" htmlFor="foto">Foto vom Motiv oder von der Schachtel</label>
            <input id="foto" type="file" accept="image/*" onChange={pick} className="block w-full" />
            {preview && <img src={preview} alt="Vorschau" className="mt-3 max-h-56 rounded-lg border border-line" />}
            <p className="mt-1 text-sm text-ink-soft">Das Foto wird vor dem Hochladen automatisch verkleinert.</p>
          </div>
          <Field label="Titel" required maxLength={200} value={f.title} onChange={(e) => set('title', e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Anzahl Teile" required type="number" inputMode="numeric" min={1} value={f.pieces} onChange={(e) => set('pieces', e.target.value)} />
            <Field label="Marke" value={f.brand} onChange={(e) => set('brand', e.target.value)} placeholder="z. B. Ravensburger" />
            <Field label="Produktnummer" value={f.productNo} onChange={(e) => set('productNo', e.target.value)} hint="Hilft, Doppelte zu erkennen." />
          </div>
          <label className="block"><span className="mb-1 block font-semibold">Schwierigkeit (optional)</span>
            <select value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)} className={field}>
              <option value="">keine Angabe</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} von 5</option>)}
            </select></label>
          <label className="block"><span className="mb-1 block font-semibold">Notizen (optional)</span>
            <textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} className={field} /></label>
          <label className="flex items-center gap-2"><input type="checkbox" checked={f.addCopy} onChange={(e) => set('addCopy', e.target.checked)} className="size-5" />
            Ich besitze dieses Puzzle (kommt in mein Regal)</label>
        </Card>
        <Card>
          <details>
            <summary className="cursor-pointer font-semibold">Meisterschaft oder Veranstaltung (optional)</summary>
            <div className="mt-4 flex flex-col gap-4">
              <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
                <Field label="Meisterschaft" value={f.eventName} onChange={(e) => set('eventName', e.target.value)} placeholder="z. B. Schweizer Puzzle Meisterschaft" />
                <Field label="Jahr" type="number" min={1990} max={2100} value={f.eventYear} onChange={(e) => set('eventYear', e.target.value)} />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1 block font-semibold">Runde</span>
                  <input list="runden" value={f.roundName} onChange={(e) => set('roundName', e.target.value)} className={field} placeholder="z. B. Finale" />
                  <datalist id="runden">{['Qualifikation', 'Halbfinale', 'Finale', 'Einzel', 'Paare', 'Teams'].map((r) => <option key={r} value={r} />)}</datalist></label>
                <label className="block"><span className="mb-1 block font-semibold">Wettkampfart</span>
                  <select value={f.teamSize} onChange={(e) => set('teamSize', e.target.value)} className={field}>
                    <option value="1">Einzel</option><option value="2">Paar</option><option value="4">Team (4 Personen)</option></select></label>
              </div>
              <Field label="Link zur offiziellen Ergebnisliste" type="url" value={f.resultsUrl} onChange={(e) => set('resultsUrl', e.target.value)} placeholder="https://" />
            </div>
          </details>
        </Card>
        <ErrorBox message={error} />
        <div><Button type="submit" disabled={busy}>{busy ? 'Speichern …' : 'Puzzle speichern'}</Button></div>
      </form>
    </div>
  )
}
