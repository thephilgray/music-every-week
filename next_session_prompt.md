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

### 3. Recent Accomplishments (Session Jan 27, 2026 - UI/UX Polish)
*   **Player Experience:**
    *   **Autoplay Fixed:** Resolved issue where player wouldn't advance to next track (state closure bug).
    *   **Context Awareness:** Player now shows "Playing from: Request/Playlist" with a link.
    *   **Notes/Lyrics:** Added "Notes" button to Player to view track lyrics/description.
    *   **MiniPlayer:** Created custom `MiniPlayer` component for audio comments, replacing native `<audio>`.
*   **UI Improvements:**
    *   **Layout:** Fixed overlap issue where bottom content was hidden behind the fixed Player.
    *   **Messaging:** Updated public visibility warning in `CreateRequest`.
    *   **Sharing:** Added "Copy Link" button to `RequestDetail`.
    *   **Edit Request:** Fixed issue where participants showed as "User" instead of their Alias.

### 4. Immediate High Priority Tasks (Next Session)

### A. Testing & Validation
1.  **Security Audit:** Verify that a malicious user cannot overwrite the *content* of a request (even if they can overwrite the global link). Test the "User Graph" reference logic.
2.  **Playlist Polish:**
    *   Implement "Remove Track" from playlist.
    *   Add "Play All" button on Request Detail (auto-create ephemeral playlist?).

### B. Deployment Prep
1.  **Environment Variables:** Audit `.env.example` and ensure all R2/Gun keys are documented.
2.  **Build Optimization:** Check bundle size (lucide-react imports are good, but check Gun bundle).

### C. New Feature: Ad-hoc Request Pool
1.  **Goal:** Allow users to request feedback without selecting specific people, lowering the barrier to entry.
2.  **Mechanism:**
    *   **Opt-in:** Users can toggle "Accept Unsolicited Requests" in their settings.
    *   **Matching:** In `CreateRequest`, add an option to "Invite Random Peers" (e.g., "Request Feedback from Community"). This selects $N$ random users from the opt-in pool.
    *   **Flow:** Selected users receive a standard invite notification and must Accept/Decline.

## Instructions for Agent
*   **Context:** The app is feature-complete and secured. We are now in the final "QA & Polish" phase before beta.
*   **Focus:**
    1.  Deployment Preparation (Env Vars, Build).
    2.  Verify the new Security Architecture works as expected.
    3.  Implement Ad-hoc Request Pool.