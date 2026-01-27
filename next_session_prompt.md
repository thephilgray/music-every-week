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

### E. Page Implementations (Next Priority)
*   **Directory Page:** Implement the `all_users` grid view.
    *   Search/Filter by alias.
    *   Card view with Avatar and Bio.
*   **Profile Page:** Implement the user profile view.
    *   **Header:** Avatar, Bio, Edit Profile (if owner).
    *   **Tabs:** "Submissions" (Grid of audio cards), "Requests" (List of owned requests).
*   **Archive Page:** List all past requests (chronological).

### F. Polish & Performance
*   **Optimistic UI:** Ensure immediate feedback for GunDB writes.
*   **Image Optimization:** Ensure avatars/artwork are sized correctly (maybe use R2 variants if available, or CSS resizing).
*   **Mobile Responsiveness:** Verify 4-pane layout on mobile (Sidebar likely becomes a drawer/bottom nav).

---

## Instructions for Agent
*   **Context:** You are working on a "Local-First" web app with GunDB.
*   **Goal:** Complete the UI views for the newly added routes.
*   **Focus:** Start with **Directory Page** and **Profile Page**. These are critical for the community aspect. Use the `UserProfile` data we just exposed in `GunContext`. The `Profile` page should reuse the `Submission` card logic from `RequestDetail`.
