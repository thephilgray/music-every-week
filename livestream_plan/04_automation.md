# Phase 4: Automation (Optional V2)

## Objective
Remove the need for a manual DJ by automating the playlist progression.

## 1. Triggering the Auto-Advance Document Update
You have two options to run this check:
1. **Client-Triggered (The DJ's Browser):** When the *host's* client reaches the end of the song, the host's client automatically triggers the Firestore update for the next track. This is easiest but relies on the host keeping their browser open.
2. **Server-Side Cron Job:** Run a Vercel Cron or Google Cloud Scheduler every 10 seconds to check active watch parties and advance them if the track has finished based on `trackStartTime` and the track's duration.

## 2. Serverless Function Approach
If you build a serverless function endpoint to handle the math:

```typescript
// Pseudo-logic for the automation worker
async function advanceWatchParty(partyId) {
  const partyDoc = await db.collection('watchParties').doc(partyId).get();
  const party = partyDoc.data();
  
  if (party.status !== 'live') return;

  const currentTrackId = party.playlist[party.currentIndex];
  // Fetch submission metadata to determine how long it is
  const trackDoc = await db.collection('submissions').doc(currentTrackId).get();
  
  // Calculate if the track has finished playing
  const durationMs = trackDoc.data().duration * 1000; 
  const timeElapsed = Date.now() - party.trackStartTime.toMillis();

  if (timeElapsed >= durationMs) {
    // Track is over, move to next
    await partyDoc.ref.update({
      currentIndex: party.currentIndex + 1,
      trackStartTime: admin.firestore.FieldValue.serverTimestamp()
    });
  }
}
```
