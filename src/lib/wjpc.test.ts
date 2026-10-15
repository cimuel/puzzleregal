// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { extractWjpcSlug, parseAny, parseCsv, parseDurationLoose, parseHeaderNumbers, parseTimeCell, parseWjpcHtml } from './wjpc'

// Zeilen nach dem Muster der echten Seite worldjigsawpuzzle.org/schweizerpuzzlemeisterschaft/2026/teams/finale
const flag = (c: string) => `<img src="https://worldjigsawpuzzle.org/users/img/flags/shiny/64/XX.png" title="${c}">`
const link = (name: string, slug: string) => `<a href="https://worldjigsawpuzzle.org/player/${slug}">${name}</a>`
const teamRow = (rank: number, country: string, team: string, members: string[], origin: string, time: string) =>
  `<tr><td>${rank}</td><td>${flag(country)}</td><td>${flag(country)} ${country}      <b>${team}</b>   ${members.join(' / ')}   ${origin}</td><td>${origin}</td><td>${country}</td><td>${time}</td><td></td><td></td></tr>`

const TEAM_ROWS = [
  teamRow(1, 'Switzerland', 'Magical September Girlies And Stefan', [link('Stefan Enzler', 'stefan-enzler'), link('Helene Beutler', 'helene-beutler'), link('Selina Suter', 'selina-suter'), link('Rachel Keller', 'rachel-keller')], 'Bern', '00:58:03'),
  teamRow(2, 'Switzerland', 'The Swiss Unicorns', [link('Nathalie Fehr', 'nathalie-fehr'), link('Annemie Imhof', 'annemie-imhof'), link('Vroni Börlin-Kostezer', 'vroni-borlin-kostezer'), 'Irma Kostezer'], 'Basel', "01:03:18   +5' 15'' (at 5' 15'')"),
  teamRow(14, 'Switzerland', 'The Puzzled Paddlers', ['Lena Schinkel', link('Maren Lebender', 'maren-lebender'), 'Mirjam Murer', link('Simon Nägeli', 'simon-nageli')], 'Zürich', "01:26:31   + 08' (at 28' 28'')"),
  teamRow(20, 'Switzerland', 'Wicki Und Die 1000 Teile', [link('Fabienne Wicki', 'fabienne-wicki'), 'Jasmin Wicki', 'Stefan Wicki', link('Carmen Wicki', 'carmen-wicki')], '6247', "01:34:20   +2' 26'' (at 36' 17'')"),
  teamRow(27, 'Switzerland', 'Kniffle Drachen', [link('Janin Sommer', 'janin-sommer'), 'Salome Meister', 'Lara Blaser', 'Annina Mombelli'], 'Burgdorf', "01:40:22   + 02' (at 42' 19'')"),
  teamRow(27, 'Germany', 'The Cool Cats', [link('Nadia Galaske', 'nadia-galaske'), link('Catherine Galaske', 'catherine-galaske'), link('Ulrike Schneider', 'ulrike-schneider'), link('Marlene Kästner', 'marlene-kastner')], 'Rutesheim', "01:40:22   + 00' (at 42' 19'')"),
  teamRow(29, 'Switzerland', 'Confrérie Des Assembleurs', [link('Elodie Barras', 'elodie-barras'), link('Franziska Steingruber', 'franziska-steingruber'), 'Jérémiah Barras', link('Caroline Anchise', 'caroline-anchise')], 'Aigle', "01:40:37   + 15'' (at 42' 34'')"),
  teamRow(31, 'Spain', 'Archistars', [link('Marina Esayag Tendler', 'marina-esayag-tendler'), link('Lisa Haller', 'lisa-haller'), link('Leonie Sohler', 'leonie-sohler'), link('Nadine Aul', 'nadine-aul')], '', "01:41:25   + 30'' (at 43' 22'')"),
  teamRow(33, 'Switzerland', 'Randstück-Queens', [link('Sabrina Sewer', 'sabrina-sewer'), 'Nina Bichsel', 'Jasmin Sewer', 'Anja Burkhalter'], '8317 Winterberg', "01:44:29   +2' 28'' (at 46' 26'')"),
  teamRow(35, 'Switzerland', 'Fast Pi', [link('Corina Spreiter', 'corina-spreiter'), 'Cinja Müller', 'Caroline Böttger', 'Severina Haas'], 'Aarau', "01:46:43   +1' 44'' (at 48' 40'')"),
  teamRow(38, 'Switzerland', 'Die Vier Verspielten', [link('Alexandra Breitenstein', 'alexandra-breitenstein'), link('Kim Klug', 'kim-klug'), link('Alexander Zbiek', 'alexander-zbiek'), 'Thomas Brack'], 'Schweiz und Deutschland', "01:48:18   + 23'' (at 50' 15'')"),
  teamRow(50, 'Switzerland', 'A Missing Piece', [link('Silja Costa', 'silja-costa'), 'Naline Spuler', 'Fabienne Kramer', 'Nicolas Trüssel'], 'Aargau / Solothurn', "01:59:17   + 08' (at 61' 14'')"),
  teamRow(51, 'Switzerland', 'Oktopuzzlers', [link('Thomas Stadelmann', 'thomas-stadelmann'), link('Bettina Hafner', 'bettina-hafner'), link('Simone Benguerel-Dit-Perroud', 'simone-benguerel-dit-perroud'), 'Stéphanie Loosli'], 'Sursee', '992 Pieces'),
  teamRow(66, 'Finland', 'Mandatory Fun', [link('Sanna Raatikainen', 'sanna-raatikainen'), link('Maija Pohjospankinaho', 'maija-pohjospankinaho'), link('Alpertti Kananen', 'alpertti-kananen'), 'Topias Pohjospankinaho'], 'Oulunsalo', '824 Pieces'),
]

