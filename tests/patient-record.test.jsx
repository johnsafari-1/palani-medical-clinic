import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../src/supabaseClient", () => ({ supabase: { from: mock.from } }));
import PatientRecord from "../src/components/PatientRecord";
let resolveQuery;
const patient = { id: "a", name: "Alice", code: "PT-1", gender: "Female", dob: "2000-01-01", phone: "0700000000" };
beforeEach(() => {
  resolveQuery = () => Promise.resolve({ data: [], error: null });
  mock.from.mockImplementation((table) => ({ select: () => ({ eq: (_column, id) => ({ order: () => resolveQuery(table, id) }) }) }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("shows query failure as unavailable, blocks printing, and supports retry", async () => {
  resolveQuery = (table) => Promise.resolve(table === "labs" || table === "lab_orders" ? { data: null, error: { message: "denied" } } : { data: [] });
  render(<PatientRecord patient={patient} onClose={() => {}} />);
  await screen.findByText(/Patient history could not be fully loaded/);
  expect(screen.queryByText("No lab tests ordered.")).toBeNull();
  expect(screen.getByRole("button", { name: "Print summary" }).disabled).toBe(true);
  resolveQuery = () => Promise.resolve({ data: [] });
  fireEvent.click(screen.getByRole("button", { name: "Retry patient history" }));
  await screen.findByText("No lab tests ordered.");
  expect(screen.getByRole("button", { name: "Print summary" }).disabled).toBe(false);
});
it("discards late patient history after switching patients", async () => {
  const old = []; resolveQuery = (_table, id) => id === "a" ? new Promise((resolve) => old.push(resolve)) : Promise.resolve({ data: [] });
  const view = render(<PatientRecord patient={patient} />);
  view.rerender(<PatientRecord patient={{ ...patient, id: "b", name: "Bob" }} />);
  await screen.findByText("No consultations yet.");
  await act(async () => old.forEach((resolve) => resolve({ data: [{ id: "old", diagnosis: "Alice private diagnosis" }] })));
  expect(screen.queryByText("Alice private diagnosis")).toBeNull();
});
it("escapes database text in the actual patient-summary HTML", async () => {
  const attack = '<img src="https://evil.test" onerror="alert(1)">';
  resolveQuery = (table) => Promise.resolve({ data: table === "consultations" ? [{ id: "c", diagnosis: attack, notes: attack, prescriptions: [{ id: "p", drug: attack, dosage: attack }] }] : [] });
  const popup = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn(), opener: window };
  vi.spyOn(window, "open").mockReturnValue(popup);
  render(<PatientRecord patient={{ ...patient, name: attack }} />);
  await waitFor(() => expect(screen.getByRole("button", { name: "Print summary" }).disabled).toBe(false));
  fireEvent.click(screen.getByRole("button", { name: "Print summary" }));
  const html = popup.document.write.mock.calls[0][0];
  expect(html).not.toContain(attack);
  expect(html).toContain("&lt;img");
  expect(html).toContain('http-equiv="Content-Security-Policy"');
  expect(popup.opener).toBeNull();
  expect(popup.print).toHaveBeenCalledOnce();
});
it("handles blocked print popups without throwing", async () => {
  vi.spyOn(window, "open").mockReturnValue(null);
  render(<PatientRecord patient={patient} />);
  await screen.findByText("No consultations yet.");
  fireEvent.click(screen.getByRole("button", { name: "Print summary" }));
  expect(screen.getByRole("alert").textContent).toContain("Allow pop-ups");
});
