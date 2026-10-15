import { describe, expect, it } from 'vitest'
import type { RankEstimateRow } from './api'
import { estimateDetails, estimateSentence, reasonText, teamLabel } from './rank'

const row = (o: Partial<RankEstimateRow> = {}): RankEstimateRow => ({
  round_id: 'r1', event_name: 'SPM 2026', event_year: 2026, round_name: 'Finale', round_team_size: 4, piece_count: 1000, time_limit_seconds: 7200,
  results_url: null, eligible: true, reason: null, estimated_rank: 6, finished_count: 50, entries_count: 70, faster_count: 5, same_time_count: 0, fetched_at: null, ...o,
})

describe('Rangschätzung: Texte', () => {
  it('formuliert die Schätzung mit Rang und Anzahl Fertiger', () => {
    expect(estimateSentence(row(), 6403)).toBe('Mit 1:46:43 wärst du bei SPM 2026, Finale etwa auf Rang 6 von 50 fertigen Einträgen gekommen.')
  })
  it('nennt Gleichstand und nicht fertig gewordene Einträge', () => {
    expect(estimateDetails(row({ faster_count: 1, same_time_count: 2 }))).toEqual(['1 Eintrag war schneller.', '2 Einträge waren genau gleich schnell (gleicher Rang).', '20 Einträge wurden im Wettkampf nicht fertig.'])
    expect(estimateDetails(row({ faster_count: 0, entries_count: 50 }))).toEqual(['0 Einträge waren schneller.'])
  })
  it('erklärt jeden Grund verständlich', () => {
    expect(reasonText('no_results', row(), 4)).toContain('noch keine')
    expect(reasonText('different_format', row(), 1)).toContain('Team-Wettkampf')
    expect(reasonText('different_format', row({ round_team_size: 1 }), 4)).toContain('Einzel-Wettkampf')
    expect(reasonText('different_pieces', row(), 4)).toMatch(/1.000 Teile/)
    expect(reasonText('over_time_limit', row(), 4)).toContain('2:00:00')
  })
  it('benennt Wettkampfarten', () => {
    expect([1, 2, 4, 3].map(teamLabel)).toEqual(['Einzel', 'Paar', 'Team', 'Team (3)'])
  })
})
