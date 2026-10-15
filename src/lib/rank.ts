import type { RankEstimateRow, RankReason } from './api'
import { formatDuration, formatInt } from './time'

export const teamLabel = (n: number): string => (n === 1 ? 'Einzel' : n === 2 ? 'Paar' : n === 4 ? 'Team' : `Team (${n})`)

/** Verständlicher Grund, warum keine Schätzung möglich ist. */
export function reasonText(reason: Exclude<RankReason, null>, row: Pick<RankEstimateRow, 'round_team_size' | 'time_limit_seconds' | 'piece_count'>, attemptTeamSize: number): string {
  switch (reason) {
    case 'no_results': return 'Für diese Runde sind noch keine offiziellen Resultate importiert.'
    case 'different_format': return `Diese Runde ist ein ${teamLabel(row.round_team_size)}-Wettkampf, deine Zeit ist ein ${teamLabel(attemptTeamSize)}-Versuch. Einzel-, Paar- und Teamzeiten sind nicht vergleichbar.`
    case 'different_pieces': return `Die Runde hatte ${formatInt(row.piece_count)} Teile, das Puzzle hat eine andere Teilezahl. Das ist nicht vergleichbar.`
    case 'over_time_limit': return `Deine Zeit liegt über dem Zeitlimit von ${formatDuration(row.time_limit_seconds)}. Im Wettkampf wäre das Puzzle nicht fertig geworden.`
  }
}

/** Hauptaussage der Schätzung. Nur für eligible-Zeilen. */
export function estimateSentence(row: RankEstimateRow, seconds: number): string {
  const where = `${row.event_name}, ${row.round_name}`
  return `Mit ${formatDuration(seconds)} wärst du bei ${where} etwa auf Rang ${row.estimated_rank} von ${row.finished_count} fertigen Einträgen gekommen.`
}

/** Zusatzangaben: Gleichstand und nicht fertig gewordene Einträge. */
export function estimateDetails(row: RankEstimateRow): string[] {
  const d: string[] = [`${row.faster_count} ${row.faster_count === 1 ? 'Eintrag war' : 'Einträge waren'} schneller.`]
  if (row.same_time_count > 0) d.push(`${row.same_time_count} ${row.same_time_count === 1 ? 'Eintrag war' : 'Einträge waren'} genau gleich schnell (gleicher Rang).`)
  const unfinished = row.entries_count - row.finished_count
  if (unfinished > 0) d.push(`${unfinished} ${unfinished === 1 ? 'Eintrag wurde' : 'Einträge wurden'} im Wettkampf nicht fertig.`)
  return d
}
