import { describe, expect, it } from 'vitest'
import { friendlyError } from './errors'

describe('friendlyError', () => {
  it('erklärt den Registrierungsfehler der Datenbank', () => {
    expect(friendlyError('Database error saving new user')).toContain('Einladungscode')
  })
  it('erkennt doppelte E-Mail-Adressen', () => {
    expect(friendlyError('User already registered')).toContain('bereits registriert')
  })
  it('erkennt falsche Zugangsdaten', () => {
    expect(friendlyError('Invalid login credentials')).toContain('Passwort')
  })
  it('weist auf mögliche Pausierung bei Netzwerkfehlern hin', () => {
    expect(friendlyError('Failed to fetch')).toContain('reaktiviert')
  })
  it('meldet fehlende Berechtigung verständlich', () => {
    expect(friendlyError('Nicht berechtigt')).toBe('Dafür fehlt dir die Berechtigung.')
  })
  it('erklärt doppelte Puzzles', () => {
    expect(friendlyError('duplicate key value violates unique constraint "puzzles_brand_product_no_key"')).toContain('gibt es schon')
  })
  it('liefert bei leerer Meldung einen Standardtext', () => {
    expect(friendlyError(undefined)).toContain('Unbekannter Fehler')
  })
})
