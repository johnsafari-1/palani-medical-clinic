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
| Dispensing | An invoker-rights RPC locks the prescription and verifies an active Pharmacist/Admin. A database trigger protects prescribed fields and links even for direct browser updates, derives the dispensing actor/time on the server, and blocks reversal or modification of a completed dispense. Same-actor retries return the saved completion without another audit event. |
| Lab completion | An invoker-rights RPC verifies an active Lab Technician/Admin and locks the order. A database trigger protects patient/test/ordering fields, verifies the consultation patient, and derives completion actor/time. Completed results cannot be overwritten by browser updates. Same-actor, same-result retries return the saved result; conflicts preserve the existing result. |
| Pharmacy/Lab UI | Save and queue failures are visible. Failed refreshes retain a read-only snapshot. Results clear only after a confirmed response. An unconfirmed lab response freezes the original draft for retry; a rejected conflicting draft remains visible alongside the saved result after refresh. |
| Development tooling | Pin patched build/test packages and refresh transitive dependencies to address the advisories reported by the full dependency audit. CI runs on Node 22; local tools require Node 22.12+ or a supported newer release. |

Retry state exists in the mounted doctor screen. Reloading, signing out or closing the page loses it. For an unconfirmed save, retry in the same screen before leaving. Persistent draft recovery and cross-device reconciliation remain future work.

The new RPC does not remove existing direct table write permissions. Legacy clients can still create consultations without this transaction; other workflows still need dedicated database operations and actor/column protections.

Order guards apply to browser database roles. Trusted database owners/service roles and the existing definer-rights billing trigger retain their maintenance authority; their writes remain audited. This is not a privileged-administrator immutability guarantee. Browser lab corrections and dispensing reversals need a separate, attributed workflow before they can be supported. Dispensing is still a boolean completion, without partial quantities or stock reconciliation. Lab results remain free text, without coded observations, units or reference ranges. Draft recovery across reload/logout is not implemented.

## Deployment state

The migration `supabase/migrations/20261011060200_atomic_clinical_records.sql` was **applied to the linked test project `dzvaqppqwrgalmvvejab` on 11 October 2026 with explicit approval**. The repository filename matches the hosted migration history. Both hosted clinical-integrity and staff-access verification scripts passed. A follow-up check found zero remaining synthetic patients, staff or Auth users. Catalog checks confirmed all 12 source tables use the private creation/change audit trigger.

The order-completion migration `supabase/migrations/20261011062324_guarded_order_completion.sql` was also applied to the linked test project on 11 October 2026. Hosted order-completion checks passed, consultation/staff checks passed again with the guards installed, and a follow-up check found zero remaining order-test patients, staff or Auth users.

The consultation and Pharmacy/Lab frontend changes were merged into `main` in PRs #3 and #4. Vercel deployment and authenticated browser behavior have not been verified in this session. Existing pending-to-completed direct updates receive the database protections; the new failure/retry feedback requires those merged frontend changes to be deployed. No existing records were backfilled or deleted.

Deployment status:

