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

### 2. Current Status: MVP Complete (Phases 1-6)
We have successfully built the core application.
*   **Frontend Scaffold:** Vite + React, GunDB, SEA Auth.
*   **File Engine:** R2 Integration, Direct Uploads, CRUD Logic.
*   **UI Core:** Dashboard Layout, Global Player, Submissions, Comments.
*   **Social:** Notifications, Inbox, Basic Creator Tools.
*   **Infrastructure:** Cloud Run Relay, GCS Persistence, Scheduler.
*   **Recent Fixes:** R2 public domain support, GunDB `put()` vs `set()` persistence fixes, Edit/Delete Request features.

---

## 3. Post-MVP Refinement Plan
*The MVP is functional, but the following architectural refinements are required to meet the specific "Community App" and "Low Cost" goals.*

### A. Identity & Recovery (The "Trusted Admin" Model)
*   **No Password Resets:** Passwords are mathematical keys.
*   **Social Recovery:**
    1.  User creates a *new* account (new key pair).
    2.  Admin/Host verifies identity manually.
    3.  **Transfer Tool:** Admin links the Old Public Key nodes to the New Public Key.
*   **Gatekeeping:**
    *   **Whitelist/Directory:** `gun.get('all_users')`. Only users in this list can access the dashboard.
    *   **Invites:** "Magic Link" system (`myapp.com/join?code=...`). Validates against `gun.get('invites')`.
    *   **Genesis:** `VITE_ADMIN_SECRET` env var allows the first user (Host) to bypass checks and become the first admin.

### B. Connectivity & Cost Optimization
*   **The "$5/Year" Strategy:** Aggressive "Scale to Zero" on Cloud Run.
*   **Smart Idle Disconnect:**
    *   Frontend tracks activity (mouse/keys).
    *   If idle > 15 mins AND **Audio is NOT playing**: Close GunDB WebSocket (`gun.opt({ peers: [] })`).
    *   *Critical:* Audio playback (R2 direct stream) must *never* be interrupted by relay disconnection.
*   **Cold Start Handling:**
    *   Google Cloud Scheduler pings relay every 10 mins during active sessions.
    *   UI: Must show "Connecting to Network..." spinner during wake-up.

### C. Data Model Enhancements
*   **Directory:** `gun.get('all_users')` acts as the global "Company Directory".
*   **Profile:** Added `bio`, `avatarUrl`, `email` (for Mailchimp matching), `isAdmin`.
*   **File Requests (The "Assignments"):**
    *   **Permissions:** Resource-based (Creator = Owner).
    *   **Visibility:** `public` (Global Feed) vs `private` (Participants only).
    *   **Participation ("Distribution Lists"):**
        *   **Snapshot Model:** Participants are *copied* into the request's specific list at creation.
        *   **Import Workflow:** "Import from Week 1" -> Filter: "Submitted Only" -> Adds those keys to new request.
*   **Submissions:**
    *   **Double-Linking:** Linked to both `Request.submissions` and `UserProfile.submissions`.
    *   **Collaborations:** `collaborators` map; submission appears on all profiles.

### D. UI/UX Specifications
*   **The "4-Pane Studio" Layout:**
    1.  **Global Rail:** Home, Archive, Directory, Profile, Settings.
    2.  **Context Header:** Breadcrumbs + Action Area.
    3.  **Main Stage:** Active view.
    4.  **Global Player (Sticky Footer):** Persists across navigation.
*   **Global Player Logic:**
    *   **Smart Queue:** Clicking a song in *any* list (Request or Profile) sets that *entire list* as the queue.
*   **File Request Component:** Header (Countdown, Roster), Feed (Card-based, Waveforms), Direct Uploads.
*   **Creator Tools:**
    *   **Mailchimp Reconciliation:** "Member List" -> CSV Export.
    *   **Mass Invite:** Generate multi-use codes.

---

## Instructions for Agent
*   **Context:** You are working on a stable, feature-complete MVP codebase that now requires specific architectural refinements.
*   **Goal:** Systematically implement the "Post-MVP Refinement Plan" (Section 3).
*   **Focus:** Prioritize the **Smart Idle Disconnect** and **Invite/Gatekeeping** logic, as these are critical for the "Low Cost" and "Community" goals.