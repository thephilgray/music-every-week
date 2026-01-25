import Gun from 'gun/gun';
import 'gun/sea';
import 'gun/axe';

// TODO: Replace with environment variable or actual Cloud Run URL
const PEERS = [
  'http://localhost:8080/gun' 
];

const gun = Gun({
  peers: PEERS,
  localStorage: true, // Persist local data
  radisk: true // Use Radisk for storage
});

// For debugging in console
// @ts-ignore
window.gun = gun;

export default gun;
export const user = gun.user().recall({sessionStorage: true});
