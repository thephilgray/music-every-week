# MEW2 Deployment Guide

This guide covers deploying the Relay Server (GunDB + Auth) to **Google Cloud Run** (using Pulumi) and the Frontend to **Vercel**.

## Prerequisites
*   **Google Cloud Platform (GCP) Account:** Active project with billing enabled.
*   **Pulumi Account:** For state management (free tier is sufficient).
*   **GCloud CLI:** Installed and authenticated (`gcloud auth login`, `gcloud config set project <PROJECT_ID>`).
*   **Cloudflare R2:** Bucket created for media uploads, with Access Key ID and Secret Access Key.

---

## Part 1: Deploy Relay Server (Infrastructure as Code)

We use **Pulumi** to define the infrastructure:
*   **Compute:** Cloud Run Gen 2 (Scale-to-Zero, Docker).
*   **Persistence:** Google Cloud Storage (Bucket mounted as file system).
*   **Registry:** Google Artifact Registry.

### 1. Initial Setup
1.  Navigate to the infrastructure directory:
    ```bash
    cd infrastructure
    ```
2.  Install dependencies:
    ```bash
    npm install
    ```
3.  Login to Pulumi:
    ```bash
    pulumi login
    ```
4.  Initialize the stack (if first time):
    ```bash
    pulumi stack init dev
    ```

### 2. Configure Environment
Set the GCP region and project (Pulumi uses your gcloud config or these vars):
```bash
pulumi config set gcp:region us-central1
pulumi config set gcp:project <YOUR_GCP_PROJECT_ID>
```

### 3. Deploy
Run the deployment command. This will:
1.  Enable necessary GCP APIs (Cloud Run, Artifact Registry, etc.).
2.  Create a GCS Bucket for GunDB data.
3.  Build the Docker image from `infrastructure/relay`.
4.  Push the image to Artifact Registry.
5.  Deploy the Cloud Run service with the bucket mounted at `/data`.

```bash
pulumi up
```

Confirm `yes` when prompted.

### 4. Capture Outputs
After a successful deploy, Pulumi will output the `relayUrl`.
**Copy this URL.** You will need it for the frontend.

Example: `relayUrl: https://mew2-relay-service-xyz-uc.a.run.app`

---

## Part 2: Deploy Frontend (Vercel)

The frontend is a static React app that connects to your new Relay.

1.  **New Project:** In Vercel, import your Git repository.
2.  **Root Directory:** Edit the Root Directory to `frontend`.
3.  **Build Settings:**
    *   Framework Preset: Vite (should detect automatically).
    *   Build Command: `npm run build`
    *   Output Directory: `dist`
4.  **Environment Variables:**
    *   `VITE_RELAY_URL`: Paste the **relayUrl** from Part 1 (e.g., `https://mew2-relay-service-xyz-uc.a.run.app`).
5.  **Deploy:** Click "Deploy".

---

## Part 3: Verification (Smoke Test)

1.  **Health Check:** Visit `<RELAY_URL>/health` (should return "OK").
2.  **Frontend Access:** Open the Vercel URL.
3.  **User Creation:** Sign up a new user.
4.  **Persistence Test:**
    *   Refresh the page. You should stay logged in.
    *   *Backend Check:* The user data is now stored in the GCS bucket created by Pulumi.
    *   *Scale-to-Zero Check:* After 15 minutes of inactivity, the Cloud Run instance will vanish. Visit the site again; it should cold-start (spin up) and still have your data.

---

## Troubleshooting

*   **Pulumi Permissions:** Ensure your GCloud user has `Owner` or `Editor` role on the project.
*   **Docker Build Fails:** Ensure Docker is running locally (`docker ps`).
*   **Relay Crash:** Check Cloud Run logs in the GCP Console. Look for "Mount" errors.
*   **Data Loss:** Verify the Cloud Run service has the "Volume Mount" configured for `/data` pointing to the GCS bucket.