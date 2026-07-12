# Palani Medical Clinic — staff management prototype

A role-based staff management system built for Palani Medical Clinic. Staff sign in with their own login and see a dashboard built for their job — front desk, doctor, nurse, lab, pharmacy, or billing.

This is an early working prototype, not a production system. See **Status** below before using it with real patient data.

## What it does

One login screen, seven different experiences depending on who's signed in:

| Role | What they can do |
|---|---|
| **Administrator** | Create and remove staff accounts, assign roles |
| **Receptionist** | Register new patients and search existing ones |
| **Doctor** | Look up a patient, record a diagnosis, write prescriptions, order lab tests |
| **Nurse** | Log vitals (blood pressure, temperature, pulse, weight) for a patient and view their history |
| **Laboratory Technician** | See pending test orders from doctors, enter results, mark complete |
| **Pharmacist** | See prescriptions waiting to be filled, mark them dispensed |
| **Cashier** | Bill a visit (consultation fee + prescribed drugs), generate an invoice, mark it paid |

The roles connect to each other the way they would in a real clinic: a doctor's prescription shows up directly in the pharmacist's queue, a doctor's lab order shows up in the lab technician's queue, and a completed visit shows up in the cashier's billing queue — nothing is re-typed between departments.

## Status

**Prototype stage.** This proves out the workflow and the user experience. Before it touches real patient data, it needs:

- A real backend and database (currently data is stored through a browser-based storage API, not a proper server)
- Password hashing and secure authentication (passwords are currently stored in plain text)
- HTTPS and proper access controls
- Audit logging (who viewed or changed what, and when)
- Compliance review for local health data regulations

## Running it

This is a single React component (`palani-medical-clinic-login.jsx`). It's built to run inside Claude's artifact environment, where it has access to a storage API for saving data. To turn this into a standalone app that runs anywhere, it needs to be wired into a normal React project with a real backend — that's the next phase of work.

**First-time login:** username `admin`, password `admin123`. Use the Admin account to create real staff logins for each department.

## Roadmap

- [ ] Configurable price list for billing (instead of the cashier typing prices by hand)
- [ ] Appointment booking (Receptionist)
- [ ] Bed/ward management (Nurse)
- [ ] Inventory tracking (Pharmacist)
- [ ] Move from browser storage to a real backend + database
- [ ] Proper authentication and security hardening

## Project structure

```
palani-medical-clinic-login.jsx   # Full prototype: login, all 7 role dashboards
```

As the project grows past a single file, it will move to a standard structure with separate components, a backend API, and a database schema.
