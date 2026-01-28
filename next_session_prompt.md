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

### 2. Current Status: Polished & Secure-ish
The app handles uploads, playback, and editing. We have implemented basic integrity checks to detect spoofing. The UI is branded as "MEOW".

### 3. Recent Accomplishments (Session Jan 27, 2026 - Polish & Security)
*   **Privacy:** Private requests are now truly private in the list view.
*   **Features:** Users can edit their submissions. Profiles now have Location and Links.
*   **Security:** Added "Unverified Source" warnings for spoofed requests and auto-filtering for spoofed submissions.

### 4. Immediate High Priority Tasks (Next Session)

### A. Logic Refactor: Request Access Modes (New Priority)
1.  **Rename & Clarify Visibility:**
    *   *Context:* The user clarified that the current "Public/Private" distinction is confusing. The intent is about *how* users join.
    *   *Goal:* Rename `visibility` (e.g., to `accessMode`).
    *   *Options:*
        *   **"Direct Add" (formerly Public):** Invited users are automatically added as `accepted`. They get a notification but don't need to click "Accept". It appears in their feed immediately.
        *   **"Invite Only" (formerly Private):** Invited users are `pending` and must explicitly "Accept" in the Inbox before it appears in their feed.
    *   *Actions:* Update `CreateRequest` (UI/Logic), `Inbox` (hide buttons for Direct Add), and `types.ts`. Remove "Public/Private" badges from `RequestCard`, `RequestDetail`, and `Profile` views.

### B. ACL & Data Model Hardening (Critical)
1.  **Refactor Invite Acceptance:**
    *   *Current Issue:* Users currently write to `file_requests/ID/participants/ME`. This is insecure if the node is open, or impossible if locked.
    *   *Fix:* Change logic so Invitees write to `~Invitee/participation/requestId = 'accepted'`.
    *   *Update:* Update `Inbox.tsx` (to write to user graph) and `RequestDetail.tsx` (to read status from participant's graph).

### C. Deployment Prep
1.  **Environment Variables:** Audit `.env.example` and ensure all R2/Gun keys are documented.
2.  **Build Optimization:** Check bundle size (lucide-react imports are good, but check Gun bundle).
3.  **Relay Server:** Final check on relay server stability (ensure it persists data correctly).

### D. Beta Launch Checklist
1.  **Readme Update:** Update README with "How to Run" and "Architecture" overview.
2.  **Seed Data:** Create a script or manual process to seed the "Directory" with a few initial users/requests for testing.

## Instructions for Agent
*   **Focus:**
    1.  Start with **Task A (Logic Refactor)** and **Task B (ACL Hardening)**. These are the last major logic refactors before launch.
    2.  Proceed to **Deployment** and **Documentation**.
--- End of content ---
