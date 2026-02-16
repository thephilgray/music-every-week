# Developer Notes

## Unresolved Items / Explanations

### Login with Email
The request to "Allow users to log in with Email OR Username" was not implemented because the current GunDB architecture uses the user's Alias (username) as the primary key for authentication (`user.auth(alias, pass)`). 

To support email login, we would need a secure, global reverse index mapping `Email -> Alias`. Since the `all_users` node is a public directory (and potentially large), scanning it client-side for every login attempt is inefficient and not scalable. 

**Recommended Solution:** Implement a dedicated "Email Index" node in the Relay or a separate auth service if this feature is critical. For now, users must log in with their Username (Alias).

### Safari Compatibility
Issues with Safari (Profile Picture, Admin Access) were addressed by:
1.  **URL Encoding:** File keys are now URL-encoded to handle spaces/special characters in S3/R2 URLs, which Safari is stricter about.
2.  **Race Condition Fix:** The `CreatorTools` and `RequestDetail` loading logic now uses `isCurrent` flags and robust subscription cleanup to prevent stale data from overwriting fresh data, which helps with Safari's fast/aggressive rendering.
3.  **HEIC Images:** HEIC uploads are now blocked (client-side validation) to prevent rendering issues, as browser support is inconsistent. Users are prompted to convert to JPG/PNG.

### Feed Visibility
The "Community Feed" now aggregates activity from:
1.  **Global Public Feed:** `global_pulse` (for public requests).
2.  **Private/Participated Requests:** `request_pulse` (newly implemented) for any request the user has joined.

This ensures users see activity for private groups they are part of.
