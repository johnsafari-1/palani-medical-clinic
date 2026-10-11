# Structured vitals and FHIR mapping — 11 October 2026

This change improves Nurse capture and prepares a pure FHIR R4 mapping. It is a test-data prototype step, not a DHA certification, Kenya Core conformance claim or exchange API.

## Capture and integrity

The Nurse form separates systolic and diastolic pressure, labels the fixed units for temperature/pulse/weight, and records the clinician-entered measurement time separately from the database entry time. Measurement time defaults to the current local minute and must be reviewed by the user. It is converted to an instant using the browser timezone. Both BP components are required when recording BP; other readings are optional, with at least one required.

The prepared invoker-rights `save_patient_vitals` RPC verifies an active Nurse/Admin, derives recorder and entry time, and saves the readings and audit event in one transaction. A request UUID and transaction advisory lock prevent duplicate saves on matching retries. A changed patient, reading, measured time or recorder cannot reuse that request ID. The browser sends no recorder or entry time.

Private browser-write guards also protect legacy inserts: valid combined BP text is split into numeric components and the recorder/time are overridden. Legacy inserts without an actual measured time retain a null measured time. Saved readings cannot be overwritten/deleted by browser roles even if a future RLS policy grants UPDATE/DELETE. Correction workflows still need to be implemented. Privileged database owners/service roles retain maintenance authority, and their writes remain audited.

Representation checks reject nonfinite numbers, partial/mismatched BP, missing readings, unit-suffixed text and unsupported precision. Pressure and pulse allow zero; weight must be positive; temperature can be signed. Pulse is a whole number; other readings accept up to three decimal places. Absolute values are capped at 1,000,000 as a storage/transport bound, **not a clinical normal range**. No clinical threshold, diagnosis or alert is inferred. Respiratory rate, oxygen saturation, height and other observations remain outside this increment.

Nurse reads distinguish unavailable history/patient lists/queues from empty results. History requests are keyed so late responses cannot replace the selected patient's readings. Concurrent saves and patient changes during an unconfirmed save are blocked. Known database rejections leave an editable draft; lost/malformed responses freeze the exact request for retry. Confirmed responses must match the patient, measurement time, request and readings before clearing the draft. Zero values remain visible with units in Nurse and Doctor history.

## Mapping

`src/fhir/vitals.js` converts newly submitted structured rows into separate base R4 `Observation` objects:

| Reading | LOINC | UCUM |
| --- | --- | --- |
| Blood-pressure panel | 85354-9 | Two components; no top-level value |
| Systolic component | 8480-6 | mm[Hg] |
| Diastolic component | 8462-4 | mm[Hg] |
| Temperature | 8310-5 | Cel |
| Pulse/heart rate | 8867-4 | /min |
| Weight | 29463-7 | kg |

Each object includes a stable logical ID, final status for the submitted reading, vital-signs category, numeric value/component, measured instant and caller-resolved Patient/Practitioner references. References must match the source patient and recorder IDs; the caller remains responsible for resolving actual resources. No encounter, national identifier, reference range, interpretation, missing result or Kenya Core profile claim is fabricated. Unstructured/historical rows without measured time and request identity are refused. Missing readings produce no invented Observation.

The mapper is tested as a pure module and is not wired into the browser bundle or exposed as a download/API. Official HL7 validator execution, terminology-server checks, Kenya Core Patient/Practitioner resource resolution, access/export audit, consent, CapabilityStatement and DHA/partner sandbox exchange remain outstanding.

References checked: [HL7 R4 vital signs](https://hl7.org/fhir/R4/observation-vitalsigns.html) and [Kenya Core Observation 1.0.0](https://fhir.dha.go.ke/ig/core/StructureDefinition-kenya-core-observation.html). Kenya Core requires its profile metadata and applicable resource references; this module deliberately makes no such claim before full validation.

## Deployment and validation

The prepared migration is `supabase/migrations/20261011114522_structured_vitals.sql`, created with the Supabase CLI. Applying it to the linked test project failed twice with `Invalid or expired requestState`. Read-only migration history and catalog checks confirmed the new RPC/columns are absent. No alternative write path was used. **Keep the frontend PR draft and unmerged until the database migration is applied and hosted checks pass.**

Local validation: 315 tests pass, production build and diff checks pass. Tests cover numeric capture, role restrictions, trusted identity, request collisions/retries, legacy compatibility, audit failure rollback, immutable browser records, non-destructive recovery, stale reads, editable/frozen drafts and LOINC/UCUM mapping. `supabase/tests/vitals.sql` passes against the inspected schema fixture, and its records/audits are rolled back. This is local fixture evidence, not hosted verification. Browser visual and signed-in end-to-end checks remain pending. The existing bundle-size warning remains.

Deployment order:

1. Resolve the Supabase connection/request-state failure, apply the reviewed migration and record its actual hosted version. Align the repository filename if the migration tool assigns a different version.
2. Run `supabase/tests/vitals.sql`, then the existing clinical-record, order-completion, staff-access and billing SQL checks against the hosted test project. Confirm no fixtures remain and check Security Advisors.
3. Preview the Nurse form at desktop/phone widths and verify test-account save, known rejection, lost-response retry and patient-history behavior. Review/merge the frontend after these checks.

Recovery: revert the Nurse frontend first, then `supabase/rollback/structured_vitals.sql` revokes the new RPC and removes the browser guard. All readings, captured audits, added columns and request-ID index remain. This rollback is locally tested; it is not a backup/restore guarantee.

Retry state is currently in memory: reload, sign out or leaving the screen loses an unconfirmed request ID. Shared clinical reads remain broad; no new read permissions are granted by this migration. Access/export audit, durable draft recovery, attributed corrections, clinical interpretation rules and broader structured clinical data are future work. Leaked-password protection remains deferred on the current test plan.
