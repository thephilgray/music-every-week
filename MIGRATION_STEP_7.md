# Step 7: Refactor Comments (Read/Write)

**Objective:** Move the discussion features to Firestore.

**Tasks:**
- Update `frontend/src/components/CommentSection.tsx`.
    - Replace GunDB listeners with Firestore `onSnapshot`.
    - Update "Add Comment" logic to `addDoc` to Firestore.
    - Ensure comments link correctly to `requestId` / `submissionId`.

## Relevant POC Code
- **Real-time Listener:** `frontend/src/pages/authless/components/AuthlessComments.tsx` (lines 45-66) - Uses `onSnapshot` with a query filtering by `requestId` and optionally `submissionId`.
- **Adding Comments:** `frontend/src/pages/authless/components/AuthlessComments.tsx` (lines 72-87) - Uses `addDoc` to `comments` collection. Note the fields: `requestId`, `submissionId`, `authorEmail`, `text`, `createdAt`, `userProfile`.
- **Editing/Deleting:** `frontend/src/pages/authless/components/AuthlessComments.tsx` (lines 90-112) - Shows `deleteDoc` and `updateDoc` usage.