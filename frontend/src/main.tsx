import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { GunProvider } from './contexts/GunContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <GunProvider>
      <App />
    </GunProvider>
  </StrictMode>,
)
