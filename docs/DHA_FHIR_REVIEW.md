# Palani Medical Clinic: DHA / HL7 FHIR source review

Review date: 10 October 2026. Baseline: `f0f2764b86867c16907317a91f8f02025154c3bf` on `main`.

## Conclusion and scope

The current repository implements clinic workflows with React, Vite and Supabase. It does not contain a FHIR exchange layer, CapabilityStatement, profile validation pipeline, or DHA certification evidence. A functioning deployed frontend is not proof of conformance. The public Vercel entrypoint returned HTTP 200 over HTTPS during this review. Authenticated production workflows, Supabase configuration, real patient records, deployed Edge Functions, and backup restores were not accessed or verified.

This is a source-based engineering review and an implementation backlog. It is not certification, legal advice, or a complete assessment of the live infrastructure. No live database changes or production deployment were performed by this increment.

## Standards baseline

Use the DHA-hosted **Kenya Core 1.0.0, `ke.fhir.core#1.0.0`, based on FHIR 4.0.1 (R4)** as the current exchange baseline reviewed here. The guide identifies national profiles, identifier patterns and terminology. Pin the downloadable package, retain its checksum and validator version, and confirm the target receiving service's accepted version before integrating. A hosted guide can change; preserve the exact package used as evidence.

FHIR is an HL7 standard. HL7 v2 messaging should be a separate work item only when a named laboratory, device, or partner requires it. Adding v2 support without such a requirement would not establish FHIR or DHA conformance.

FHIR conformance applies to specific supported exchange capabilities and profiles. Resource validation and a truthful CapabilityStatement are necessary evidence for a proposed RESTful FHIR interface. FHIR itself does not implement an application's authentication, authorization, or privacy policy. Those controls require independent engineering and operational evidence.

Primary references reviewed:

