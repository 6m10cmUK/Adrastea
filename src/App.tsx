import { BrowserRouter as Router, Routes, Route } from 'react-router-dom'
import './App.css'
import Adrastea from './pages/Adrastea'
import AdrasteaAdmin from './pages/AdrasteaAdmin'
import AdrasteaDemo from './pages/AdrasteaDemo'
import { AuthProvider } from './contexts/AuthContext'

function NotFound() {
  return (
    <div style={{ padding: '20px', textAlign: 'center' }}>
      <h1>404 - Page Not Found</h1>
      <p>申し訳ありませんが、お探しのページは見つかりませんでした。</p>
      <a href="/" style={{ color: '#007bff', textDecoration: 'none' }}>
        ホームに戻る
      </a>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Adrastea />} />
          <Route path="/:roomId" element={<Adrastea />} />
          <Route path="/demo" element={<AdrasteaDemo />} />
          <Route path="/admin" element={<AdrasteaAdmin />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </Router>
    </AuthProvider>
  )
}

export default App