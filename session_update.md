# Session Update: Privacy, Editing, & Branding

## Completed Tasks

### 1. Critical Logic & Privacy
- **Request Visibility:** Fixed `Home.tsx` to correctly filter "private" requests. They are now invisible unless the user is the owner or an invited participant (verified via `pubKey` check).
- **Edit Submission:** Implemented full "Edit" functionality for submissions. Users can now update their title, lyrics, and replace audio/artwork files. The UI adapts to "Edit Mode" when an existing submission is present.

### 2. UI & Branding Polish
- **Rebranding:** Renamed app title to "MEOW" and replaced the text logo in the sidebar with the official `mewlogo.png`.
- **Profile Enhancements:** Added `Location` and `External Links` fields to the User Profile schema. Updated `Settings` (edit), `Profile` (view/edit), and `types.ts` to support these new fields.

### 3. Security Audit (Integrity Checks)
- **Request Integrity:** Implemented cryptographic verification in `RequestDetail`. If a request's content signer does not match the declared `ownerPub`, a "Unverified Source" warning badge is displayed.
- **Submission Integrity:** Added logic to ignore spoofed submissions where the data signer does not match the `uploaderPub`. This prevents malicious users from impersonating others in the submission list.

## Next Steps
- **ACL Hardening:** Refactor the "Invite Acceptance" flow to write to the User's graph (`~User/responses`) instead of the public Request node, to prevent unauthorized status updates.
- **Deployment:** Finalize environment variables and deploy to production.
- **Beta Launch:** Create seed data and documentation.