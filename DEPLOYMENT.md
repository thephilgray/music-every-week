# MEW2 Deployment Guide

This guide covers deploying the Relay Server (GunDB + Auth) and the Frontend (React).

## Prerequisites
*   **Source Code:** Pushed to a Git provider (GitHub/GitLab).
*   **Cloudflare R2:** Bucket created, with Access Key ID and Secret Access Key.
*   **Railway Account:** For hosting the Relay (Node.js).
*   **Vercel/Netlify Account:** For hosting the Frontend (Static).

---

## Part 1: Deploy Relay Server (Railway)

1.  **New Project:** In Railway, create a new project from your GitHub repository.
2.  **Root Directory:** Settings > General > Root Directory. Set to `infrastructure/relay`.
3.  **Variables:** Go to the "Variables" tab and add:
    *   `PORT`: `8080`
    *   `R2_ACCOUNT_ID`: Your Cloudflare Account ID.
    *   `R2_ACCESS_KEY_ID`: Your R2 Token ID.
    *   `R2_SECRET_ACCESS_KEY`: Your R2 Token Secret.
    *   `R2_BUCKET_NAME`: Name of your R2 bucket.
    *   `GUN_FILE`: `/data/radata`
4.  **Persistence (Crucial):**
    *   Go to the "Volumes" tab (or "Storage").
    *   Add a Volume.
    *   Mount Path: `/data`
    *   *Note: Without this, user accounts and data will vanish on every redeploy.*
5.  **Public URL:** Go to Settings > Networking > Generate Domain. 
    *   Copy this URL (e.g., `https://mew2-relay-production.up.railway.app`).

---

## Part 2: Deploy Frontend (Vercel)

1.  **New Project:** In Vercel, import your Git repository.
2.  **Root Directory:** Edit the Root Directory to `frontend`.
3.  **Build Settings:**
    *   Framework Preset: Vite (should detect automatically).
    *   Build Command: `npm run build`
    *   Output Directory: `dist`
4.  **Environment Variables:**
    *   `VITE_RELAY_URL`: Paste the Relay URL from Part 1 (e.g., `https://mew2-relay-production.up.railway.app`).
    *   *Note: Ensure no trailing slash if your code appends `/gun` manually, though the current code handles it.*
5.  **Deploy:** Click "Deploy".

---

## Part 3: Verification (Smoke Test)

1.  Open the Vercel URL.
2.  Create a new account (Sign Up).
3.  Refresh the page. You should stay logged in (Testing `localStorage` + Session Recall).
4.  Go to **Profile** > Edit. Upload an Avatar.
5.  If the avatar saves and displays, R2 storage is working.
6.  Open the site in a second browser (Incognito). Create a second user.
7.  Check if you can find the first user in the **Directory**.

---

## Troubleshooting

*   **Relay crashes:** Check Railway logs. Ensure `R2` credentials are correct.
*   **Data loss on restart:** Ensure the Docker Volume is mounted at `/data` in Railway.
*   **CORS Errors:** The Relay is configured to allow all origins (`origin: true`). If stricter security is needed later, update `server.js` to whitelist your Vercel domain.
