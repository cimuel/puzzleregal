import { useEffect, useState, type FormEvent } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { supabase } from '../lib/supabase'
import { rpc, type AttemptRow, type Puzzle } from '../lib/api'
import { friendlyError } from '../lib/errors'
import { removeImage, uploadImage } from '../lib/image'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, Field, Spinner } from '../components/ui'
import { ErrorBox, PuzzleImage } from '../components/Parts'

export function PuzzleEdit() {
  const { id = '' } = useParams()
  const { profile } = useAuth()
  const navigate = useNavigate()
  const loaded = useAsync(async () => {
    const [p, a] = await Promise.all([
      supabase.from('puzzles').select('id, title, brand, product_no, piece_count, image_path, difficulty, notes, created_by').eq('id', id).maybeSingle(),
      rpc<AttemptRow[]>('puzzle_attempts', { p_puzzle: id }),
    ])
    if (p.error) throw new Error(friendlyError(p.error.message))
    return { puzzle: p.data as Puzzle | null, attempts: a.length }
  }, [id])
  const [f, setF] = useState({ title: '', brand: '', productNo: '', pieces: '', difficulty: '', notes: '' })
  const [file, setFile] = useState<File | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const p = loaded.data?.puzzle

  useEffect(() => {
    if (p) setF({ title: p.title, brand: p.brand ?? '', productNo: p.product_no ?? '', pieces: String(p.piece_count), difficulty: p.difficulty ? String(p.difficulty) : '', notes: p.notes ?? '' })
  }, [p])

  if (loaded.loading && !loaded.data) return <Spinner />
  if (!p) return <ErrorBox message={loaded.error ?? 'Dieses Puzzle gibt es nicht.'} />
  const locked = (loaded.data?.attempts ?? 0) > 0
  const set = (k: keyof typeof f, v: string) => setF((o) => ({ ...o, [k]: v }))

  async function save(e: FormEvent) {
    e.preventDefault()
    if (!profile || !p) return
    setBusy(true); setError(null)
    let newPath: string | null = null
    try {
      if (file) newPath = await uploadImage(profile.id, file)
      const { data, error: err } = await supabase.from('puzzles').update({
        title: f.title.trim(), brand: f.brand.trim() || null, product_no: f.productNo.trim() || null, piece_count: Number(f.pieces),
        difficulty: f.difficulty ? Number(f.difficulty) : null, notes: f.notes.trim() || null, ...(newPath ? { image_path: newPath } : {}),
      }).eq('id', p.id).select('id')
      if (err) throw new Error(friendlyError(err.message))
      if (!data?.length) throw new Error('Dafür fehlt dir die Berechtigung.')
      if (newPath && p.image_path) await removeImage(p.image_path)
      navigate(`/puzzle/${p.id}`)
    } catch (e2) {
      if (newPath) await removeImage(newPath)
      setError(e2 instanceof Error ? e2.message : 'Unbekannter Fehler.'); setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-3xl font-bold">Puzzle bearbeiten</h1>
      <form onSubmit={save} className="flex max-w-2xl flex-col gap-4">
        <Card className="flex flex-col gap-4">
          <div className="flex items-center gap-4"><PuzzleImage path={p.image_path} alt={p.title} className="h-24 w-32 rounded-lg" />
            <label className="block flex-1"><span className="mb-1 block font-semibold">Neues Foto (optional)</span><input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} /></label></div>
          <Field label="Titel" required value={f.title} onChange={(e) => set('title', e.target.value)} />
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Anzahl Teile" type="number" min={1} required disabled={locked} value={f.pieces} onChange={(e) => set('pieces', e.target.value)} hint={locked ? 'Nicht mehr änderbar: Es gibt schon Zeiten.' : undefined} />
            <Field label="Marke" value={f.brand} onChange={(e) => set('brand', e.target.value)} />
            <Field label="Produktnummer" value={f.productNo} onChange={(e) => set('productNo', e.target.value)} />
          </div>
          <label className="block"><span className="mb-1 block font-semibold">Schwierigkeit</span>
            <select value={f.difficulty} onChange={(e) => set('difficulty', e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-white px-3"><option value="">keine Angabe</option>{[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n} von 5</option>)}</select></label>
          <label className="block"><span className="mb-1 block font-semibold">Notizen</span><textarea rows={3} value={f.notes} onChange={(e) => set('notes', e.target.value)} className="w-full rounded-lg border border-line bg-white px-3 py-2" /></label>
        </Card>
        <ErrorBox message={error} />
        <div className="flex gap-3"><Button type="submit" disabled={busy}>{busy ? 'Speichern …' : 'Änderungen speichern'}</Button><Button type="button" variant="secondary" onClick={() => navigate(-1)}>Abbrechen</Button></div>
      </form>
    </div>
  )
}
