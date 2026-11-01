import { useState } from 'react'
import { rpc, type DeleteInfoRow } from '../lib/api'
import { removeImage } from '../lib/image'
import { deleteBlockText, deleteSummary } from '../lib/puzzles'
import { Button } from './ui'
import { ErrorBox } from './Parts'

/** «Löschen» mit Vorab-Prüfung: zeigt, was verschwindet oder warum es nicht geht. */
export function DeletePuzzle({ puzzleId, onDeleted }: { puzzleId: string; onDeleted: () => void }) {
  const [info, setInfo] = useState<DeleteInfoRow | null>(null)
  const [confirmed, setConfirmed] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function open() {
    setBusy(true); setError(null); setConfirmed(false)
    try { setInfo((await rpc<DeleteInfoRow[]>('puzzle_delete_info', { p_puzzle: puzzleId }))[0] ?? null) } catch (e) { setError(e instanceof Error ? e.message : 'Unbekannter Fehler.') }
    setBusy(false)
  }

  async function remove() {
    if (!info) return
    setBusy(true); setError(null)
    try {
      const imagePath = await rpc<string | null>('delete_puzzle', { p_puzzle: puzzleId, p_with_foreign_data: info.needs_admin_force })
      if (typeof imagePath === 'string' && imagePath) await removeImage(imagePath)
      onDeleted()
    } catch (e) { setError(e instanceof Error ? e.message : 'Unbekannter Fehler.'); setBusy(false) }
  }

  if (!info) {
    return (<span className="inline-flex flex-col gap-2"><Button variant="danger" disabled={busy} onClick={open}>Löschen</Button><ErrorBox message={error} /></span>)
  }
  return (
    <div role="alertdialog" aria-label="Puzzle löschen" className="w-full rounded-xl border border-danger/40 bg-danger/5 p-4">
      <p className="font-bold">«{info.title}» löschen?</p>
      {!info.can_delete && info.block_reason ? (
        <p className="mt-2">{deleteBlockText(info.block_reason)}</p>
      ) : (
        <>
          <ul className="mt-2 list-inside list-disc">{deleteSummary(info).map((l) => <li key={l}>{l}</li>)}</ul>
          <p className="mt-2 text-sm">Das lässt sich nicht rückgängig machen.</p>
          {info.needs_admin_force && (
            <label className="mt-3 flex items-start gap-2"><input type="checkbox" className="mt-1 size-5" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              <span>Ich weiss, dass auch Exemplare und Zeiten anderer Personen gelöscht werden. Die Besitzerinnen und Besitzer werden benachrichtigt.</span></label>)}
        </>)}
      <div className="mt-3 flex flex-wrap gap-2">
        {info.can_delete && <Button variant="danger" disabled={busy || (info.needs_admin_force && !confirmed)} onClick={remove}>{busy ? 'Löschen …' : 'Endgültig löschen'}</Button>}
        <Button variant="secondary" onClick={() => { setInfo(null); setError(null) }}>{info.can_delete ? 'Abbrechen' : 'Schliessen'}</Button>
      </div>
      <div className="mt-2"><ErrorBox message={error} /></div>
    </div>
  )
}
