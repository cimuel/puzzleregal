import { describe, expect, it } from 'vitest'
import { formatDate, formatDelta, formatDuration, formatNumber, partsToSeconds, piecesPerHour, piecesPerMinute, secondsToParts } from './time'

describe('partsToSeconds', () => {
  it('rechnet Stunden, Minuten, Sekunden um', () => {
    expect(partsToSeconds(1, 46, 43)).toBe(6403)
    expect(partsToSeconds(0, 50, 0)).toBe(3000)
    expect(partsToSeconds(0, 0, 45)).toBe(45)
  })
  it('lehnt ungültige Eingaben ab', () => {
    expect(partsToSeconds(0, 0, 0)).toBeNull()
    expect(partsToSeconds(0, 60, 0)).toBeNull()
    expect(partsToSeconds(0, 0, 60)).toBeNull()
    expect(partsToSeconds(-1, 0, 5)).toBeNull()
    expect(partsToSeconds(1.5, 0, 0)).toBeNull()
    expect(partsToSeconds(48, 0, 0)).toBeNull()
    expect(partsToSeconds(Number.NaN, 0, 0)).toBeNull()
  })
  it('ist die Umkehrung von secondsToParts', () => {
    for (const t of [1, 59, 60, 3599, 3600, 6403, 172799]) {
      const { h, m, s } = secondsToParts(t)
      expect(partsToSeconds(h, m, s)).toBe(t)
    }
  })
})

describe('formatDuration', () => {
  it('zeigt Stunden nur, wenn nötig', () => {
    expect(formatDuration(6403)).toBe('1:46:43')
    expect(formatDuration(3000)).toBe('50:00')
    expect(formatDuration(65)).toBe('1:05')
    expect(formatDuration(3600)).toBe('1:00:00')
  })
  it('zeigt einen Strich ohne Wert', () => {
    expect(formatDuration(null)).toBe('–')
    expect(formatDuration(undefined)).toBe('–')
  })
})

describe('Geschwindigkeit', () => {
  it('Beispiel aus der Anforderung: 500 Teile in 50 Minuten = 10 Teile pro Minute', () => {
    expect(piecesPerMinute(500, 3000)).toBe(10)
    expect(piecesPerHour(500, 3000)).toBe(600)
  })
  it('Teamzeit-Beispiel: 2000 Teile in 2:47:03 ≈ 11,97 Teile pro Minute', () => {
    expect(piecesPerMinute(2000, 2 * 3600 + 47 * 60 + 3)).toBeCloseTo(11.97, 2)
  })
})

describe('Anzeige', () => {
  it('Rückstand', () => {
    expect(formatDelta(3300, 3000)).toBe('+5:00')
    expect(formatDelta(3000, 3000)).toBe('–')
  })
  it('Datum im Schweizer Format', () => {
    expect(formatDate('2026-10-11')).toBe('11.10.2026')
    expect(formatDate(null)).toBe('–')
  })
})

describe('formatNumber', () => {
  it('zeigt Teile pro Minute standardmässig mit zwei Stellen wie die Referenzseite', () => {
    expect(formatNumber(11.9654)).toBe('11.97')
    expect(formatNumber('20.00')).toBe('20.00')
    expect(formatNumber(600, 0)).toBe('600')
    expect(formatNumber(null)).toBe('–')
  })
})
