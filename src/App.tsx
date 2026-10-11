import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAdmin, RequireApproved } from './auth/guards'
import { Layout } from './components/Layout'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Waiting } from './pages/Waiting'
import { Home } from './pages/Home'
import { Profile } from './pages/Profile'
import { Admin } from './pages/Admin'
import { Placeholder } from './pages/Placeholder'

export default function App() {
  return (
    <AuthProvider>
      {/* HashRouter, weil GitHub Pages keine serverseitigen Routen kennt */}
      <HashRouter>
        <Routes>
          <Route path="/" element={<Landing />} />
          <Route path="/anmelden" element={<Login />} />
          <Route path="/registrieren" element={<Register />} />
          <Route path="/warten" element={<Waiting />} />
          <Route element={<RequireApproved />}>
            <Route element={<Layout />}>
              <Route path="/start" element={<Home />} />
              <Route path="/puzzles" element={<Placeholder title="Alle Puzzles" phase="Phase 3" />} />
              <Route path="/regale" element={<Placeholder title="Alle Regale" phase="Phase 3" />} />
              <Route path="/mein-regal" element={<Placeholder title="Mein Regal" phase="Phase 3" />} />
              <Route path="/puzzle-neu" element={<Placeholder title="Neues Puzzle erfassen" phase="Phase 3" />} />
              <Route path="/versuch-neu" element={<Placeholder title="Neuen Versuch erfassen" phase="Phase 3" />} />
              <Route path="/ausleihen/anfragen" element={<Placeholder title="Ausleihanfragen" phase="Phase 4" />} />
              <Route path="/ausleihen/meine" element={<Placeholder title="Eigene Ausleihen" phase="Phase 4" />} />
              <Route path="/profil" element={<Profile />} />
              <Route element={<RequireAdmin />}>
                <Route path="/admin" element={<Admin />} />
              </Route>
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  )
}
