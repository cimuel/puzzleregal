import type { DeleteBlock } from './api'

/** Erklärt, warum ein Puzzle nicht gelöscht werden kann. */
export function deleteBlockText(reason: Exclude<DeleteBlock, null>): string {
  switch (reason) {
    case 'not_allowed': return 'Nur wer das Puzzle erfasst hat oder ein Admin kann es löschen.'
    case 'has_loans': return 'Für dieses Puzzle gibt es Ausleihen (auch abgeschlossene). Nur ein Admin kann es mit diesem Verlauf löschen.'
    case 'has_rounds': return 'Das Puzzle ist mit einer Meisterschaftsrunde verknüpft. Löse zuerst die Verknüpfung auf der Rundenseite (Admin), sonst ginge die Rangschätzung verloren.'
    case 'foreign_data': return 'Es hängen Exemplare oder Zeiten anderer Personen daran. Nur ein Admin kann das Puzzle mit diesen Daten löschen.'
  }
}

/** Zusammenfassung dessen, was beim Löschen verschwindet. */
export function deleteSummary(i: { copies_count: number; attempts_count: number; other_copies_count: number; other_attempts_count: number; loans_count?: number }): string[] {
  const out: string[] = []
  out.push(`${i.copies_count} ${i.copies_count === 1 ? 'Exemplar' : 'Exemplare'} und ${i.attempts_count} ${i.attempts_count === 1 ? 'erfasste Zeit' : 'erfasste Zeiten'} werden mit gelöscht.`)
  if (i.other_copies_count > 0 || i.other_attempts_count > 0)
    out.push(`Davon gehören ${i.other_copies_count} ${i.other_copies_count === 1 ? 'Exemplar' : 'Exemplare'} und ${i.other_attempts_count} ${i.other_attempts_count === 1 ? 'Zeit' : 'Zeiten'} anderen Personen.`)
  if ((i.loans_count ?? 0) > 0) out.push(`${i.loans_count} ${i.loans_count === 1 ? 'Ausleihe' : 'Ausleihen'} im Verlauf ${i.loans_count === 1 ? 'wird' : 'werden'} ebenfalls gelöscht.`)
  return out
}

export const DIFFICULTY_LABELS: Record<number, string> = { 1: 'sehr leicht', 2: 'leicht', 3: 'mittel', 4: 'schwer', 5: 'sehr schwer' }

/** «3 von 5 (mittel)» oder «keine Angabe». */
export function difficultyText(d: number | null | undefined): string {
  return d ? `${d} von 5 (${DIFFICULTY_LABELS[d] ?? ''})`.replace(' ()', '') : 'keine Angabe'
}

/** Vergleich für die Sortierung. Puzzles ohne Angabe stehen immer am Ende, bei beiden Richtungen. */
export function compareDifficulty(a: number | null | undefined, b: number | null | undefined, dir: 'asc' | 'desc'): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  return dir === 'asc' ? a - b : b - a
}
