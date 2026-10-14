import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { AuthProvider } from './auth/AuthContext'
import { RequireAdmin, RequireApproved } from './auth/guards'
import { Layout } from './components/Layout'
import { Landing } from './pages/Landing'
import { Login } from './pages/Login'
import { Register } from './pages/Register'
import { Waiting } from './pages/Waiting'
import { Home } from './pages/Home'
import { PlayerProfile } from './pages/PlayerProfile'
import { Puzzles } from './pages/Puzzles'
import { PuzzleNew } from './pages/PuzzleNew'
import { PuzzleDetail } from './pages/PuzzleDetail'
import { PuzzleEdit } from './pages/PuzzleEdit'
import { AttemptNew } from './pages/AttemptNew'
import { AttemptEdit } from './pages/AttemptEdit'
import { Shelf } from './pages/Shelf'
import { Shelves } from './pages/Shelves'
import { Admin } from './pages/Admin'
import { LoanRequests } from './pages/LoanRequests'
import { MyLoans } from './pages/MyLoans'
import { Notifications } from './pages/Notifications'
import { GuestShelf } from './pages/GuestShelf'

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
              <Route path="/puzzles" element={<Puzzles />} />
              <Route path="/puzzle/:id" element={<PuzzleDetail />} />
              <Route path="/puzzle/:id/bearbeiten" element={<PuzzleEdit />} />
              <Route path="/puzzle-neu" element={<PuzzleNew />} />
              <Route path="/regale" element={<Shelves />} />
              <Route path="/regal/:id" element={<Shelf />} />
              <Route path="/mein-regal" element={<Shelf own />} />
              <Route path="/versuch-neu" element={<AttemptNew />} />
              <Route path="/versuch/:id/bearbeiten" element={<AttemptEdit />} />
              <Route path="/ausleihen/anfragen" element={<LoanRequests />} />
              <Route path="/ausleihen/meine" element={<MyLoans />} />
              <Route path="/mitteilungen" element={<Notifications />} />
              <Route path="/gaesteregal" element={<GuestShelf />} />
              <Route path="/profil" element={<PlayerProfile own />} />
              <Route path="/person/:id" element={<PlayerProfile />} />
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
