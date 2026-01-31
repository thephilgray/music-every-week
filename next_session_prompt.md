# MEW2 Project Context & Next Session Prompt

## Project Overview
**Role:** Senior Full-Stack Architect specializing in "Local-First" web applications.
**Project:** Rebuilding "Music Every Week" (MEW) into a serverless, peer-to-peer file-sharing system called MEW2.

### Current Status: Frontend Deployed / QA Phase
*   **Backend:** Deployed successfully to GCP (Cloud Run + GCS) via Pulumi.
    *   **Relay URL:** `https://mew2-relay-service-a65bc79-6xaixpnemq-uw.a.run.app`
*   **Frontend:** Deployed to Vercel (Production).
    *   **URL:** https://frontend-five-lime-89.vercel.app
*   **Status:** Initial smoke tests passed (Signup/Login), but functional issues identified.

### Immediate Next Tasks (Next Session)

### 1. Resolve QA Issues (Local Testing)
*   **Context:** User identified multiple functional issues during initial smoke testing.
*   **Action:** Address these issues by reproducing and fixing them in the local environment (`localhost`).
*   **Known Fixes (Already Applied):**
    *   Fixed "User already created" / Infinite loading on signup (Auth/GunContext race condition).
    *   Fixed "Invite a Friend" flow (deep linking and data sanitization).
    *   Fixed mobile audio recording (dynamic MIME type selection for MediaRecorder).
    *   **New Issue:** Frontend routing broken on Settings page (production-only bug). After navigating to the Settings page, navigation to other pages is impossible.

### 2. Live QA (Smoke Test - Round 2)
*   **Once fixes are deployed:**
    *   **Create 2 Users:** Open the live site in two different browsers.
    *   **User A (Creator):** Create an "Invite Only" request.
    *   **User B (Invitee):** Receive invite, accept it, and upload a track.
    *   **Verification:**
        *   Does User A see User B in the list immediately?
        *   Does the track play?
        *   Does data persist after refreshing both browsers?

### 3. Final Sign-off
*   If QA passes, the "Migration to MEW2" milestone is complete.

### Completed Tasks
*   [x] **Deploy Frontend (Vercel):** Deployed via CLI with `VITE_RELAY_URL` configured.
