# Client Response

## Answers to Questions

**Q: Can people who are invited to the request but have not yet submitted access the playlist?**
**A:** I have updated the logic so that access is restricted to **submitters only** (and the host), even after the playlist goes "live" or the deadline passes. Invitees who have not submitted will see the tracks as locked/hidden. They must submit a track to unlock the playlist.

**Q: Is it possible to hide the empty community section for now if we're not using public playlists?**
**A:** I initially hid it, but per your latest instruction, I have **restored the "Community" section**. It serves as a global feed/preview of activity in the public space, even if content is locked, similar to the global feed in the old app.

**Q: "Definitely do not forget your login" (what happens if they do? ... is there a possibility to incorporate a password recovery feature later on?)**
**A:** Currently, because the app uses a decentralized database (GunDB) where user accounts are cryptographic key pairs generated from the username and password, **there is no way to recover a lost password**. The "password" is actually a seed to regenerate their private keys. If they lose it, the account is effectively lost forever.

However, we have an **admin workaround**: If a user loses their password, they can create a new account (generating a new Public Key). An admin can then manually link their old Public Key to the new one. This will transfer "ownership" display, meaning their old content will appear on their new profile, but **they will lose the ability to edit that old content** (since they lost the private key needed to sign updates).

**Q: Can testers update their submission so it doesn't have to be the final thing?**
**A:** Yes, users can already edit their submissions. If they have submitted, the "Submit Track" button changes to "Edit Submission", allowing them to update the title, audio, artwork, etc., as long as the deadline hasn't passed (or they have an extension).

## Important Note on Request Settings

**Recommendation: Use "Public" Mode**
For official group requests, I recommend using **"Public"** mode.
*   **Public:** Users are automatically added to the request when invited or when they find it. They do *not* need to accept an invite in their Inbox.
*   **Private:** Designed for 1-on-1 or small group feedback (e.g., asking a specific person for thoughts on a WIP). Users receive an invite in their **Inbox** and must explicitly accept it before they can participate. This prevents the main feed from being cluttered with personal requests.

## Summary of Changes

1.  **Landing Page:**
    *   Updated the "About" text to reflect the current session until April 2026.
    *   Moved the "You're invited!" section into the Rules column.
    *   Aligned the Login and Rules columns to the top.
    *   Updated the mailchimp link.

2.  **Auth / Login:**
    *   Changed the login title to "Member Login".

3.  **Sidebar:**
    *   **Restored** the "Community" link.

4.  **Request Details (Playlist):**
    *   **Strict Access Control:** Non-submitters cannot see the playlist contents (other than their own) even after the deadline.
    *   **Expand on Click:** Clicking anywhere on a submission card (except buttons) now expands/collapses the details (comments, etc.).
    *   **Expandable Description:** Added "Read Prompt" toggle for long descriptions.