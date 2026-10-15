/**
 * Einlesen von Ergebnislisten der WJPC (worldjigsawpuzzle.org) aus gespeichertem oder kopiertem HTML,
 * dazu ein CSV-Weg als Ersatz. Reine Funktionen, ohne Netzwerkzugriff.
 *
 * Aufbau der Tabelle laut echter Seite: «#», Flagge, Name, Herkunft, Land, Zeit, …
 * Name-Zelle: Flagge, Landname, fetter Teamname (nur bei Teams), Mitglieder getrennt mit « / » (Mitglieder mit
 * WJPC-Profil sind verlinkt auf /player/<kürzel>), am Schluss die Herkunft.
 * Zeit-Zelle: «01:03:18   +5' 15'' (at 5' 15'')» (fertig) oder «992 Pieces» (nicht fertig).
 */

export interface ParsedMember { name: string; slug: string | null }
export interface ParsedRow {
  rank: number
  entry_name: string
  country: string | null
  status: 'finished' | 'unfinished'
  finish_seconds: number | null
  pieces_placed: number | null
  members: ParsedMember[]
}
export interface ParsedMeta {
  eventName?: string; eventYear?: number; roundName?: string; teamSize?: number
  pieceCount?: number; timeLimitSeconds?: number; puzzleName?: string; sourceUrl?: string
}
export interface ParsedResults { rows: ParsedRow[]; meta: ParsedMeta; warnings: string[] }

const PLACEHOLDER = /\u0001(\d+)\u0002/

export const normSpace = (s: string | null | undefined): string => (s ?? '').replace(/[\s\u00a0]+/g, ' ').trim()

