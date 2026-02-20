import Gun from 'gun/gun';
import 'gun/sea';
import 'gun/lib/radix';
import 'gun/lib/radisk';
import 'gun/lib/store';
import 'gun/lib/rindexed';

const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'http://localhost:8080';

console.log("GunDB Relay URL:", RELAY_URL);

export const PEERS = [
  `${RELAY_URL}/gun` 
];

const gun = Gun({
  peers: PEERS,
  localStorage: true, // Enable simple localStorage for stability and auth persistence
  radisk: false, // Keep Radisk (IndexedDB) disabled to avoid 'radix' corruption errors
  file: 'mew-radata-v1', // This file name is used by localStorage as a prefix
  axe: false // Explicitly disable AXE
});

// For debugging in console
// @ts-ignore
window.gun = gun;

export default gun;
export const user = gun.user().recall({sessionStorage: true});
