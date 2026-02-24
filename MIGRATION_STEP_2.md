# Step 2: Routing & Guards

**Objective:** Secure the application using the new Auth Context.

**Tasks:**
- Create `frontend/src/components/AuthGuard.tsx` (or update existing) to handle:
    - **Admin Routes:** Require Firebase User. Redirect to `/admin/login`.
    - **Participant Routes:** Require `participantEmail`. Redirect to a generic "Enter Email" entry page or modal.
- Update `frontend/src/App.tsx` to apply these guards to existing routes.
- Ensure the POC's `HostLogin` is accessible as the Admin entry point.

## Relevant POC Code
- **Admin Guard:** `frontend/src/components/HostAuthGuard.tsx` (implied usage in `HostDashboard.tsx`) - Wraps admin pages to ensure `auth.currentUser` is present.
- **Participant Access Control:** `frontend/src/pages/authless/RequestView.tsx` (lines 200-205) - Conditionally renders `<AuthlessLogin />` if `currentUserEmail` is missing.
- **Access List Logic:** `frontend/src/pages/authless/RequestView.tsx` (lines 135-147) - Logic to check if an entered email is allowed (`requestData.accessList.includes(...)`).