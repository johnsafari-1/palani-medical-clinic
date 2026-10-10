# Palani Medical Clinic

A React/Vite clinic application using Supabase Auth, PostgreSQL/PostgREST, row-level security (RLS), and a staff-management Edge Function. The deployed frontend is hosted on Vercel.

## Current workflows

| Role | Workflow |
|---|---|
| Administrator | Staff creation, password reset, deactivation/reactivation, prices, reports, audit viewer |
| Receptionist | Patient registration/search, duplicate warning, check-in, incoming referrals, patient summary |
| Doctor | Consultation, prescriptions, lab orders, referrals, admission/discharge |
| Nurse | Vitals and visit queue |
| Laboratory Technician | Pending tests and result completion |
| Pharmacist | Prescription dispensing |
| Cashier | Encounter/ward billing, OTC sales, invoices, payment recording, receipt printing |

## Development

Use Node.js 22.12+ (Node 24 is also supported). The build/test toolchain was updated after dependency advisories were found.

```bash
npm ci
```

Copy `.env.example` to `.env` and supply your Supabase URL and public anon key. Never put a service-role key in a `VITE_*` variable: those variables are included in the browser bundle.

```bash
npm run dev
npm test
npm run build
```

Use synthetic data and a staging Supabase project for development. There is no hard-coded initial password in the active `src/` application. Bootstrap the first administrator through trusted Supabase administration, then create other staff through the reviewed server function.

## Database and Edge Function state

`palani_clinic_schema.sql` is an **older baseline**, not a complete representation of the deployed database. The app also references visits, admissions, referrals, price lists, audit logs and additional columns absent from that file. Do not rerun it against the existing database, and do not expect it alone to provision the current app.

The new migration `supabase/migrations/202610100001_active_staff_access.sql` adds staff activation support where absent, blocks inactive/missing staff on known application tables, revokes anonymous table access and authenticated TRUNCATE, and retains staff identity by denying browser staff deletion. It preserves existing role policies. Follow [the staging/application checklist](docs/DHA_FHIR_REVIEW.md#staging-and-release-checklist) before applying it.

The frontend calls `quick-handler`; the committed `create-staff-function.ts` is a create-only reference and is **not** the complete deployed function. Obtain the deployed function before replacing it. Its reference authorization now also requires an active administrator and depends on the migration above.

## Standards and production readiness

The application is **not established as DHA certified or Kenya Core FHIR conformant**. This first increment improves session isolation, blocks misleading patient summaries after read failures, and protects patient/receipt HTML printing. It does not add a FHIR server or exchange integration.

See [the source review, gap register, and implementation order](docs/DHA_FHIR_REVIEW.md). Complete database/function reconciliation, clinical transaction safety, least-privilege access, audit verification, and profile validation before making production readiness or certification claims.

Historical `palani-medical-clinic-login*.jsx` files are archived prototypes; the active entrypoint is `src/main.jsx` → `src/App.jsx`. Those prototype files are not imported by the Vite application.