const PAGE = (rows: string[], extra = '') => `<!doctype html><html><head>
<title>Classification SPM Schweizer Puzzle Meisterschaft 2026 - Teams</title>
<link rel="canonical" href="https://worldjigsawpuzzle.org/schweizerpuzzlemeisterschaft/2026/teams/finale"></head><body>
<h1>Classification Teams</h1><p>Final</p><p>11/10/2026 14:00</p><div><span>1.000</span><span>02:00:00</span></div><p>Eulachhallen - Wartstrasse 73</p>
<img src="https://worldjigsawpuzzle.org/users/img/puzzles/9c32af2d.jpg" alt="Lavaux Vineyards">${extra}
<table><thead><tr><th>#</th><th></th><th>Name</th><th>Origin</th><th>Country</th><th>Time</th><th></th><th></th></tr></thead><tbody>${rows.join('\n')}</tbody></table>
<p>Last updated 14/10/2026 03:06:37 UTC</p></body></html>`

describe('Zeit und Kopfzeile', () => {
  it('liest fertige Zeiten auch mit Rückstand-Anhang', () => {
    expect(parseTimeCell("01:03:18   +5' 15'' (at 5' 15'')")).toEqual({ status: 'finished', seconds: 3798 })
    expect(parseTimeCell('00:58:03')).toEqual({ status: 'finished', seconds: 3483 })
    expect(parseTimeCell("01:46:43   +1' 44'' (at 48' 40'')")).toEqual({ status: 'finished', seconds: 6403 })
  })
  it('liest nicht fertig gewordene Einträge mit Teilezahl', () => {
    expect(parseTimeCell('992 Pieces')).toEqual({ status: 'unfinished', pieces: 992 })
    expect(parseTimeCell('775 Pieces')).toEqual({ status: 'unfinished', pieces: 775 })
  })
  it('erkennt leere oder unbekannte Zellen', () => {
    expect(parseTimeCell('')).toBeNull()
    expect(parseTimeCell('-')).toBeNull()
  })
  it('trennt Teilezahl und Zeitlimit in der Kopfzeile', () => {
    expect(parseHeaderNumbers('1.00002:00:00')).toEqual({ pieces: 1000, limitSeconds: 7200 })
    expect(parseHeaderNumbers('50001:30:00')).toEqual({ pieces: 500, limitSeconds: 5400 })
    expect(parseHeaderNumbers('Eulachhallen')).toBeNull()
  })
  it('liest Zeiten im CSV als Minuten:Sekunden oder Stunden:Minuten:Sekunden', () => {
    expect(parseDurationLoose('1:46:43')).toBe(6403)
    expect(parseDurationLoose('46:43')).toBe(2803)
    expect(parseDurationLoose('abc')).toBeNull()
  })
})

