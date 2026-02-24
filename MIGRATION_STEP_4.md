# Step 4: Refactor Request Detail & Playlist (Read)

**Objective:** Make the deep-link pages (Request and Playlist views) read from Firestore, implementing enhanced filtering and separate access controls from the POC.

**Tasks:**
- Update `frontend/src/pages/RequestDetail.tsx`.
    - Fetch specific Request metadata from Firestore.
    - Fetch Submissions collection for that Request.
    - **Separate Access Control:** Implement logic to check the Request's specific `accessList` (which may differ from the linked Playlist's list).
- Update `frontend/src/pages/Playlists.tsx`.
    - Fetch Playlist metadata and associated Submissions.
    - **Separate Access Control:** Implement logic to check the Playlist's specific `accessList`.
    - **Filters & Sorting:** Implement the advanced filtering system from the POC:
        - Add state for `searchTerm`, `sortBy` (newest, oldest, most comments, etc.), `filterByAI`, `filterByFragile`, and `filterByFeedbackFocus`.
        - Implement the `FilterPopover` component (or equivalent UI) to control these states.
        - Use a `useMemo` hook to efficiently filter and sort the submissions based on these states.
    - **Shuffle:** Implement a shuffle feature that randomizes the playback order of the *filtered* list.
- Ensure `isLocked` logic (for future playlists) works with the new `serverTimestamp` / date comparisons.

## Relevant POC Code
- **Fetching Single Request:** `frontend/src/pages/authless/RequestView.tsx` (lines 38-55) - Uses `getDoc(doc(db, 'requests', id))`.
- **Fetching Playlist & Submissions:** `frontend/src/pages/authless/PlaylistView.tsx` (lines 148-185) - Fetches the playlist doc, associated request, and queries `submissions` where `playlistId == id`.
- **Separate Access Control Logic:** 
    - `frontend/src/pages/authless/RequestView.tsx` (lines 135-147) checks `requestData.accessList`.
    - `frontend/src/pages/authless/PlaylistView.tsx` (lines 200-215) checks `playlistData.accessList`.
- **Locking Logic:** `frontend/src/pages/authless/PlaylistView.tsx` (lines 125-142) - Detailed `isLocked` implementation.
- **Sorting/Filtering Implementation:** `frontend/src/pages/authless/PlaylistView.tsx` (lines 75-115) - `useMemo` block that handles sorting and filtering.
    - **Filter UI:** `frontend/src/components/ui/FilterPopover.tsx` (if available in POC, otherwise implemented inline or as a separate component in the POC folder structure).
- **Shuffle Logic:** `frontend/src/pages/authless/PlaylistView.tsx` (lines 270-280) - `handleShufflePlay` function using a seeded random generator.
