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

### 2. Current Status: Ready for Deployment
*   **Access Modes:** Implemented "Direct Add" vs "Invite Only".
*   **Security:** ACL hardening complete.
*   **UX/UI:** Mobile responsiveness improved (CreatorTools, RequestDetail).
*   **Bug Fixes:** Login flash and Profile Submissions fixed.

### 3. Recent Accomplishments (Session Jan 27, 2026 - Polish & Fixes)
*   **Fixed:** Login screen flash on refresh (Auth loading state).
*   **Fixed:** Profile submissions not loading (Graph traversal path).
*   **Polished:** `CreatorTools` is now responsive with Master-Detail view on mobile.
*   **Polished:** `RequestDetail` layout verified for mobile.

### 4. Immediate High Priority Tasks (Next Session)

### A. Deployment & QA (Primary Focus)
1.  **Deploy Relay:** Deploy the relay server to the target environment (e.g. Railway/Fly.io) and verify `radata` persistence volume.
2.  **Deploy Frontend:** Deploy to Vercel/Netlify.
3.  **End-to-End Test:**
    *   Create 2 users (Creator, Invitee) on the live site.
    *   Creator makes "Invite Only" request.
    *   Invitee accepts via Inbox.
    *   Invitee uploads track.
    *   Verify playback and data persistence after refresh.

### B. Future Features (Post-Launch)
1.  **Push Notifications:** Investigate service workers for notifications.
2.  **Audio Processing:** Client-side normalization or format conversion.

## Instructions for Agent
*   **Focus:** Deployment validation and smoke testing.
*   **Goal:** Confirm the system works in a real-world multi-user environment.