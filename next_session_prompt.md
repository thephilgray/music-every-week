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

### 2. Current Status: Feature Complete & Stable
We have resolved the critical blocking bugs (Uploads/CORS) and added the requested UI polish (Minimize Player). The app is fully functional and ready for final security verification and deployment.

### 3. Recent Accomplishments (Session Jan 27, 2026 - Critical Fixes)
*   **Critical Fix:** Resolved `Access-Control-Allow-Origin` and `S3Client` initialization errors in the Relay Server. Uploads and Recording submissions now work.
*   **UI Feature:** Implemented "Minimize Player" mode.

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
*   **Context:** The app is feature-complete and bugs are squashed.
*   **Focus:**
    1.  Perform the **Security Audit** (Task A). This is the most critical step before letting real users in.
    2.  Prepare for **Deployment** (Task B).
