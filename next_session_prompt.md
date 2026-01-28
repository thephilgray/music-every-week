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

### 2. Current Status: Ready for Beta
*   **Access Modes:** Implemented "Direct Add" vs "Invite Only".
*   **Security:** ACL hardening complete (User-Graph acceptance).
*   **Visibility:** Strict filtering implemented in `RequestList`. Uninvited users see nothing. "Invite Only" requires acceptance.
*   **Persistence:** Relay configured for local persistence.
*   **Admin Tools:** Seed data generator available.

### 3. Recent Accomplishments (Session Jan 27, 2026 - Access Modes & Prep)
*   **Refactor:** Switched from `visibility` to `accessMode`.
*   **Fix:** Updated `RequestList` to strictly enforce visibility rules (User must be Owner or Participant).
*   **Docs:** Created comprehensive README and Env setup guides.

### 4. Immediate High Priority Tasks (Next Session)

### A. Deployment & QA
1.  **Deploy Relay:** Deploy the relay server to the target environment (e.g. Railway/Fly.io) and verify `radata` persistence volume.
2.  **Deploy Frontend:** Deploy to Vercel/Netlify.
3.  **End-to-End Test:**
    *   Create 2 users (Creator, Invitee).
    *   Creator makes "Invite Only" request.
    *   Invitee accepts via Inbox.
    *   Invitee uploads track.
    *   Verify playback and data persistence after refresh.

### B. Mobile Polish & UI Tweaks
1.  **Responsiveness:** Check `RequestDetail` and `CreatorTools` on mobile width.
2.  **Navigation:** Ensure Admin/Seed tools are accessible (or hidden) appropriately on small screens.

### C. Bug Hunting
1.  **Monitor Logs:** Watch for GunDB sync errors or SEA verification failures during QA.
2.  **Fix:** Address any issues found.

## Instructions for Agent
*   **Focus:** Deployment support and Mobile Polish.
*   **Goal:** Get the app running live and looking good on phones.
