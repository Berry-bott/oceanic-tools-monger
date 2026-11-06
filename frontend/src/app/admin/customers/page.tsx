"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import { useQueryClient } from "@tanstack/react-query";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { useBusiness } from "@/hooks/queries/use-business";
import { useCustomers } from "@/hooks/queries/use-customers";
import { useCustomerStatement } from "@/hooks/queries/use-customer-statement";
import { AdminEmptyState } from "@/components/admin-empty-state";
import { AdminUiIcon } from "@/components/admin-ui-icon";
import { AdminDialogPanel } from "@/components/admin-motion";
import { AdminPageSkeleton, AdminTableSkeleton } from "@/components/admin-loading-skeleton";
import {
  getCustomerStatement,
  customerKeys,
  recordCustomerPayment,
  saveCustomer as saveCustomerRequest,
  sendCustomerReminder,
  getCustomerReminders,
  retryNotificationDelivery,
  type CustomerReminder,
} from "@/services/customers/customer.service";

type User = { name: string; role: string };
type Business = { currency: string };
type Customer = {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  creditLimit: number | string;
  creditDays: number;
  emailRemindersAllowed: boolean;
  smsRemindersAllowed: boolean;
  totalPurchases: number;
  totalPayments: number;
  outstandingBalance: number;
  _count: { sales: number };
};
type Transaction = {
  type: "SALE" | "CREDIT_NOTE";
  saleId: string;
  reference: string;
  date: string;
  amount: number;
  paid: number;
  status: string;
};
type Statement = {
  customer: Pick<Customer, "id" | "name" | "phone" | "email">;
  transactions: Transaction[];
};
type CustomerDraft = {
  name: string;
  phone: string;
  email: string;
  address: string;
  creditLimit: string;
  creditDays: string;
  emailRemindersAllowed: boolean;
  smsRemindersAllowed: boolean;
};

const emptyDraft: CustomerDraft = {
  name: "",
  phone: "",
  email: "",
  address: "",
  creditLimit: "0",
  creditDays: "0",
  emailRemindersAllowed: false,
  smsRemindersAllowed: false,
};
const money = (value: number | string, currency: string) =>
  new Intl.NumberFormat("en-NG", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(Number(value));
const dateTime = (value: string) =>
  new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));

