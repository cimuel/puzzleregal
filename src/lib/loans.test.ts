import { describe, expect, it } from 'vitest'
import { isActive, nextStep, notificationLink, notificationText, statusLabel } from './loans'

describe('Ausleih-Status', () => {
  it('benennt alle Status auf Deutsch wie in der Anforderung', () => {
    expect(statusLabel.requested).toBe('angefragt')
    expect(statusLabel.accepted).toBe('angenommen')
    expect(statusLabel.lent).toBe('ausgeliehen')
    expect(statusLabel.return_requested).toBe('Rückgabe angefragt')
    expect(statusLabel.returned).toBe('zurückgegeben')
  })
  it('unterscheidet laufende und abgeschlossene Ausleihen', () => {
    expect(['requested', 'accepted', 'lent', 'return_requested'].every((s) => isActive(s as never))).toBe(true)
    expect(['returned', 'declined', 'cancelled'].some((s) => isActive(s as never))).toBe(false)
  })
  it('erklärt den nächsten Schritt je nach Rolle', () => {
    expect(nextStep('requested', 'owner')).toContain('annehmen');
    expect(nextStep('requested', 'borrower')).toContain('Warte');
    expect(nextStep('returned', 'owner')).toBe('')
  })
})

describe('Mitteilungen', () => {
  it('formuliert die Anfrage mit Nachricht', () => {
    const t = notificationText({ type: 'loan_requested', payload: { borrower_name: 'Corina', puzzle_title: 'Alpen', message: 'Für das Wochenende?' } })
    expect(t).toBe('Corina möchte «Alpen» ausleihen. Nachricht: Für das Wochenende?')
  })
  it('kennt alle Typen und hat einen Standardtext', () => {
    for (const type of ['loan_accepted', 'loan_declined', 'loan_cancelled', 'loan_handed_over', 'loan_return_requested', 'loan_returned', 'copy_transferred'])
      expect(notificationText({ type, payload: { puzzle_title: 'X', owner_name: 'A', borrower_name: 'B', from_name: 'C' } })).not.toBe('Neue Mitteilung.')
    expect(notificationText({ type: 'unbekannt', payload: {} })).toBe('Neue Mitteilung.')
  })
  it('verlinkt auf die passende Seite', () => {
    expect(notificationLink({ payload: { page: 'requests' } })).toBe('/ausleihen/anfragen')
    expect(notificationLink({ payload: { page: 'mine' } })).toBe('/ausleihen/meine')
    expect(notificationLink({ payload: { page: 'shelf' } })).toBe('/mein-regal')
    expect(notificationLink({ payload: {} })).toBe('/start')
  })
})