describe('parseWjpcHtml (Team-Final)', () => {
  const res = parseWjpcHtml(PAGE(TEAM_ROWS))
  const byRank = (rank: number, i = 0) => res.rows.filter((r) => r.rank === rank)[i]

  it('liest alle Zeilen', () => expect(res.rows).toHaveLength(TEAM_ROWS.length))

  it('Rang 1: Teamname, vier verlinkte Mitglieder mit Kürzel, Herkunft nicht als Mitglied', () => {
    const r = byRank(1)
    expect(r.entry_name).toBe('Magical September Girlies And Stefan')
    expect(r.members.map((m) => m.name)).toEqual(['Stefan Enzler', 'Helene Beutler', 'Selina Suter', 'Rachel Keller'])
    expect(r.members.map((m) => m.slug)).toEqual(['stefan-enzler', 'helene-beutler', 'selina-suter', 'rachel-keller'])
    expect(r).toMatchObject({ country: 'Switzerland', status: 'finished', finish_seconds: 3483, pieces_placed: null })
  })
  it('Mitglieder ohne Profil stehen als Text, ohne Kürzel', () => {
    expect(byRank(2).members.map((m) => [m.name, m.slug])).toEqual([['Nathalie Fehr', 'nathalie-fehr'], ['Annemie Imhof', 'annemie-imhof'], ['Vroni Börlin-Kostezer', 'vroni-borlin-kostezer'], ['Irma Kostezer', null]])
    expect(byRank(14).members.map((m) => m.name)).toEqual(['Lena Schinkel', 'Maren Lebender', 'Mirjam Murer', 'Simon Nägeli'])
  })
  it('Fast Pi: nur Corina hat ein Kürzel, Zeit 1:46:43', () => {
    const r = byRank(35)
    expect(r.entry_name).toBe('Fast Pi')
    expect(r.members.map((m) => [m.name, m.slug])).toEqual([['Corina Spreiter', 'corina-spreiter'], ['Cinja Müller', null], ['Caroline Böttger', null], ['Severina Haas', null]])
    expect(r.finish_seconds).toBe(6403)
  })
  it('Herkunft in allen Formen wird nicht zum Mitglied: leer, Zahl, Zahl mit Ort, mit Schrägstrich, mehrere Wörter', () => {
    for (const rank of [31, 20, 33, 50, 38]) expect(byRank(rank).members).toHaveLength(4)
    expect(byRank(50).members.at(-1)?.name).toBe('Nicolas Trüssel')              // Herkunft «Aargau / Solothurn» enthält einen Schrägstrich
    expect(byRank(31).members.at(-1)?.name).toBe('Nadine Aul')                   // Herkunft leer
    expect(byRank(33).members.at(-1)?.name).toBe('Anja Burkhalter')              // «8317 Winterberg»
    expect(byRank(38).members.at(-1)?.name).toBe('Thomas Brack')                 // «Schweiz und Deutschland»
    expect(byRank(20).members.at(-1)?.name).toBe('Carmen Wicki')                 // Herkunft «6247»
  })
  it('Gleichstand bleibt erhalten: zweimal Rang 27 mit gleicher Zeit', () => {
    expect(res.rows.filter((r) => r.rank === 27).map((r) => [r.entry_name, r.finish_seconds])).toEqual([['Kniffle Drachen', 6022], ['The Cool Cats', 6022]])
    expect(res.rows.filter((r) => r.rank === 27).map((r) => r.country)).toEqual(['Switzerland', 'Germany'])
  })
  it('nicht fertig gewordene Teams: Teilezahl statt Zeit', () => {
    expect(byRank(51)).toMatchObject({ entry_name: 'Oktopuzzlers', status: 'unfinished', finish_seconds: null, pieces_placed: 992 })
    expect(byRank(66)).toMatchObject({ status: 'unfinished', pieces_placed: 824, country: 'Finland' })
  })
  it('liest die Kopfdaten der Seite', () => {
    expect(res.meta).toMatchObject({
      eventName: 'SPM Schweizer Puzzle Meisterschaft 2026', eventYear: 2026, roundName: 'Finale', teamSize: 4,
      pieceCount: 1000, timeLimitSeconds: 7200, puzzleName: 'Lavaux Vineyards',
      sourceUrl: 'https://worldjigsawpuzzle.org/schweizerpuzzlemeisterschaft/2026/teams/finale',
    })
  })
  it('meldet keine Warnungen bei sauberen Daten', () => expect(res.warnings).toEqual([]))
})

