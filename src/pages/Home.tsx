import { Link } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Card } from '../components/ui'

const entries = [
  { to: '/mein-regal', title: 'Mein Regal', text: 'Deine Puzzles und was du ausgeliehen hast.' },
  { to: '/puzzles', title: 'Alle Puzzles', text: 'Das gemeinsame Verzeichnis mit Ranglisten.' },
  { to: '/versuch-neu', title: 'Zeit erfassen', text: 'Einen gelösten Versuch eintragen.' },
  { to: '/ausleihen/anfragen', title: 'Ausleihanfragen', text: 'Offene Anfragen annehmen oder ablehnen.' },
]

export function Home() {
  const { profile } = useAuth()
  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-3xl font-bold">Hallo {profile?.display_name}</h1>
      <p className="max-w-prose text-ink-soft">
        Erfasse Puzzles mit Foto, trage Zeiten ein und vergleiche dich in den Ranglisten. Das Ausleihen folgt in der
        nächsten Phase.
      </p>
      <div className="grid gap-4 sm:grid-cols-2">
        {entries.map((e) => (
          <Link key={e.to} to={e.to} className="rounded-xl border border-line bg-card p-5 hover:border-teal">
            <h2 className="text-xl font-bold">{e.title}</h2>
            <p className="text-ink-soft">{e.text}</p>
          </Link>
        ))}
      </div>
      {profile?.role === 'admin' && (
        <Card>
          <h2 className="mb-1 text-xl font-bold">Administration</h2>
          <p className="text-ink-soft">
            Neue Mitglieder freigeben und Einladungscodes verwalten: <Link className="text-teal-dark underline" to="/admin">zur Administration</Link>.
          </p>
        </Card>
      )}
    </div>
  )
}