/** «01:46:43 +1' 44''» → fertig in 6403 s. «992 Pieces» → nicht fertig mit 992 Teilen. Sonst null. */
export function parseTimeCell(text: string): { status: 'finished'; seconds: number } | { status: 'unfinished'; pieces: number } | null {
  const t = normSpace(text)
  const time = /(?<![\d:])(\d{1,2}):(\d{2}):(\d{2})(?![\d:])/.exec(t)
  if (time) return { status: 'finished', seconds: Number(time[1]) * 3600 + Number(time[2]) * 60 + Number(time[3]) }
  const pieces = /(\d[\d.']*)\s*(?:pieces?|teile?)\b/i.exec(t)
  if (pieces) return { status: 'unfinished', pieces: Number(pieces[1].replace(/[.']/g, '')) }
  return null
}

/** Kopfzeile der Seite: «1.00002:00:00» = 1000 Teile und Zeitlimit 02:00:00. */
export function parseHeaderNumbers(text: string): { pieces: number; limitSeconds: number } | null {
  const m = /^(\d+(?:\.\d{3})*)(\d{2}):(\d{2}):(\d{2})$/.exec(normSpace(text))
  if (!m) return null
  return { pieces: Number(m[1].replace(/\./g, '')), limitSeconds: Number(m[2]) * 3600 + Number(m[3]) * 60 + Number(m[4]) }
}

function parseNameCell(cell: Element, origin: string, country: string): { entryName: string; members: ParsedMember[]; hasTeamName: boolean } {
  const clone = cell.cloneNode(true) as Element
  clone.querySelectorAll('img, script, style').forEach((n) => n.remove())

  let team: string | null = null
  const bold = clone.querySelector('b, strong')
  if (bold) { team = normSpace(bold.textContent); bold.remove() }

  const anchors: ParsedMember[] = []
  clone.querySelectorAll('a').forEach((a) => {
    const m = /\/player\/([^/?#\s]+)/.exec(a.getAttribute('href') ?? '')
    const replacement = clone.ownerDocument.createTextNode(m ? `\u0001${anchors.length}\u0002` : ' ')
    if (m) anchors.push({ name: normSpace(a.textContent), slug: decodeURIComponent(m[1]).toLowerCase() })
    a.replaceWith(replacement)
  })

  let text = normSpace(clone.textContent)
  if (country && text.toLowerCase().startsWith(country.toLowerCase())) text = normSpace(text.slice(country.length))
  if (origin && text.endsWith(origin) && (text.length === origin.length || text[text.length - origin.length - 1] === ' ')) {
    text = normSpace(text.slice(0, text.length - origin.length))
  }

  const members: ParsedMember[] = []
  for (const part of text.split(/\s*\/\s*/)) {
    const p = normSpace(part)
    if (!p) continue
    const ph = PLACEHOLDER.exec(p)
    if (ph) members.push(anchors[Number(ph[1])])
    else members.push({ name: p, slug: null })
  }
  const entryName = team || members.map((m) => m.name).join(' / ')
  return { entryName, members, hasTeamName: !!team }
}

interface ColumnMap { rank: number; name: number; origin: number; country: number; time: number }

/**
 * Spalten erkennen. Die Tabellen der WJPC sind je nach Meisterschaft und Jahr verschieden (2026: «#», Flagge, Name, Herkunft,
 * Land, Zeit; 2024: «#», Name, Herkunft, Zeit). Darum: erst die Überschriften lesen, bei Lücken den Inhalt prüfen.
 * Herkunft und Land sind optional (-1).
 */
function columnMap(table: Element, dataRows: Element[][]): ColumnMap | null {
  const head = table.querySelector('thead tr') ?? table.querySelector('tr')
  const headers = head ? Array.from(head.querySelectorAll('th')).map((h) => normSpace(h.textContent).toLowerCase()) : []
  const find = (...names: string[]) => headers.findIndex((h) => names.includes(h))
  const fromHeader = { rank: find('#', 'rank', 'rang'), name: find('name'), origin: find('origin', 'herkunft'), country: find('country', 'land'), time: find('time', 'zeit') }
  const width = Math.max(0, ...dataRows.map((r) => r.length))
  if (fromHeader.rank >= 0 && fromHeader.name >= 0 && fromHeader.time >= 0 && fromHeader.time < width && fromHeader.name < width) return fromHeader

  // Fallback über den Inhalt der Zeilen
  const sample = dataRows.slice(0, 15)
  if (sample.length === 0) return null
  const share = (pred: (c: Element) => boolean) => Array.from({ length: width }, (_, i) => sample.filter((r) => r[i] && pred(r[i])).length / sample.length)
  const timeShare = share((c) => parseTimeCell(c.textContent ?? '') !== null)
  const nameShare = share((c) => !!c.querySelector('b, strong, a[href*="/player/"]'))
  const time = timeShare.indexOf(Math.max(...timeShare))
  const name = nameShare.indexOf(Math.max(...nameShare))
  if (timeShare[time] < 0.5 || nameShare[name] < 0.5 || time <= name) return null
  const originGuess = name + 1 < time ? name + 1 : -1
  return { rank: 0, name, origin: fromHeader.origin >= 0 ? fromHeader.origin : originGuess, country: fromHeader.country, time }
}

/** Notfall: erste Zelle rechts vom Namen, die wie eine Zeit oder Teilezahl aussieht. */
function scanForTime(cells: Element[], from: number) {
  for (let i = from + 1; i < cells.length; i++) {
    const t = parseTimeCell(cells[i].textContent ?? '')
    if (t) return t
  }
  return null
}

/** Liest eine komplette gespeicherte Seite oder ein kopiertes HTML-Stück. */
export function parseWjpcHtml(html: string): ParsedResults {
  const doc = new DOMParser().parseFromString(html, 'text/html')
  const warnings: string[] = []
  const rows: ParsedRow[] = []

  for (const table of Array.from(doc.querySelectorAll('table'))) {
    const dataRows = Array.from(table.querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('td'))).filter((cells) => cells.length >= 3)
    const col = columnMap(table, dataRows)
    if (!col) { if (dataRows.length > 0) warnings.push('Die Spalten einer Tabelle konnten nicht erkannt werden (Rang, Name, Zeit). Diese Tabelle wurde übersprungen.'); continue }
    for (const cells of dataRows) {
      if (cells.length <= Math.max(col.name, col.time, col.rank)) continue
      const rank = Number(normSpace(cells[col.rank].textContent))
      if (!Number.isInteger(rank) || rank <= 0) continue
      const country = col.country >= 0 ? normSpace(cells[col.country]?.textContent) : ''
      const origin = col.origin >= 0 ? normSpace(cells[col.origin]?.textContent) : ''
      const { entryName, members } = parseNameCell(cells[col.name], origin, country)
      const time = parseTimeCell(cells[col.time].textContent ?? '') ?? scanForTime(cells, col.name)
      if (!entryName) { warnings.push(`Rang ${rank}: kein Name erkannt, Zeile übersprungen.`); continue }
      if (!time) { warnings.push(`Rang ${rank} («${entryName}»): weder Zeit noch Teilezahl erkannt, Zeile übersprungen.`); continue }
      rows.push({
        rank, entry_name: entryName, country: country || null, members,
        status: time.status, finish_seconds: time.status === 'finished' ? time.seconds : null, pieces_placed: time.status === 'unfinished' ? time.pieces : null,
      })
    }
  }
  if (rows.length === 0) warnings.push('Keine Ergebniszeilen gefunden. Prüfe, ob du die Seite mit der Rangliste gespeichert oder die Tabelle kopiert hast.')
  return { rows, meta: readMeta(doc), warnings: [...warnings, ...checkRows(rows)] }
}

function readMeta(doc: Document): ParsedMeta {
  const meta: ParsedMeta = {}
  const canonical = doc.querySelector('link[rel="canonical"]')?.getAttribute('href') ?? undefined
  if (canonical) meta.sourceUrl = canonical

  const title = normSpace(doc.querySelector('title')?.textContent)
  const tm = /^Classification\s+(.+?)\s+-\s+(Teams?|Individual|Pairs?)$/i.exec(title)
  if (tm) {
    meta.eventName = tm[1]
    meta.teamSize = /^team/i.test(tm[2]) ? 4 : /^pair/i.test(tm[2]) ? 2 : 1
    const year = /\b(20\d{2})\b/.exec(tm[1])
    if (year) meta.eventYear = Number(year[1])
  }
  if (canonical) {
    const seg = /\/([^/]+?)\/?$/.exec(canonical)?.[1]
    if (seg) meta.roundName = seg.charAt(0).toUpperCase() + seg.slice(1)
    if (meta.teamSize === undefined) meta.teamSize = /\/teams?\//.test(canonical) ? 4 : /\/paare\/|\/pairs?\//.test(canonical) ? 2 : /\/einzel|\/individual\//.test(canonical) ? 1 : undefined
  }

  const img = Array.from(doc.querySelectorAll('img')).find((i) => (i.getAttribute('src') ?? '').includes('/img/puzzles/'))
  const alt = normSpace(img?.getAttribute('alt'))
  if (alt) meta.puzzleName = alt

  for (const el of Array.from(doc.querySelectorAll('div, p, span, td, li'))) {
    const text = normSpace(el.textContent)
    if (text.length > 24) continue
    const h = parseHeaderNumbers(text)
    if (h) { meta.pieceCount = h.pieces; meta.timeLimitSeconds = h.limitSeconds; break }
  }
  return meta
}

function checkRows(rows: ParsedRow[]): string[] {
  const w: string[] = []
  if (rows.length === 0) return w
  const ranks = rows.map((r) => r.rank)
  for (let i = 1; i < ranks.length; i++) if (ranks[i] < ranks[i - 1]) { w.push('Die Ränge sind nicht aufsteigend sortiert. Prüfe die Quelle.'); break }
  const finished = rows.filter((r) => r.status === 'finished')
  for (let i = 1; i < finished.length; i++) if ((finished[i].finish_seconds ?? 0) < (finished[i - 1].finish_seconds ?? 0)) { w.push('Die Zeiten sind nicht aufsteigend sortiert. Prüfe die Quelle.'); break }
  const sizes = rows.map((r) => r.members.length)
  const common = [...sizes].sort((a, b) => sizes.filter((x) => x === b).length - sizes.filter((x) => x === a).length)[0]
  const odd = rows.filter((r) => r.members.length !== common).length
  if (odd > 0) w.push(`${odd} ${odd === 1 ? 'Eintrag hat' : 'Einträge haben'} eine andere Anzahl Personen als die meisten (${common}). Bitte in der Vorschau prüfen.`)
  const dupRanks = rows.length - new Set(rows.map((r) => `${r.rank}|${r.entry_name}`)).size
  if (dupRanks > 0) w.push('Es gibt doppelte Einträge.')
  return w
}

// ---------------------------------------------------------------- CSV als Ersatz

function splitCsvLine(line: string, delim: string): string[] {
  const out: string[] = []
  let cur = '', quoted = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (quoted) {
      if (ch === '"' && line[i + 1] === '"') { cur += '"'; i++ }
      else if (ch === '"') { quoted = false }
      else { cur += ch }
    } else if (ch === '"') {
      quoted = true
    } else if (ch === delim) {
      out.push(cur); cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out.map((c) => c.trim())
}

/** Zeit wie «1:46:43» oder «46:43» (Minuten:Sekunden) in Sekunden. */
export function parseDurationLoose(text: string): number | null {
  const m = /^(?:(\d{1,2}):)?(\d{1,3}):(\d{2})$/.exec(normSpace(text))
  if (!m) return null
  const total = Number(m[1] ?? 0) * 3600 + Number(m[2]) * 60 + Number(m[3])
  return total > 0 ? total : null
}

/**
 * CSV oder Tabulator-Text. Spalten (mit oder ohne Kopfzeile): Rang; Name; Mitglieder; Land; Zeit oder Teile.
 * Mitglieder werden mit « / » oder «|» getrennt. Kopfzeilen-Namen: rang/rank/#, name/team, mitglieder/members, land/country, zeit/time, teile/pieces.
 */
export function parseCsv(text: string): ParsedResults {
  const warnings: string[] = []
  const lines = text.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() !== '')
  if (lines.length === 0) return { rows: [], meta: {}, warnings: ['Keine Daten eingefügt.'] }
  const delim = [';', '\t', ','].map((d) => [d, lines[0].split(d).length] as const).sort((a, b) => b[1] - a[1])[0][0]
  let idx = { rank: 0, name: 1, members: 2, country: 3, time: 4, pieces: -1 }
  let start = 0
  const first = splitCsvLine(lines[0], delim)
  if (!/^\d+$/.test(first[0])) {
    start = 1
    const h = first.map((x) => x.toLowerCase())
    const f = (...n: string[]) => h.findIndex((x) => n.includes(x))
    idx = { rank: f('rang', 'rank', '#'), name: f('name', 'team', 'teamname'), members: f('mitglieder', 'members', 'personen'), country: f('land', 'country'), time: f('zeit', 'time'), pieces: f('teile', 'pieces') }
    if (idx.rank < 0 || idx.name < 0 || (idx.time < 0 && idx.pieces < 0)) {
      return { rows: [], meta: {}, warnings: ['Die Kopfzeile braucht mindestens die Spalten Rang, Name und Zeit (oder Teile).'] }
    }
  }
  const rows: ParsedRow[] = []
  for (let i = start; i < lines.length; i++) {
    const c = splitCsvLine(lines[i], delim)
    const rank = Number(c[idx.rank])
    const name = normSpace(c[idx.name])
    if (!Number.isInteger(rank) || rank <= 0 || !name) { warnings.push(`Zeile ${i + 1}: Rang oder Name fehlt, übersprungen.`); continue }
    const members = (idx.members >= 0 ? c[idx.members] ?? '' : '').split(/\s*[|/]\s*/).map(normSpace).filter(Boolean).map((n) => ({ name: n, slug: null }))
    const timeText = idx.time >= 0 ? c[idx.time] ?? '' : ''
    const secs = parseDurationLoose(timeText)
    const piecesCell = idx.pieces >= 0 ? c[idx.pieces] : ''
    const pieces = piecesCell ? Number(piecesCell.replace(/[^\d]/g, '')) : parseTimeCell(timeText)?.status === 'unfinished' ? (parseTimeCell(timeText) as { pieces: number }).pieces : NaN
    if (secs !== null) rows.push({ rank, entry_name: name, country: normSpace(c[idx.country]) || null, members, status: 'finished', finish_seconds: secs, pieces_placed: null })
    else if (Number.isFinite(pieces)) rows.push({ rank, entry_name: name, country: normSpace(c[idx.country]) || null, members, status: 'unfinished', finish_seconds: null, pieces_placed: pieces })
    else warnings.push(`Zeile ${i + 1} («${name}»): weder Zeit noch Teilezahl erkannt, übersprungen.`)
  }
  if (rows.length === 0) warnings.push('Keine gültigen Zeilen gefunden.')
  return { rows, meta: {}, warnings: [...warnings, ...checkRows(rows)] }
}

/** Entscheidet nach Inhalt, ob HTML oder Text/CSV vorliegt. */
export function parseAny(input: string): ParsedResults {
  return /<\s*(?:!doctype|html|head|body|table|tr|td|div|p|span|a|img)\b/i.test(input) ? parseWjpcHtml(input) : parseCsv(input)
}

/** Aus «https://worldjigsawpuzzle.org/player/corina-spreiter» oder «corina-spreiter» das Kürzel holen. Leer = kein Profil. */
export function extractWjpcSlug(input: string): string | null {
  const t = input.trim()
  if (!t) return null
  const m = /\/player\/([^/?#\s]+)/.exec(t)
  const slug = decodeURIComponent(m ? m[1] : t).toLowerCase()
  return /^[a-z0-9][a-z0-9-]{1,80}$/.test(slug) ? slug : null
}
