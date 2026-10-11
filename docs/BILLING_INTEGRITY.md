# Billing integrity — 11 October 2026

This is a test-data prototype improvement, not DHA certification or HL7 FHIR conformance. It builds on the merged consultation and order-completion changes.

## Controls

| Control | Behavior |
| --- | --- |
| Atomic invoice creation | `create_clinic_invoice` saves the invoice, catalogue-backed line items, billed flags and their audits in one invoker-rights transaction. Any failed line or audit rolls back the entire save. |
| Authoritative prices | Active catalogue prices determine labels, unit prices, cent-rounded line amounts and the invoice total. Positive quantities are limited to 100000 and three decimal places. The UI sends the reviewed unit price; changed prices reject the draft for refresh/review. Price IDs and snapshots are retained on new lines. |
| Patient/source integrity | Encounter invoices require exactly one consultation or discharged stay belonging to the patient. Prescription/lab charges must belong to the invoice consultation and patient; OTC sales cannot claim clinical orders. Medication/lab catalogue categories must match the source type. |
| Duplicate protection | Transaction advisory locks serialize the request ID and consultation/stay invoice creation. Existing invoices block a second invoice for that consultation/stay. Clinical source rows are locked before their billed flag is checked and claimed. Matching invoice retries return the original saved record; changed payloads or callers reject. Historical duplicates are not deleted. |
| Trusted identity | Invoice creation and payment derive actor and time in database triggers, including legacy direct browser updates. Browser payment updates cannot change invoice patient, source, total or creation identity. |
| Payment | `record_invoice_payment` locks the invoice, requires supported payment methods and consistent, nonempty line totals, and records `paid_by`/`paid_at`. Same-actor/method retries return the saved payment without another audit. Conflicting or reversed browser payments reject. This records a cashier's payment declaration; it does not verify a bank/M-Pesa settlement. |
| Pharmacy scope | Pharmacists can create, read and pay only their own OTC invoices. Cashier/Admin permissions remain subject to active-staff RLS. Other staff retain their existing permitted reads; shared clinical reads still need narrowing. |
| Cashier UI | Both encounter/stay and OTC saves use the atomic RPC. Failed drafts remain editable after a known database rejection. Lost or malformed responses freeze the exact invoice/payment for retry, block cancellation/refresh and block switching workflows. Queue failures retain a read-only snapshot rather than claiming no records exist. |
| Receipts | Unavailable, empty or inconsistent line reads cannot produce a receipt. Printed dynamic text is escaped, the new window's opener is cleared, and a restrictive content policy is included. Popup failures are shown. Other printable screens are outside this change. |

The only definer-rights operation is a private, uncallable trigger that validates billing roles and ownership before claiming clinical billed flags. Cashiers do not receive general clinical UPDATE rights. Public completion RPCs retain invoker rights and an empty search path. Owners and service roles retain privileged maintenance authority; audit storage is not externally tamper evident.

## Compatibility and limits

No historical records or totals are backfilled, repaired or deleted. Legacy UI inserts still work for valid encounter/OTC invoices and catalogue-backed lines: missing price IDs are resolved from the active label, unit price and source category. Legacy browser writes receive actor, source and payment protections, but their separate invoice/item requests can still leave an unpaid partial invoice. The atomic guarantee applies to the new RPC; removing legacy direct writes needs a coordinated follow-up.

Payment is refused for an empty or inconsistent legacy invoice. Review and correct such records through an attributed correction process; a refund, void, credit-note or invoice adjustment UI is not implemented. One invoice per consultation/stay matches the current UI; charges ordered after invoicing need a future supplementary-charge workflow. Quantities and room-day quantities are entered by the billing user, not derived from a stock or ward tariff engine. Taxes, discounts, insurance claims and payment-provider verification are not implemented.

Retry state exists only in the mounted screen. Reload, logout or closing the page loses an unconfirmed invoice request ID. Retry in the same screen before leaving; durable recovery remains outstanding. Removing diagnosis/reason/contact fields from billing queries reduces the data requested by this screen, but does not establish column-level access isolation.

## Deployment and recovery

The billing migration was applied to the hosted test project on 11 October 2026 as version `20261011104648` (`atomic_billing`). The repository file `supabase/migrations/20261011104648_atomic_billing.sql` matches that hosted version and SQL; it was renamed from the earlier prepared filename to avoid replaying it as a pending migration. The earlier migration-tool request-state error was resolved on a later authorized attempt.

All 248 tests pass with the merged UI changes, along with the production build and diff checks. Hosted billing, clinical-record, order-completion and staff-access SQL checks pass using transaction-scoped synthetic fixtures that were rolled back. Security Advisors reports only the previously deferred leaked-password-protection warning. Authenticated browser and visual checks remain pending; the local browser download failed. The user authorized merging the commits with this limitation disclosed.

If recovery is needed, revert the Cashier frontend first, then use `supabase/rollback/atomic_billing.sql`. It revokes browser execution of the new RPCs, removes invoice/line guards and pharmacy-own-read policies, and restores the prior billing trigger. All invoices, lines, payments, audit history, added columns and the request-ID index remain. The rollback is tested locally; it is not a backup or a verified production restore point.

## Validation

The suite verifies active/inactive/anonymous roles, pharmacists' own OTC reads/payments, catalogue amounts and rounding, actor/time spoofing, request collisions and retries, duplicate consultation/stay invoices, mismatched patients/sources, immutable invoice/payment fields, rollback on late line/audit failure, legacy catalogue-backed writes and data-preserving rollback. UI checks cover both invoice types, lost/malformed responses, payment failures/retries, price refresh, failed queues, escaped receipts, failed receipt reads and blocked popups.

`supabase/tests/billing.sql` uses transaction-scoped synthetic fixtures to verify hosted behavior without retaining records. Prior consultation, staff-access and dispensing/lab SQL checks should also pass with this migration installed. Fixture rows and audits roll back; sequence numbers may advance. Competing-actor tests exercise conflict rules sequentially; simultaneous multi-connection load testing is not yet recorded.

Leaked-password protection remains deferred on the current test plan, as requested. See [Supabase password security](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection). Remaining DHA/FHIR and operational work is tracked in [clinical integrity](CLINICAL_INTEGRITY.md).
