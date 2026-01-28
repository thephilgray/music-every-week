# Session Update: Access Modes, ACL Hardening & Deployment Prep

## Completed Tasks

### 1. Logic Refactor: Access Modes
- **Renamed Visibility:** Replaced `visibility` ('public'/'private') with `accessMode` ('direct'/'invite') across the entire codebase (`types.ts`, `CreateRequest`, `EditRequest`, `RequestDetail`, etc.).
- **Direct Add:** "Direct Add" requests now automatically accept invited participants.
- **Invite Only:** "Invite Only" requests require explicit acceptance.
- **Privacy Enforcement:** Updated `RequestList` to strictly filter "Invite Only" requests to participants, while "Direct Add" remains visible to the community (similar to Public).

### 2. ACL & Security Hardening
- **User-Graph Acceptance:** Refactored `Inbox` and `RequestDetail` to write acceptance status to the *User's Graph* (`~User/participation`) instead of the shared Request node. This prevents unauthorized modification of participant lists by non-owners.
- **Submission Security:** "Submit Track" button is now strictly guarded by participation status (or ownership/previous submission).

### 3. Deployment Prep
- **Environment Variables:** Standardized `VITE_RELAY_URL` and `VITE_R2_PUBLIC_DOMAIN`. Updated `.env.example` files.
- **Relay Config:** Verified Relay Server uses `radata` for local persistence.
- **Documentation:** Created root `README.md` with architecture and setup guide.
- **Seed Data:** Added a "Seed Directory" tool in `CreatorTools` (Admin only) to generate fake users and requests for testing.

## Next Steps
- **Deployment:** Deploy Relay and Frontend to production environment.
- **Manual QA:** Perform a full "Invite Cycle" test on deployed instance.
- **Mobile Polish:** Ensure new UI elements (Access Mode select, Admin tools) work well on mobile.
