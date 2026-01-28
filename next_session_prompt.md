# MEW2 Project Context & Next Session Prompt

## Project Overview
**Role:** Senior Full-Stack Architect specializing in "Local-First" web applications.
**Project:** Rebuilding "Music Every Week" (MEW) into a serverless, peer-to-peer file-sharing system called MEW2.

### Current Status: Backend Live / Frontend Pending
*   **Backend:** Deployed successfully to GCP (Cloud Run + GCS) via Pulumi.
    *   **Relay URL:** `https://mew2-relay-service-a65bc79-6xaixpnemq-uw.a.run.app`
*   **Frontend:** Ready for deployment to Vercel.
*   **Documentation:** Private deployment details saved in `deployment_details.private.md`.

### Immediate Next Tasks (Next Session)

### 1. Deploy Frontend (Vercel)
*   **Action:** Go to Vercel Dashboard -> Import Repo.
*   **Settings:**
    *   **Root Directory:** `frontend`
    *   **Environment Variable:** `VITE_RELAY_URL` = `https://mew2-relay-service-a65bc79-6xaixpnemq-uw.a.run.app`
*   **Verify:** Ensure the deployed site loads without errors and connects to the relay (check browser console).

### 2. Live QA (Smoke Test)
*   **Create 2 Users:** Open the live site in two different browsers.
*   **User A (Creator):** Create an "Invite Only" request.
*   **User B (Invitee):** Receive invite, accept it, and upload a track.
*   **Verification:**
    *   Does User A see User B in the list immediately?
    *   Does the track play?
    *   Does data persist after refreshing both browsers?
    *   **Cold Start Test:** Wait 15 mins (for Cloud Run to scale to zero), then refresh. Does data persist?

### 3. Final Sign-off
*   If QA passes, the "Migration to MEW2" milestone is complete.