1. Database migrations: applied and recorded as `20261011060200_atomic_clinical_records` and `20261011062324_guarded_order_completion`.
2. Hosted checks: `supabase/tests/clinical_records.sql`, `supabase/tests/staff_access.sql` and `supabase/tests/order_completion.sql` passed using transaction-scoped fixtures. Rows and audit events were rolled back; sequence numbers can advance during tests.
3. Security Advisors: no new findings; leaked-password protection remains disabled. The user has deferred this plan-dependent feature on the current test project; no subscription or Auth setting changes are part of this implementation. See [password security settings](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
4. Frontend: verify deployment of the merged changes and check Pharmacy/Lab save, retry and refresh with test accounts. Verify Doctor save/retry plus Nurse, billing and Admin audit screens. These authenticated browser checks are pending.
5. Recovery evidence: backup availability and recovery have not been verified. Establish a recoverable backup/restore point before using real patient data or treating the system as production-ready.

If deployment fails, revert the frontend first. `supabase/rollback/atomic_clinical_records.sql` disables browser execution of the new RPC and restores the nine prior audit triggers. It retains all records, captured audit events, added columns and unique indexes, and keeps the safer TRUNCATE/audit-write revocations. The rollback is locally tested; it is not a replacement for backups. Prefer fixing a specific defect while retaining the stronger audit coverage.

For the order-completion changes, revert Pharmacy/Lab screens first, then use `supabase/rollback/guarded_order_completion.sql` if required. It removes the two order guards and revokes browser access to the two completion RPCs. It leaves all records, saved completions, RLS and audit coverage intact. This compatibility rollback passed locally and was not applied to the hosted project.

## Validation

Current results including the prepared structured-vitals changes: 315 tests passed, production build passed, and the full dependency audit reported zero vulnerabilities after the toolchain updates. GitHub CI also runs the tests and build on each PR. [Billing deployment and remaining limitations](BILLING_INTEGRITY.md) records the applied billing migration and its tested recovery procedure.

`npm test` covers the existing Auth/route behavior, doctor-screen saves and history races, retry IDs, and real PostgreSQL semantics through PGlite. A schema-only fixture captures the inspected project's tables, constraints and policies; it contains mock Auth and no patient records, and is not a production restore or fresh-project baseline.

The local tests inject a failing lab-storage trigger after the consultation and prescriptions have been inserted and verify that every write and audit event rolls back. They also check all seven staff roles, inactive and anonymous callers, repeat requests, mismatched payloads/patients, audit protection, and the compatibility rollback. Hosted SQL checks confirmed save/retry behavior, patient/visit integrity, active/inactive/anonymous authorization, creation audit records, protected audit/TRUNCATE grants and the existing staff-access rules. Failure injection and the compatibility rollback were tested locally, not applied to the hosted database.

Order-completion tests also verify direct browser writes cannot alter prescribed drugs, doses, patient links or ordering fields; client-supplied actor/time are overridden; completed results are preserved; retries avoid duplicate audit events; and audit-storage failure rolls back completion. They verify compatibility with the existing invoice-item billing trigger, inactive/anonymous denial, queue errors and stale reads, UI retries, conflict draft retention, and a non-destructive rollback. The transaction-scoped hosted verification script is `supabase/tests/order_completion.sql`.

## Remaining readiness work

| Area | Next implementation/evidence |
| --- | --- |
| Clinical permissions | Least-privilege reads; clinician/patient assignment; actor protections in other workflows. Existing shared clinical reads remain broad. Pharmacy queries no longer request diagnosis, but this does not enforce column-level read isolation. |
| Other transactions | Atomic billing/OTC migration applied and merged in PR #5; admission/discharge and referral workflows; attributed lab corrections, invoice adjustments and dispensing reversals; partial dispensing and inventory. |
| Safe output | Receipt hardening merged and Vercel reports deployment completed; complete the separate patient-summary, reports and referral printing work. |
| Clinical safety data | Structured allergy status, coded diagnoses/medications/tests, units and result interpretation, clinician identity and facility identifiers. |
| HL7 FHIR exchange | Prepared [structured-vitals R4 mapping](STRUCTURED_VITALS.md); applicable domain profiles, references and terminology validation, an authenticated API with an honest CapabilityStatement, and integration tests against the DHA/partner sandbox. No FHIR endpoint exists yet. |
| Audit evidence | Access/print/export events, reliable privileged-system attribution, retention policy and off-database integrity controls. Current row snapshots include clinical data and require the same access/retention protections. |
| Operational/legal readiness | Confirm DHA certification checklist, hosting/data-transfer and residency requirements, privacy/consent processes, backups/recovery and incident procedures. The inspected test project's region is `eu-west-1`; production suitability has not been established. |

Primary technical references: [Kenya Core IG 1.0.0, FHIR R4](https://fhir.dha.go.ke/ig/core/), [DHA certification portal](https://certification.dha.go.ke/), [HL7 R4 security](https://hl7.org/fhir/R4/security.html), [FHIR validation](https://hl7.org/fhir/R4/validation.html), [Supabase database functions](https://supabase.com/docs/guides/database/functions). The full current DHA certification checklist still needs to be obtained and mapped to evidence.

The structured-vitals increment is prepared separately on `feature/structured-vitals`. Its migration is not applied because of a Supabase request-state error. See [structured vitals](STRUCTURED_VITALS.md) for validation and deployment order.