describe('parseWjpcHtml (weitere Fälle)', () => {
  it('Einzel: keine Teamnamen, Social-Media-Links werden ignoriert, Person wird zum Namen', () => {
    const row = (rank: number, name: string, slug: string | null, time: string) =>
      `<tr><td>${rank}</td><td>${flag('Switzerland')}</td><td>${flag('Switzerland')} Switzerland   ${slug ? link(name, slug) : name}   <a href="https://www.instagram.com/x">https://www.instagram.com/x</a>   Zürich</td><td>Zürich</td><td>Switzerland</td><td>${time}</td></tr>`
    const html = `<table><tr><th>#</th><th></th><th>Name</th><th>Origin</th><th>Country</th><th>Time</th></tr>${row(1, 'Anna Muster', 'anna-muster', '00:41:02')}${row(2, 'Bea Beispiel', null, '00:43:10')}${row(3, 'Cora Test', 'cora-test', '410 Pieces')}</table>`
    const r = parseWjpcHtml(html)
    expect(r.rows.map((x) => [x.rank, x.entry_name, x.members.length, x.members[0].slug, x.status])).toEqual([
      [1, 'Anna Muster', 1, 'anna-muster', 'finished'], [2, 'Bea Beispiel', 1, null, 'finished'], [3, 'Cora Test', 1, 'cora-test', 'unfinished'],
    ])
  })
  it('kopiertes Tabellenstück ohne Kopfdaten funktioniert (ohne Meta)', () => {
    const r = parseWjpcHtml(`<table><tbody>${TEAM_ROWS.slice(0, 2).join('')}</tbody></table>`)
    expect(r.rows).toHaveLength(2)
    expect(r.meta.puzzleName).toBeUndefined()
    expect(r.meta.pieceCount).toBeUndefined()
  })
  it('meldet fehlende Zeit und überspringt die Zeile', () => {
    const bad = teamRow(5, 'Switzerland', 'Ohne Zeit', ['A B'], 'Bern', '-')
    const r = parseWjpcHtml(PAGE([TEAM_ROWS[0], bad]))
    expect(r.rows).toHaveLength(1)
    expect(r.warnings.join(' ')).toContain('Ohne Zeit')
  })
  it('meldet Seiten ohne Tabelle verständlich', () => {
    const r = parseWjpcHtml('<html><body><p>nichts</p></body></html>')
    expect(r.rows).toEqual([])
    expect(r.warnings[0]).toContain('Keine Ergebniszeilen')
  })
  it('warnt bei falscher Sortierung der Zeiten und ungewöhnlicher Personenzahl', () => {
    const r = parseWjpcHtml(PAGE([TEAM_ROWS[1], TEAM_ROWS[0], teamRow(3, 'Switzerland', 'Drei', ['A B', 'C D', 'E F'], 'Bern', '01:10:00')]))
    expect(r.warnings.some((w) => w.includes('Zeiten sind nicht aufsteigend'))).toBe(true)
    expect(r.warnings.some((w) => w.includes('andere Anzahl Personen'))).toBe(true)
  })
})

