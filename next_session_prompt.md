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

### 2. Current Status: Deployment Ready
*   **Configuration:** Dockerfiles and `docker-compose.yml` created.
*   **Documentation:** `DEPLOYMENT.md` guide available.
*   **Code:** Bug fixes (Login, Profile) and UI Polish complete.

### 3. Recent Accomplishments (Session Jan 27, 2026 - Deployment Prep)
*   **Deployment:** Created `DEPLOYMENT.md` and Docker configs.
*   **Relay:** Hardened Dockerfile with volume and permission handling.
*   **Frontend:** Added Dockerfile for nginx serving.

### 4. Immediate High Priority Tasks (Next Session)

### A. Deployment Execution
1.  **Follow Guide:** User to execute steps in `DEPLOYMENT.md` for Railway and Vercel.
2.  **Verify Relay:** Check `/health` endpoint on deployed Relay.

### B. Live QA (Smoke Test)
1.  **End-to-End Test:**
    *   Create 2 users (Creator, Invitee) on the live site.
    *   Creator makes "Invite Only" request.
    *   Invitee accepts via Inbox.
    *   Invitee uploads track.
    *   Verify playback and data persistence after refresh.

## Instructions for Agent
*   **Focus:** Assisting user with any deployment errors and running the QA checklist.
*   **Goal:** Confirm the system works in a real-world multi-user environment.
