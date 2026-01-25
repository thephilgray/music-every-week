# MEW2 Project Context & Next Session Prompt

## Project Overview
**Role:** Senior Full-Stack Architect specializing in "Local-First" web applications.
**Project:** Rebuilding "Music Every Week" (MEW) into a serverless, peer-to-peer file-sharing system called MEW2.

### 1. The Tech Stack
*   **Frontend:** React + Vite + Tailwind CSS (Hosted on Vercel/Netlify).
*   **State/Database:** GunDB (Decentralized Graph DB).
*   **Auth:** Gun SEA (Key-pair identity).
*   **Storage (All Media):** Cloudflare R2 (Audio & Images) - Zero Egress Fees.
*   **Storage (DB Persistence):** Google Cloud Storage (mounted via FUSE).
*   **Relay Server:** Google Cloud Run (Docker). Configured to Scale to Zero.
*   **Infrastructure:** Pulumi (TypeScript) on GCP.

### 2. UX/UI Structure
*   **Layout:** "4-Pane Studio" (Sidebar Nav, Top Context Bar, Main Stage, Sticky Bottom Player).
*   **Dashboard:**
    *   *Home:* Feed of Public "File Requests" (Active Assignments).
    *   *Inbox:* Notifications (Comments, Direct Invites, Mentions).
    *   *Creator Tools:* "Manage Participants" table with CSV export, Email Staging for new users, and Smart Import.

### 3. Data Schema & Logic
*   **User Profile:** `gun.get('all_users').get(pub_key)`
    *   Fields: `displayName`, `email` (Required), `bio`, `avatarUrl`, `isAdmin`.
*   **File Request (The Playlist Container):**
    *   *Permissions:* Any user can create a File Request.
    *   *Fields:* `title`, `description`, `deadline`, `visibility` ('public'/'private'), `artworkUrl` (R2).
    *   *participants:* Map of `{ pub_key: { status: 'pending'|'accepted' } }`.
    *   *pending_emails:* Array of emails invited but not yet registered (Staging area).
*   **Submission (The Track):**
    *   Fields: `audioUrl`, `artworkUrl`, `lyrics`, `uploadedBy`.
    *   *comments:* Linked list of comment nodes.
    *   *Logic:* A File Request acts as a Playlist of these submissions.
*   **Inbox (Notifications):**
    *   `gun.user(target_pub).get('inbox')`
    *   Senders write "Invite" or "Comment Alert" nodes here. Recipient marks `read: true`.

### 4. Key Features
*   **Democratized Creation:** Any user can create a File Request, upload Artwork/Description, and invite others.
*   **Deep Link Onboarding (The "Magic Link"):**
    *   Hosts can generate a link: `mew2.app/request/:id?invite=:code`.
    *   *Logic:* If a user is logged out/new, this code acts as their "Signup Invite."
*   **Auto-Join:** Upon signup, the app automatically adds the new user to the specific File Request embedded in the link.
*   **User-Generated Invites:** Any verified user can generate an Invite Code to onboard a friend.
*   **Threaded Commenting:** Support for "Slack-style" single-level nesting.
*   **In-App Notifications:** Real-time "Bell Icon" alerts.
*   **Smart Participant Import:** Creators can import users from any past request they were part of to quickly spin up a new session.
*   **Smart Queue:** Global Player loads the File Request context (the Playlist) and auto-advances through submissions.
*   **Smart Idle Disconnect:** Keeps connection alive if audio is playing.

### 5. Implementation Phases
*   **Phase 1: Infrastructure (Pulumi).** Deploy GCS, Cloud Run Relay, Scheduler. **[COMPLETED]**
*   **Phase 2: The Core.** React setup, GunDB provider, SEA Auth, Deep Link/Invite Logic. **[COMPLETED]**
*   **Phase 3: The "File Request" Engine.** R2 Uploads, Visibility, Email Staging. **[COMPLETED]**
*   **Phase 4: The UI & Interactions.** Dashboard Layout, Submissions, Comments System, Global Player. **[COMPLETED]**
*   **Phase 5: Social Features & Creator Tools.** Inbox Notifications, Participant Management, CSV Export. **[COMPLETED]**
*   **Phase 6: Deployment & Polish.** Production Build, Hosting Setup, UI Refinement, E2E Testing. **[NEXT]**

---

## Current Status
We have successfully implemented **Phase 1**, **Phase 2**, **Phase 3**, **Phase 4**, and **Phase 5**.

### Accomplished
1.  **Frontend Scaffold & Core**: Vite + React, GunDB, SEA Auth.
2.  **File Request Engine**: R2 Integration, Frontend Upload, CRUD Logic.
3.  **UI & Interactions**: Dashboard Layout, Global Player, Submissions, Comments.
4.  **Social Features (Phase 5)**:
    -   **Notifications**: Implemented logic to notify users on comments and submissions (`gun.user(pub).get('inbox')`).
    -   **Inbox Page**: Real-time list of notifications with "Mark as Read" functionality.
    -   **Creator Tools**: Dashboard to view "My Requests" and manage participants.
    -   **CSV Export**: Added functionality to export participant lists.

## Next Session Goal: Phase 6 (Deployment & Polish)
The goal is to prepare the application for production deployment and ensure a polished user experience.

### Tasks
1.  **Deployment Configuration**:
    -   Configure `vercel.json` or `netlify.toml` for SPA routing.
    -   Ensure environment variables are properly handled for production builds.
2.  **UI Polish**:
    -   Review responsive design on mobile breakpoints.
    -   Add loading skeletons instead of spinners where appropriate.
    -   Improve empty states.
3.  **Relay Server Hardening**:
    -   Verify Dockerfile optimization.
    -   Ensure "Scale to Zero" works as expected with GunDB peer syncing.
4.  **Final Walkthrough**:
    -   Manual End-to-End test of the "New User -> Invite -> Join -> Submit -> Comment -> Notification" loop.

## Instructions for Agent
-   You are acting as the **Senior Full-Stack Architect**.
-   Read this file to understand the project history.
-   Continue with **Phase 6**.