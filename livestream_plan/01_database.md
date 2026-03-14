# Phase 1: The Database (Firebase)

## Objective
Establish a single source of truth that every client will listen to in real time. We will create a new Firebase collection named `watchParties`.

## 1. Define Types (`frontend/src/types.ts`)
Add the following interfaces to your `types.ts` file to describe the real-time event:

```typescript
export interface WatchParty {
  id?: string;
  status: 'scheduled' | 'live' | 'paused' | 'ended';
  playlist: string[]; // Array of Submission IDs
  currentIndex: number;
  trackStartTime: number | FieldValue; 
  serverOffset?: number; 
  hostPub: string; // The user hosting the party
}

export interface WatchPartyMessage {
  id?: string;
  uid: string;
  displayName: string;
  text: string;
  createdAt: number | FieldValue;
  // If true, this message is permanently attached to the track's comments
  isAttachedToTrack?: boolean; 
  trackId?: string; // The submission ID this comment references
}
```

## 2. Update Firebase Security Rules (`firestore.rules`)
Add rules for the new `watchParties` collection so only the host or admins can update it, but anyone can read it and post to the `messages` subcollection.

```javascript
match /watchParties/{partyId} {
  allow read: if true;
  allow create: if request.auth != null;
  allow update, delete: if request.auth != null && 
    (resource.data.hostPub == request.auth.uid || 
     get(/databases/$(database)/documents/users/$(request.auth.uid)).data.isAdmin == true);

  match /messages/{messageId} {
    allow read: if true;
    allow create: if request.auth != null;
  }
}
```
