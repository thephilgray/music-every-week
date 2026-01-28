# MEW2 Project Context & Next Session Prompt

## Project Overview
**Role:** Senior Full-Stack Architect specializing in "Local-First" web applications.
**Project:** Rebuilding "Music Every Week" (MEW) into a serverless, peer-to-peer file-sharing system called MEW2.

### Current Status: Pre-Deployment / Critical Bug Fix Mode
*   **Codebase:** Feature complete but unstable in `CreatorTools`.
*   **Deployment:** Pending resolution of the "Disappearing Invitees" bug.

### 🛑 Critical Bug: Creator Tools Data Instability
**Symptoms:**
1.  **Flashing List:** When selecting a request, the invitee list appears briefly ("flashes") and then disappears, leaving *only* users who have submitted tracks.
2.  **Missing Data in Edit:** When opening the "Edit Request" modal, the participant list is empty or shows generic "User" placeholders instead of names.
3.  **Persistence:** Changes to the participant list (e.g., adding "Bob") do not seem to persist reliably.

**Suspected Cause (Hypothesis):**
*   **Race Condition in `CreatorTools.tsx`:** The "Dual-Subscription" model (fetching Root Node vs. Participant Node) might be causing `selectedRequest` to update multiple times with conflicting data.
*   **Overwriting State:** The second update (likely from the Node subscription) might be returning empty/null data that overwrites the valid data from the first update (Root), triggering a re-render of the row processing effect with an empty participant list.
*   **Effect Dependency:** The row-processing `useEffect` rebuilds the `rows` Map from scratch on every update. If `selectedRequest.participants` becomes empty temporarily during the update cycle, the rows are cleared.

### Immediate Next Tasks (Next Session)
1.  **Debug `CreatorTools` State:**
    *   Add extensive `console.log` tapping in the `useEffect` hooks in `CreatorTools.tsx` to trace exactly what data is arriving from Gun and in what order.
    *   Check if `cleanParts` in the Node subscription is coming back empty.
2.  **Stabilize Data Merging:**
    *   Refactor the `setSelectedRequest` merge logic to be additive/defensive (never overwrite an existing object with an empty one unless explicitly deleted).
    *   Consider using a `ref` for the `rows` Map to persist invitees across effect re-runs if necessary, or fully decouple the "List View" state from the "Request Data" state.
3.  **Fix Edit Modal:** Ensure the `EditRequest` component receives the fully resolved participant list, not just the raw state.
4.  **Execute Deployment:** Once `CreatorTools` is stable, proceed with `DEPLOYMENT.md`.