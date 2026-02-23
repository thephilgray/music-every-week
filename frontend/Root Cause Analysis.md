  Root Cause Analysis
   1. Server Data Loss: The Cloud Run Relay was writing to the container's ephemeral filesystem instead of the persistent GCS bucket.
      When the service restarted/redeployed, the server-side user directory (~@alias mappings) and graph data were wiped. This caused
      the "User not found" errors.
   2. Client Persistence Mismatch: The frontend configuration was switched from IndexedDB (radisk: true) to localStorage (radisk:
      false) to improve stability.
       * Result: The application stopped looking in IndexedDB, where all the historical user data (the "graph") was stored.
       * The Trap: Users' devices still hold the data in IndexedDB, but the app currently ignores it. Since the server is empty, the
         app sees "no data."

  The Solution: "Legacy Data Recovery" Tool
  I have added a new tool to the Settings page (under "Data Management") called "Recover Data from IndexedDB".

  This tool connects to the old IndexedDB storage (mew-radata-v1), iterates through the trapped data, and pushes it to the new Relay
  server.

  Instructions for Recovery

  Scenario A: You have a device (e.g., Phone) that was logged in properly before the crash.
   1. Open the app on that device.
   2. Go to Settings -> Data Management.
   3. Click "Recover Data from IndexedDB".
       * This will push your local history to the server, restoring the content for everyone.
   4. Once finished, use "Export Session (Backup)" on that device to get your private keys.
   5. On your Laptop (or other devices), use the "Restore Session" link on the login page and paste those keys to log in to your
      original account.

  Scenario B: You only have your Laptop, and you logged out.
   1. Go to Settings and run "Recover Data from IndexedDB".
       * This will restore the PUBLIC content (tracks, playlists) to the server.
   2. Crucial: Since you logged out, your private keys (which allow you to edit that content) might be lost if they were only in
      localStorage.
       * If you cannot find a backup of your keys, you will be able to see and play your old content, but you won't be able to edit
         it.
       * You can use the "Account Migration" tool (also in Settings) to link your old account (public key) to your new one, merging
         your identity.

  Scenario C: All local data is gone, but you have the GCS Backup.
  If the local tool fails, you can upload your GCS backup files to the bucket manually using the Google Cloud CLI:

   1 # Run this from your terminal where the backup is located
   2 gsutil -m cp -r /Users/phillipgray/Downloads/mew2gun-backup/mew2-gun-data-9606141/* gs://mew2-gun-data/
  Note: This assumes `mew2-gun-data` is your bucket name. Check `infrastructure/index.ts` to confirm.

  The Settings page update is complete and ready for use.