# Development Notes

## Recent Changes
- **Auth Migration (Steps 1 & 2):**
  - Replaced GunDB authentication with a dual-mode Auth Context (Firebase Admin + Email Participant).
  - Implemented `AuthGuard` to protect routes based on roles (`admin` or `participant`).
  - Updated `Sidebar` and `ContextBar` to use the new `AuthContext` logout function, ensuring a clean sign-out experience.
  - Updated `HostLogin` to automatically set the participant email upon successful admin login, ensuring seamless access to the main app via `/host/app-login`.
- Switched Gun.js storage from `localStorage` to `IndexedDB` (via `radisk` + `rindexed`) to resolve storage limits (5MB) on mobile devices.
- Verified that global data persists on the Relay (`radata` file storage).
- Confirmed that user authentication keys are manually recovered from `localStorage` in `GunContext.tsx`, ensuring users remain logged in after the update.

## Known Issues
- "Unknown User" or missing submissions on mobile were caused by `localStorage` filling up. This should be resolved by the switch to IndexedDB.
- Unsynced local drafts (created while offline) may not migrate automatically to IndexedDB and could be lost for the user, but this is a rare edge case.

## Deployment
- The Relay server must be running and persistent to ensure new users (or users with cleared local data) can fetch the full history.