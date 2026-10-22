# Test-data release completion — 22 October 2026

The user selected **Test-data release** as the finish line on 22 October 2026. This completes the scoped existing prototype workflows and reporting safeguards; it does not convert the application into a certified production EMR. The baseline is main `f2af903faa100a3b54e97b68a8b23f5b09533055` (merged PR #11).

## Release contents

| Area | Release behavior / evidence |
| --- | --- |
| Check-in | Active Reception/Admin invoker RPC; original request/patient/reason/actor must match on retry; derived actor/time; one active visit per patient. UI retains a retry outside the filtered list. |
| Visits | Doctor/Admin forward transitions; patient/check-in identity immutable; terminal visits cannot reopen; idempotent start returns the current started visit without another update. Source audits retain transition actor/time. |
| Ward | One active admission per patient; server admission/discharge metadata; original fields immutable; same-request admission retry; natural same-actor/visit discharge retry. Discharge and the explicitly selected optional visit update/audit share a transaction. |
| Directory versus queue | Directory admission/discharge has no inferred queue effect. Queue actions use only the selected visit. Failed start blocks clinical writes until refreshed/reselected. |
| Reporting | Admin-only invoker aggregation from one database snapshot, independent of REST row limits. Seven-day revenue uses `paid_at`; paid invoices without a timestamp are counted separately. Failed reads never become zeros. A failed refresh retains a labelled snapshot and disables printing. |
| Output | Reports now use the shared escaped, isolated, restrictive-CSP training-document printer; popup failure/closed windows are visible. Prior summary/referral/receipt hardening remains. |
| UI | Ward/check-in recovery states, keyboard patient/queue selection, visible directory/queue failures, labelled financial periods and missing-date notices. Each role loads on demand with a loading state. |
| Regression | Existing Auth/routes, referrals, vitals, allergy, billing and order tests remain in the suite. Existing hosted scripts are rerun after the release migration. |

Visit/admission guards protect browser roles, including direct legacy writes. Existing deployed frontend operations remain compatible, but the new RPC clients carry the stronger replay/explicit-visit behavior. Privileged owners/service roles retain maintenance authority; unique indexes still enforce their constraints. Historical identities/times/links are not backfilled. Preflight found zero duplicate active visit/admission patients before creating unique indexes.

Original rows and audits are retained. Explicit same-state legacy updates may retain original terminal metadata and produce a no-op audit; RPC retries return before updating and do not append duplicate transition audits. Existing direct visit completion is still available to authorized Doctor/Admin callers, subject to the guard; this is not an enforcement that every completion has a consultation/referral attached.

## Verification record

Final local results: **586 tests across 28 files passed** with `npm test -- --maxWorkers=1`; production build and diff checks passed. The full dependency audit reported zero vulnerabilities. No test timeouts or dependencies were changed. New database checks include identity/terminal protections, role/inactive/anonymous denial, unique active records, safe retries, wrong-patient links, audit rollback and recovery. Reporting tests include aggregation across 1,100 invoices and correct use of payment time. UI/helper tests include uncertainty retention, exact retry, malformed confirmations, failed-read snapshots and popup errors.

The first broad run had one unchanged Header test time out under concurrent build/load, with no assertion failure. The complete suite was rerun serially without increasing test timeouts. No dependencies were changed. The dependency audit reported zero vulnerabilities.

The production build before final verification reduced the initial JS from approximately 561 kB to 422 kB before gzip (124 kB gzip), with role chunks separate and no >500 kB warning. This is a build-size result, not a measured user-device performance benchmark.

## Deployment and recovery

Apply `release_workflow_integrity` to the linked **test** project before deploying the frontend. Never reset the linked project or use the historical schema snapshot as a baseline. The migration is additive except for stricter browser guards/uniqueness, preserves existing RLS and adds no definer-rights public RPC. Both active-record uniqueness checks must pass preflight; no duplicates are deleted or merged by this release.

If frontend recovery is needed, revert the frontend first. `supabase/rollback/release_workflow_integrity.sql` revokes execution of new RPCs, retaining rows, links, identities, guards, unique indexes, RLS and audits. This compatibility procedure is tested locally, not applied hosted, and is not proof of backup recovery.

## Test-account acceptance

These authenticated browser/device checks remain manual unless a result is explicitly recorded below. SQL roles/automated DOM tests do not establish hosted end-to-end or print-layout results.

1. Reception: register a synthetic patient; confirm duplicate warning; check in once, then confirm a second active check-in fails visibly. Test uncertain-response retry in the same screen, including filtering.
2. Doctor: open the queued patient with keyboard; start the visit; create a consultation with synthetic prescriptions/labs. Confirm the selected visit completes and cannot reopen or switch patient through direct client updates.
3. Ward: admit a patient; confirm a second active admission is rejected. Discharge from a selected queue visit and confirm both records complete. A directory discharge should leave other queue visits untouched. Retry an uncertain action without changing patient/details.
4. Nurse/Pharmacy/Doctor: verify allergy states and structured vitals; Nurse cannot edit allergy reviews, Reception sees unavailable allergy information, Pharmacy requires a successful allergy read before dispensing.
5. Lab/Pharmacy: complete synthetic orders once; retries retain the saved completion; denied/conflicting writes preserve originals. Billing uses configured catalogue values.
6. Cashier/Admin: create and pay synthetic invoices, print receipts, then verify report totals, payment-time period labels, missing-date warnings and refresh failure handling. Print summary/referral/report to PDF and inspect pagination/long text.
7. All roles: deep-link refresh, denied cross-role routes, sign-out, inactive-account denial, responsive navigation and keyboard focus. Verify the latest Vercel deployment.

Drafts/request IDs remain in memory; registration replay, durable drafts, clinical corrections/stock, external payments and production compliance are outside the agreed test release. Other workflow details and explicit limits are listed in the README.

## Interoperability and production boundary

The official Kenya Core guide currently identifies version 1.0.0 based on FHIR R4/4.0.1. Existing vitals mapping is a pure helper; it does not establish a FHIR API or profile conformance. A production/interoperability project must select applicable domain profiles and terminology, collect valid facility/practitioner/patient identifiers, validate actual resources with official tooling and obtain partner sandbox evidence. No profile claims or invented official identifiers are added by this release.

DHA certification review, privacy/consent/legal mapping, hosting/residency suitability, backup/restore evidence, retention and response procedures are not replaced by software tests. The inspected linked test project is in `eu-west-1`; production suitability is not established. Leaked-password protection remains deferred without changing the plan or Auth settings.

References checked on 22 October 2026: [Kenya Core IG](https://fhir.dha.go.ke/ig/core/), [DHA certification portal](https://certification.dha.go.ke/), [Supabase database functions](https://supabase.com/docs/guides/database/functions). The certification landing page exposed no checklist text to the retrieval tool; no claim that a full certification checklist was assessed is made. Supabase changelog markdown retrieval was unsupported.

Hosted verification: `20261022201519_release_workflow_integrity` was applied to test project `dzvaqppqwrgalmvvejab` on 22 October 2026. All nine SQL scripts passed: release workflows, incoming/outgoing referrals, allergies, vitals, clinical records, order completion, staff access and billing. Follow-up checks found zero synthetic test patients, zero Release-test staff/Auth users, five invoker functions and both row guards. Sequence counters can advance. Security Advisors reported only the previously deferred [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), with no new findings. The frontend is prepared on `release/test-data-completion` for final test-account acceptance. No authenticated hosted browser acceptance is claimed by the agent.
