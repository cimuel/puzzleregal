import { describe, expect, it } from 'vitest'
import { compareDifficulty, deleteBlockText, deleteSummary, difficultyText } from './puzzles'

describe('Puzzle löschen: Texte', () => {
  it('erklärt jeden Sperrgrund verständlich', () => {
    expect(deleteBlockText('has_loans')).toContain('Ausleihen')
    expect(deleteBlockText('has_loans')).toContain('Admin')
    expect(deleteBlockText('has_rounds')).toContain('Meisterschaftsrunde')
    expect(deleteBlockText('foreign_data')).toContain('Admin')
    expect(deleteBlockText('not_allowed')).toContain('erfasst hat')
  })
  it('fasst zusammen, was gelöscht wird, auch mit Einzahl', () => {
    expect(deleteSummary({ copies_count: 1, attempts_count: 1, other_copies_count: 0, other_attempts_count: 0 })).toEqual(['1 Exemplar und 1 erfasste Zeit werden mit gelöscht.'])
    expect(deleteSummary({ copies_count: 2, attempts_count: 3, other_copies_count: 1, other_attempts_count: 2 })).toEqual([
      '2 Exemplare und 3 erfasste Zeiten werden mit gelöscht.', 'Davon gehören 1 Exemplar und 2 Zeiten anderen Personen.'])
  })
})

describe('Schwierigkeit', () => {
  it('zeigt Text mit Wort, oder «keine Angabe»', () => {
    expect(difficultyText(3)).toBe('3 von 5 (mittel)')
    expect(difficultyText(1)).toBe('1 von 5 (sehr leicht)')
    expect(difficultyText(null)).toBe('keine Angabe')
    expect(difficultyText(undefined)).toBe('keine Angabe')
  })
  it('sortiert aufsteigend und absteigend, Puzzles ohne Angabe stehen in beiden Richtungen am Ende', () => {
    const list = [3, null, 1, 5, undefined, 2]
    expect([...list].sort((a, b) => compareDifficulty(a, b, 'asc'))).toEqual([1, 2, 3, 5, null, undefined])
    expect([...list].sort((a, b) => compareDifficulty(a, b, 'desc'))).toEqual([5, 3, 2, 1, null, undefined])
  })
})

describe('Löschen: Ausleihverlauf', () => {
  it('nennt den Ausleihverlauf in der Zusammenfassung', () => {
    expect(deleteSummary({ copies_count: 1, attempts_count: 0, other_copies_count: 0, other_attempts_count: 0, loans_count: 2 })).toContain('2 Ausleihen im Verlauf werden ebenfalls gelöscht.')
    expect(deleteSummary({ copies_count: 1, attempts_count: 0, other_copies_count: 0, other_attempts_count: 0, loans_count: 1 })).toContain('1 Ausleihe im Verlauf wird ebenfalls gelöscht.')
    expect(deleteSummary({ copies_count: 1, attempts_count: 0, other_copies_count: 0, other_attempts_count: 0 }).some((l) => l.includes('Ausleihe'))).toBe(false)
  })
})
