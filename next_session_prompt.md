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

### 2. Current Status: QA & Polish
We have successfully implemented core features, secured the application, and addressed critical UI/UX feedback.
*   **Core Pages:** Home, Archive, Directory, Profile, Playlists, Request Detail.
*   **Features:** Authenticated Uploads, Audio Comments, Audio Submissions (Upload + Record), Smart Invites, Playlists.

### 3. Recent Accomplishments (Session Jan 27, 2026 - Critical Fixes & Features)
*   **Critical Bugs & Layout:**
    *   **Player Layout:** Resolved overlap issues by refactoring Player from `fixed` to flexbox layout.
    *   **Relay Server:** Fixed startup crash (undefined `port`).
    *   **Edit Request:** Fixed "User" alias bug by stringifying participants data in GunDB.
    *   **Collaborators:** Fixed issue where adding a collaborator showed "ID" instead of "Alias".
*   **Feature Enhancements:**
    *   **Audio Recording:** Added "Record Audio" tab to `SubmitTrack` for direct browser recording.
    *   **Profile Linking:** Made names clickable in Comments and Submissions to navigate to user profiles.
    *   **Player Controls:** Implemented functional Volume slider and Mute button.

### 4. Immediate High Priority Tasks (Next Session)

### A. Settings & User Polish
1.  **Settings Page:** Currently empty. Implement:
    *   **Profile Edit:** Change Alias, Bio, Avatar.
    *   **Privacy:** Toggle "Accept Unsolicited Requests" (if false, only show invites from known peers).
    *   **Data Management:** "Clear Local Data" (troubleshooting).

### B. Invite System Overhaul (Logic Clarification)
1.  **Email Invites Flow:** 
    *   **Creation:** When adding an email to a request (Create/Edit), create a "placeholder" slot.
    *   **Claiming:** When a user signs up with that email + Invite Code, auto-inherit the invite.
    *   **Deep Link:** The "Copy Link" URL should include `?inviteCode=` or `?reqId=` to auto-populate signup.
2.  **Post-Creation Invites:** Add ability to invite emails in `EditRequest` (currently only in Create).

### C. Testing & Validation
1.  **Security Audit:** Verify that a malicious user cannot overwrite the *content* of a request (even if they can overwrite the global link). Test the "User Graph" reference logic.
2.  **Playlist Polish:**
    *   Implement "Remove Track" from playlist.
    *   Add "Play All" button on Request Detail (auto-create ephemeral playlist?).

### D. Deployment Prep
1.  **Environment Variables:** Audit `.env.example` and ensure all R2/Gun keys are documented.
2.  **Build Optimization:** Check bundle size (lucide-react imports are good, but check Gun bundle).

## Instructions for Agent
*   **Context:** The app is feature-complete. We are cleaning up the last few logic flows (Invites) and UI screens (Settings) before Beta.
*   **Focus:**
    1.  Implement the **Settings Page** (easy win).
    2.  Tackle the **Invite System Overhaul** (complex logic).
    3.  Finalize **Playlist** features.