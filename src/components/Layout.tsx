import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useAuth } from '../auth/AuthContext'
import { Button, Logo } from './ui'

const nav = [
  { to: '/start', label: 'Start' },
  { to: '/puzzles', label: 'Alle Puzzles' },
  { to: '/regale', label: 'Alle Regale' },
  { to: '/mein-regal', label: 'Mein Regal' },
  { to: '/ausleihen/anfragen', label: 'Ausleihanfragen' },
  { to: '/ausleihen/meine', label: 'Eigene Ausleihen' },
  { to: '/puzzle-neu', label: 'Neues Puzzle erfassen' },
  { to: '/versuch-neu', label: 'Neuen Versuch erfassen' },
  { to: '/profil', label: 'Mein Profil' },
]

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `block rounded-lg px-3 py-2 ${isActive ? 'bg-ink text-white font-semibold' : 'text-ink hover:bg-white'}`

export function Layout() {
  const { profile, signOut } = useAuth()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  const links = (
    <nav aria-label="Hauptnavigation" className="flex flex-col gap-1">
      {nav.map((n) => (
        <NavLink key={n.to} to={n.to} className={linkClass} onClick={() => setOpen(false)}>
          {n.label}
        </NavLink>
      ))}
      {profile?.role === 'admin' && (
        <NavLink to="/admin" className={linkClass} onClick={() => setOpen(false)}>
          Administration
        </NavLink>
      )}
    </nav>
  )

  return (
    <div className="min-h-screen md:grid md:grid-cols-[17rem_1fr]">
      <header className="flex items-center justify-between border-b border-line bg-card px-4 py-3 md:hidden">
        <div className="flex items-center gap-2 font-display text-xl font-bold">
          <Logo /> Puzzleregal
        </div>
        <Button variant="secondary" aria-expanded={open} aria-controls="mobile-nav" onClick={() => setOpen((o) => !o)}>
          {open ? 'Schliessen' : 'Menü'}
        </Button>
      </header>
      {open && (
        <div id="mobile-nav" className="border-b border-line bg-paper p-3 md:hidden">
          {links}
        </div>
      )}

      <aside className="hidden border-r border-line bg-paper p-5 md:flex md:flex-col md:gap-6">
        <div className="flex items-center gap-2 font-display text-2xl font-bold">
          <Logo size={34} /> Puzzleregal
        </div>
        {links}
        <div className="mt-auto border-t border-line pt-4 text-sm">
          <p className="font-semibold">{profile?.display_name}</p>
          <button
            className="text-teal-dark underline"
            onClick={async () => {
              await signOut()
              navigate('/')
            }}
          >
            Abmelden
          </button>
        </div>
      </aside>

      <main className="mx-auto w-full max-w-5xl p-4 md:p-8">
        <Outlet />
        <div className="mt-10 border-t border-line pt-4 text-sm md:hidden">
          <button className="text-teal-dark underline" onClick={async () => { await signOut(); navigate('/') }}>
            Abmelden ({profile?.display_name})
          </button>
        </div>
      </main>
    </div>
  )
}
