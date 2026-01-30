import Gun from 'gun/gun';
import 'gun/sea';

const RELAY_URL = import.meta.env.VITE_RELAY_URL || 'http://localhost:8080';

console.log("GunDB Relay URL:", RELAY_URL);

export const PEERS = [
  `${RELAY_URL}/gun` 
];

const gun = Gun({
  peers: PEERS,
  localStorage: true, // Persist local data
  radisk: true, // Use Radisk for storage
  axe: false // Explicitly disable AXE
});

// For debugging in console
// @ts-ignore
window.gun = gun;

export default gun;
export const user = gun.user().recall({sessionStorage: true});
