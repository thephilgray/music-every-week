import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'

import './index.css'
import App from './App.tsx'
import { PlayerProvider } from './contexts/PlayerContext'
import { AuthProvider } from './contexts/AuthContext'
import { cleanupLegacyStorage } from './lib/storage'

cleanupLegacyStorage()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
          <PlayerProvider>
            <App />
          </PlayerProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
