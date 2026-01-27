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

### 3. Recent Accomplishments (Session Jan 26, 2026 - Part 4)
*   **Logic Refinement:**
    *   Updated `CreateRequest` and `EditRequest` to handle Public/Private invite statuses automatically.
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

### B. UI/UX Polish
1.  **Audio Player:** The standard `<audio>` element in comments is functional but ugly. Create a custom `MiniPlayer` component (similar to the main Player but smaller).
2.  **Mobile Experience:** Verify the "Record Audio" workflow on mobile devices (permissions, UI).

### C. Deployment Prep
1.  **Environment Variables:** Audit `.env.example` and ensure all R2/Gun keys are documented.
2.  **Build Optimization:** Check bundle size (lucide-react imports are good, but check Gun bundle).

## Instructions for Agent
*   **Context:** The app is feature-complete and secured. We are now in the final "QA & Polish" phase before beta.
*   **Focus:**
    1.  Verify the new Security Architecture works as expected (Refactoring didn't break reading).
    2.  Polish the Audio Comment UI.
    3.  Implement "Remove Track" for playlists.
