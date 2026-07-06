# CLAUDE.md — AI Coding Assistant Guide for MEW2

This file provides architectural guidance, command references, and domain terminology for AI assistants (Claude, Cursor, Copilot, Gemini) working on the MEW2 repository.

## 🚀 Quick Start Commands

Run all development commands from the `frontend/` directory:

```bash
cd frontend
npm install              # Install dependencies
npm run dev              # Start Vite development server on http://localhost:5173
npm run build            # Run TypeScript type check (`tsc -b`) and production build
npm run lint             # Run ESLint across codebase
npm run deploy:rules     # Deploy firestore.rules using Firebase CLI
```

---

## 🏛️ Architecture & System Invariants

1. **Cloud-Native Serverless Stack:**
   - **Frontend:** React 19 + TypeScript + Vite + Tailwind CSS v4.
   - **Database:** Cloud Firestore (`onSnapshot` real-time listeners are used extensively throughout `src/pages/` and `src/components/`).
   - **Authentication:** Firebase Auth using passwordless Magic Link (`sendSignInLinkToEmail`).
   - **File Storage:** Cloudflare R2 (S3-compatible) for high-bitrate audio tracks and artwork images.
   - **Serverless API:** Vercel Node.js Serverless Functions in `frontend/api/upload.ts` for presigned PUT URL generation.

2. **No Legacy P2P / GunDB:**
   - The application was originally prototyped with GunDB (local-first peer-to-peer storage). **All GunDB, local relay, and P2P code have been decommissioned and removed.** Never re-introduce GunDB, IndexedDB peer syncing, or local relay dependencies.

3. **Real-Time Listener Cleanups:**
   - Whenever adding `onSnapshot` listeners in React components or custom hooks, always return the unsubscribe function in `useEffect` cleanup to prevent memory leaks and zombie listeners.

---

## 📖 Domain Terminology

| UI Term | Legacy / DB Term | Description |
|---|---|---|
| **Prompt** | `Request` / `FileRequest` | A songwriting assignment with a description, submission deadline, and reveal date. Stored in the `requests` Firestore collection. |
| **Session** | `Session` | A grouping mechanism for prompts (e.g., *Summer 2026 Session*, 10 prompts over 20 weeks). Stored in the `sessions` Firestore collection. |
| **Playlist** | `Playlist` | The auto-generated collection of track submissions linked to a specific prompt. Stored in the `playlists` collection. |
| **Reveal Date** | `playlistLiveDate` | The timestamp when track submissions become visible and playable for all participants. Prior to this date, only submitters and hosts can preview tracks. |
| **Watch Party** | `WatchParty` | Synchronized live listening rooms with chat and radio broadcasting. Stored in `watchParties`. |

> **Important Invariant:** While UI copy uses **"Prompt"** and **"Reveal Date"**, the underlying Firestore collections, document properties, and TypeScript interfaces still use legacy database naming (`requests` collection, `requestId`, `playlistLiveDate`, `FileRequest` type). Do not rename database collection strings or field names without an explicit data migration plan.

---

## 📂 Key Files & Schemas

- `frontend/src/types.ts`: Central repository of TypeScript interfaces (`FileRequest`, `Submission`, `Profile`, `Comment`, `WatchParty`).
- `frontend/src/lib/firebase.ts`: Initializes Firebase app, Firestore db instance, and Auth provider.
- `frontend/src/lib/r2.ts`: Handles client-side file compression/resizing (for images > 500KB) and direct PUT uploads to Cloudflare R2 via presigned URLs.
- `frontend/api/upload.ts`: Vercel serverless function using `@aws-sdk/client-s3` to generate presigned R2 upload URLs.
- `firestore.rules`: Security rules enforcing role-based access (`admin` vs `participant`), submission ownership, and watch party permissions.
- `frontend/src/contexts/AuthContext.tsx`: Manages magic-link authentication state, profile UIDs, and host/admin privileges.
- `frontend/src/contexts/PlayerContext.tsx`: Global audio player state controlling bottom bar playback, queueing, and waveforms.

---

## 🛠️ Code Style & Conventions

- **Styling:** Use standard Tailwind CSS utility classes. Avoid custom CSS files unless styling third-party DOM widgets or animations.
- **Icons:** Use `lucide-react` icons.
- **Audio Handling:** Always respect user volume settings and handle loading states gracefully. When uploading audio, `lib/r2.ts` sets a 5-minute timeout for large WAV/MP3 files.
- **Type Safety:** Maintain strict TypeScript typing. Avoid `any`; define interfaces in `types.ts`.
