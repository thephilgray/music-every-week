# Phase 3: The Admin/DJ Controls

## Objective
Provide an interface for hosts/admins to control the watch party flow.

## 1. Admin Component (`frontend/src/components/WatchPartyAdmin.tsx`)
Create a control panel component that only renders if `user.uid === watchParty.hostPub` or if the user is an admin. You can reuse the `<Gatekeeper>` component to ensure only authorized users see this.

## 2. Playback Action Handlers
Wire up buttons to execute Firestore updates.

```typescript
import { doc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';

// Helper to advance the track
const handleNextTrack = async (partyId: string, currentIndex: number) => {
  const partyRef = doc(db, 'watchParties', partyId);
  await updateDoc(partyRef, {
    currentIndex: currentIndex + 1,
    trackStartTime: serverTimestamp(),
    status: 'live'
  });
};

// Helper to pause
const handlePause = async (partyId: string) => {
  const partyRef = doc(db, 'watchParties', partyId);
  await updateDoc(partyRef, {
    status: 'paused'
  });
};
```

## 3. Playlist Builder
- Render the `playlist` array as a list.
- Add drag-and-drop functionality to allow the host to modify the array order.
- On reorder, execute `updateDoc` to save the new `playlist` array to Firestore.
