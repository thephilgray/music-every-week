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
We have resolved all critical blocking bugs (Uploads/CORS/Auth) and added the requested UI polish (Minimize Player). The app is fully functional and ready for final security verification and deployment.

### 3. Recent Accomplishments (Session Jan 27, 2026 - Critical Fixes)
*   **Auth & Uploads:** Implemented robust session recovery to fix "missing private key" errors.
*   **Relay Server:** Fixed CORS and R2 configuration.
*   **UI Feature:** Implemented "Minimize Player" mode.

### 4. Immediate High Priority Tasks (Next Session)

### A. Critical Logic & Privacy Fixes
1.  **Request Visibility:** Fix bug where new users see *all* requests (including private ones) they weren't invited to.
    *   *Action:* Update the request fetching logic (likely in `Home.tsx`) to filter out private requests unless the user is the owner or a participant.
2.  **Edit Submission:** Implement functionality to edit/replace a submission.
    *   *Requirement:* Users must be able to replace their track/audio file and update details if the request deadline has not passed.

### B. UI & Branding Polish
1.  **Rebranding:**
    *   **App Title:** Rename the document title (browser tab) to "MEOW".
    *   **Logo:** Replace the text logo with the image at `/Users/phillipgray/Downloads/mewlogo.png` (Copy to `frontend/public` or assets).
2.  **Profile Enhancements:**
    *   Add fields for **Location** and **External Links** (e.g., Socials) to the User Profile schema, `Settings` page, and `Profile` view.

### C. Security Audit (Critical)
1.  **Overwrite Protection:** Verify that a malicious user cannot overwrite the *content* of a request (even if they can overwrite the global link). Test the "User Graph" reference logic.
2.  **Submission Integrity:** Ensure users cannot delete/overwrite others' submissions.
3.  **ACL Verification:** Review the "Invite Claiming" logic where new users write to `participants`. Ensure this isn't too permissive.

### D. Deployment Prep
1.  **Environment Variables:** Audit `.env.example` and ensure all R2/Gun keys are documented.
2.  **Build Optimization:** Check bundle size (lucide-react imports are good, but check Gun bundle).
3.  **Relay Server:** Final check on relay server stability (ensure it persists data correctly).

### E. Beta Launch Checklist
1.  **Readme Update:** Update README with "How to Run" and "Architecture" overview.
2.  **Seed Data:** Create a script or manual process to seed the "Directory" with a few initial users/requests for testing.

## Instructions for Agent
*   **Context:** The app is feature-complete but needs logic tightening (privacy) and final branding polish.
*   **Focus:**
    1.  **Fix Request Visibility** (Task A.1) immediately.
    2.  Implement **Edit Submission** (Task A.2).
    3.  Apply **Branding & Profile Updates** (Task B).
    4.  Proceed with **Security Audit** and **Deployment**.