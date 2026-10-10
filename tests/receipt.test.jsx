import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
const mock = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("../src/supabaseClient", () => ({ supabase: { from: mock.from } }));
vi.mock("../src/components/Header", () => ({ default: () => null }));
import CashierDashboard from "../src/components/CashierDashboard";
const attack = '<script>alert("receipt")</script>';
let itemResult, popup;
beforeEach(() => {
  itemResult = { data: [{ label: attack, quantity: 1, unit_price: 100, amount: 100 }] };
  mock.from.mockImplementation((table) => {
    const result = () => table === "invoice_items" ? itemResult : { data: table === "invoices" ? [{ id: "i", code: attack, status: "Paid", total: 100, payment_method: attack, patients: { name: attack, code: attack } }] : [] };
    const builder = { select: () => builder, order: () => builder, eq: () => builder, then: (resolve, reject) => Promise.resolve(result()).then(resolve, reject) };
    return builder;
  });
  popup = { document: { write: vi.fn(), close: vi.fn() }, focus: vi.fn(), print: vi.fn(), close: vi.fn(), opener: window };
  vi.spyOn(window, "open").mockReturnValue(popup);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); });
it("escapes receipt fields and prints only after item loading succeeds", async () => {
  render(<CashierDashboard staff={{ id: "s" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Print receipt" }));
  await waitFor(() => expect(popup.print).toHaveBeenCalledOnce());
  const html = popup.document.write.mock.calls[0][0];
  expect(html).not.toContain(attack);
  expect(html).toContain("&lt;script&gt;");
  expect(popup.opener).toBeNull();
});
it("does not print a misleading empty receipt when invoice-item lookup fails", async () => {
  itemResult = { data: null, error: { message: "denied" } };
  render(<CashierDashboard staff={{ id: "s" }} />);
  fireEvent.click(await screen.findByRole("button", { name: "Print receipt" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(popup.close).toHaveBeenCalledOnce();
  expect(popup.print).not.toHaveBeenCalled();
});
