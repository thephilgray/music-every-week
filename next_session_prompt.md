# MEW2 Project Context & Next Session Prompt

## Project Overview
**Role:** Senior Full-Stack Architect specializing in "Local-First" web applications.
**Project:** Rebuilding "Music Every Week" (MEW) into a serverless, peer-to-peer file-sharing system called MEW2.

### Current Status: Deployment Ready
*   **Codebase:** Stable. Critical bugs in `CreatorTools` and `EditRequest` have been resolved.
*   **Infrastructure:** Pulumi (GCP) definition verified.
*   **Deployment:** Ready to execute `DEPLOYMENT.md`.

### Immediate Next Tasks (Next Session)

### 1. Execute Deployment (Infrastructure as Code)
*   **Relay (GCP + Pulumi):**
    *   Navigate to `infrastructure/`.
    *   Run `npm install` and `pulumi stack init dev`.
    *   Configure GCP project: `pulumi config set gcp:project <PROJECT_ID>`.
    *   Run `pulumi up`.
    *   **Result:** This deploys Cloud Run (Relay), GCS (DB Persistence), and Artifact Registry automatically.
    *   **Capture:** Note the `relayUrl` output.
*   **Frontend (Vercel):**
    *   Import Repo -> Set Root to `frontend`.
    *   Set Env Var: `VITE_RELAY_URL` (The `relayUrl` from Pulumi).
    *   Deploy.

### 2. Live QA (Smoke Test)
*   **Create 2 Users:** Open the live site in two different browsers.
*   **User A (Creator):** Create an "Invite Only" request.
*   **User B (Invitee):** Receive invite, accept it, and upload a track.
*   **Verification:**
    *   Does User A see User B in the list immediately?
    *   Does the track play?
    *   Does data persist after refreshing both browsers?
    *   **Cold Start Test:** Wait 15 mins (for Cloud Run to scale to zero), then refresh. Does data persist?

### 3. Post-Deployment Polish
*   Monitor GCP Cloud Logging for any `gun` errors.
*   Check for CORS issues if the frontend cannot connect to the relay.