export default function CustomersPage() {
  const queryClient = useQueryClient();
  const userQuery = useCurrentUser();
  const user = userQuery.data?.user as User | undefined;
  const businessQuery = useBusiness<Business>();
  const currency = businessQuery.data?.data.currency || "NGN";
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const customersQuery = useCustomers<Customer>(search);
  const customers = customersQuery.data?.data ?? [];
  const [selectedId, setSelectedId] = useState("");
  const [statementId, setStatementId] = useState("");
  const statementQuery = useCustomerStatement<Statement>(statementId);
  const statement = statementQuery.data?.data;
  const [draft, setDraft] = useState<CustomerDraft>(emptyDraft);
  const [editing, setEditing] = useState(false);
  const [creating, setCreating] = useState(false);
  const loading = customersQuery.isLoading;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("CASH");
  const [paymentReference, setPaymentReference] = useState("");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [reminderCustomerId, setReminderCustomerId] = useState("");
  const [reminderHistory, setReminderHistory] = useState<CustomerReminder[]>([]);
  const pageError = error || (customersQuery.error instanceof Error
    ? customersQuery.error.message
    : customersQuery.isError
      ? "Customers could not be loaded."
      : "");

  const canManage = user?.role === "OWNER" || user?.role === "STAFF";
  const canPay = user?.role === "OWNER" || user?.role === "STAFF";
  const canRemind = user?.role === "OWNER" || user?.role === "STAFF";

  const loadCustomers = useCallback(async () => {
    setError("");
    await Promise.all([customersQuery.refetch(), invalidateAdminSummaries(queryClient)]);
  }, [customersQuery.refetch, queryClient]);

  const loadStatement = useCallback(async (customerId: string) => {
    setBusy("statement");
    setError("");
    setSelectedId(customerId);
    setStatementId(customerId);
    try {
      await queryClient.fetchQuery({
        queryKey: customerKeys.statement(customerId),
        queryFn: () => getCustomerStatement<Statement>(customerId),
      });
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Customer account history could not be loaded.",
      );
    } finally {
      setBusy("");
    }
  }, [queryClient]);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const totals = useMemo(
    () =>
      customers.reduce(
        (result, customer) => ({
          balance: result.balance + Number(customer.outstandingBalance),
          purchases: result.purchases + Number(customer.totalPurchases),
          debtors:
            result.debtors + (Number(customer.outstandingBalance) > 0 ? 1 : 0),
        }),
        { balance: 0, purchases: 0, debtors: 0 },
      ),
    [customers],
  );

  function startEdit(customer: Customer) {
    setSelectedId(customer.id);
    setDraft({
      name: customer.name,
      phone: customer.phone ?? "",
      email: customer.email ?? "",
      address: customer.address ?? "",
      creditLimit: String(customer.creditLimit),
      creditDays: String(customer.creditDays),
      emailRemindersAllowed: customer.emailRemindersAllowed,
      smsRemindersAllowed: customer.smsRemindersAllowed,
    });
    setEditing(true);
    setCreating(false);
  }

  function startCreate() {
    setDraft(emptyDraft);
    setSelectedId("");
    setEditing(false);
    setCreating(true);
  }

  function closeCustomerForm() {
    if (busy === "customer") return;
    setCreating(false);
    setEditing(false);
    setError("");
  }

  async function saveCustomer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy("customer");
    setError("");
    setNotice("");
    const payload = {
      ...draft,
      phone: draft.phone || undefined,
      email: draft.email || undefined,
      address: draft.address || undefined,
      creditLimit: Number(draft.creditLimit),
      creditDays: Number(draft.creditDays),
    };
    try {
      const result = await saveCustomerRequest<Customer>(
        creating ? undefined : selectedId,
        payload,
      );
      setNotice(creating ? "Customer created." : "Customer details saved.");
      setCreating(false);
      setEditing(false);
      await loadCustomers();
      if (!creating) await loadStatement(result.data.id);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Customer could not be saved.",
      );
    } finally {
      setBusy("");
    }
  }

  async function recordPayment(
    event: FormEvent<HTMLFormElement>,
    transaction: Transaction,
  ) {
    event.preventDefault();
    if (!statement || !paymentReference.trim() || !Number(paymentAmount))
      return;
    setBusy(transaction.saleId);
    setError("");
    setNotice("");
    try {
      await recordCustomerPayment(statement.customer.id, {
          method: paymentMethod,
          reference: paymentReference.trim(),
          allocations: [
            { saleId: transaction.saleId, amount: Number(paymentAmount) },
          ],
      });
      setNotice(`Payment added to ${transaction.reference}.`);
      setPaymentReference("");
      setPaymentAmount("");
      await Promise.all([
        loadCustomers(),
        loadStatement(statement.customer.id),
      ]);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Payment could not be recorded.",
      );
    } finally {
      setBusy("");
    }
  }

  async function queueReminder(customer: Customer) {
    const channels = [
      customer.emailRemindersAllowed && customer.email ? "EMAIL" : null,
      customer.smsRemindersAllowed && customer.phone ? "SMS" : null,
    ].filter(Boolean);
    if (!channels.length) {
      setError(
        "This customer has no enabled reminder channel with contact details.",
      );
      return;
    }
    setBusy(customer.id);
    setError("");
    setNotice("");
    try {
      await sendCustomerReminder(customer.id, { channels });
      await invalidateAdminSummaries(queryClient);
      setReminderCustomerId(customer.id);
      setNotice(`Reminder queued for ${customer.name}. Delivery runs through the backend worker.`);
      try { const history = await getCustomerReminders(customer.id); setReminderHistory(history.data); }
      catch { setReminderHistory([]); }
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : "Reminder could not be queued.",
      );
    } finally {
      setBusy("");
    }
  }

  async function showReminderHistory(customer: Customer) {
    setBusy("reminders"); setError(""); setReminderCustomerId(customer.id);
    try { const history = await getCustomerReminders(customer.id); setReminderHistory(history.data); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Reminder history could not be loaded."); }
    finally { setBusy(""); }
  }

  async function retryReminder(deliveryId: string) {
    setBusy(deliveryId); setError("");
    try { await retryNotificationDelivery(deliveryId); const history = await getCustomerReminders(reminderCustomerId); setReminderHistory(history.data); setNotice("Failed reminder queued for another delivery attempt."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Reminder could not be retried."); }
    finally { setBusy(""); }
  }

  if (!user)
    return <AdminPageSkeleton />;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <div className="mx-auto max-w-7xl space-y-6 px-4 py-7 sm:px-8">
        <section className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="mb-2 text-sm font-normal uppercase tracking-[.14em] text-brand">
              Customer accounts
            </p>
            <h1 className="text-2xl font-normal tracking-tight">Customers</h1>
            <p className="mt-1 text-sm text-muted">
              Contact details, balances, statements, and reminder consent.
            </p>
          </div>
          {canManage && !creating && !editing && (
            <button
              type="button"
              onClick={startCreate}
              className="inline-flex h-10 cursor-pointer items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-4 text-sm text-white transition-colors hover:bg-brand-dark"
            >
              <AdminUiIcon name="plus" size={16} />
              Add customer
            </button>
          )}
        </section>
        {pageError && !creating && !editing && (
          <div
            role="alert"
            className="flex items-center justify-between gap-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800"
          >
            <span>{pageError}</span>
            <button
              onClick={() => setError("")}
              className="font-normal underline"
            >
              Dismiss
            </button>
          </div>
        )}
        {notice && (
          <div
            role="status"
            className="flex items-center justify-between gap-4 rounded-md border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800"
          >
            <span>{notice}</span>
            <button
              onClick={() => setNotice("")}
              aria-label="Dismiss notification"
            >
              x
            </button>
          </div>
        )}
        <section className="grid gap-3 sm:grid-cols-3">
          <article className="rounded-lg border border-line bg-white p-4">
            <p className="text-xs text-muted">Customers listed</p>
            <strong className="mt-2 block text-2xl font-normal">
              {customers.length}
            </strong>
            <p className="mt-1 text-xs text-muted">
              The API returns up to 200 matching customers
            </p>
          </article>
          <article className="rounded-lg border border-line bg-white p-4">
            <p className="text-xs text-muted">Money still owed</p>
            <strong className="mt-2 block text-2xl font-normal">
              {money(totals.balance, currency)}
            </strong>
            <p className="mt-1 text-xs text-muted">Across listed customers</p>
          </article>
          <article className="rounded-lg border border-line bg-white p-4">
            <p className="text-xs text-muted">Customers with balances</p>
            <strong className="mt-2 block text-2xl font-normal">
              {totals.debtors}
            </strong>
            <p className="mt-1 text-xs text-muted">
              Listed customers with a positive receivable
            </p>
          </article>
        </section>

        {(creating || editing) && typeof document !== "undefined" && createPortal(
          <div
            className="fixed inset-0 z-[100] flex items-center justify-center overflow-y-auto bg-[#14201e]/60 p-4 backdrop-blur-sm sm:p-6"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) closeCustomerForm();
            }}
          >
          <AdminDialogPanel
            role="dialog"
            aria-modal="true"
            aria-labelledby="customer-form-title"
            onEscape={closeCustomerForm}
            className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-2xl border border-[#e4eae5] bg-white shadow-[0_24px_70px_rgba(12,25,25,.28)] sm:max-h-[calc(100dvh-3rem)]"
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-4 border-b border-[#edf1ed] bg-white/95 px-5 py-4 backdrop-blur sm:px-7">
              <div>
                <p className="mb-1 text-[11px] font-semibold uppercase tracking-[.14em] text-brand">
                  Customer accounts
                </p>
                <h2 id="customer-form-title" className="m-0 text-xl font-semibold tracking-tight text-[#1a2a22]">
                  {creating ? "Add customer" : "Edit customer"}
                </h2>
                <p className="mb-0 mt-1 text-sm text-muted">
                  Get the customer&apos;s permission before sending text or
                  email reminders.
                </p>
              </div>
              <button
                type="button"
                aria-label="Close customer form"
                disabled={busy === "customer"}
                onClick={closeCustomerForm}
                className="grid size-9 shrink-0 cursor-pointer place-items-center rounded-[10px] border border-line bg-white text-muted hover:bg-canvas disabled:cursor-wait disabled:opacity-50"
              >
                <AdminUiIcon name="close" size={15} />
              </button>
            </div>
            <form
              onSubmit={(event) => void saveCustomer(event)}
              className="grid gap-5 p-5 sm:grid-cols-2 sm:p-7"
            >
              <section className="grid gap-4 sm:col-span-2 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <h3 className="m-0 text-sm font-semibold text-[#35453b]">Contact details</h3>
                  <p className="mb-0 mt-1 text-xs text-muted">Add the customer&apos;s name and preferred contact information.</p>
                </div>
              <label className="grid gap-1 text-xs font-normal">
                Name
                <input
                  required
                  maxLength={180}
                  value={draft.name}
                  onChange={(event) =>
                    setDraft({ ...draft, name: event.target.value })
                  }
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
              </label>
              <label className="grid gap-1 text-xs font-normal">
                Phone
                <input
                  maxLength={40}
                  value={draft.phone}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      phone: event.target.value,
                      ...(event.target.value
                        ? {}
                        : { smsRemindersAllowed: false }),
                    })
                  }
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
              </label>
              <label className="grid gap-1 text-xs font-normal">
                Email
                <input
                  type="email"
                  value={draft.email}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      email: event.target.value,
                      ...(event.target.value
                        ? {}
                        : { emailRemindersAllowed: false }),
                    })
                  }
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
              </label>
              <label className="grid gap-1 text-xs font-normal">
                Address
                <input
                  maxLength={1000}
                  value={draft.address}
                  onChange={(event) =>
                    setDraft({ ...draft, address: event.target.value })
                  }
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
              </label>
              </section>
              <section className="grid gap-4 rounded-xl border border-[#e7ece8] bg-[#fbfcfb] p-4 sm:col-span-2 sm:grid-cols-2 sm:p-5">
                <div className="sm:col-span-2">
                  <h3 className="m-0 text-sm font-semibold text-[#35453b]">Credit and reminders</h3>
                  <p className="mb-0 mt-1 text-xs text-muted">Set account terms and only enable reminders when the customer has given consent.</p>
                </div>
              <label className="grid gap-1 text-xs font-normal">
                Max amount customer can owe
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.creditLimit}
                  onChange={(event) =>
                    setDraft({ ...draft, creditLimit: event.target.value })
                  }
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
              </label>
              <label className="grid gap-1 text-xs font-normal">
                Days to pay
                <input
                  type="number"
                  min="0"
                  max="365"
                  step="1"
                  value={draft.creditDays}
                  onChange={(event) =>
                    setDraft({ ...draft, creditDays: event.target.value })
                  }
                  className="h-10 rounded-md border border-line px-3 text-sm"
                />
              </label>
              <div className="flex flex-wrap gap-5 sm:col-span-2">
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.emailRemindersAllowed}
                    disabled={!draft.email}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        emailRemindersAllowed: event.target.checked,
                      })
                    }
                  />
                  Permission to send email reminders
                </label>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={draft.smsRemindersAllowed}
                    disabled={!draft.phone}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        smsRemindersAllowed: event.target.checked,
                      })
                    }
                  />
                  Permission to send text reminders
                </label>
              </div>
              </section>
              {error && <p role="alert" className="m-0 text-sm text-[#b44f44] sm:col-span-2">{error}</p>}
              <div className="sticky bottom-0 -mx-5 -mb-5 flex justify-end gap-2 border-t border-[#edf1ed] bg-white/95 px-5 py-4 backdrop-blur sm:col-span-2 sm:-mx-7 sm:-mb-7 sm:px-7">
                <button
                  type="button"
                  disabled={busy === "customer"}
                  onClick={closeCustomerForm}
                  className="rounded-md border border-line px-4 py-2 text-sm disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={busy === "customer"}
                  className="rounded-md bg-brand px-4 py-2 text-sm text-white disabled:opacity-60"
                >
                  {busy === "customer" ? "Saving..." : "Save customer"}
                </button>
              </div>
            </form>
          </AdminDialogPanel>
          </div>,
          document.body,
        )}

        <section className="overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex flex-col gap-3 border-b border-line p-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="font-normal">Customers</h2>
              <p className="mt-1 text-xs text-muted">
                Search by name, phone, or email.
              </p>
            </div>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search customers"
              aria-label="Search customers"
              className="h-10 rounded-md border border-line px-3 text-sm sm:w-72"
            />
          </div>
          {loading && !customers.length ? (
            <AdminTableSkeleton columns={6} rows={6} />
          ) : customers.length === 0 ? (
            <AdminEmptyState icon="person" title="No customers found" description="Adjust the search or create a customer record." />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-sm">
                <thead className="bg-canvas text-xs uppercase tracking-wide text-muted">
                  <tr>
                    {[
                      "Customer",
                      "Contact",
                      "Purchases",
                      "Payments",
                      "Balance",
                      "Reminder consent",
                      "Actions",
                    ].map((heading) => (
                      <th key={heading} className="px-4 py-3 font-normal">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {customers.map((customer) => (
                    <tr key={customer.id} className="align-top">
                      <td className="px-4 py-4">
                        <strong>{customer.name}</strong>
                        <p className="mt-1 text-xs text-muted">
                          {customer._count.sales} sales | credit{" "}
                          {money(customer.creditLimit, currency)} /{" "}
                          {customer.creditDays} days
                        </p>
                      </td>
                      <td className="px-4 py-4 text-xs text-muted">
                        {customer.email || "No email"}
                        <p className="mt-1">{customer.phone || "No phone"}</p>
                      </td>
                      <td className="px-4 py-4">
                        {money(customer.totalPurchases, currency)}
                      </td>
                      <td className="px-4 py-4">
                        {money(customer.totalPayments, currency)}
                      </td>
                      <td className="px-4 py-4 font-normal">
                        {money(customer.outstandingBalance, currency)}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-col gap-1 text-xs">
                          <span>
                            {customer.emailRemindersAllowed
                              ? "Email on"
                              : "Email off"}
                          </span>
                          <span>
                            {customer.smsRemindersAllowed
                              ? "SMS on"
                              : "SMS off"}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap gap-2">
                          <button
                            onClick={() => void loadStatement(customer.id)}
                            className="rounded border border-line px-2.5 py-1.5 text-xs font-normal hover:bg-canvas"
                          >
                            Account history
                          </button>
                          {canRemind && <button onClick={() => void showReminderHistory(customer)} className="rounded border border-line px-2.5 py-1.5 text-xs font-normal hover:bg-canvas">Reminder history</button>}
                          {canManage && (
                            <button
                              onClick={() => startEdit(customer)}
                              className="rounded border border-line px-2.5 py-1.5 text-xs font-normal hover:bg-canvas"
                            >
                              Edit
                            </button>
                          )}
                          {canRemind &&
                            Number(customer.outstandingBalance) > 0 && (
                              <button
                                disabled={busy === customer.id}
                                onClick={() => void queueReminder(customer)}
                                className="rounded border border-line px-2.5 py-1.5 text-xs font-normal hover:bg-canvas disabled:opacity-60"
                              >
                                Send a reminder
                              </button>
                            )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {reminderCustomerId && <section className="mt-4 overflow-hidden rounded-lg border border-line bg-white">
          <div className="flex items-center justify-between border-b border-line p-4"><div><h2 className="m-0 text-lg font-semibold">Reminder history</h2><p className="mb-0 mt-1 text-sm text-muted">{customers.find((customer) => customer.id === reminderCustomerId)?.name ?? "Customer"}</p></div><button onClick={() => setReminderCustomerId("")} className="rounded-md border border-line px-3 py-2 text-sm">Close</button></div>
          {busy === "reminders" ? <AdminTableSkeleton columns={3} rows={3} /> : !reminderHistory.length ? <p className="p-4 text-sm text-muted">No reminders have been queued for this customer.</p> : <div className="divide-y divide-line">{reminderHistory.map((reminder) => <article key={reminder.id} className="grid gap-2 p-4"><div className="flex flex-wrap justify-between gap-2"><strong>{reminder.title}</strong><time className="text-sm text-muted">{dateTime(reminder.createdAt)}</time></div><p className="m-0 text-sm text-muted">{reminder.message}</p><div className="grid gap-2 sm:grid-cols-2">{reminder.deliveries.map((delivery) => <div key={delivery.id} className="flex items-center justify-between gap-3 rounded-md bg-[#f8faf8] p-3 text-sm"><span><strong>{delivery.channel}</strong> · {delivery.destination}<br /><small className="text-muted">{delivery.status.toLowerCase()} · {delivery.attempts} attempts{delivery.lastError ? ` · ${delivery.lastError}` : ""}</small></span>{delivery.status === "FAILED" && ["OWNER", "STAFF"].includes(user?.role ?? "") && <button disabled={busy === delivery.id} onClick={() => void retryReminder(delivery.id)} className="rounded border border-line bg-white px-2 py-1 text-xs disabled:opacity-50">Retry</button>}</div>)}</div></article>)}</div>}
        </section>}

        {statement && (
          <section className="overflow-hidden rounded-lg border border-line bg-white">
            <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
              <div>
                <p className="text-sm font-normal uppercase tracking-[.12em] text-brand">
                  Customer account history
                </p>
                <h2 className="mt-1 text-lg font-normal">
                  {statement.customer.name}
                </h2>
                <p className="mt-1 text-xs text-muted">
                  {statement.customer.email || "No email"} |{" "}
                  {statement.customer.phone || "No phone"}
                </p>
              </div>
              <button
                onClick={() => setStatementId("")}
                className="rounded-md border border-line px-3 py-2 text-xs"
              >
                Close statement
              </button>
            </div>
            {busy === "statement" ? (
              <AdminTableSkeleton columns={4} rows={4} />
            ) : !statement.transactions.length ? (
              <p className="p-8 text-center text-sm text-muted">
                No sale transactions recorded.
              </p>
            ) : (
              <div className="divide-y divide-line">
                {statement.transactions.map((entry, index) => {
                  const due =
                    entry.type === "SALE"
                      ? Math.max(
                          0,
                          entry.amount -
                            entry.paid +
                            statement.transactions
                              .filter(
                                (credit) =>
                                  credit.type === "CREDIT_NOTE" &&
                                  credit.saleId === entry.saleId,
                              )
                              .reduce((sum, credit) => sum + credit.amount, 0),
                        )
                      : 0;
                  return (
                    <article
                      key={`${entry.reference}-${index}`}
                      className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_minmax(300px,.9fr)]"
                    >
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <strong>{entry.reference}</strong>
                          <span className="rounded bg-canvas px-2 py-1 text-sm capitalize text-muted">
                            {entry.type === "SALE"
                              ? entry.status.toLowerCase()
                              : "credit note"}
                          </span>
                        </div>
                        <p className="mt-1 text-xs text-muted">
                          {dateTime(entry.date)}
                        </p>
                        <p className="mt-2 text-sm">
                          {entry.type === "SALE"
                            ? `Sale ${money(entry.amount, currency)} | paid ${money(entry.paid, currency)} | due ${money(due, currency)}`
                            : `Credit ${money(Math.abs(entry.amount), currency)}`}
                        </p>
                      </div>
                      {canPay &&
                        entry.type === "SALE" &&
                        entry.status !== "CANCELLED" &&
                        due > 0 && (
                          <form
                            onSubmit={(event) =>
                              void recordPayment(event, entry)
                            }
                            className="grid gap-2 sm:grid-cols-2"
                          >
                            <label className="grid gap-1 text-sm font-normal text-muted">
                              Method
                              <select
                                value={paymentMethod}
                                onChange={(event) =>
                                  setPaymentMethod(event.target.value)
                                }
                                className="h-9 rounded border border-line bg-white px-2 text-sm text-foreground"
                              >
                                <option value="CASH">Cash</option>
                                <option value="BANK_TRANSFER">
                                  Bank transfer
                                </option>
                                <option value="CARD">Card</option>
                                <option value="OTHER">Other</option>
                              </select>
                            </label>
                            <label className="grid gap-1 text-sm font-normal text-muted">
                              Amount
                              <input
                                required
                                type="number"
                                min="0.01"
                                max={due}
                                step="0.01"
                                value={paymentAmount}
                                onChange={(event) =>
                                  setPaymentAmount(event.target.value)
                                }
                                placeholder={due.toFixed(2)}
                                className="h-9 rounded border border-line px-2 text-sm text-foreground"
                              />
                            </label>
                            <label className="grid gap-1 text-sm font-normal text-muted sm:col-span-2">
                              Reference
                              <input
                                required
                                maxLength={80}
                                value={paymentReference}
                                onChange={(event) =>
                                  setPaymentReference(event.target.value)
                                }
                                placeholder="Receipt or transfer reference"
                                className="h-9 rounded border border-line px-2 text-sm text-foreground"
                              />
                            </label>
                            <button
                              disabled={busy === entry.saleId}
                              className="rounded-md bg-brand px-3 py-2 text-xs font-normal text-white disabled:opacity-60 sm:col-span-2"
                            >
                              {busy === entry.saleId
                                ? "Recording..."
                                : `Save payment up to ${money(due, currency)}`}
                            </button>
                          </form>
                        )}
                    </article>
                  );
                })}
              </div>
            )}
            <p className="border-t border-line bg-canvas px-4 py-3 text-xs text-muted">
              This page shows up to 100 recent sales. The system checks the
              amount before saving a payment.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
