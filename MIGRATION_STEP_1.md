# Step 1: Authentication Infrastructure

**Objective:** Replace the GunDB user concept with a dual-mode Auth Context (Firebase Admin + Email Participant).

**Tasks:**
- Create `frontend/src/contexts/AuthContext.tsx`.
- Implement `AuthProvider` to:
    - Listen to `onAuthStateChanged` for Firebase Admins (Google Auth).
    - Manage a `participantEmail` state backed by `sessionStorage`/`localStorage`.
    - Provide `isAdmin`, `user` (Firebase), and `email` (Participant) to the app.
- Wrap `App.tsx` with `AuthProvider`.
- Update `frontend/src/lib/firebase.ts` if needed to export auth helpers.

## Relevant POC Code
- **Firebase Init:** `frontend/src/lib/firebase.ts` - Already sets up `auth` and `googleProvider`.
- **Admin Login:** `frontend/src/pages/authless/HostLogin.tsx` - Demonstrates `signInWithPopup(auth, googleProvider)`.
- **Participant Login:** `frontend/src/pages/authless/components/AuthlessLogin.tsx` - Simple UI for capturing an email address.
- **Session Persistence:** `frontend/src/pages/authless/RequestView.tsx` (lines 80-90) - Shows checking `sessionStorage.getItem('mew_auth_email')` and syncing it with the component state.