- [DHA certification programme](https://certification.dha.go.ke/) and [system categories](https://certification.dha.go.ke/systems). Obtain the current EMR/HMIS assessment checklist through the programme; its complete criteria were not available in the retrieved page text.
- [DHA Kenya Core implementation guide](https://fhir.dha.go.ke/ig/core/), version displayed as 1.0.0, FHIR 4.0.1, generated 2 October 2026.
- [HL7 R4 conformance](https://hl7.org/fhir/R4/conformance-rules.html), [validation](https://hl7.org/fhir/R4/validation.html), and [security](https://hl7.org/fhir/R4/security.html).
- [Supabase RLS guidance](https://supabase.com/docs/guides/database/postgres/row-level-security).

The priorities below are engineering recommendations grounded in observed code, not a claim that each row reproduces a specific legal or DHA certification clause.

## Verified findings and first changes

| Finding at baseline | Source evidence | First increment |
|---|---|---|
| A previous staff dashboard could remain while another profile request ran; late responses could set staff after sign-out | `src/App.jsx` | Session subtree keyed by user and token, cleanup/request guards, verified identity/role, fail-closed profile errors, focus and 60-second access rechecks |
| Inactive or missing staff could use existing authenticated SELECT policies | Baseline schema policies use `using (true)`; role helper did not check activation | Staging migration adds an activation-aware role helper and restrictive active-staff policy on 13 known tables where present |
| Staff deletion removed app identity and could conflict with clinical foreign-key history | Admin direct `staff.delete()` and baseline delete policy | Remove delete UI and revoke authenticated staff DELETE; retain deactivate/reactivate controls |
| Print HTML interpolated user/database strings | Patient summary and cashier receipt template strings | Escape dynamic text, add script/remote-content-blocking print CSP, detach opener, handle blocked popup and failed receipt-item lookup |
| Patient-record failures appeared as empty clinical history | PatientRecord discarded every query error and defaulted missing data to `[]` | Explicit unavailable state, retry, print disabled until all reads succeed, patient-keyed subtree and stale-response cleanup |
| Build/test dependencies had published advisories | npm dependency audit | Update Vite/React plugin/Vitest and affected transitive packages; declare Node compatibility and verify locked dependencies |
| Setup documentation described the obsolete browser-storage prototype | README compared with `src/main.jsx` and Supabase client | Document current stack, schema/function drift, tests and remaining gaps |

**Database limitations:** The migration does not narrow active staff by clinical purpose or assignment; it deliberately retains the existing role policies. It only affects the listed tables, not unknown tables, owner-executed views, service-role access, SECURITY DEFINER RPCs, storage buckets, or cached records on other clients. Audit-log immutability and trigger coverage are not established by this migration. Browser access rechecks do not replace database authorization.

## Open gap register

| Priority | Area | Observed gap / evidence | Required next change and acceptance evidence |
|---|---|---|---|
| P0 | Database reproducibility | Baseline SQL omits tables/columns used by current dashboards | Export a schema-only snapshot and deployed migrations/functions; reconstruct staging from versioned migrations and run each role's workflow |
| P0 | Least privilege | Broad SELECT policies; receptionist opens full patient chart, cashier queries consultations including diagnosis/prescriptions | Agree a field/operation access matrix with the clinic; use restricted endpoints/views or column grants; test direct API attempts for every role, including forbidden reads |
| P0 | Atomic clinical saves | Doctor inserts consultation, prescriptions and tests in separate requests and ignores later errors | Server transaction/RPC saves encounter plus orders atomically; validate actor, patient linkage and expected state; inject failures and verify no partial save or false success |
| P0 | Atomic billing | Cashier inserts invoice before items; failed line insert leaves invoice; OTC ignores item-insert errors | Server transaction validates prices, quantities and totals; idempotency and uniqueness for billing references; prove rollback and duplicate-request handling |
| P0 | Dispense/lab integrity | Client supplies actor/time and updates entire rows; errors not consistently surfaced | Restricted transition RPCs with server actor/time, immutable prescribing/order fields, expected status and concurrency tests; retain lab drafts after failure |
| P0 | Auditing | Viewer exists, but audit table, triggers and retention controls are absent from baseline SQL | Obtain actual definitions; verify create/read/change/export/print and privileged access coverage, actor attribution, append-only integrity, retention and recovery; avoid unrestricted clinical payloads in logs |
| P0 | Staff administration | UI invokes `quick-handler` actions, committed function only creates; activation enforcement unknown live | Inspect deployed function; active-admin check on each operation, validated roles/passwords, origin handling, self/last-admin safeguards, recovery, error/rollback tests |
| P1 | Patient identity | Registration has name/DOB/gender/contact and local code; no national identifier-system mappings | Define demographic/identifier fields and lifecycle against pinned Kenya Core Patient profile; distinguish unknown/absent values; no fabricated national identifiers; duplicate resolution with audit trail |
| P1 | Clinical safety | No structured allergy module visible; diagnosis, drugs, doses and test names largely free text | Implement coded conditions, allergy review states, medication identity and structured dosage, units, route/frequency/duration, lab codes and result status according to clinical and profile requirements |
| P1 | Encounter model | Visits and consultations are separate; consultation save does not include visit_id | Durable encounter linkage and participants, facility, timestamps, status transitions and corrections; verify all orders/results link to the correct encounter and patient |
| P1 | FHIR exchange | No FHIR resource mapper, REST metadata endpoint or validator tests in active app | Implement authenticated server exchange with resource references, truthful supported operations, OperationOutcome failures, version/concurrency behaviour, profile and terminology validation using synthetic examples |
| P1 | Consent and disclosure | No consent/access-purpose workflow in source | Agree lawful processing/disclosure rules with the responsible clinic roles; represent consent where appropriate, enforce disclosure decisions and test restricted/withdrawn cases |
| P1 | Failure handling | Doctor/nurse histories, queues and reports also suppress some read/write failures | Extend explicit unavailable/retry states and stale-patient guards across all clinical screens; no misleading empty history or unconfirmed success |
| P1 | Hosting and recovery | Vercel frontend accessible; backend region, processors, policies, restores and operational controls unknown | Review deployment/data flows and relevant Kenyan obligations with accountable owners; evidence for access controls, encrypted transport/storage, backups/restores, incident handling, retention and vendor arrangements |
| P2 | National/domain integrations | No DHA registry/HIE or SHA exchange implementation established | Confirm facility/provider identifiers, sandbox access and accepted IGs; validate domain payloads, retries, duplicate handling, reconciliation and audit evidence |
| P2 | Operational review | No clinical sign-off or certification evidence in repository | Workflow acceptance by clinician/lab/pharmacy/billing owners, agreed scope, current DHA checklist, submission evidence and external assessment |

## Proposed FHIR mapping (design backlog, not implemented)

| Existing data / workflow | Candidate R4 resource | Important missing design decisions |
|---|---|---|
| Patient registration | Patient | Identifier systems, structured demographic elements, applicable profile constraints |
| Staff clinician / clinic | Practitioner, PractitionerRole, Organization, Location | Professional/facility identifiers and role-to-provider mapping; staff login is not itself a practitioner |
| Visit / consultation | Encounter, Condition | Encounter linkage, status/participants, coded diagnosis and clinical verification state |
| Nursing vitals | Observation | Measurement codes, typed quantities/UCUM units, effective time, performer, BP components |
| Prescription / dispensing | MedicationRequest, MedicationDispense | Coded medication, structured dosage and quantity, prescribing/dispensing identities and relationship |
| Lab order / result | ServiceRequest, Observation, DiagnosticReport | Coded tests, result data types, units/ranges, final/corrected statuses and encounter links |
| Clinical referral | ServiceRequest, possibly Task | Agreed referral IG, destination identifiers, workflow state and immutable history |
| Billing / coverage | ChargeItem, Invoice; Coverage/Claim if in integration scope | Verified domain IG, payer identifiers, service coding and separation of clinical versus financial access |
| Access / authorship | AuditEvent, Provenance; Consent where applicable | Event completeness, authenticated attribution, policy enforcement, retention and integrity |

These mappings are proposed engineering choices based on the workflows. They do not assert that the current local rows already satisfy the resources or national profiles. Do not mark unvalidated exports with `meta.profile` merely to claim conformance.

## Validation performed

- `npm test`: 22 passing tests across staff-session isolation, denied/invalid access, stale requests, patient-history failure/retry, safe print HTML, receipt read failures and database migration behaviour.
- PostgreSQL tests execute the baseline schema and migration in PGlite with synthetic users/records, all seven active roles, inactive staff, missing staff and anonymous access. The fixture models Supabase `auth.uid()` and API roles; it omits loading the pgcrypto extension because PostgreSQL supplies `gen_random_uuid()` directly.
- Database checks verify retained active-role reads, denied inactive/missing-staff reads/writes, anonymous grant revocation, authenticated TRUNCATE denial, staff DELETE denial, immediate deactivation effects and repeat application.
- `npm run build`: passed. `git diff --check`: passed.
- `npm audit`: zero reported vulnerabilities after build/test and transitive dependency updates. This is an advisory check, not proof that every dependency is defect-free.
- Toolchain: Vite 7.3.7, React plugin 5.2.0, Vitest 4.1.11; Node 22.12+ or Node 24 recommended. CI uses Node 22 and runs tests/build.
- Hosted Supabase/PostgREST integration, deployed Edge Function execution, real browser auth and formal FHIR validation remain separate verification steps. No FHIR resources were implemented or submitted by this increment.

## Staging and release checklist

1. Confirm whether the deployed app holds real patient data. Obtain a schema-only export, actual RLS policies, grants, RPC/view definitions, audit triggers, deployed `quick-handler` source and function configuration. Do not send service keys, passwords or patient exports into chat.
2. Preserve the current source/deployment and a tested database recovery point. Reconcile local changes at `C:\palani-app` before fetching the review branch.
3. Reproduce the live structure in staging with synthetic data. The older baseline SQL is not sufficient. Inspect nullable/legacy `staff.active` values and the ownership of `current_staff_role()`; the helper must be owned by a trusted database administrator whose execution can read staff without recursive RLS.
4. Apply `202610100001_active_staff_access.sql` to staging. Confirm its transaction commits. Verify RLS/grants on each known table and investigate any unprotected tables, views, RPCs and storage separately. Tables missing from the environment are skipped; later-created tables need their own policies.
5. Exercise all seven roles, direct API denial cases, deactivation with an already-issued token, reactivation, reset and first/last-admin recovery. Verify the deployed staff function checks active administration. Updating the reference file alone does not deploy the function.
6. Run tests/build and manually verify account switching, logout, patient changes, failed histories and printed output in a real browser. Review the draft PR and deployment previews.
7. Apply approved database/function changes before deploying the frontend to production, then smoke-test workflows. Source deployment alone does not apply SQL migrations. Do not restore broad anonymous/inactive access as an informal rollback; use a reviewed recovery procedure.
8. Continue with atomic clinical/billing operations and role access, then implement profile-backed FHIR exchange and assemble the current DHA assessment evidence.

Certification and partner onboarding remain external processes; completing the code backlog does not itself issue certification.
