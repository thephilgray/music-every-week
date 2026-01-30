# MEW2 - Music Every Week (v2)

MEW2 is a decentralized, local-first file-sharing and collaboration platform built for the "Music Every Week" songwriting community. It leverages **GunDB** for peer-to-peer database synchronization and **Google Cloud Run + Cloud Storage** for persistence and relaying.

## Architecture

*   **Frontend:** React (Vite) + Tailwind CSS. Deployed on Vercel.
*   **Database:** GunDB (Local-First, Graph-based). Data lives in the user's browser (IndexedDB/LocalStorage).
*   **Relay:** A Node.js GunDB peer running on Google Cloud Run.
*   **Persistence:** Google Cloud Storage (GCS) mounted as a file system to the Relay for permanent data backup.
*   **Storage (Files):** Cloudflare R2 (S3 compatible) for audio/image uploads.

## Development

### Prerequisites
*   Node.js v18+
*   Google Cloud SDK (`gcloud`)
*   Pulumi CLI (for infrastructure)

### Local Setup
1.  **Frontend:**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```
2.  **Local Relay (Optional - for offline dev):**
    ```bash
    cd infrastructure/relay
    npm install
    npm start
    ```
    *Note: Update `frontend/src/lib/gun.ts` to point to `http://localhost:8080/gun` if using local relay.*

## Deployment

### Infrastructure (Backend)
The backend infrastructure is managed via **Pulumi**.
```bash
cd infrastructure
pulumi up
```
This deploys the Cloud Run service, GCS bucket, and Artifact Registry.

### Frontend
The frontend is deployed to **Vercel**.
*   **Production:** Auto-deploys from `main` branch.
*   **Environment Variables:**
    *   `VITE_RELAY_URL`: The URL of the Cloud Run relay service.
    *   `VITE_ADMIN_SECRET`: Secret code for admin signup privileges.

## Administration & Maintenance

### 1. Resetting the Database (Wipe All Data)
Since MEW2 is local-first, data exists in two places: the **Server (GCS)** and **User Browsers**. To completely reset the application (e.g. before a new season), you must wipe both.

**Step A: Wipe Server Storage**
Run this command to delete all database files from the Google Cloud Storage bucket:
```bash
gsutil -m rm -r gs://mew2-gun-data-9606141/**
```
*Warning: This action is irreversible.*

**Step B: Wipe Client Cache**
Because browsers cache data, visiting the site after a server wipe might cause the browser to re-upload old data.
1.  **Instruct Users:** Tell users to clear their browser cache ("Clear Site Data") or "Hard Reset" via the login screen link.
2.  **Admins:** Ensure you clear your own Local Storage and IndexedDB before creating the new "Genesis" admin account.

### 2. Password Recovery
Users cannot reset passwords because their password *is* their encryption key. If a user loses their password:
1.  User creates a **New Account**.
2.  Admin searches for the **Old Account** in the Directory.
3.  Admin clicks the **Red Shield Icon** on the old profile to "Remove from Directory".
    *   *This hides the old account from search/invites but preserves historical submissions under the old alias.*

### 3. Managing Volunteers
Users can opt-in to the "Feedback Volunteer Pool" in Settings. Admins/Hosts can then invite the entire pool to a request.
*   **Seat Limits:** Hosts can limit how many volunteers can accept.
*   **Permissions:** Volunteers gain immediate access to view/comment on all tracks in that request.