import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { rpc, type PuzzleListRow, type SimilarRow } from '../lib/api'
import { formatDuration, formatInt } from '../lib/time'
import { parseAny, parseDurationLoose, type ParsedResults } from '../lib/wjpc'
import { useAsync } from '../hooks/useAsync'
import { Button, Card, Field, Notice } from '../components/ui'
import { ErrorBox } from '../components/Parts'

const field = 'min-h-11 w-full rounded-lg border border-line bg-white px-3 py-2'

export function AdminImport() {
  const [parsed, setParsed] = useState<ParsedResults | null>(null)
  const [csv, setCsv] = useState('')
  const [form, setForm] = useState({ event: '', year: '', round: '', team: '4', pieces: '', limit: '', url: '', puzzleId: '' })
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<{ roundId: string; imported: number; linked: number } | null>(null)
  const [busy, setBusy] = useState(false)
  const [suggest, setSuggest] = useState<SimilarRow[]>([])
  const puzzles = useAsync(() => rpc<PuzzleListRow[]>('puzzle_list'), [])
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }))

  function load(input: string) {
    setDone(null); setError(null)
    const res = parseAny(input)
    setParsed(res)
    const m = res.meta
    setForm((f) => ({
      ...f, event: m.eventName ?? f.event, year: m.eventYear ? String(m.eventYear) : f.year, round: m.roundName ?? f.round,
      team: m.teamSize ? String(m.teamSize) : f.team, pieces: m.pieceCount ? String(m.pieceCount) : f.pieces,
      limit: m.timeLimitSeconds ? formatDuration(m.timeLimitSeconds) : f.limit, url: m.sourceUrl ?? f.url, puzzleId: '',
    }))
  }

  // Passendes Puzzle vorschlagen: Name aus der Seite und Teilezahl der Runde
  const puzzleName = parsed?.meta.puzzleName
  useEffect(() => {
    if (!puzzleName) { setSuggest([]); return }
    let alive = true
    rpc<SimilarRow[]>('find_similar_puzzles', { p_title: puzzleName, p_brand: null, p_product_no: null, p_piece_count: form.pieces ? Number(form.pieces) : null })
      .then((r) => { if (alive) { setSuggest(r); if (r[0] && r[0].score >= 0.5) setForm((f) => (f.puzzleId ? f : { ...f, puzzleId: r[0].puzzle_id })) } })
      .catch(() => alive && setSuggest([]))
    return () => { alive = false }
  }, [puzzleName, form.pieces])

  const stats = useMemo(() => {
    const rows = parsed?.rows ?? []
    return { total: rows.length, finished: rows.filter((r) => r.status === 'finished').length, members: rows.reduce((n, r) => n + r.members.length, 0), withProfile: rows.reduce((n, r) => n + r.members.filter((m) => m.slug).length, 0) }
  }, [parsed])

  async function doImport() {
    if (!parsed || parsed.rows.length === 0) return
    setBusy(true); setError(null)
    try {
      const limit = form.limit.trim() ? parseDurationLoose(form.limit.trim()) : null
      if (form.limit.trim() && limit === null) throw new Error('Das Zeitlimit ist ungültig. Beispiel: 2:00:00')
      const roundId = await rpc<string>('admin_ensure_round', {
        p_event_name: form.event, p_event_year: Number(form.year), p_round_name: form.round, p_team_size: Number(form.team),
        p_piece_count: form.pieces ? Number(form.pieces) : null, p_time_limit_seconds: limit, p_results_url: form.url || null,
        p_puzzle: form.puzzleId || null, p_puzzle_name_source: parsed.meta.puzzleName ?? null,
      })
      const res = await rpc<{ imported: number; members: number; linked: number }>('import_round_results', { p_round: roundId, p_rows: parsed.rows, p_source_url: form.url || null })
      setDone({ roundId, imported: res.imported, linked: res.linked })
    } catch (e) { setError(e instanceof Error ? e.message : 'Unbekannter Fehler.') }
    setBusy(false)
  }

  const ready = !!parsed && parsed.rows.length > 0 && form.event.trim() && form.round.trim() && Number(form.year) > 1989
  return (
    <div className="flex flex-col gap-6">
      <div><p className="text-sm text-ink-soft"><Link className="text-teal-dark underline" to="/meisterschaften">Meisterschaften</Link></p>
        <h1 className="text-3xl font-bold">Resultate importieren</h1></div>

      <Card>
        <h2 className="mb-2 text-xl font-bold">1. Ergebnisliste einlesen</h2>
        <p className="mb-3 max-w-prose text-ink-soft">Öffne die Ergebnisseite der Runde auf worldjigsawpuzzle.org. Am zuverlässigsten ist die ganze Seite als Datei: <strong>Strg + S</strong>, Typ «Webseite, nur HTML», dann hier hochladen. Alternativ die Tabelle markieren, kopieren und in das Feld unten einfügen. Im Notfall geht auch CSV.</p>
        <div className="flex flex-col gap-4">
          <label className="block"><span className="mb-1 block font-semibold">Gespeicherte Seite oder CSV-Datei</span>
            <input type="file" accept=".html,.htm,.csv,.txt,text/html,text/csv,text/plain" onChange={async (e) => { const f = e.target.files?.[0]; if (f) load(await f.text()) }} /></label>
          <div>
            <span className="mb-1 block font-semibold">Kopierte Tabelle einfügen</span>
            <div contentEditable suppressContentEditableWarning role="textbox" aria-label="Kopierte Tabelle hier einfügen" tabIndex={0}
              onPaste={(e) => { e.preventDefault(); const html = e.clipboardData.getData('text/html'); const text = e.clipboardData.getData('text/plain'); load(/<table|<tr/i.test(html) ? html : text) }}
              className="min-h-16 rounded-lg border-2 border-dashed border-line bg-white px-3 py-3 text-ink-soft">Hier klicken, dann Strg + V</div>
          </div>
          <details><summary className="cursor-pointer font-semibold">CSV oder Text einfügen</summary>
            <p className="my-2 text-sm text-ink-soft">Spalten: Rang; Name; Mitglieder (mit « / » getrennt); Land; Zeit (z. B. 1:46:43) oder Teile (z. B. 992 Pieces). Eine Kopfzeile ist möglich.</p>
            <textarea rows={5} value={csv} onChange={(e) => setCsv(e.target.value)} className={`${field} font-mono text-sm`} placeholder={'Rang;Name;Mitglieder;Land;Zeit\n1;Fast Pi;Corina / Cinja / Caroline / Severina;Schweiz;1:46:43'} />
            <div className="mt-2"><Button variant="secondary" disabled={!csv.trim()} onClick={() => load(csv)}>Einlesen</Button></div></details>
        </div>
      </Card>

      {parsed && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">2. Vorschau prüfen</h2>
          {parsed.rows.length === 0 ? <Notice kind="error">{parsed.warnings[0] ?? 'Keine Zeilen erkannt.'}</Notice> : (
            <>
              <p className="mb-2"><strong>{stats.total} Einträge</strong>: {stats.finished} fertig, {stats.total - stats.finished} nicht fertig · {stats.members} Personen ({stats.withProfile} mit WJPC-Profil)</p>
              {parsed.warnings.length > 0 && <ul className="mb-3 list-inside list-disc rounded-lg border border-mustard/60 bg-mustard/15 px-3 py-2 text-sm">{parsed.warnings.map((w) => <li key={w}>{w}</li>)}</ul>}
              <div className="overflow-x-auto"><table className="w-full min-w-[32rem] text-left text-sm">
                <thead><tr className="border-b border-line text-ink-soft"><th className="py-1 pr-3">Rang</th><th className="pr-3">Name</th><th className="pr-3">Personen</th><th>Zeit</th></tr></thead>
                <tbody>{parsed.rows.slice(0, 8).map((r, i) => (
                  <tr key={i} className="border-b border-line/60 align-top"><td className="py-1 pr-3">{r.rank}</td><td className="pr-3 font-semibold">{r.entry_name}</td><td className="pr-3">{r.members.map((m) => m.name).join(', ')}</td>
                    <td>{r.status === 'finished' ? formatDuration(r.finish_seconds) : `nicht fertig (${formatInt(r.pieces_placed)} Teile)`}</td></tr>))}</tbody></table></div>
              {parsed.rows.length > 8 && <p className="mt-1 text-sm text-ink-soft">… und {parsed.rows.length - 8} weitere. Prüfe vor allem, dass die Personen richtig getrennt sind und keine Herkunft als Name erscheint.</p>}
            </>)}
        </Card>)}

      {parsed && parsed.rows.length > 0 && (
        <Card>
          <h2 className="mb-2 text-xl font-bold">3. Runde und Puzzle</h2>
          <div className="grid max-w-3xl gap-4 sm:grid-cols-2">
            <Field label="Meisterschaft" value={form.event} onChange={(e) => set('event', e.target.value)} />
            <Field label="Jahr" type="number" value={form.year} onChange={(e) => set('year', e.target.value)} />
            <Field label="Runde" value={form.round} onChange={(e) => set('round', e.target.value)} placeholder="z. B. Finale" />
            <label className="block"><span className="mb-1 block font-semibold">Wettkampfart</span>
              <select value={form.team} onChange={(e) => set('team', e.target.value)} className={field}><option value="1">Einzel</option><option value="2">Paar</option><option value="4">Team (4)</option></select></label>
            <Field label="Teilezahl der Runde" type="number" value={form.pieces} onChange={(e) => set('pieces', e.target.value)} />
            <Field label="Zeitlimit" value={form.limit} onChange={(e) => set('limit', e.target.value)} placeholder="2:00:00" />
            <div className="sm:col-span-2"><Field label="Link zur Ergebnisliste" type="url" value={form.url} onChange={(e) => set('url', e.target.value)} /></div>
          </div>
          <div className="mt-4 max-w-3xl">
            <p className="font-semibold">Puzzle der Runde{puzzleName ? <> <span className="font-normal text-ink-soft">(laut Seite: «{puzzleName}»)</span></> : ''}</p>
            {suggest.length > 0 && <p className="mb-1 text-sm text-ink-soft">Vorschlag: {suggest.map((s) => <button key={s.puzzle_id} type="button" className="mr-2 text-teal-dark underline" onClick={() => set('puzzleId', s.puzzle_id)}>{s.title} ({formatInt(s.piece_count)} Teile)</button>)}</p>}
            <select aria-label="Puzzle der Runde" value={form.puzzleId} onChange={(e) => set('puzzleId', e.target.value)} className={field}>
              <option value="">Noch nicht verknüpfen</option>
              {(puzzles.data ?? []).map((p) => <option key={p.puzzle_id} value={p.puzzle_id}>{p.title} ({[p.brand, `${p.piece_count} Teile`].filter(Boolean).join(', ')})</option>)}</select>
            <p className="mt-1 text-sm text-ink-soft">Nur mit verknüpftem Puzzle gibt es später die Rangschätzung. Fehlt das Puzzle, erfasse es zuerst unter «Neues Puzzle erfassen» und importiere danach (oder verknüpfe es später auf der Rundenseite).</p>
          </div>
          <ErrorBox message={error} />
          <p className="mt-4 text-sm text-ink-soft">Beim Import werden vorhandene Resultate dieser Runde ersetzt. Personen werden automatisch Mitgliedern zugeordnet: über das WJPC-Profil im Profil oder bei genau gleichem Namen. Den Rest kannst du auf der Rundenseite von Hand zuordnen.</p>
          <div className="mt-3"><Button disabled={!ready || busy} onClick={doImport}>{busy ? 'Importieren …' : `${stats.total} Resultate importieren`}</Button></div>
        </Card>)}

      {done && <Notice kind="success">Importiert: {done.imported} Einträge, {done.linked} Personen automatisch zugeordnet. <Link className="font-semibold underline" to={`/runde/${done.roundId}`}>Zur Runde</Link></Notice>}
    </div>
  )
}
