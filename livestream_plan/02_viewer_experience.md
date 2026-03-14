# Phase 2: The Viewer Experience (Frontend)

## Objective
Build a new `/live` or `/party/:id` route in the application where users can join the watch party, listen together, and chat.

## 1. Create the Page Layout (`frontend/src/pages/WatchParty.tsx`)
Create a new page component that manages the split view: Media Player on the left, Chat on the right. 

- Use `react-router-dom` to read the `partyId` from the URL.
- Use `useEffect` with Firebase `onSnapshot` to listen to the document `/watchParties/${partyId}`.
- Save the current `status`, `currentIndex`, and `trackStartTime` in React state.

## 2. Time Math & Synchronization Hook
Create a custom hook (e.g., `useWatchPartySync`) to handle the math:

```typescript
// Fetch the current submission based on playlist[currentIndex]
// Calculate the offset
const calculateOffset = () => {
   if (!trackStartTime) return 0;
   const now = Date.now();
   // Firebase timestamps are in milliseconds or seconds depending on how you save it. 
   // Assuming trackStartTime is converted to a JS Date/milliseconds:
   const offsetMs = now - trackStartTime;
   return Math.max(0, offsetMs / 1000); // Return seconds for the audio player
};
```

## 3. The Synchronized Player
Mount your existing audio player or `PointsAnimation` component. 
- You will need to add a `seekTo` or `initialTime` prop to your audio playing logic.
- E.g., `audioElement.currentTime = calculateOffset();`
- Ensure standard controls are hidden so users cannot scrub: `<audio controls={false} />`.

## 4. Real-time Chat Component (`frontend/src/components/WatchPartyChat.tsx`)
- Build a chat pane that listens to `firestore.collection('watchParties').doc(id).collection('messages')` ordered by `createdAt`.
- Provide a simple text input using the existing UI components so authenticated users can react in real time.
- **The "Attach to Track" Toggle:**
  - Add a small checkbox or toggle switch near the chat input: `"Keep this comment on the track"`.
  - When the user submits a message, check this state.
  - If **unchecked** (Ephemeral): Write the message directly to the `/watchParties/{partyId}/messages` subcollection.
  - If **checked** (Permanent Integration): 
    - Write the message as a standard `Comment` to the `/submissions/{currentTrackId}/comments` collection.
    - AND write a reference or a duplicate of the message to the `/watchParties/{partyId}/messages` subcollection so it still appears seamlessly in the live chat feed. The message object should include `isAttachedToTrack: true` and `trackId: currentTrackId` so the UI can visually distinguish these "permanent" comments (e.g., with a small icon).
  - A cloud function or automated cron job can later delete the watch party's `messages` subcollection, but the track comments will remain safe.
