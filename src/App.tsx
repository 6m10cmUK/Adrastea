import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom'
import './App.css'
import Adrastea from './pages/Adrastea'
import AdrasteaAdmin from './pages/AdrasteaAdmin'
import AdrasteaDemo from './pages/AdrasteaDemo'
import { AuthProvider } from './contexts/AuthContext'

const isDemo = import.meta.env.VITE_PUBLIC_MODE === 'demo'

function App() {
  if (isDemo) {
    return (
      <AuthProvider>
        <Router>
          <Routes>
            <Route path="/" element={<Navigate to="/demo" replace />} />
            <Route path="/demo" element={<AdrasteaDemo />} />
            <Route path="*" element={<RedirectTo404 />} />
          </Routes>
        </Router>
      </AuthProvider>
    )
  }

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Adrastea />} />
          <Route path="/:roomId" element={<Adrastea />} />
          <Route path="/demo" element={<AdrasteaDemo />} />
          <Route path="/admin" element={<AdrasteaAdmin />} />
          <Route path="*" element={<RedirectTo404 />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

function RedirectTo404() {
  window.location.href = '/404.html'
  return null
}

export default App