# MEW2 Project Context & Next Session Prompt

## Project Overview
**Role:** Senior Full-Stack Architect specializing in "Local-First" web applications.
**Project:** Rebuilding "Music Every Week" (MEW) into a serverless, peer-to-peer file-sharing system called MEW2.
**Goal:** A "Community App" for songwriters that costs ~$5/year to run.

### 1. The Tech Stack
*   **Frontend:** React + Vite + Tailwind CSS.
*   **State/Database:** GunDB (User-Graph Architecture).
*   **Storage:** Cloudflare R2 (Authenticated Uploads).
*   **Relay Server:** Node.js + Gun (with SEA verification).

### 2. Current Status: Polishing & Security
We have successfully implemented all core features and secured the application logic.
*   **Core Pages:** Home, Archive, Directory, Profile, Playlists.
*   **Security:** 
    *   **Authenticated Uploads:** R2 signed URLs now require Gun SEA signatures (`X-Proof`).
    *   **Tamper-Proof Data:** Requests, Submissions, and Comments are now stored in **User Graphs** (`user.get('...')`) and linked to the global graph. This ensures only authors can edit their content.
*   **New Features:**
    *   **Audio Comments:** Users can record and attach voice notes to comments.
    *   **Playlists:** Users can create playlists and add tracks from the Request Detail view. "My Playlists" page implemented.
    *   **Smart Invites:** Public requests auto-accept participants; Private requests send pending invites.
    *   **Smart Filter:** Added "Submitted / Pass Only" filter when importing participants from previous requests.

### 3. Recent Accomplishments (Session Jan 26, 2026 - Part 4)
*   **Logic Refinement:**
    *   Updated `CreateRequest` and `EditRequest` to handle Public/Private invite statuses automatically.
    *   Added "Submitted / Pass" filter to `CreateRequest` import logic.
*   **Feature Implementation:**
    *   **Audio Comments:** Implemented `MediaRecorder` in `CommentSection` with R2 upload.
    *   **Playlists:** Created `AddToPlaylist` modal, `Playlists` page, and updated `RequestDetail`.
*   **Security Implementation:**
    *   **Storage:** Implemented `X-Pub`, `X-Proof`, `X-Timestamp` verification in `relay/server.js` and `upload.ts`.
    *   **Graph Schema:** Refactored `CreateRequest`, `SubmitTrack`, and `CommentSection` to write to User Graph (`user.get(...)`) and link to Global Graph, ensuring data ownership and immutability for others.

### 4. Immediate High Priority Tasks (Next Session)

### A. Testing & Validation
1.  **Security Audit:** Verify that a malicious user cannot overwrite the *content* of a request (even if they can overwrite the global link). Test the "User Graph" reference logic.
2.  **Playlist Polish:**
    *   Implement "Remove Track" from playlist.
    *   Add "Play All" button on Request Detail (auto-create ephemeral playlist?).

### B. UI/UX Polish (User Feedback)
1.  **Visibility Messaging:** Update "Public" visibility warning in `CreateRequest` to clarify it should only be used for "long running sessions users have signed up for".
2.  **Layout Fixes:** Increase bottom padding/margin on lists (Submissions, Playlists) as the fixed Player is blocking content.
3.  **Player Features:**
    *   **Notes/Lyrics:** Add a way to view track notes/lyrics from the Player and Submission list.
    *   **Context Navigation:** Add a "Go to Context" link in the Player to navigate back to where the track started (Request, Profile, or Playlist).
4.  **Audio Player:** 
    *   **Autoplay Fix:** Debug `usePlayer` to ensure it correctly autoplays to the next track in the queue/context.
    *   **Custom MiniPlayer:** The standard `<audio>` element in comments is functional but ugly. Create a custom `MiniPlayer` component.

### C. Deployment Prep
1.  **Environment Variables:** Audit `.env.example` and ensure all R2/Gun keys are documented.
2.  **Build Optimization:** Check bundle size (lucide-react imports are good, but check Gun bundle).

## Instructions for Agent
*   **Context:** The app is feature-complete and secured. We are now in the final "QA & Polish" phase before beta.
*   **Focus:**
    1.  Address User Feedback (Layout, Player Autoplay, Notes/Lyrics, Visibility Messaging).
    2.  Verify the new Security Architecture works as expected.
    3.  Polish the Audio Comment UI.