describe('parseCsv', () => {
  it('liest Semikolon-CSV mit Kopfzeile, Zeiten und Teilezahlen', () => {
    const r = parseCsv('Rang;Name;Mitglieder;Land;Zeit\n1;Fast Pi;Corina / Cinja / Caroline / Severina;Schweiz;1:46:43\n2;Andere;Anna | Bea;Schweiz;992 Pieces\n')
    expect(r.rows).toHaveLength(2)
    expect(r.rows[0]).toMatchObject({ rank: 1, entry_name: 'Fast Pi', status: 'finished', finish_seconds: 6403, country: 'Schweiz' })
    expect(r.rows[0].members.map((m) => m.name)).toEqual(['Corina', 'Cinja', 'Caroline', 'Severina'])
    expect(r.rows[1]).toMatchObject({ status: 'unfinished', pieces_placed: 992 })
    expect(r.rows[1].members).toHaveLength(2)
  })
  it('liest Tabulator-Text ohne Kopfzeile', () => {
    const r = parseCsv('1\tAnna\t\tSwitzerland\t00:41:02\n2\tBea\t\tSwitzerland\t00:43:10')
    expect(r.rows.map((x) => [x.rank, x.entry_name, x.finish_seconds])).toEqual([[1, 'Anna', 2462], [2, 'Bea', 2590]])
  })
  it('liest Anführungszeichen mit Komma im Namen', () => {
    const r = parseCsv('rank,name,time\n1,"Pieces, Pints & Potatoes",1:06:44')
    expect(r.rows[0].entry_name).toBe('Pieces, Pints & Potatoes')
    expect(r.rows[0].finish_seconds).toBe(4004)
  })
  it('meldet fehlende Spalten und ungültige Zeilen verständlich', () => {
    expect(parseCsv('Foo;Bar\n1;2').warnings[0]).toContain('Kopfzeile')
    const r = parseCsv('1;Ok;;;1:00:00\nx;Kaputt;;;1:00:00\n3;OhneZeit;;;-')
    expect(r.rows).toHaveLength(1)
    expect(r.warnings.length).toBeGreaterThanOrEqual(2)
    expect(parseCsv('').warnings[0]).toContain('Keine Daten')
  })
})

describe('parseAny', () => {
  it('erkennt HTML und Text selbst', () => {
    expect(parseAny(PAGE(TEAM_ROWS)).rows.length).toBe(TEAM_ROWS.length)
    expect(parseAny('1;Anna;;;1:00:00').rows).toHaveLength(1)
  })
  it('behandelt jede HTML-Datei als HTML, auch ohne Tabelle (verständliche Meldung statt CSV-Fehler)', () => {
    const r = parseAny('<!doctype html><html><body><p>Falsche Seite</p></body></html>')
    expect(r.rows).toEqual([])
    expect(r.warnings[0]).toContain('Keine Ergebniszeilen')
  })
})

describe('extractWjpcSlug', () => {
  it('holt das Kürzel aus der Profil-Adresse oder nimmt es direkt', () => {
    expect(extractWjpcSlug('https://worldjigsawpuzzle.org/player/corina-spreiter')).toBe('corina-spreiter')
    expect(extractWjpcSlug('  https://worldjigsawpuzzle.org/player/Corina-Spreiter?x=1 ')).toBe('corina-spreiter')
    expect(extractWjpcSlug('corina-spreiter')).toBe('corina-spreiter')
  })
  it('lehnt Ungültiges ab', () => {
    expect(extractWjpcSlug('')).toBeNull()
    expect(extractWjpcSlug('Das ist kein Kürzel!')).toBeNull()
    expect(extractWjpcSlug('x')).toBeNull()
  })
})

