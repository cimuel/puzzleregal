import { describe, expect, it } from 'vitest'
import { generateInviteCode } from './inviteCode'

describe('generateInviteCode', () => {
  it('hat das Format xxxx-xxxx-xxxx und erfüllt die Datenbank-Regel (klein, mind. 8 Zeichen)', () => {
    const code = generateInviteCode((n) => Uint8Array.from({ length: n }, (_, i) => (i * 37) % 256))
    expect(code).toMatch(/^[a-z2-9]{4}-[a-z2-9]{4}-[a-z2-9]{4}$/)
    expect(code).toBe(code.toLowerCase().trim())
  })
  it('verwendet nie verwechselbare Zeichen', () => {
    for (let i = 0; i < 200; i++) expect(generateInviteCode()).not.toMatch(/[01oil]/)
  })
  it('liefert verschiedene Codes', () => {
    expect(new Set(Array.from({ length: 50 }, () => generateInviteCode())).size).toBe(50)
  })
})
