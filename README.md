# MEW2 (Music Every Week 2)

MEW2 is a peer-to-peer file-sharing application designed for songwriter communities. It is a "Local-First" web application built on GunDB.

## Architecture

*   **Frontend:** React + Vite + Tailwind CSS (SPA).
*   **Database:** GunDB (Decentralized, Peer-to-Peer Graph Database).
*   **Storage:** Cloudflare R2 (S3 Compatible) via authenticated Relay.
*   **Relay Server:** Node.js + Express + Gun. The relay server acts as a superpeer to ensure data availability and handles authenticated uploads to R2.

### Core Concepts

*   **Requests:** Users create "File Requests" (challenges/prompts).
*   **Access Mode:**
    *   **Direct Add:** Participants are added immediately and see the request.
    *   **Invite Only:** Participants must accept the invite.
*   **Submissions:** Participants upload audio tracks to a request.
*   **Peer Review:** Submissions are locked until deadline, then revealed to participants.
*   **Security:** Cryptographic signatures (SEA) verify authorship of data.

## Getting Started

### Prerequisites

*   Node.js v18+
*   Cloudflare R2 Bucket (or AWS S3)
*   Google Gemini API Key (for AI features if enabled)

### Environment Setup

1.  **Frontend:** Copy `frontend/.env.example` to `frontend/.env` and configure:
    *   `VITE_RELAY_URL`: URL of your relay server (default: `http://localhost:8080`).
    *   `VITE_R2_PUBLIC_DOMAIN`: Public domain of your R2 bucket.

2.  **Relay:** Copy `infrastructure/relay/.env.example` to `infrastructure/relay/.env` and configure:
    *   `R2_...`: R2 credentials.
    *   `PORT`: Server port (default: 8080).

### Running Locally

1.  **Start Relay Server:**
    ```bash
    cd infrastructure/relay
    npm install
    npm start
    ```

2.  **Start Frontend:**
    ```bash
    cd frontend
    npm install
    npm run dev
    ```

3.  Open `http://localhost:5173`.

## Deployment

*   **Frontend:** Deploy as a static site (Vercel, Netlify, Cloudflare Pages).
*   **Relay:** Deploy to a Node.js environment (Railway, Fly.io, Google Cloud Run). Note: Relay requires persistent storage (volume) for `radata` to ensure graph data persists across restarts.

## License

MIT
