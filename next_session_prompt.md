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
*   **Phase 6: Deployment & Polish.** Production Build, Hosting Setup, UI Refinement, E2E Testing. **[COMPLETED]**

---

## Current Status
We have successfully implemented **ALL Phases** (1 through 6).

### Accomplished
1.  **Frontend Scaffold & Core**: Vite + React, GunDB, SEA Auth.
2.  **File Request Engine**: R2 Integration, Frontend Upload, CRUD Logic.
3.  **UI & Interactions**: Dashboard Layout, Global Player, Submissions, Comments.
4.  **Social Features**: Notifications, Inbox, Creator Tools.
5.  **Deployment & Polish (Phase 6)**:
    -   **Deployment**: Added `vercel.json` for SPA routing. Verified build settings.
    -   **UI Polish**: Added `Skeleton` loading states for Requests, Details, and Inbox. Improved empty states.
    -   **Relay Hardening**: Optimized Docker build with `.dockerignore`.
    -   **Verification**: Frontend `npm run build` passes successfully.

### Recent Fixes & Additions (Post-Phase 6)
1.  **Uploads**: Fixed R2 public domain configuration. Added `VITE_R2_PUBLIC_DOMAIN` support in `upload.ts`.
2.  **Data Persistence**: Fixed "missing request" issue by switching from `gun.set()` to explicit `gun.get(uuid).put()`. Added JSON stringification for complex fields (`pending_emails`, `participants`) to prevent GunDB errors.
3.  **Feature**: Added **Edit & Delete Request** functionality for request owners.

## Next Session Goal: Launch & Maintenance
The project is feature-complete, stable, and ready for deployment.

### Tasks
1.  **Deploy**: Push to Vercel/Netlify (Frontend) and Cloud Run (Relay).
2.  **Monitor**: Watch for any GunDB sync issues in production.
3.  **Iterate**: Gather user feedback on the "File Request" workflow.

## Instructions for Agent
-   You are acting as the **Senior Full-Stack Architect**.
-   The codebase is in a stable, production-ready state.
-   Future sessions will focus on maintenance, bug fixes, or new features based on user feedback.