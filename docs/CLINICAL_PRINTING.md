# Clinical summaries and referral printing — 12 October 2026

This frontend increment hardens test-data documents. It does not add a FHIR endpoint, certified clinical document, clinician identity verification, or DHA certification evidence beyond the specific implementation and tests described here.

## Behavior

Patient summaries are available from Reception and the Doctor screen. Each section loads independently, has a read timestamp and refresh/retry control, and distinguishes loading, unavailable and successful empty reads. Patient-keyed mounting and per-section generations discard earlier responses; printing is disabled while any section is loading. Failed sections are cleared and marked unavailable. A partial summary can be printed only with a prominent incomplete-summary warning and an unavailable marker in each affected section.

Summaries include consultations and prescriptions, vitals, lab orders/results, ward admissions, invoices and the latest allergy review when accessible. Unknown, not assessed and explicitly no-known allergy states remain distinct. Corrections marked refuted or entered-in-error stay visible with their verification status. The captured reaction, severity, future-risk criticality, category, mechanism, notes, revision, reason, recorder ID and review time are included; this is the latest review, not the complete revision history.

Reception's existing allergy restriction remains. The browser does not issue an allergy read for a disallowed or unknown role, and displays unavailable rather than interpreting a RLS-filtered empty list as no assessment. Allowed readers first verify their current staff row, active state and role through existing RLS. A failed or changed authorization check prevents the allergy read. No database grants, policies, Auth settings or migrations change.

History reads use explicit projections, exact counts and pages of up to 200 ordered by date and ID. A section with more than 5,000 records, count changes, unexpected patient/record identities, duplicate IDs, missing counts, malformed responses or incomplete page results fails visibly; it is not silently presented as complete. Embedded prescription links are checked against their consultation. These are sequential accessible reads, not a transactionally consistent export: updates that preserve counts may occur between pages or sections, and nested relationship visibility still follows existing RLS.

Numeric zero remains visible. Vitals show fixed units, measured time separately from recorded time, and recorder ID; historical records without a measured time show “Not recorded” rather than an invented time. Dates/times are displayed in Africa/Nairobi with an explicit EAT label. Missing demographic/clinical fields show “Not recorded”.

## Referral workflow

A Doctor saves the referral first, receives confirmation, and chooses **Print saved referral**. Outgoing history rows also have a print action. Printing re-reads the saved referral, consultations, vitals and latest allergy review. Identity mismatch, denied/malformed reads or failed required reads prevent printing. The letter includes the captured referring staff ID, receiving doctor, recorded date, urgency, reason, additional notes, latest vitals and up to three recent consultations with prescription details. It labels this as a limited current snapshot, not the full chart. The staff member printing another author's referral is not substituted as its author.

Duplicate submit events are guarded while a referral save is in flight. Patient switching and other Doctor clinical writes are blocked during referral save or print preparation. Print retries perform reads and create a document; they do not insert another referral or complete a visit again. Failed popup creation, a closed window and failed context reads are recoverable print errors. An unmounted Doctor screen closes the pending popup and does not print a late response.

At the PR #9 baseline, referral creation and queue completion used separate legacy writes. The subsequent [atomic outgoing referral increment](ATOMIC_REFERRALS.md) replaces those writes in the Doctor UI with one retry-safe RPC; its evidence and remaining direct-client limitations are documented separately. Captured author IDs are not independently verified practitioner identities. Signed documents, archived document versions, consent, read/print/export audit events and external transfer controls remain separate work. A reprint uses the current fetched context rather than a historical snapshot of the original referral.

## Output and interface

Both templates HTML-escape all supplied text. The popup opener is cleared; each document includes a restrictive Content Security Policy blocking scripts, external resources, base changes and form actions. Line breaks and long words wrap. Both outputs prominently label TEST DATA and training-only use. No document is persisted or sent to another person or service.

The summary modal has a labelled dialog, focus containment, Escape/close controls, focus restoration and responsive card layout. Referral controls have accessible names. Actual browser printing/PDF layout and authenticated mobile/desktop review remain pending; automated DOM tests do not establish those visual results. The separate ReportsPanel printer remains outside this increment and still needs review.

## Validation and deployment

Local validation: **426 tests across 21 files passed** with `npm test -- --maxWorkers=2`; production build and diff checks passed. An initial unrestricted run spawned 21 workers and timed out in three UI tests, without assertion failures. The complete suite passed after limiting local worker concurrency; test timeouts and CI configuration were not changed. The production bundle was approximately 559 kB before gzip (155 kB gzip). Tests cover text injection, unknown/unavailable/corrected allergy states, zero readings, times and units, author/patient identity, pagination and count failures, stale/inactive staff checks, patient switches, section retries, popup failure, print-only retries, save locking, late-response suppression and modal keyboard behavior. No dependencies changed.

The hosted schema was checked for the structured-vitals and allergy fields used by the projections. Security Advisors reported only the previously deferred leaked-password-protection warning; its plan-dependent setting remains unchanged. No test patient rows were created for this frontend increment.

The user reported testing complete and merged [PR #9](https://github.com/johnsafari-1/palani-medical-clinic/pull/9) on 12 October 2026 as `e3205f9d6d25ca7b7ad15078bc66e5d794d80d75`. Merge CI passed and Vercel reported deployment completed. The agent did not independently verify the specific authenticated device or print-to-PDF scenarios. Recovery is a frontend revert; no database rollback is required. The existing build bundle-size warning remains.

References used for the read implementation: [Supabase JavaScript select](https://supabase.com/docs/reference/javascript/select) and [range pagination](https://supabase.com/docs/reference/javascript/range). The changelog markdown retrieval failed with an unsupported-content-type response; no claim about its contents is made.
