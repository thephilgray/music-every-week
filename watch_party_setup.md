# Watch Party Setup Guide

Currently, there is no frontend UI for creating a Watch Party directly. To set one up as an Admin, you will need to manually create a document in your Firebase Firestore Database.

## Step 1: Gather Information
Before creating the party, you need two things:
1. **Host UID (`hostPub`)**: Your Firebase User ID (or the UID of whoever will be DJing). You can find this in the Auth tab in Firebase.
2. **Track IDs (`playlist`)**: An array of `submissionId` strings from the submissions collection that you want to play.

## Step 2: Create the Firestore Document
1. Go to your **Firebase Console**.
2. Navigate to **Firestore Database**.
3. Create a new collection named `watchParties` (if it doesn't already exist).
4. Add a new document (you can let Firebase auto-generate the ID, or use a custom one like `party-123`).
5. Add the following fields to the document:

| Field | Type | Value | Description |
|---|---|---|---|
| `currentIndex` | `number` | `0` | The index of the track in the playlist to start with. |
| `hostPub` | `string` | `YOUR_UID` | The UID of the admin/host running the DJ controls. |
| `playlist` | `array` | `["trackId1", "trackId2"]` | The list of submission IDs to play. |
| `status` | `string` | `scheduled` | The initial state before going live. |
| `trackStartTime` | `number` | `0` | Default to 0. The app will update this automatically. |

## Step 3: Launch the Party
Once the document is saved, your watch party is ready!
- Share the URL with your users: `https://your-domain.com/watch-party/<DOCUMENT_ID>`
- Navigate there yourself.
- Since your UID matches the `hostPub`, you will see the **DJ Controls** interface.
- Click **Play** to start the music and sync everyone!
