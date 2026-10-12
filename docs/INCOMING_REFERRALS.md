# Incoming referral retry integrity — 12 October 2026

This test-data increment records reported incoming-referral information with attributable creation and safe retries. It is not a FHIR exchange implementation, a clinical triage engine, independently verified external practitioner identity, or DHA certification.

## Database behavior

`save_incoming_referral` uses invoker rights and existing RLS, checks an active Receptionist/Admin, and derives creation recorder/time in the existing referral guard. It accepts a patient, request UUID, referring facility/doctor description, reason, reported urgency and notes. Limits and normalization match the outgoing path: facility/doctor 500, reason 10,000, notes 50,000 characters, with required facility/reason and Routine/Urgent/Emergency urgency.

Incoming records have no visit link and create/complete no queue visit. The request advisory lock and unique request index are shared with outgoing referrals. Matching same-recorder, same-patient, normalized-text retries return the original record without another insert or audit event. Changed payloads, recorder or direction cannot reuse a request ID; outgoing retry checks now explicitly verify direction too. Fingerprints of existing outgoing referrals are unchanged.

The additive migration extends the request-link check and existing guard to incoming request IDs, replaces the outgoing RPC with its direction-aware equivalent, and adds the incoming RPC. No historical rows, request IDs, visit links, hashes or authors are rewritten. Browser direct incoming inserts without a request remain compatible. Direct incoming inserts with request IDs receive derived fingerprints and trusted metadata, but replaying a direct insert still requires the RPC. Incoming visit links remain forbidden.

Saved referral mutation/TRUNCATE protections, prior grants and RLS continue. Privileged database owners/service roles retain maintenance authority. No policy is broadened and no public definer function is introduced. Role checks verify recording authority, not the identity of the external doctor named in the incoming source text.

## Reception interface

The editor is displayed outside the filtered patient list and retains the selected patient's name/code and UUID. Searching or a list refresh cannot hide an unconfirmed draft or change its target. Fields have visible labels, maximum lengths, reported urgency and additional notes; the editor states that referral capture does not check in or complete a visit.

One RPC saves the referral. Duplicate submit events and switching/cancelling the referral editor are blocked while saving or pending confirmation. Unknown response outcomes and malformed/wrong-direction, wrong-patient, actor, request or text confirmations freeze the draft and expose **Retry incoming referral save** with the original UUID. A definite SQL rejection retains editable fields. The draft clears only after a matching confirmation; the confirmation includes the patient name/code and persists until a new referral editor is opened. An unmounted screen suppresses late save feedback.

Other Reception actions remain independent. The lock protects the referral editor's identity; it does not claim a global lock on check-in, registration or summary reading. Drafts/request IDs exist in memory: reload, navigation or logout loses pending identity. Durable recovery, incoming clinical assessment and visit creation are separate work.

## Validation and rollout

Local verification: **521 tests across 25 files passed** with `npm test -- --maxWorkers=2`; production build and diff checks passed. There are 30 PostgreSQL incoming-referral tests, including an isolated pre-migration rehearsal, six Reception tests and an additional incoming submission-helper check. The existing bundle warning remains (approximately 561 kB before gzip, 155 kB gzip). PostgreSQL tests cover roles, inactive/anonymous calls, matching/changed retries, actor collisions, both cross-direction request collisions for an Admin, validation, direct metadata guards, audit rollback, untouched visits, data-preserving recovery, hosted SQL and rehearsal of pre-migration outgoing retries and legacy incoming contents. UI/helper tests cover confirmation identity, duplicate submit, filtering during pending saves, cancel/switch protection, editable rejection, lost-response replay, reported fields and unmount suppression.

Apply the migration before deploying the Reception frontend; the currently deployed direct incoming form remains compatible during review. Recovery: revert Reception frontend first, then `supabase/rollback/incoming_referral_retries.sql` revokes browser access to the incoming RPC while keeping records, request identities, RLS, indexes, metadata guards, direction checks and outgoing RPC access. This procedure is tested locally, not applied hosted, and is not backup/restore evidence.

No dependencies or Auth/subscription settings change. Actual authenticated desktop/mobile review remains unclaimed by the agent. The user reported testing completed and merged outgoing [PR #10](https://github.com/johnsafari-1/palani-medical-clinic/pull/10); the incoming UI is a separate increment.

Remaining work includes durable drafts; attributed referral correction/cancellation; practitioner/facility identifiers; external document provenance and attachments; patient assignment and least-privilege reads; coded referral reasons, FHIR ServiceRequest/Provenance mapping and validation; consent, print/export audit and controlled visit transitions. Reported urgency is source information, not automatically assigned clinical triage priority.

Technical reference: [Supabase database functions](https://supabase.com/docs/guides/database/functions). The earlier changelog-markdown retrieval was unsupported; no assertion about its contents is made.

The linked test project migration was applied as `20261012075352_incoming_referral_retries`; repository filename matches hosted history. All eight hosted scripts passed: incoming referrals, outgoing referrals, allergies, vitals, clinical records, order completion, staff access and billing. They rolled back synthetic rows/audits; sequence counters can advance. Follow-up checks found zero synthetic test patients and zero incoming-test staff/Auth users, enabled referral RLS and two invoker RPCs. Security Advisors reported only the previously deferred [leaked-password-protection warning](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection); no setting or subscription changed. The incoming frontend remains prepared for draft PR review.
