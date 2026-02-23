import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { Buffer } from 'buffer';

// Polyfill Buffer and Global for Gun/SEA
if (!(window as any).Buffer) {
    (window as any).Buffer = Buffer;
}
if (!(window as any).global) {
    (window as any).global = window;
}

// Monkey-patch btoa to prevent "InvalidCharacterError" from SEA
// SEA sometimes passes "binary strings" with high-byte characters to btoa.
// If the environment handles binary strings as UTF-16, btoa crashes.
const originalBtoa = window.btoa;
window.btoa = (str: string) => {
    try {
        return originalBtoa(str);
    } catch (e) {
        // If normal btoa fails, try to "binary-safe" it
        // This handles cases where SEA generates a "binary string" that acts like unicode
        try {
            return Buffer.from(str, 'latin1').toString('base64');
        } catch (e2) {
             // Fallback: Escape unicode
             return originalBtoa(encodeURIComponent(str).replace(/%([0-9A-F]{2})/g,
                function toSolidBytes(_match, p1) {
                    return String.fromCharCode(parseInt(p1, 16));
            }));
        }
    }
};

import './index.css'
import App from './App.tsx'
import { GunProvider } from './contexts/GunContext'
import { PlayerProvider } from './contexts/PlayerContext'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <GunProvider>
        <PlayerProvider>
          <App />
        </PlayerProvider>
      </GunProvider>
    </BrowserRouter>
  </StrictMode>,
)
