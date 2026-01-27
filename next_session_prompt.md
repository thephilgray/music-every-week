# MEW2 Project Context & Next Session Prompt

## Project Overview
**Role:** Senior Full-Stack Architect specializing in "Local-First" web applications.
**Project:** Rebuilding "Music Every Week" (MEW) into a serverless, peer-to-peer file-sharing system called MEW2.
**Goal:** A "Community App" for songwriters that costs ~$5/year to run.

### 1. The Tech Stack
*   **Frontend:** React + Vite + Tailwind CSS (Hosted on Vercel/Netlify).
*   **State/Database:** GunDB (Decentralized Graph DB).
*   **Auth:** Gun SEA (Key-pair identity).
*   **Storage (All Media):** Cloudflare R2 (Audio & Images) - Zero Egress Fees.
*   **Storage (DB Persistence):** Google Cloud Storage (mounted via FUSE).
*   **Relay Server:** Google Cloud Run (Docker). Configured to Scale to Zero.
*   **Infrastructure:** Pulumi (TypeScript) on GCP.

### 2. Current Status: Post-MVP Refinement (Phases 1-6 + Partial 7)
We have successfully implemented the core application and started architectural refinements.
*   **Frontend Scaffold:** Vite + React, GunDB, SEA Auth.
*   **File Engine:** R2 Integration, Direct Uploads, CRUD Logic.
*   **UI Core:** "4-Pane Studio" Layout (Sidebar, Context, Stage, Player).
*   **Identity & Recovery:** Implemented "Trusted Admin" model & Directory.
    *   **Profile:** `UserProfile` loaded from `all_users` with bio, avatar, etc.
*   **Connectivity:** "Smart Idle Disconnect" active.

### 3. Recent Accomplishments (Session Jan 26, 2026)
*   **Data Model:** Enhanced `UserProfile`, `FileRequest` (snapshots), and `Submission` (double-linking).
*   **Features:** 
    *   **Import Workflow:** Can import participants from previous requests in `CreateRequest`.
    *   **Collaborators:** Submissions support multiple artists and link to all profiles.
    *   **Creator Tools:** Fixed participant listing and implemented CSV Export.
*   **UI/UX:** Added Sidebar links (Directory, Profile, Archive), Breadcrumbs, and placeholder pages.

---

## 4. Remaining Post-MVP Refinement Plan

### E. User Feedback Integration (High Priority)
*   **Submission Byline:**
    *   **Goal:** Allow custom artist/project names per submission (e.g., for collaborations or nom de plumes).
    *   **Implementation:** Add `byline` field to `Submission` schema. UI in `SubmitTrack` (default to profile name). Update Player to display `byline`.
*   **Advanced Deadlines & Extensions:**
    *   **Fine-Grain Deadlines:** `FileRequest.deadline` must support specific times (ISO timestamp) in user's timezone.
    *   **Extensions & Passes:** Host can grant extensions (12h, 24h, 48h) or a "Pass" per participant.
    *   **Management:** Add dropdown in `Creator Tools > Your Requests` participant rows.
    *   **Logic:**
        *   **Extension:** Allow `SubmitTrack` if `now < deadline + extension`.
        *   **Pass:** Treat user as "participated" during "Import from previous week" workflow.
*   **Invite Graph:**
    *   **Goal:** Track the growth network.
    *   **Implementation:** Store `invitedBy` (pubKey) and `invites` (list of pubKeys) in `UserProfile`.

### F. Page Implementations
*   **Directory Page:** Implement the `all_users` grid view.
    *   Search/Filter by alias.
    *   Card view with Avatar and Bio.
*   **Profile Page:** Implement the user profile view.
    *   **Header:** Avatar, Bio, Edit Profile (if owner).
    *   **Tabs:** "Submissions" (Grid of audio cards), "Requests" (List of owned requests).
*   **Archive Page:** List all past requests (chronological).

### G. Polish & Performance
*   **Optimistic UI:** Ensure immediate feedback for GunDB writes.
*   **Image Optimization:** Ensure avatars/artwork are sized correctly.
*   **Mobile Responsiveness:** Verify 4-pane layout on mobile.

---

## Instructions for Agent
*   **Context:** You are working on a "Local-First" web app with GunDB.
*   **Goal:** Implement the "User Feedback Integration" items and then complete the UI views.
*   **Focus:**
    1.  **Data Schema Updates:** Add `byline`, `extensions`, and `inviteGraph` fields.
    2.  **Creator Tools:** Implement the Participant Management row (Extensions/Passes).
    3.  **Pages:** Build the **Directory** and **Profile** pages using the enhanced data.