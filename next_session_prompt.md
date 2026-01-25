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
*   **Phase 4: The UI & Interactions.** Dashboard Layout, Submissions, Comments System, Global Player. **[NEXT]**

---

## Current Status
We have successfully implemented **Phase 1**, **Phase 2**, and **Phase 3**.

### Accomplished
1.  **Frontend Scaffold**: Vite + React + Tailwind CSS.
2.  **GunDB Core**: Relay connected, `GunContext` established, SEA Auth working.
3.  **File Request Engine (Phase 3)**:
    -   **R2 Integration**: Created `infrastructure/relay` endpoint (`/api/upload-url`) using AWS SDK v3 for Cloudflare R2.
    -   **Frontend Upload**: Implemented `uploadFile` service to fetch signed URLs and PUT data.
    -   **CRUD Logic**: `CreateRequest` form implemented with Title, Description, Date, Visibility, and Artwork Upload.
    -   **Persistence**: Requests are saved to `gun.get('file_requests')` and linked to `user.get('my_requests')`.
    -   **Participant Staging**: UI implemented to add "Pending Emails" to a request during creation.
    -   **List View**: `RequestList` component displays active requests with realtime updates.

## Next Session Goal: Phase 4 (The UI & Interactions)
The goal is to turn the functional engine into a usable application with a proper dashboard layout, submission handling, and media playback.

### Tasks
1.  **Dashboard Layout**:
    -   Implement the "4-Pane Studio" layout (Sidebar, Context Bar, Main Stage, Player).
    -   Move `RequestList` and `CreateRequest` into appropriate views/modals within this layout.
2.  **Submissions Logic**:
    -   Allow users to "Submit Track" to a specific File Request.
    -   Upload Audio (MP3/WAV) using the existing R2 `uploadFile` service.
    -   Link submission to the File Request node.
3.  **Global Player**:
    -   Create a persistent bottom player component.
    -   Implement logic to load a File Request's submissions into the queue.
4.  **Comments**:
    -   Implement basic commenting on Submissions.

## Instructions for Agent
-   You are acting as the **Senior Full-Stack Architect**.
-   Read this file to understand the project history.
-   Continue with **Phase 4**.