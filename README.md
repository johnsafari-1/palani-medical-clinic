# Palani Medical Clinic

A React/Vite clinic workflow prototype using Supabase Auth, PostgreSQL Row Level Security (RLS), and an administrator-only staff management Edge Function.

## Run locally

```powershell
cd C:\palani-app
npm ci
Copy-Item .env.example .env
# Set the publishable key in .env using Supabase Dashboard > Settings > API Keys.
npm run dev
```

Environment variables:

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser key, recommended |
| `VITE_SUPABASE_ANON_KEY` | Supported fallback for existing deployments |

Never put a Supabase secret or service-role key in a `VITE_` variable. Secrets for `quick-handler` remain on Supabase's servers.

Staff use their assigned username and password. The app maps the username to `username@palani.local`; these are internal login identifiers, not deliverable email addresses. New accounts and password resets are managed by an active Administrator. There is no public registration or default administrator password.

## Protected routes

| Staff role | Dashboard URL |
| --- | --- |
| Admin | `/app/admin` |
| Receptionist | `/app/reception` |
| Doctor | `/app/doctor` |
| Nurse | `/app/nursing` |
| Lab Technician | `/app/lab` |
| Pharmacist | `/app/pharmacy` |
| Cashier | `/app/billing` |

`/` and `/app` open the assigned dashboard after access verification. Signed-out users visiting a dashboard go to `/login`. A signed-in staff member visiting another department sees an access-denied page with a link to their own dashboard.

`AuthProvider` validates the access token with `auth.getUser()` and reads the caller's `staff` profile before rendering protected content. Roles come from the database, not the login screen's role cards or user-editable metadata. Missing, inactive, and unsupported staff profiles are blocked. Verification failures offer retry and sign out. Pending responses cannot restore another account's dashboard after account switches or logout.

Staff access is rechecked on Auth events, window focus, visibility restoration, and every minute while the page is visible. RLS checks active membership for each database statement, so deactivation blocks database access immediately, even if an old access token still exists.

## Database and Edge Function

The existing linked project is `dzvaqppqwrgalmvvejab` (`palani-medical-clinic`).

The hardening migration is `supabase/migrations/20261011044601_enforce_active_staff_access.sql`. It has already been applied to this linked project. It adds restrictive active-staff checks to the 12 existing clinic tables, preserves department-specific permissions, limits staff directory reads to the caller or an active Admin, and removes public execution privileges from internal trigger functions.

The unexposed `private.active_staff_role()` function uses narrowly scoped definer privileges to read only the caller's active role without recursing through staff RLS. Its public compatibility wrapper uses invoker privileges. The existing clinic workflow still shares clinical reads between active staff; this change does not introduce patient assignment or facility-level isolation.

`create-staff-function.ts` matches the deployed `quick-handler` function and supports account creation, deactivation, reactivation, and password resets. Every request validates the caller through Auth and requires an active Admin profile. JWT verification remains enabled. The active-Admin check was deployed as version 5 on 11 October 2026.

This repository's original `palani_clinic_schema.sql` is a historical, incomplete snapshot. The new migration hardens an existing schema; it is not a fresh-project baseline. Do not run the historical schema over the deployed database or reset the linked project. A complete baseline is needed before provisioning a separate fresh database.

## Validate

```powershell
npm test
npm run build
npm audit --omit=dev
```

`supabase/tests/staff_access.sql` tests the live policies using transaction-scoped fixtures and `authenticated`/`anon` database roles. Run it as the database owner in Supabase SQL Editor; all fixture users, patient records, and writes are rolled back. It tests all seven staff roles, missing membership, inactive Admin access, anonymous access, permitted patient writes, denied writes, and role escalation.

Validation on 11 October 2026: 96 frontend tests passed; production build passed; runtime dependency audit reported no vulnerabilities; database access tests passed. Supabase Security Advisors still reports leaked-password protection disabled. Enable it in Auth password security settings if available for the project's plan.

## Vercel

Keep the project URL and public key configured in the Vercel environment. Existing deployments using `VITE_SUPABASE_ANON_KEY` continue to work. `vercel.json` provides the SPA fallback required when opening or refreshing a dashboard URL directly.

The Supabase policy and Edge Function changes are live. The frontend route changes require deploying this branch or merging its pull request into the Vercel production branch. Verify sign-in with an existing staff account after deployment, refresh its dashboard URL, test another department's URL, and sign out.

## Scope

Use test data while the prototype is developed. Auth and RLS protections alone do not establish healthcare compliance or production readiness. Broader audit coverage, clinical data permissions, workflow integrity, and operational controls need separate review.
