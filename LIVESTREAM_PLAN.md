# Livestream Watch Party Implementation Plan

## Top-Level Context
We are implementing a "Simulated Live" Synchronized Playback system within the existing `mew2` application (Idea 1). This approach fakes a livestream using the existing web app, a backend database (Firebase), and real-time syncing.

### Why this approach?
1. **Keeps Users In-App:** They can use existing features (tipping, commenting, following) while watching.
2. **No Video Rendering Overhead:** Uses existing `<Waveform />` or `<PointsAnimation />` and standard files.
3. **No Copyright Strikes:** Avoids Twitch/YouTube automated takedown bots.
4. **Low Cost:** Relies on standard file delivery and Firebase reads instead of costly 24/7 RTMP servers.

## Index of Steps

Here are the detailed steps for implementation:

1. [Phase 1: The Database (Firebase)](./livestream_plan/01_database.md)
2. [Phase 2: The Viewer Experience (Frontend)](./livestream_plan/02_viewer_experience.md)
3. [Phase 3: The Admin/DJ Controls](./livestream_plan/03_admin_controls.md)
4. [Phase 4: Automation (Optional V2)](./livestream_plan/04_automation.md)
