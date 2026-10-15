import { useEffect, useMemo, useState } from 'react'
import { rpc, type AttemptRow, type RankEstimateRow } from '../lib/api'
import { estimateDetails, estimateSentence, reasonText, teamLabel } from '../lib/rank'
import { formatDate, formatDuration } from '../lib/time'
import { useAsync } from '../hooks/useAsync'
import { Card } from './ui'
import { Chip, ErrorBox } from './Parts'

/** Hypothetische Rangschätzung: eine eigene Zeit gegen die offiziellen Resultate verknüpfter Meisterschaftsrunden. */
export function RankEstimate({ puzzleId, attempts, myId }: { puzzleId: string; attempts: AttemptRow[]; myId: string | undefined }) {
  const mine = useMemo(() => attempts.filter((a) => myId && a.participant_ids?.includes(myId)).sort((a, b) => a.duration_seconds - b.duration_seconds), [attempts, myId])
  const [selected, setSelected] = useState('')
  useEffect(() => { if (!selected && mine[0]) setSelected(mine[0].attempt_id) }, [mine, selected])
  const attempt = mine.find((a) => a.attempt_id === selected)

  const est = useAsync(
    () => (attempt ? rpc<RankEstimateRow[]>('rank_estimates', { p_puzzle: puzzleId, p_seconds: attempt.duration_seconds, p_team_size: attempt.team_size }) : Promise.resolve([] as RankEstimateRow[])),
    [puzzleId, attempt?.attempt_id],
  )

  return (
    <Card>
      <h2 className="mb-1 text-xl font-bold">Hypothetische Rangschätzung</h2>
      <p className="mb-3 text-sm text-ink-soft">Wo wärst du mit deiner Zeit bei einer Meisterschaft gelandet? Das ist eine Schätzung und kein offizielles Ergebnis. Verglichen wird nur bei gleichem Puzzle, gleicher Wettkampfart (Einzel, Paar, Team) und innerhalb des Zeitlimits.</p>
      {mine.length === 0 ? <p className="text-ink-soft">Du hast für dieses Puzzle noch keine Zeit erfasst. Erfasse zuerst einen Versuch, dann kannst du dich vergleichen.</p> : (
        <>
          <label className="mb-4 block max-w-md"><span className="mb-1 block font-semibold">Welche deiner Zeiten?</span>
            <select value={selected} onChange={(e) => setSelected(e.target.value)} className="min-h-11 w-full rounded-lg border border-line bg-white px-3">
              {mine.map((a) => <option key={a.attempt_id} value={a.attempt_id}>{formatDuration(a.duration_seconds)} · {teamLabel(a.team_size)} · {formatDate(a.solved_on)}{a.kind === 'official' ? ' · offiziell' : ''}</option>)}
            </select></label>
          <ErrorBox message={est.error} />
          {!est.loading && (est.data ?? []).length === 0 && <p className="text-ink-soft">Dieses Puzzle ist mit keiner Meisterschaftsrunde verknüpft. Darum ist keine Schätzung möglich.</p>}
          <ul className="flex flex-col gap-3">
            {(est.data ?? []).map((r) => (
              <li key={r.round_id} className="rounded-xl border border-line bg-paper p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-semibold">{r.event_name}, {r.round_name} <span className="font-normal text-ink-soft">({teamLabel(r.round_team_size)})</span></p>
                  {r.eligible ? <Chip tone="good">Schätzung</Chip> : <Chip>nicht vergleichbar</Chip>}
                </div>
                {r.eligible && attempt ? (
                  <>
                    <p className="mt-2 text-lg"><strong>Hypothetisch:</strong> {estimateSentence(r, attempt.duration_seconds)}</p>
                    <ul className="mt-1 list-inside list-disc text-sm text-ink-soft">{estimateDetails(r).map((d) => <li key={d}>{d}</li>)}</ul>
                    <p className="mt-2 text-sm text-ink-soft">Quelle: offizielle Ergebnisliste{r.results_url && <> (<a className="text-teal-dark underline" href={r.results_url} target="_blank" rel="noreferrer noopener">Link</a>)</>}{r.fetched_at && <>, importiert am {formatDate(r.fetched_at)}</>}. Im Wettkampf gelten Zeitdruck, Tisch und Publikum: Dein Rang dort kann abweichen.</p>
                  </>
                ) : r.reason && attempt ? <p className="mt-2 text-ink-soft">{reasonText(r.reason, r, attempt.team_size)}</p> : null}
              </li>))}
          </ul>
        </>)}
    </Card>
  )
}