// ---------------------------------------------------------------------------------------------------------------
// Regression: Seite der SPM 2024 (Teams, Final). Andere Tabelle als 2026: nur 6 Spalten, KEINE Flaggen- und KEINE Länderspalte,
// im Namen steht kein Landname. Fehler damals: «Rang 1 («Bern»): weder Zeit noch Teilezahl erkannt».
const row24 = (rank: number, team: string, members: string[], origin: string, time: string) =>
  `<tr><td>${rank}</td><td><b>${team}</b>   ${members.join(' / ')}   ${origin}</td><td>${origin}</td><td>${time}</td><td></td><td></td></tr>`
const ROWS_2024 = [
  row24(1, 'Once Upon A Puzzle', [link('Patrick Inniger', 'patrick-inniger'), link('Maria Golova', 'maria-golova'), link('Letizia Pomes', 'letizia-pomes'), link('Stefan Enzler', 'stefan-enzler')], 'Bern', '00:56:48'),
  row24(2, 'Addicted To Puzzles', [link('Birgit Warwas', 'birgit-warwas'), link('Jochen Baur', 'jochen-baur'), link('Yvonne Lehner-Grübel', 'yvonne-lehner-grubel'), link('Caroline Räth', 'caroline-rath')], 'Lindau', "00:59:19   +2' 31'' (at 2' 31'')"),
  row24(3, 'Two Thousand Pieces And Some Breakdowns Later', [link('Paulina Schlinker', 'paulina-schlinker'), 'Janina Benn', link('Lara Geppert', 'lara-geppert'), 'Dorian Link'], '', "00:59:47   + 28'' (at 2' 59'')"),
  row24(7, 'Teams10', [link('Nadine Herbst', 'nadine-herbst'), link('Serena Kilchenmann', 'serena-kilchenmann'), link('Jasmine Koira', 'jasmine-koira'), link('Rahel Stauber', 'rahel-stauber')], 'AR', "01:15:08   + 17'' (at 18' 20'')"),
  row24(8, 'Die Vier Puzzletiere', ['Annette Sauter-Ott', 'Anja Kästle-Senfle', 'Carolin Lipp', 'Nadine Schieber'], 'Rosenheim', "01:17:58   +2' 50'' (at 21' 10'')"),
  row24(10, 'Teams15', [link('Remo Theiler', 'remo-theiler'), 'Susan Schaffner', link('Pascale Theiler', 'pascale-theiler'), 'Richy Henseler'], 'AG', "01:27:53   +8' 47'' (at 31' 05')"),
  row24(16, 'Teams17', ['Naline Spuler', 'Fabienne Kramer', link('Silja Costa', 'silja-costa'), 'Pablo Gutiérrez Ranera'], 'AG', "01:39:40   +3' 25'' (at 42' 52'')"),
]
const PAGE_2024 = (rows: string[]) => `<!doctype html><html><head><title>Classification SPM Schweizer Puzzle Meisterschaft 2024 - Teams</title>
<link rel="canonical" href="https://worldjigsawpuzzle.org/schweizerpuzzlemeisterschaft/2024/teams/finale"></head><body>
<h1>Classification Teams</h1><p>Qualifiying Round - Final</p><p>29/09/2024 14:30</p><div><span>1.000</span><span>02:00:00</span></div>
<img src="https://worldjigsawpuzzle.org/users/img/puzzles/bb4b50fd.png" alt="Universo">
<table><thead><tr><th>#</th><th>Name</th><th>Origin</th><th>Time</th><th></th><th></th></tr></thead><tbody>${rows.join('\n')}</tbody></table></body></html>`

