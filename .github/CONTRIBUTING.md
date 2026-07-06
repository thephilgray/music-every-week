# Contributing to Music Every Week (MEW) 🎵

First off, thank you for considering contributing to **Music Every Week**! It's people like you that make open-source collaborative songwriting tools thrive.

This document serves as a guide for developers, musicians, and designers looking to contribute code, documentation, or design improvements to the platform.

---

## 🏗️ Architecture & Tech Stack

Before diving in, familiarize yourself with our core technology stack:
- **Frontend Framework:** React 19 + TypeScript + Vite
- **Styling:** Tailwind CSS v4 (Vanilla utility classes, responsive design, dark mode)
- **Database & State:** Cloud Firestore (Real-time synchronization via `onSnapshot`)
- **Authentication:** Firebase Authentication (Passwordless Magic Links)
- **File Storage:** Cloudflare R2 (S3-compatible bucket for audio and artwork uploads)
- **Serverless Endpoints:** Vercel API routes (`/api/upload`) for generating presigned upload URLs

---

## 🚀 Local Development Setup

### 1. Fork & Clone the Repository
1. Fork the repository on GitHub.
2. Clone your fork locally:
   ```bash
   git clone https://github.com/your-username/music-every-week.git
   cd music-every-week
   ```

### 2. Install Dependencies
All frontend code lives inside the `frontend/` directory:
```bash
cd frontend
npm install
```

### 3. Environment Configuration
To run the app locally, you will need a Firebase project (Auth + Firestore enabled) and a Cloudflare R2 bucket.

1. Copy the frontend environment template:
   ```bash
   cp .env.example .env
   ```
2. Fill in your Firebase and R2 keys inside `frontend/.env`.
3. *(Optional)* If you are modifying backend Firestore security rules or database indexes, copy the Firebase CLI configuration from the root directory:
   ```bash
   cd ..
   cp .firebaserc.example .firebaserc
   cd frontend
   ```

### 4. Run the Dev Server
Start the local Vite development server:
```bash
npm run dev
```
The app will be running at `http://localhost:5173`.

---

## 🌿 Branching & Pull Request Workflow

1. **Create a Feature Branch:**
   Create a descriptive branch name from `main`:
   ```bash
   git checkout -b feat/waveform-scrubbing
   # or
   git checkout -b fix/audio-player-mobile
   ```
2. **Follow Code Conventions:**
   - Write clean, functional TypeScript with appropriate type definitions in `src/types.ts`.
   - Use Tailwind CSS utility classes for styling. Avoid inline styles or custom ad-hoc CSS classes.
   - Maintain responsive design (test on mobile and desktop viewports).
3. **Verify Your Changes:**
   Before submitting your PR, ensure the codebase builds and lints cleanly:
   ```bash
   npm run build
   npm run lint
   ```
4. **Submit a Pull Request:**
   - Push your branch to your fork on GitHub.
   - Open a Pull Request targeting our `main` branch.
   - Fill out the Pull Request template describing your changes, how you tested them, and any relevant screenshots.

---

## 🐞 Reporting Bugs & Suggesting Features

If you find a bug or have an idea for a feature:
- Check existing GitHub Issues to see if it has already been reported or suggested.
- If not, open a new Issue using one of our GitHub templates (Bug Report or Feature Request).
- Include browser version, OS, error logs from console, and steps to reproduce.

---

## 📜 License

By contributing to Music Every Week, you agree that your contributions will be licensed under its MIT License.
