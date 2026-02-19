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
  localStorage: false, // Disable default localStorage (5MB limit)
  radisk: true, // Use Radisk (which now uses IndexedDB via rindexed)
  axe: false // Explicitly disable AXE
});

// For debugging in console
// @ts-ignore
window.gun = gun;

export default gun;
export const user = gun.user().recall({sessionStorage: true});
