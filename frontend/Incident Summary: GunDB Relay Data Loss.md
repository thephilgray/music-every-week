Incident Summary: GunDB Relay Data Loss & Recovery

  1. The Core Issues
   * Client-Side Corruption: The application was initially crashing due to radisk (IndexedDB)
     errors (Cannot create property '' on number) and race conditions on mobile devices
     causing "Invalid Code" errors during writes.
   * Server-Side Data Loss: The Relay Server (Cloud Run) was misconfigured to write to the
     ephemeral container filesystem instead of the persistent GCS bucket mount. Upon
     restart/redeployment, all user accounts and graph data were lost from the server.
   * Login Lockout: Users who logged out or cleared their local data could not log back in
     because the server no longer held their authentication keys (~@alias nodes).
   * Locked Content: While content was recovered via reseeding, it was cryptographically
     "owned" by the lost private keys, making it uneditable and locked to non-participants.

  2. Actions Taken

  Infrastructure & Server
   * Fixed Storage Path: Updated server.js to enforce an absolute path (/data/radata) to
     ensure Gun writes to the persistent GCS bucket mount, preventing future data loss.
   * Data Cleanup: Wiped the corrupted/inconsistent files from the GCS bucket to allow for a
     clean restart.

  Frontend Code Fixes
   * Storage Adapter: Switched gun.ts to use localStorage: true and radisk: false. This
     provides stable, simple persistence and avoids the corruption crashes of IndexedDB.
   * Auth Stability: Added isLoading locks to Auth.tsx to prevent race conditions
     (double-submitting) on slower devices.
   * Sync Performance: Refactored Community.tsx to use independent profile fetching
     (FeedItemRow), fixing the "syncing 1K+ records" warning and "Unknown User" display
     issues.
   * Validation: Added checks for undefined keys in various components to prevent "Invalid
     get request" log spam.

  Recovery Tools Implemented
   * Restore Session (Auth): Added a feature to Auth.tsx allowing users to paste a session
     JSON string to log in, bypassing server-side authentication if they have a backup.
   * Export Session (Settings): Added a tool to export the current session keys.
   * Reseed Relay (Admin): Added a tool to iterate through the local graph (Laptop
     "Lifeboat") and push public content (Requests/Submissions) back to the fresh server.
   * Backup Directory (Admin): Added a tool to export the known User Directory (Alias ->
     PubKey) to CSV for future migration.

  The "Phoenix" Recovery (Content Restoration)
   * Reseeded Content: Used the Admin's laptop cache to push the community's content back to
     the server.
   * Cloned Request: Since the original Request was locked by lost keys, we ran a script to
     Clone the request (creating a new ID owned by the current Admin) and copy all
     submissions/comments to it.
   * Unlocked Access: Forced the new Request to accessMode: 'volunteer' (via console) to
     ensure all users (who are effectively "new" users now) can view and play the tracks.

  3. Current Status
   * Server: Stable, persistent, and accepting new writes.
   * Content: Visible and playable via the New Request Link.
   * Admin: Logged in and has control over the new request.
   * Users:
       * Logged In: Unaffected (their devices will push their keys to the server).
       * Logged Out/Reset: Must Sign Up Again (same username). They will have a new identity
         (keys) but can view the old content.

  4. Immediate Next Steps (For New Session)
   1. Distribute New Link: Send the new Request URL (with the invite code param) to the
      community.
   2. Monitor: Watch for "Unknown User" issues; if they persist, the reseed might need to be
      repeated for specific profiles.
   3. Migration (Optional): If needed, use the Account Migration tool in Settings to link a
      user's Old Public Key (from CSV backup) to their New Public Key, aggregating their
      history on their new profile.