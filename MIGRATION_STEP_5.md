# Step 5: Refactor Player Context

**Objective:** Ensure the global player can play tracks from the new data source.

**Tasks:**
- Update `frontend/src/contexts/PlayerContext.tsx`.
    - Remove GunDB node subscriptions.
    - Ensure it accepts the "Submission" object structure from Firestore.
    - Verify R2 URL playback.

## Relevant POC Code
- **Audio Playback:** `frontend/src/pages/authless/PlaylistView.tsx` (lines 234-243) - Uses `usePlayer()` context's `play` function.
    - **Crucial:** Observe how it constructs the track object and playlist context: `play(track, trackList, { type: 'playlist', ... })`.
- **URL Handling:** `frontend/src/lib/url.ts` - Contains `fixUrl` which might be needed to ensure R2 URLs are correctly formatted for the audio element.