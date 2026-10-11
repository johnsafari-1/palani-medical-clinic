# Clinical integrity implementation — 11 October 2026

This change builds on the merged Supabase Auth work. It is one implementation step toward healthcare readiness, not a DHA certification or FHIR conformance claim. Only test data is authorized for this prototype.

## Implemented

| Control | Result |
| --- | --- |
| Atomic consultation save | One invoker-rights database RPC writes the consultation, prescriptions, lab orders and selected visit completion. A failure rolls back all writes and their audit events. Existing RLS still applies. |
| Trusted actor | The RPC derives the doctor and lab-order author from `auth.uid()` and verifies an active Doctor/Admin in the database. It accepts no client-supplied doctor ID. |
| Encounter linkage | New queue consultations store `visit_id`, verify patient identity and visit state, and allow one consultation per selected visit. Historical rows are retained without invented encounter links. Saves from the patient list can have no queue visit. |
| Retry integrity | A request UUID and payload fingerprint detect retries and changed submissions. Matching retries return the original consultation. Visit locks and unique indexes serialize competing writes. The fingerprint is not encryption. |
| Creation/change audits | Private database triggers capture INSERT, UPDATE and DELETE on all 12 source tables, with actor, record ID, timestamp and before/after snapshots. Audit writes and TRUNCATE are revoked from browser roles. Database owners retain administrative authority; this is not external tamper-evident storage. |
| Doctor UI | Drafts clear only after confirmation; duplicate submission and patient switching are blocked during saves. An unconfirmed response retains the draft and request ID for retry. History failures show unavailable states and block clinical writes. Old patient responses cannot replace current history. |
| Development tooling | Pin patched build/test packages and refresh transitive dependencies to address the advisories reported by the full dependency audit. CI runs on Node 22; local tools require Node 22.12+ or a supported newer release. |

Retry state exists in the mounted doctor screen. Reloading, signing out or closing the page loses it. For an unconfirmed save, retry in the same screen before leaving. Persistent draft recovery and cross-device reconciliation remain future work.

The new RPC does not remove existing direct table write permissions. Legacy clients can still create consultations without this transaction; other workflows still need dedicated database operations and actor/column protections.

## Deployment state

The migration `supabase/migrations/20261011060200_atomic_clinical_records.sql` was **applied to the linked test project `dzvaqppqwrgalmvvejab` on 11 October 2026 with explicit approval**. The repository filename matches the hosted migration history. Both hosted clinical-integrity and staff-access verification scripts passed. A follow-up check found zero remaining synthetic patients, staff or Auth users. Catalog checks confirmed all 12 source tables use the private creation/change audit trigger.

The frontend remains in draft PR #3 and is not deployed. The existing frontend remains compatible with the additive columns and stronger audit coverage; it uses its previous separate save requests until the new frontend is deployed. No existing records were backfilled or deleted.

Deployment status:

1. Database migration: applied and recorded as `20261011060200_atomic_clinical_records`.
2. Hosted checks: `supabase/tests/clinical_records.sql` and `supabase/tests/staff_access.sql` passed using transaction-scoped fixtures. Rows and audit events were rolled back; sequence numbers can advance during tests.
3. Security Advisors: no new findings; leaked-password protection remains disabled. See [password security settings](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
4. Frontend: merge/deploy PR #3, then verify Doctor save/retry plus Nurse, Lab Technician, billing and Admin audit screens with test accounts. These authenticated browser checks are pending.
5. Recovery evidence: backup availability and recovery have not been verified. Establish a recoverable backup/restore point before using real patient data or treating the system as production-ready.

If deployment fails, revert the frontend first. `supabase/rollback/atomic_clinical_records.sql` disables browser execution of the new RPC and restores the nine prior audit triggers. It retains all records, captured audit events, added columns and unique indexes, and keeps the safer TRUNCATE/audit-write revocations. The rollback is locally tested; it is not a replacement for backups. Prefer fixing a specific defect while retaining the stronger audit coverage.

## Validation

Current results: 124 tests passed, production build passed, and the full dependency audit reported zero vulnerabilities after the toolchain updates. GitHub CI also runs the tests and build on each PR.

`npm test` covers the existing Auth/route behavior, doctor-screen saves and history races, retry IDs, and real PostgreSQL semantics through PGlite. A schema-only fixture captures the inspected project's tables, constraints and policies; it contains mock Auth and no patient records, and is not a production restore or fresh-project baseline.

The local tests inject a failing lab-storage trigger after the consultation and prescriptions have been inserted and verify that every write and audit event rolls back. They also check all seven staff roles, inactive and anonymous callers, repeat requests, mismatched payloads/patients, audit protection, and the compatibility rollback. Hosted SQL checks confirmed save/retry behavior, patient/visit integrity, active/inactive/anonymous authorization, creation audit records, protected audit/TRUNCATE grants and the existing staff-access rules. Failure injection and the compatibility rollback were tested locally, not applied to the hosted database.

## Remaining readiness work

| Area | Next implementation/evidence |
| --- | --- |
| Clinical permissions | Least-privilege reads; clinician/patient assignment; protected actor fields; pharmacists restricted to dispensing fields and lab technicians to result fields. Existing shared clinical reads remain broad. |
| Other transactions | Atomic billing/OTC, dispensing, lab completion, admission/discharge and referral workflows; server timestamps and concurrent state transitions. |
| Safe output | Complete the separate printing hardening work, including referral letters. |
| Clinical safety data | Structured allergy status, coded diagnoses/medications/tests, units and result interpretation, clinician identity and facility identifiers. |
| HL7 FHIR exchange | Kenya Core R4 mappings, applicable domain profiles, references and terminology validation, an authenticated API with an honest CapabilityStatement, and integration tests against the DHA/partner sandbox. No FHIR endpoint exists yet. |
| Audit evidence | Access/print/export events, reliable privileged-system attribution, retention policy and off-database integrity controls. Current row snapshots include clinical data and require the same access/retention protections. |
| Operational/legal readiness | Confirm DHA certification checklist, hosting/data-transfer and residency requirements, privacy/consent processes, backups/recovery and incident procedures. The inspected test project's region is `eu-west-1`; production suitability has not been established. |

Primary technical references: [Kenya Core IG 1.0.0, FHIR R4](https://fhir.dha.go.ke/ig/core/), [DHA certification portal](https://certification.dha.go.ke/), [HL7 R4 security](https://hl7.org/fhir/R4/security.html), [FHIR validation](https://hl7.org/fhir/R4/validation.html), [Supabase database functions](https://supabase.com/docs/guides/database/functions). The full current DHA certification checklist still needs to be obtained and mapped to evidence.
