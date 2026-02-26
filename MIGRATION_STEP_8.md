# Step 8: Refactor Admin/Creator Tools

**Objective:** Allow Admins to create and manage requests via the new backend, including separate access controls for requests and playlists.

**Tasks:**
- [x] Update `frontend/src/components/CreateRequest.tsx`.
    - [x] Save new Requests to Firestore.
    - [x] Manage "Access Lists" (emails) in the Firestore document.
- [x] Update `frontend/src/pages/CreatorTools.tsx`.
    - [x] **Separate Access Control UI:**
        - [x] Add a checkbox/toggle to "Use different access list for playlist?".
        - [x] If checked, show a separate text area for "Playlist Access Emails".
        - [x] If unchecked, use the Request's access list for both.
    - [x] **Separate Live Date:** Ensure the UI allows setting a `playlistLiveDate` that is distinct from the Request `deadline`.
- [x] Update `frontend/src/pages/Profile.tsx` to read/write Admin profile data from Firestore `profiles` collection.

## Relevant POC Code
- **Creating Request & Playlist:** `frontend/src/pages/authless/HostCreate.tsx` (lines 97-133) - Shows creating *two* linked documents (`playlists` and `requests`).
- **Separate Access Logic:** `frontend/src/pages/authless/HostCreate.tsx` (lines 80-96) - Logic to conditionally parse `playlistEmails` if `separatePlaylistAccess` is true, otherwise defaulting to `requestEmails`.
- **Access List Parsing:** `frontend/src/pages/authless/HostCreate.tsx` (lines 83-93) - Shows how to parse comma/newline separated emails into an array.
- **Profile Management:** `frontend/src/pages/authless/RequestView.tsx` (lines 115-127) - Shows how to fetch/create a `profiles` document for a user.