describe('SPM 2024 (Tabelle ohne Flaggen- und Länderspalte)', () => {
  const res = parseWjpcHtml(PAGE_2024(ROWS_2024))
  const by = (rank: number) => res.rows.find((r) => r.rank === rank)!

  it('liest alle Zeilen ohne Warnung (der frühere Fehler «weder Zeit noch Teilezahl erkannt»)', () => {
    expect(res.rows).toHaveLength(ROWS_2024.length)
    expect(res.warnings).toEqual([])
  })
  it('Rang 1: Teamname und Zeit stimmen, «Bern» ist weder Name noch Mitglied', () => {
    expect(by(1).entry_name).toBe('Once Upon A Puzzle')
    expect(by(1).finish_seconds).toBe(3408)
    expect(by(1).members.map((m) => m.name)).toEqual(['Patrick Inniger', 'Maria Golova', 'Letizia Pomes', 'Stefan Enzler'])
    expect(by(1).members.map((m) => m.slug)).toEqual(['patrick-inniger', 'maria-golova', 'letizia-pomes', 'stefan-enzler'])
    expect(by(1).country).toBeNull()
  })
  it('Zeiten mit Rückstand-Anhang, leere Herkunft, Kurzformen wie AR und AG', () => {
    expect(by(2).finish_seconds).toBe(3559)
    expect(by(3).members.map((m) => m.name)).toEqual(['Paulina Schlinker', 'Janina Benn', 'Lara Geppert', 'Dorian Link'])   // Herkunft leer
    expect(by(7).members.at(-1)?.name).toBe('Rahel Stauber')                                                           // Herkunft «AR»
    expect(by(10).members.at(-1)?.name).toBe('Richy Henseler')                                                         // Herkunft «AG»
    expect(by(8).members.map((m) => m.slug)).toEqual([null, null, null, null])                                         // niemand verlinkt
    expect(by(16).members.map((m) => m.name)).toEqual(['Naline Spuler', 'Fabienne Kramer', 'Silja Costa', 'Pablo Gutiérrez Ranera'])
  })
  it('liest Kopfdaten: Meisterschaft 2024, Puzzle «Universo», 1000 Teile, 2:00:00', () => {
    expect(res.meta).toMatchObject({ eventName: 'SPM Schweizer Puzzle Meisterschaft 2024', eventYear: 2024, roundName: 'Finale', teamSize: 4, pieceCount: 1000, timeLimitSeconds: 7200, puzzleName: 'Universo' })
  })
})

describe('Tabellenformen: Erkennung über den Inhalt, wenn Überschriften fehlen oder abweichen', () => {
  it('Tabelle ohne Kopfzeile (nur td) wird über den Inhalt erkannt', () => {
    const r = parseWjpcHtml(`<table><tbody>${ROWS_2024.slice(0, 3).join('')}</tbody></table>`)
    expect(r.rows.map((x) => [x.rank, x.entry_name, x.finish_seconds])).toEqual([[1, 'Once Upon A Puzzle', 3408], [2, 'Addicted To Puzzles', 3559], [3, 'Two Thousand Pieces And Some Breakdowns Later', 3587]])
  })
  it('Tabelle mit anderen Überschriften (Rank/Name/Time) und einer Extra-Spalte', () => {
    const html = `<table><thead><tr><th>Rank</th><th>Name</th><th>Time</th></tr></thead><tbody>
      <tr><td>1</td><td><b>Team A</b> ${link('Anna A', 'anna-a')} / Bea B</td><td>00:50:00</td></tr>
      <tr><td>2</td><td><b>Team B</b> Cora C / Dani D</td><td>412 Pieces</td></tr></tbody></table>`
    const r = parseWjpcHtml(html)
    expect(r.rows.map((x) => [x.rank, x.entry_name, x.status])).toEqual([[1, 'Team A', 'finished'], [2, 'Team B', 'unfinished']])
    expect(r.rows[0].members.map((m) => m.name)).toEqual(['Anna A', 'Bea B'])
  })
  it('Kopfzeile hat weniger Spalten als die Daten: Zeit wird trotzdem gefunden', () => {
    const html = `<table><thead><tr><th>#</th><th>Name</th><th>Origin</th></tr></thead><tbody>
      <tr><td>1</td><td><b>Team A</b> Anna A / Bea B  Bern</td><td>Bern</td><td>00:50:00 +1' (at 1')</td></tr></tbody></table>`
    const r = parseWjpcHtml(html)
    expect(r.rows).toHaveLength(1)
    expect(r.rows[0].finish_seconds).toBe(3000)
  })
  it('Herkunft wird nur als eigenes Wort abgeschnitten: «Rolf BAG» bleibt bei Herkunft «AG» erhalten', () => {
    const html = `<table><thead><tr><th>#</th><th>Name</th><th>Origin</th><th>Time</th></tr></thead><tbody>
      <tr><td>1</td><td><b>Team</b> Anna A / Rolf BAG</td><td>AG</td><td>00:50:00</td></tr></tbody></table>`
    expect(parseWjpcHtml(html).rows[0].members.map((m) => m.name)).toEqual(['Anna A', 'Rolf BAG'])
  })
  it('Tabelle, deren Spalten nicht erkennbar sind, meldet das statt falsch zu lesen', () => {
    const r = parseWjpcHtml('<table><tbody><tr><td>x</td><td>y</td><td>z</td></tr><tr><td>a</td><td>b</td><td>c</td></tr></tbody></table>')
    expect(r.rows).toEqual([])
    expect(r.warnings.join(' ')).toContain('Spalten')
  })
})

