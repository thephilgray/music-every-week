# MEW2 — Project Context for AI Agents

## What is MEW2?

MEW2 (Music Every Week v2) is a cloud-native, collaborative music production platform for a songwriting community. Hosts create **prompts** (formerly called "file requests") that participants respond to by uploading original tracks. Prompts are organized into **sessions** — typically 10–12 prompts with deadlines every other week.

## Architecture

- **Frontend:** React (Vite) + Tailwind CSS, deployed on Vercel
- **Database:** Cloud Firestore. Collection names in Firestore still use legacy terminology (e.g. `requests` collection for prompts)
- **Storage:** Cloudflare R2 (S3-compatible) for audio/image uploads
- **Auth:** Firebase Auth with magic-link (passwordless) sign-in

## Key Terminology (Updated July 2025)

| Old Term | New Term | Notes |
|----------|----------|-------|
| File Request / Request | **Prompt** | A single assignment with a deadline for track submissions |
| (no concept) | **Session** | A group of related prompts (e.g. "Summer 2025 Session", 10 prompts over 20 weeks) |
| Playlist | Playlist | Auto-generated collection of submissions for a prompt |
| Playlist Live Date | Reveal Date | When submissions become visible to other participants |

> **Important:** Firestore collection names (`requests`, `submissions`, etc.) and the `requestId` field on documents have NOT been renamed in the database. The rename is UI-copy only. Internal variable names may still use the old terminology.

## Key Data Model

### Firestore Collections

- **`requests`** — Prompt documents (the `FileRequest` type in `types.ts`)
- **`playlists`** — Auto-created alongside each prompt; holds the track list
- **`submissions`** — Individual track uploads linked to a prompt via `requestId`
- **`profiles`** — User profiles with settings, contacts, points
- **`notifications`** — Inbox items (comments, invites, mentions)
- **`watchParties`** — Live listening sessions with chat
- **`events`** — Calendar events (deadlines, streams, workshops)

### FileRequest (Prompt) Fields

Key fields on the `requests` collection documents:
- `title`, `description` — prompt details
- `deadline` — ISO datetime for submission cutoff
- `playlistLiveDate` — when submissions become visible (optional)
- `accessMode` — `'direct'` (public), `'invite'` (private), `'volunteer'` (open pool)
- `accessList` — array of participant email addresses
- `ownerPub` — Firebase UID of the host
- `hostEmail` — host's email
- `playlistId` — linked playlist document ID
- `inviteCode` — shareable invite code
- `participants` — map of UID → {status, alias, email, extensionHours, hasPass}

### Session Concept (Active — July 2025)

Sessions are a grouping mechanism for prompts visible to hosts/admins in CreatorTools. They do NOT create a nested hierarchy in the member-facing feed. A session has:
- A name (e.g. "Fall 2025")
- A set of linked prompt IDs
- Optional metadata (start date, cadence, description)

The `FileRequest` type (`Prompt` alias) has an optional `sessionId` field, and a top-level `sessions` collection in Firestore stores session metadata. CreatorTools features a dedicated **Sessions** sidebar tab to manage sessions and assign/remove prompts.

## Application Structure

### Pages (`src/pages/`)
- `Home.tsx` — Active prompts feed + "New Prompt" button (admin/host only)
- `PromptDetail.tsx` — Single prompt view with submissions, comments, filters (formerly RequestDetail.tsx)
- `CreatorTools.tsx` — Admin dashboard: manage sessions, prompts, participants, exports
- `Playlists.tsx` — Browse and manage playlists
- `Community.tsx` — Activity feed across all prompts
- `Profile.tsx` — User profile with hosted prompts and submissions
- `Settings.tsx` — User preferences
- `Inbox.tsx` — Notifications
- `LiveSessions.tsx`, `WatchParty.tsx`, `PartyHub.tsx` — Live listening features

### Key Components (`src/components/`)
- `CreatePrompt.tsx` — 2-step form to create a new prompt (formerly CreateRequest.tsx)
- `EditPrompt.tsx` — 2-step modal form to edit an existing prompt (formerly EditRequest.tsx)
- `PromptCard.tsx` — Card component displaying a prompt with artwork, deadline timer (formerly RequestCard.tsx)
- `PromptList.tsx` — Grid of PromptCards with filtering (formerly RequestList.tsx)
- `SubmitTrack.tsx` — Track upload form
- `CommentSection.tsx` — Threaded comments on submissions
- `SubmissionCard.tsx` — Individual track display with player controls

### Access Modes
- **Direct (Public):** Anyone with the link can submit. Participants are auto-accepted.
- **Invite (Private):** Host must add participants by email. Participants must accept.
- **Volunteer:** Open seats that anyone can claim. Configurable whether volunteers can submit tracks.

## Conventions

- The app uses Tailwind CSS for styling
- Firestore listeners (`onSnapshot`) are used extensively for real-time updates
- The URL route for viewing a prompt is `/request/:id` (legacy path, may be updated)
- Toast notifications use a custom `ToastContext`
- File uploads go to Cloudflare R2 via a Vercel API route
