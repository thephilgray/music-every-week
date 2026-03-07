# Audio Volume Normalization Strategies

To solve the issue of varying perceived loudness across user-submitted audio tracks, let's break it down using first principles. 

The fundamental problem is that the perceived loudness of an audio file is varied, but the user expects a consistent listening experience without having to touch their volume dial. 

At a foundational level, we have three places where we can intervene to change the volume:
1. **The Source:** The actual audio file stored in your database/bucket.
2. **The Metadata:** Data *about* the audio file stored in your database, acting as instructions for the player.
3. **The Playback:** The browser's audio engine processing the sound in real-time.

Based on those intervention points, here are three distinct approaches to normalizing volume:

### 1. The Pre-processing Approach (Server-Side Audio Alteration)
*Intervening at the Source.*
When a user uploads a track, a backend worker (like an AWS Lambda function running FFmpeg) processes the audio file. It calculates the loudness and physically alters the file's waveform to hit a standard target (like -14 LUFS, the Spotify standard) before saving it to your storage.
* **Pros:** Your frontend player remains incredibly simple. Every file it loads is already perfectly leveled. No client-side CPU overhead.
* **Cons:** You are permanently altering the original art. Audio purists might hate that you compressed or boosted their track. It also requires backend infrastructure and compute time during the upload process.

### 2. The ReplayGain Approach (Metadata & Client-Side Gain)
*Intervening via Metadata.*
When a track is uploaded, a backend script analyzes it to find its average loudness, but it **does not alter the audio file**. Instead, it calculates an "adjustment value" (e.g., "+3.2 dB" or "-1.5 dB") needed to reach the target loudness. It saves this single number in your database alongside the track info. When the frontend loads the track, it reads this value and applies a static volume multiplier to the player specifically for that song.
* **Pros:** Preserves the original, untouched audio file. The frontend math is trivial (just multiplying the player volume by the adjustment value). It maintains the track's internal dynamic range perfectly.
* **Cons:** Requires backend compute during upload just to do the analysis. Requires adding a new field to your database schema.

### 3. The Real-time Web Audio Approach (Client-Side Compression)
*Intervening at Playback.*
You route your HTML5 Audio element through the browser's Web Audio API and insert a `DynamicsCompressorNode` before the sound reaches the speakers. This acts like a real-time invisible hand riding the volume fader—squashing loud peaks and boosting quiet sections on the fly.
* **Pros:** Zero backend infrastructure needed. Can be implemented entirely in your React frontend today. Works instantly on all existing tracks in your database.
* **Cons:** A compressor alters the *dynamic range* of the song, not just the static volume. It can make acoustic tracks sound unnatural or "pumped" if not tuned carefully. It uses slightly more CPU on the user's device. 

---

**Recommendation:**
Given that you have a mix of acoustic recordings and highly mastered tracks, **Approach 2 (ReplayGain)** is the industry gold standard (it's what Spotify and Apple Music use). It respects the artist's original file while providing a smooth experience for the listener.

***

## High-Level Plan: The ReplayGain Approach (Approach 2)

Based on the current repository's stack (React/Vite Frontend, Vercel Serverless Functions, Cloudflare R2 for Storage, Firebase Firestore for Metadata, and Pulumi/GCP for Infrastructure), here is a high-level architecture and implementation plan.

### 1. The Upload & Trigger Workflow
We need to trigger an audio analysis job after the file reaches Cloudflare R2 and the track metadata is saved to Firestore.
- **Client Action:** The React frontend requests a presigned URL from Vercel (`api/upload.ts`), uploads the file directly to Cloudflare R2, and then creates a new track document in Firebase Firestore.
- **Analysis Trigger:** We can use **Firebase Cloud Functions** (since you are already utilizing Firebase) or a **GCP Cloud Run** service (managed via Pulumi) that listens to a Firestore `onCreate` trigger for the tracks collection. 
- *Why this way?* Cloudflare R2 doesn't have native, easy-to-use S3-like event triggers for standard compute without bridging through Cloudflare Workers. A Firebase Cloud Function triggering on document creation is robust and keeps your metadata logic tightly coupled to your database.

### 2. Audio Analysis (Backend Worker)
The Cloud Function / Cloud Run service will perform the heavy lifting asynchronously:
- **Download:** Stream the audio file from Cloudflare R2 using the AWS S3 SDK.
- **Analyze:** Use a library like `fluent-ffmpeg` (with a statically linked FFmpeg binary like `ffmpeg-static`) to run the `ebur128` filter. This filter calculates the Integrated Loudness (LUFS) of the track.
- **Calculate:** Determine the gain adjustment needed to hit a target loudness (e.g., -14 LUFS, a common streaming standard). 
  * *Formula:* `Adjustment (dB) = Target LUFS - Track LUFS`
- **Store:** Update the original Firestore track document, adding a new field: `volumeAdjustmentDb: <number>`.

### 3. Client-Side Playback (Frontend)
The React application (`Player.tsx`) will consume this metadata to adjust playback volume seamlessly.
- **Fetch Metadata:** When loading a track, the frontend reads the `volumeAdjustmentDb` from the Firestore document alongside the track URL.
- **Apply Gain:** The HTML5 `<audio>` element accepts a `volume` property between `0.0` and `1.0`. We must convert the dB adjustment to a linear scale multiplier.
  * *Formula:* `Gain Multiplier = 10 ^ (volumeAdjustmentDb / 20)`
- **Dynamic Calculation:** The final volume applied to the HTML5 Audio element will be the user's preferred volume dial setting multiplied by the track's gain multiplier.
  * *Example:* `audio.volume = Math.min(1.0, userVolume * gainMultiplier)`
  * *Note:* If using the Web Audio API instead of a pure HTML5 tag, this multiplier would be applied to a `GainNode`.

### 4. Handling Legacy / Unprocessed Tracks
- For existing tracks in your database without a `volumeAdjustmentDb` field, the system will gracefully default to a multiplier of `1.0` (no adjustment, fallback to default behavior).
- A one-off backfill script can be written to iterate through existing Firestore tracks, process the R2 files, and update them with their respective gain adjustments.

### Required Changes Summary
- **Infrastructure:** Add a Firebase Cloud Function (or Cloud Run worker) with `ffmpeg` capabilities.
- **Frontend Types:** Update the track schema/types in `frontend/src/types.ts` to include `volumeAdjustmentDb?: number`.
- **Frontend Player:** Update `frontend/src/components/Layout/Player.tsx` (or `frontend/src/lib/audio.ts`) to calculate and apply the linear volume shift based on the adjustment.