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

### 2. Current Status: Feature Complete (Beta Prep)
We have implemented all core features including Settings, Invites (with auto-join), Playlists, and Profile management. The app is functionally complete for a Beta release.

### 3. Recent Accomplishments (Session Jan 27, 2026 - Polish & Invites)
*   **Settings Page:** Profile editing, Privacy toggle, Data management.
*   **Invites:** "Auto-Join" flow for new signups via email links.
*   **Playlists:** Edit/Remove tracks and "Play All" context.
*   **Privacy:** Inbox filtering for unsolicited requests.

### 4. Immediate High Priority Tasks (Next Session)

### A. Security Audit (Critical)
1.  **Overwrite Protection:** Verify that a malicious user cannot overwrite the *content* of a request (even if they can overwrite the global link). Test the "User Graph" reference logic.
2.  **Submission Integrity:** Ensure users cannot delete/overwrite others' submissions.
3.  **ACL Verification:** Review the "Invite Claiming" logic where new users write to `participants`. Ensure this isn't too permissive.

### B. Deployment Prep
1.  **Environment Variables:** Audit `.env.example` and ensure all R2/Gun keys are documented.
2.  **Build Optimization:** Check bundle size (lucide-react imports are good, but check Gun bundle).
3.  **Relay Server:** Final check on relay server stability (ensure it persists data correctly).

### C. Beta Launch Checklist
1.  **Readme Update:** Update README with "How to Run" and "Architecture" overview.
2.  **Seed Data:** Create a script or manual process to seed the "Directory" with a few initial users/requests for testing.

## Instructions for Agent
*   **Context:** The app is feature-complete. Focus shifts to Security and Deployment.
*   **Focus:**
    1.  Perform the **Security Audit** (Task A). This is the most critical step before letting real users in.
    2.  Prepare for **Deployment** (Task B).