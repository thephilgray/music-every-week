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

## Administration

*See `deployment_details.private.md` for operational commands and data management procedures.*
