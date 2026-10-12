# Atomic outgoing referrals — 12 October 2026

Test-data implementation toward clinical integrity. It does not establish DHA certification, FHIR conformance, verified practitioner identity, signed referrals or external exchange.

## Transaction and attribution

`save_outgoing_referral` is an invoker-rights RPC, restricted to authenticated callers with an active Doctor/Admin staff row. It accepts patient, an explicitly selected optional visit, request UUID and referral text; no actor or timestamp parameters. The database derives recorder and time. Facility/reason are required, urgency is Routine/Urgent/Emergency, and text limits are 500 characters for facility/receiving doctor, 10,000 for reason and 50,000 for notes. Text is trimmed before fingerprinting and storage.

An additive migration adds nullable `visit_id`, `request_id` and `request_hash` to existing referrals. Historical records are retained without invented encounter links, request IDs or authors. Unique partial indexes enforce distinct request IDs and one linked referral per visit; constraints disallow incoming request/visit links. The retry hash is a matching fingerprint, not encryption.

Request advisory locks serialize saves sharing a UUID. Matching same-actor, same-patient/visit/normalized-text retries return the original record without another referral, visit update or audit event. Changed payloads and another recorder cannot reuse that ID. A row lock on the selected visit serializes with existing consultation saves; missing, completed and wrong-patient visits are rejected. A walk-in referral with no visit link completes no queue entry.

A BEFORE INSERT guard completes the linked visit under the same invoker/RLS permissions. Referral insert, visit completion and existing audit triggers share one transaction. An insert, uniqueness, visit-policy or audit failure rolls everything back. Reopened visits cannot receive a second linked referral. These tests verify rejection and atomicity; they do not constitute a multi-connection load/concurrency benchmark.

The guard also covers direct browser inserts, deriving author/time and normalized fields for new incoming and outgoing records. Incoming Reception/Admin inserts remain compatible and cannot claim outgoing visit/request links. Outgoing legacy inserts without links remain compatible with the deployed prior frontend; they have trusted creation metadata but lack RPC retry/visit transaction behavior. Direct inserts with links receive the same guard/atomic completion, while a repeated direct insert must use the RPC to retrieve its original result.

Browser UPDATE/DELETE/TRUNCATE are revoked; the row trigger rejects updates/deletes even if later grants/policies are introduced. A separate attributed correction workflow is needed. Existing RLS remains; no policy broadening or public definer RPC is added. The pure fingerprint helper lives in the unexposed private schema with explicit execution grants needed by invoker code. Trusted database owners/service roles retain maintenance authority; this is not privileged immutability.

## Doctor interface

The Doctor screen calls one RPC. A referral from an explicitly selected queue visit completes that visit; choosing the patient from the general directory leaves the visit link empty. The form explains this distinction. It no longer separately updates a queue visit inferred from the patient ID.

Duplicate submissions are blocked while saving. Draft fields clear only after matching patient, visit, request, actor, text fields and server identity/time confirmation. Unknown transport outcomes and malformed confirmations preserve the original request UUID, freeze fields and expose **Retry referral save**. Patient switching, other clinical writes, allergy edits and printing are locked until confirmation. A definite database rejection keeps an editable draft; retries after an unknown outcome can proceed even if a later history read fails.

Saving and printing remain separate. Confirmed referrals use the previously merged fresh-read, escaped print workflow. Print retries perform no writes. Draft/request identity exists only in the mounted Doctor screen; reload, navigation and logout lose it. Durable recovery remains pending.

## Validation, rollout and recovery

Local verification: **484 tests across 23 files passed** with `npm test -- --maxWorkers=2`; production build and diff checks passed. There are 36 PostgreSQL referral tests and 19 submission-helper tests, plus Doctor retry/queue integration tests. The existing bundle-size warning remains (approximately 560 kB before gzip, 155 kB gzip). PostgreSQL tests cover role/active/anonymous access, same-request replay, changed fields/actor, visit identity/completion, unique links, validation, direct spoofed metadata, incoming compatibility, audit/policy rollback, protected mutations and data-preserving recovery. Browser tests cover exact-response verification, connection errors, changed retry refusal, queued versus walk-in payloads, duplicate submission, draft retention/freezing and print-only retries.

The migration must precede the new Doctor frontend. It retains legacy inserts so the existing deployed screens remain usable during review. Recovery: revert Doctor frontend first; `supabase/rollback/atomic_referrals.sql` revokes authenticated execution of the new RPC and retains referral records, request IDs, links, RLS, guard, unique indexes and audit coverage. This is a locally tested compatibility procedure, not a backup/restore guarantee.

Remaining work: test-account review of the subsequent [incoming retry RPC](INCOMING_REFERRALS.md), durable drafts; attributed corrections/cancellation; controlled visit status transitions (legacy callers can still change visit state later); clinician/patient assignment and least-privilege reads; verified practitioner/facility identifiers; coded referral reasons, FHIR ServiceRequest/Provenance mapping and validation; consent and read/print/export auditing. The RPC does not enforce server-side allergy acknowledgment or clinical decision support. No Auth/subscription setting or dependency change is required.

Reference checked: [Supabase database functions](https://supabase.com/docs/guides/database/functions). Changelog markdown retrieval was unsupported; no statement about its contents is made.

The linked test project migration was applied on 12 October 2026 as `20261012063329_atomic_referrals`; the repository filename matches hosted history. All seven hosted scripts passed: referrals, allergies, vitals, clinical records, order completion, staff access and billing. Synthetic transactions rolled back their rows and audits; sequences can advance. The user reported testing complete and merged [PR #10](https://github.com/johnsafari-1/palani-medical-clinic/pull/10) as `8085ae09f62f23cce7e81ce699ab4b1ae2568ae4` on 12 October 2026. Merge CI passed and Vercel reported deployment completed; the agent did not independently verify authenticated browser scenarios.

Follow-up catalog/fixture checks found zero synthetic test patients, staff or Auth users in the checked fixture scopes, the invoker RPC and the guard trigger. Security Advisors reported only the previously deferred [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no setting or subscription changed.
