# Step 6: Refactor Submissions (Write)

**Objective:** Allow users to submit tracks to the new backend.

**Tasks:**
- Update `frontend/src/components/SubmitTrack.tsx`.
    - Use `frontend/src/lib/r2.ts` (from POC) for file uploads.
    - Write to Firestore `submissions` collection.
    - Handle optimistic UI updates or navigation after submission.

## Relevant POC Code
- **Submission Logic:** `frontend/src/pages/authless/components/AuthlessSubmissionForm.tsx` (lines 115-180) - This is the core reference.
    - **File Upload:** Uses `uploadToR2(audioFile)` (line 144).
    - **Waveform Generation:** Calls `generateWaveform(audioFile)` (line 149).
    - **Firestore Write:** Uses `addDoc` to `submissions` collection (line 173) or `updateDoc` for edits (line 168).
    - **Data Structure:** Lines 156-166 define exactly what fields are saved to Firestore (`title`, `byline`, `audioUrl`, `usesAI`, `fragile`, etc.).