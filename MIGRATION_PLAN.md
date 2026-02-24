# Migration Plan: GunDB to Firebase (In-Place Refactor)

## Executive Summary
This plan details the process of replacing the GunDB backend with the Firebase/R2 backend within the *existing* main application (`frontend/src/pages/*`, `frontend/src/components/*`). We will not be porting the POC components (`pages/authless`) directly; instead, we will refactor the original application components to use the new data sources and authentication methods. The goal is to preserve the original UI/UX while completely removing the reliance on GunDB and the relay server.

## Migration Steps

### [x] Step 1: Authentication Infrastructure
**Objective:** Replace the GunDB user concept with a dual-mode Auth Context (Firebase Admin + Email Participant).
Detailed Plan: [MIGRATION_STEP_1.md](./MIGRATION_STEP_1.md)

### [x] Step 2: Routing & Guards
**Objective:** Secure the application using the new Auth Context.
Detailed Plan: [MIGRATION_STEP_2.md](./MIGRATION_STEP_2.md)

### [x] Step 3: Refactor Home & Feed (Read)
**Objective:** Make the main landing pages display data from Firestore.
Detailed Plan: [MIGRATION_STEP_3.md](./MIGRATION_STEP_3.md)

### [x] Step 4: Refactor Request Detail & Playlist (Read)
**Objective:** Make the deep-link pages (Request and Playlist views) read from Firestore.
Detailed Plan: [MIGRATION_STEP_4.md](./MIGRATION_STEP_4.md)

### [x] Step 5: Refactor Player Context
**Objective:** Ensure the global player can play tracks from the new data source.
Detailed Plan: [MIGRATION_STEP_5.md](./MIGRATION_STEP_5.md)

### [x] Step 6: Refactor Submissions (Write)
**Objective:** Allow users to submit tracks to the new backend.
Detailed Plan: [MIGRATION_STEP_6.md](./MIGRATION_STEP_6.md)

### [x] Step 7: Refactor Comments (Read/Write)
**Objective:** Move the discussion features to Firestore.
Detailed Plan: [MIGRATION_STEP_7.md](./MIGRATION_STEP_7.md)

### [ ] Step 8: Refactor Admin/Creator Tools
**Objective:** Allow Admins to create and manage requests via the new backend.
Detailed Plan: [MIGRATION_STEP_8.md](./MIGRATION_STEP_8.md)

### [ ] Step 9: Cleanup & Gun Removal
**Objective:** The final severing of ties.
Detailed Plan: [MIGRATION_STEP_9.md](./MIGRATION_STEP_9.md)
