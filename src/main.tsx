import { createRoot } from 'react-dom/client'
import { HelmetProvider } from 'react-helmet-async'
import './index.css'
import 'prosemirror-view/style/prosemirror.css'
import App from './App.tsx'

// StrictMode を無効化（P2P WebRTC の useEffect が2回起動してpeerIdが重複するため）
createRoot(document.getElementById('root')!).render(
  <HelmetProvider>
    <App />
  </HelmetProvider>,
)
