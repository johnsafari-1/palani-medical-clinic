# Structured allergy reviews — 11 October 2026

This test-data increment records allergy assessment and attributed corrections. It is not a DHA certification, a Kenya Core conformant resource or a medication interaction engine.

## Capture and workflow

There are three deliberate assessment choices: unknown, no known allergies reported, and recorded allergies/intolerances. A patient without a review displays **Not assessed — allergy status unknown**. No migration backfills patients as allergy-free. “No known” is an explicitly recorded report, not a guarantee that reactions cannot occur.

Doctors/Admins record a review with a reason. Structured entries contain a stable record UUID, substance description, optional reaction and note, reaction severity, future-risk criticality, optional category/mechanism, clinical status and verification status. New entries are unconfirmed, their reaction/category/mechanism are unspecified, and future risk defaults to unable-to-assess. Reaction severity is separate from future risk. Classification fields use the base R4 value sets; substances and manifestations remain text pending terminology resolution.

Nurse and Pharmacy screens read this information without edit controls. New allergy data is readable only by active Doctors, Nurses, Pharmacists and Admins in database RLS; other staff roles and inactive/unassigned accounts see no rows. Anonymous roles have no grants. These roles still have broad patient scope; clinician/patient assignment is not implemented.

Doctor clinical actions require a successful allergy read. Pharmacy dispensing controls remain disabled until the related patient's allergy review is available; a missing patient link or failed/malformed read blocks the control. An empty successful read shows “Not assessed”, not “No known”. These are browser workflow safeguards, not server-enforced checks that a clinician acknowledged an allergy or that a drug was matched against a substance. Existing consultation/prescription APIs and trusted database clients retain their prior authority.

The panel shows captured assessment, reaction and verification details, attributed recent history and refresh controls. Forms have labelled controls and a responsive grid. It loads the latest 20 revisions; complete history remains stored. Failed refreshes show an unavailable current status while prior, timestamped revisions remain in the history disclosure. Patient-keyed mounting and request generations discard responses for earlier patients.

## Integrity and corrections

`public.patient_allergy_reviews` stores immutable assessment snapshots. Each new revision references the latest prior review for the same patient. The invoker-rights `save_patient_allergy_review` RPC and a private browser-write guard derive recorder, time, revision and retry fingerprint. Client actor/time/revision/fingerprint claims are ignored. An advisory lock serializes each request and each patient's revision chain, backed by unique request and patient/revision constraints.

The expected prior ID must still be current; stale or cross-patient parents fail. Matching retries return the original review, including a historical retry after another review was saved. Changed payloads, patients, parents or recorders cannot reuse a request ID. The hash identifies matching payloads; it is not encryption.

Saved allergy IDs cannot silently disappear from a later snapshot. Corrections keep IDs and require a reason. Incorrect records can be marked refuted or entered-in-error; entered-in-error has no clinical status. Unknown/no-known assessments cannot coexist with substantive allergy entries. Prior snapshots preserve the original substance, reaction, classification and author even when later corrected. Browser UPDATE, DELETE and TRUNCATE are unavailable; the trigger still blocks row mutations if later grants/policies are added. Privileged database owners/service roles retain maintenance authority.

Allergy revisions use the protected private clinical audit trigger. Review and audit insert share a transaction; audit failure rolls back the review. Client drafts clear only when response identity, recorder, parent, revision and fields match. Unknown transport outcomes freeze the exact request and lock Doctor patient switching until retry. Definite database rejections retain an editable draft. Conflicts require refresh, comparison and an explicit decision to use the refreshed revision with the retained draft or discard it. Existing IDs introduced by another writer still cannot be omitted.

Retry state and drafts are in memory: navigating away, logout or reload loses an unconfirmed request identity. Durable draft recovery remains pending. Latest allergy state is a fetched snapshot, not a real-time guarantee; refresh and clinical review remain necessary. No automatic prescribing block, substitute recommendation or clinical risk inference is implemented.

## Deployment and evidence

The migration was created with the Supabase CLI and applied to test project `dzvaqppqwrgalmvvejab` as `20261011133508_structured_allergies`. The repository filename matches the hosted version. No existing patient rows were changed.

Local verification: 395 tests, production build and diff checks pass. Forty-eight PostgreSQL allergy tests cover states, validation, role-restricted reads/writes, trusted metadata, stale/cross-patient revisions, retained corrections, request collisions/retries, protected writes, audit failure rollback and data-preserving recovery. Submission/UI tests cover malformed confirmations, lost responses, conflict reconciliation, stale patient reads and Doctor/Pharmacy guards.

Hosted verification: allergy, vitals, clinical-record, order-completion, staff-access and billing SQL scripts all passed. Each used a synthetic transaction and rolled back its clinical rows and audits. Follow-up checks found zero synthetic patients, staff or Auth users, no retained test allergy reviews, enabled RLS and an invoker RPC. Sequence counters can advance during tests. Security Advisors reported only the previously deferred leaked-password warning; no Auth or subscription settings changed.

The frontend is prepared on `feature/structured-allergies` for a draft PR. Authenticated desktop/mobile browser review remains pending; no successful end-to-end Nurse/Doctor/Pharmacy session is claimed for this increment. The existing bundle-size warning remains (approximately 553 kB before gzip).

Recovery: revert the allergy frontend first, then `supabase/rollback/structured_allergies.sql` revokes browser RPC execution and table inserts. It retains revisions, request identities, RLS reads and captured audits. This procedure passed locally; it was not applied to the hosted database and is not a backup/restore guarantee.

## Standards and remaining work

References checked: [HL7 R4 AllergyIntolerance](https://hl7.org/fhir/R4/allergyintolerance.html), [Kenya Core AllergyIntolerance 1.0.0](https://fhir.dha.go.ke/ig/core/StructureDefinition-kenya-core-allergyintolerance.html), and [Supabase database functions](https://supabase.com/docs/guides/database/functions).

Kenya Core requires applicable coded substances, profile metadata and resource references as well as required classifications. Text capture here does not satisfy those terminology/profile requirements. No AllergyIntolerance export, allergy-status FHIR List, Provenance, CapabilityStatement or authenticated FHIR endpoint is created in this increment. A complete mapping and official validator run must precede any conformance claim or partner exchange.

Further work includes terminology selection/validation; provenance and asserted-source information; durable draft reconciliation; access/export auditing; complete review-history pagination; real-time/review freshness policy; medication decision support; corrections for other clinical record types; and allergy-aware patient-summary/referral printing. Existing legacy summary/referral output omits this allergy panel and must not be treated as a complete allergy review.
