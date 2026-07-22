import { ShieldCheck, ClipboardList, Stethoscope, HeartPulse, FlaskConical, Pill, Banknote } from "lucide-react";

export const ROLES = [
  { key: "Admin", label: "Administrator", color: "#2B6777", icon: ShieldCheck },
  { key: "Receptionist", label: "Receptionist", color: "#7C5CBF", icon: ClipboardList },
  { key: "Doctor", label: "Doctor", color: "#2F7D4F", icon: Stethoscope },
  { key: "Nurse", label: "Nurse", color: "#C2467D", icon: HeartPulse },
  { key: "Lab Technician", label: "Laboratory Technician", color: "#C77D2E", icon: FlaskConical },
  { key: "Pharmacist", label: "Pharmacist", color: "#3D6FB4", icon: Pill },
  { key: "Cashier", label: "Cashier", color: "#A13D3D", icon: Banknote },
];

export const roleMeta = (key) => ROLES.find((r) => r.key === key) || ROLES[0];
