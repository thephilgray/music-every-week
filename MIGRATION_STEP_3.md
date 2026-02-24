# Step 3: Refactor Home & Feed (Read)

**Objective:** Make the main landing pages display data from Firestore.

**Tasks:**
- Update `frontend/src/pages/Home.tsx`.
    - Replace `useGun` hooks with `onSnapshot` or `getDocs` from Firestore (`requests` collection).
- Update `frontend/src/components/FeedItemRow.tsx` (and related UI) to accept Firestore data shapes (handling potential type mismatches).

## Relevant POC Code
- **Fetching Requests:** `frontend/src/pages/authless/HostDashboard.tsx` (lines 24-40) - Shows how to `query` the `requests` collection.
    - Note: The POC filters by `hostEmail`. For the public feed, you might want to remove that filter or add a `visibility: public` field/check.
- **Data Shape:** `frontend/src/pages/authless/HostDashboard.tsx` (lines 10-16) - Defines the `RequestSummary` interface which matches the Firestore document structure.