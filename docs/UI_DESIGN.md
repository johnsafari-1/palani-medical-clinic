# Clinic workspace UI

This branch refreshes the sign-in screen and shared layout for the seven existing staff roles. The UI was delivered in PR #6 and merged into main. Billing PR #5 adds its separately verified database controls.

## Changes

- Light teal surfaces, a dark clinic sidebar, consistent typography and clearer spacing.
- Staff sign-in with native department buttons, labelled inputs, password visibility and visible errors. Selecting a department focuses the form; the authenticated account still determines access.
- Shared staff header, account details, sign out and a collapsible navigation menu below 900px.
- Admin navigation opens the existing Staff accounts, Price list, Reports and Audit log sections.
- Skip link and workspace landmark, keyboard focus after section selection, Escape to close the menu, visible focus styles and reduced-motion support.
- Responsive single-column workspaces and forms, wrapping staff and prescription rows, and explicit test-workspace labels.

No database migrations, new clinical actions or permission changes are included. Existing clinical save/retry behavior and protected routes remain covered by the test suite. This UI work does not establish DHA or FHIR conformance.

## Validation

- 173 automated tests pass, including protected-route and clinical workflow regression tests, menu focus/Escape, section selection/sign out and password visibility without credential changes.
- Production build and `git diff --check` pass. The existing bundle-size warning remains.
- Browser visual validation is pending: this environment has no installed browser and the Playwright Chromium download returned invalid archives. Responsive CSS has been reviewed, but screenshot or real-browser checks have not been completed.

## Preview review before merge

Use synthetic staff and patient records only. Configure the existing Vite Supabase environment variables and run `npm ci`, then `npm run dev` from a Git checkout of this branch.

- At 1440px, 1024px, 768px and 390px widths, inspect sign-in, the Admin sections and each department workspace. Check long names, medications and errors for overflow.
- Tab through sign-in, toggle password visibility, and verify selecting a department focuses Username without granting access.
- At phone width, open navigation, press Escape and check focus returns to the toggle; select a section and check focus moves into the workspace.
- With test accounts, confirm account-based role routing, sign out, and that menu interaction preserves an in-progress Doctor consultation.
- Inspect forms, populated queues, loading/empty/error states and keyboard focus at browser zoom 200%.

The user authorized merging after automated validation. Browser visual review remains pending and should be completed on the deployed app using test accounts.
