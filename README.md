# Palani Medical Clinic — test-data release

React/Vite clinic workflow application with Supabase Auth, PostgreSQL RLS and an administrator-only staff management Edge Function. **Use synthetic/test data only.** This release is not DHA certification, Kenya Core conformance or authorization to process real patient data.

## Run locally

Use Node.js 22.12+ or a supported newer version. Clone the repository first: the original Windows `C:\palani-app` directory was not a Git checkout.

```powershell
git clone https://github.com/johnsafari-1/palani-medical-clinic.git
cd palani-medical-clinic
npm ci
Copy-Item .env.example .env
# Configure the project URL and public browser key in .env.
npm run dev
```

| Variable | Purpose |
| --- | --- |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Public browser key, preferred |
| `VITE_SUPABASE_ANON_KEY` | Supported legacy public-key fallback |

Never put a secret/service-role key in a `VITE_` variable. The hosted project is `dzvaqppqwrgalmvvejab`; server-side staff management uses `quick-handler`. No default administrator password or public registration is provided. An active Administrator provisions staff accounts and resets passwords. Login usernames map to internal `username@palani.local` identifiers, not deliverable email addresses.

## Implemented workflows

| Role | Route | Functions |
| --- | --- | --- |
| Admin | `/app/admin` | Staff account management, price catalogue, audit viewer, operations reports |
| Receptionist | `/app/reception` | Patient registration/duplicate warning, retry-safe check-in, incoming referrals, accessible patient summary |
| Doctor | `/app/doctor` | Queue start, atomic consultation/orders, allergy review/corrections, admission/discharge, outgoing referrals, patient summary/printing |
| Nurse | `/app/nursing` | Structured vitals with measurement time and units, allergy visibility, queue/history |
| Lab Technician | `/app/lab` | Guarded lab completion, retained failure/retry feedback |
| Pharmacist | `/app/pharmacy` | Guarded dispensing, allergy visibility, OTC billing |
| Cashier | `/app/billing` | Atomic invoice creation, trusted catalogue totals, payment declaration and receipts |

Routes check Auth and an active database staff role before rendering role-specific screens. Access is revalidated on Auth events, visibility/focus and periodically. RLS checks active staff on database statements. Department bundles load on demand. Visible test-workspace labels, responsive navigation and keyboard controls are included.

Check-in/admission request IDs prevent duplicate retries within the current screen. Visit start/discharge are naturally retryable against the same saved identity. Visits progress forward; completed visits cannot be reopened or reassigned by browser clients. Admission identity/original fields are protected; discharge and an explicitly selected queue visit complete in one transaction. Directory actions do not infer a visit from a patient ID. One active visit and one active admission per patient are enforced.

Consultations save prescriptions, lab orders and their selected visit atomically. Outgoing referrals have explicit optional visit links; incoming referrals never create/complete queue visits. Matched retries return saved records. Browser metadata guards derive creation/completion actors and times. Audit writes share the source transaction; failed audit storage rolls back the clinical write. Browser TRUNCATE and audit-table writes are revoked. Privileged owners/service roles retain administrative authority.

Allergies distinguish not assessed, unknown, no-known and recorded entries. Corrections retain record IDs and attributed revision history. Nurse/Pharmacy read without editing; Reception cannot read allergy reviews. Doctor and Pharmacy actions require successful allergy reads in the UI. This is not medication decision support or server-enforced acknowledgment.

Summaries/referral letters/receipts/reports escape supplied text, isolate popup openers and use restrictive print CSP. Unavailable summary sections are explicitly marked. Required referral reads must succeed before printing. Admin reports aggregate in the database and use payment time for seven-day paid revenue, identify missing payment timestamps, and retain an unprintable snapshot after failed refresh.

## Database rollout

The eight hardening migrations through `incoming_referral_retries` were applied and merged in PRs #2–#11. The release branch adds `release_workflow_integrity` for check-in/visit/ward guards and report aggregation. See [release status and acceptance evidence](docs/TEST_RELEASE.md) for its exact hosted migration version and validation.

The original `palani_clinic_schema.sql` is an incomplete historical snapshot. These migrations extend the existing linked database. **Do not reset the project or run the historical snapshot over it.** The PGlite schema fixture uses mock Auth and is a test harness, not a fresh-project deployment baseline. Provisioning a new production database requires a complete baseline and restore rehearsal.

Apply database changes before deploying the corresponding frontend. Recovery SQL under `supabase/rollback/` preserves saved data and protections where documented; it is not a substitute for a verified backup. No recovery script is applied automatically.

## Verification

```powershell
npm ci
npm test -- --maxWorkers=1
npm run build
npm audit
```

CI runs tests/build on pushes and PRs. Local worker limits avoid contention in shared environments; test timeouts are unchanged. `supabase/tests/*.sql` scripts run as database owner against transaction-scoped synthetic fixtures and roll back rows/audits. Sequence numbers can advance. Never substitute real patient data for these fixtures.

Detailed evidence: [test release](docs/TEST_RELEASE.md), [clinical integrity](docs/CLINICAL_INTEGRITY.md), [billing](docs/BILLING_INTEGRITY.md), [vitals](docs/STRUCTURED_VITALS.md), [allergies](docs/STRUCTURED_ALLERGIES.md), [printing](docs/CLINICAL_PRINTING.md), [outgoing referrals](docs/ATOMIC_REFERRALS.md), [incoming referrals](docs/INCOMING_REFERRALS.md).

Vercel needs the configured public environment variables. `vercel.json` provides SPA deep-link fallback. Open `/login`, sign in with an assigned test account, verify the assigned dashboard/deep-link refresh, test another department's denied route, and sign out.

## Explicit release boundaries

- In-memory drafts/request identities are lost on reload, navigation or logout. Retry uncertain writes in the same mounted screen before leaving; reconcile saved records after a reload. Cross-session recovery is not implemented.
- Existing shared clinical reads are broad; clinician assignment, facility isolation and full least-privilege column separation are not implemented.
- Registration has a duplicate warning/confirmation, but a server-idempotent registration workflow is not part of this release. Direct legacy no-request inserts can also lack RPC replay guarantees.
- Dispensing is boolean completion, without partial quantities or inventory. Results/diagnoses/drugs/reasons are largely text. Attributed lab corrections, dispense reversals and invoice adjustments need separate workflows.
- Payments are staff declarations, not payment-provider verification or SHA claims. Reports are internal operational summaries, not audited accounts.
- No authenticated FHIR endpoint, HL7 v2 interface, Kenya Core validator evidence, HIE connection or DHA certificate exists. The pure vitals-to-R4 helper is preparation only. Identifiers, terminology, consent, read/export auditing, backups, retention and hosting suitability need production work.
- Leaked-password protection remains deferred by the user on the current plan. No subscription or Auth setting is changed.

These boundaries define the agreed **test-data release**, not production readiness. See the acceptance checklist for what was verified and what remains manual.
