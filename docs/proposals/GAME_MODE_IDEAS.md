# mew2 "Game Mode" Brainstorm: The Festival Grounds

## The Core Concept
A completely optional, immersive 2D multiplayer mode that overlays the 24/7 `/live` continuous stream. Instead of passively listening and scrolling through a standard UI, users drop into a procedurally generated 2D room as an avatar. The room's layout, colors, and vibes change dynamically based on the current track. 

To provide variety without overwhelming complexity, the environment is divided into "Zones," allowing players to choose how they want to interact with the music.

## The 3 Interactive Mechanics

### 1. The Dancefloor (The Rhythm Catcher)
* **Location:** The center of the room.
* **The Gameplay:** An arcade-style zone where players catch objects falling from the ceiling synced to the beat (calculated deterministically on the client-side using the Web Audio API or pre-calculated beat maps). 
* **The Reward:** Earn platform points to use for tips, stickers, or cosmetic upgrades.

### 2. The Scaffolding (The Scavenger Hunt)
* **Location:** Platforms and structures above the main floor.
* **The Gameplay:** A platforming challenge. The track's lyrics and artist byline are shattered into fragments hidden up high.
* **The Reward:** Finding a fragment unlocks that line of text for the whole lobby. Unlocked lyrics then become available as "Neon Signs" or elements to use in the Time Capsule.

### 3. The Graffiti Wall (The Time Capsule)
* **Location:** The back wall of the environment.
* **The Gameplay:** A collaborative canvas. To prevent network lag, it relies on a "Stamping" constraint rather than freehand pixel drawing. Players spend points to place stickers, stamps, and visual effects on the wall.
* **The Integration (Comments, Lyrics, Artwork):** 
  * The track's **Artwork** acts as the central mural or the canvas backdrop. 
  * As **Lyrics** are unlocked from the Scavenger Hunt, they can be dragged and dropped onto the wall as stylized text.
  * **Comments** aren't just a scrolling sidebar. As users type in the chat, it appears as a speech bubble above their avatar. Furthermore, players can choose to **"Pin"** their comment directly onto the Graffiti Wall as a permanent sticky note.
* **The Reward:** When the song ends, a snapshot of the final wall (stickers, pinned comments, neon lyrics) is saved to the track's permanent archive as the "Crowd Canvas" for that specific live listening session.

---

## Phase 1 Implementation Plan

*Focus: The Foundation, Multiplayer Sync, and The Interactive Canvas (Integrating Comments/Art)*

### 1. The Tech Stack Integration
* **Phaser.js:** Use Phaser to handle the 2D rendering, sprites, and physics. Wrap the Phaser game instance inside a standard React component (`<GameMode canvasRef={...} />`).
* **Firebase Realtime Database:** Use this for fast, ephemeral state (avatar X/Y positions, current room state, canvas stamps).
* **React `PlayerContext`:** The game listens to the existing React audio player to know when to start, stop, and switch tracks.

### 2. Dynamic Room Generation (The Seed)
* When a new track starts, hash the `Artist Name + Track Title` into a deterministic seed.
* Use this seed to generate the room's basic layout (ensuring every player sees the exact same layout for that song without downloading map files).
* Extract the dominant colors from the track's **Artwork** (using a library like `color-thief`) and apply them as a global lighting tint to the Phaser scene.

### 3. Avatar Sync & Real-time Commenting
* Set up a Firebase Realtime listener for the current room ID.
* Broadcast the local player's X/Y coordinates every ~100ms. Interpolate movement for other players to keep it smooth.
* **Spatial Chat:** Hook your existing chat input into the game. When a user submits a comment, display it as a speech bubble over their avatar's head in Phaser.

### 4. The Collaborative Canvas (Graffiti Wall)
* Create a `canvasStamps` array in Firebase for the current track.
* Allow users to select predefined stickers (stars, hearts, flames) or select the track's **Artwork** as a stamp.
* **Comment Stamping:** Add a UI button next to recent chat messages that says "Pin to Wall". Clicking this converts their text comment into a physical 2D object they can place on the Phaser background.
* When a user places an item, push a tiny object to Firebase: `{ type: 'comment', text: 'this drop is insane', x: 250, y: 120, color: '#fff' }`. All clients render this immediately.

### 5. Track Transitions & Archiving
* When `PlayerContext` signals the song has ended, pause avatar movement.
* Take a visual snapshot of the Phaser canvas (or save the JSON array of stamps).
* Upload this "Time Capsule" to the track's metadata in Firestore/R2.
* Clear the Realtime Database room, generate the new seed for the next track, and fade the environment into the new color palette.

---
*Future Phases: Once Phase 1 is stable, introduce the Rhythm Catcher (Phase 2) for earning points, and finally the Platforming/Physics engine (Phase 3) for the Lyric Scavenger Hunt.*