// SPM 2024, Einzel-Final: Person (verlinkt), optional Instagram-Link direkt dahinter, Herkunft mit Klammern
describe('SPM 2024 Einzel (6 Spalten, Herkunft mit Kanton)', () => {
  const insta = '<a href="https://www.instagram.com/swissspeedpuzzle/" title="Instagram">https://www.instagram.com/swissspeedpuzzle/</a>'
  const solo = (rank: number, who: string, origin: string, time: string) => `<tr><td>${rank}</td><td>${who}   ${origin}</td><td>${origin}</td><td>${time}</td><td></td><td></td></tr>`
  const html = `<html><head><title>Classification SPM Schweizer Puzzle Meisterschaft 2024 - Individual</title>
    <link rel="canonical" href="https://worldjigsawpuzzle.org/schweizerpuzzlemeisterschaft/2024/individual/finale"></head><body>
    <div><span>500</span><span>01:30:00</span></div><img src="https://worldjigsawpuzzle.org/users/img/puzzles/bc10e7fc.png" alt="Escritorio">
    <table><thead><tr><th>#</th><th>Name</th><th>Origin</th><th>Time</th><th></th><th></th></tr></thead><tbody>
    ${solo(1, link('Kristin Gall', 'kristin-gall'), 'Winterthur (ZH)', '00:43:07')}
    ${solo(2, link('Helene Beutler', 'helene-beutler'), 'Bern (BE)', "00:43:21   + 14'' (at 14'')")}
    ${solo(7, link('Patrick Inniger', 'patrick-inniger') + insta, 'Thun (BE)', "00:51:39   + 03' (at 8' 32'')")}
    ${solo(28, link('Jochen Baur', 'jochen-baur'), 'Kohlberg (Baden-Württemberg)', "01:09:15   + 21'' (at 26' 08')")}
    ${solo(40, 'Ohne Profil Person', 'Zürich (ZH)', '412 Pieces')}
    </tbody></table></body></html>`
  const r = parseWjpcHtml(html)
  it('liest Personen als Einträge, ohne Herkunft und ohne Instagram-Adresse im Namen', () => {
    expect(r.warnings).toEqual([])
    expect(r.rows.map((x) => [x.rank, x.entry_name, x.members.length])).toEqual([[1, 'Kristin Gall', 1], [2, 'Helene Beutler', 1], [7, 'Patrick Inniger', 1], [28, 'Jochen Baur', 1], [40, 'Ohne Profil Person', 1]])
    expect(r.rows[2].members[0].slug).toBe('patrick-inniger')
    expect(r.rows[4].members[0].slug).toBeNull()
    expect(r.rows[4]).toMatchObject({ status: 'unfinished', pieces_placed: 412 })
  })
  it('liest Kopfdaten: Einzel, 500 Teile, 1:30:00, Puzzle «Escritorio»', () => {
    expect(r.meta).toMatchObject({ teamSize: 1, pieceCount: 500, timeLimitSeconds: 5400, puzzleName: 'Escritorio', eventYear: 2024, roundName: 'Finale' })
  })
})
