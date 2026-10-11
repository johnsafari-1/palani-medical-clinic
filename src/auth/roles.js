export const ROLE_PATHS = Object.freeze({
  Admin: "/app/admin", Receptionist: "/app/reception", Doctor: "/app/doctor",
  Nurse: "/app/nursing", "Lab Technician": "/app/lab",
  Pharmacist: "/app/pharmacy", Cashier: "/app/billing",
});

export function homeForRole(role) {
  return Object.hasOwn(ROLE_PATHS, role) ? ROLE_PATHS[role] : null;
}

export function destinationAfterLogin(role, from) {
  const home = homeForRole(role);
  // Only restore a destination belonging to this staff member's role.
  return from?.pathname === home ? home + (from.search || "") : home;
}
