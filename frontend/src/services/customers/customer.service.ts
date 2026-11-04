import { apiRequest } from "@/lib/api";

export const customerKeys = {
  all: ["customers"] as const,
  list: () => ["customers", "list"] as const,
  statement: (customerId: string) => ["customers", "statement", customerId] as const,
};

export function getCustomers<Customer>(search = "") {
  const query = new URLSearchParams();
  if (search.trim()) query.set("search", search.trim());
  const suffix = query.size ? `?${query.toString()}` : "";
  return apiRequest<{ data: Customer[] }>(`/customers${suffix}`);
}

export function getCustomerStatement<Statement>(customerId: string) {
  return apiRequest<{ data: Statement }>(`/customers/${encodeURIComponent(customerId)}/statement`);
}

export function saveCustomer<Customer>(id: string | undefined, input: Record<string, unknown>) {
  return apiRequest<{ data: Customer }>(id ? `/customers/${encodeURIComponent(id)}` : "/customers", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(input),
  });
}

export function recordCustomerPayment(customerId: string, input: Record<string, unknown>) {
  return apiRequest(`/customers/${encodeURIComponent(customerId)}/payments`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export function sendCustomerReminder(customerId: string, input: Record<string, unknown>) {
  return apiRequest(`/customers/${encodeURIComponent(customerId)}/reminders`, {
    method: "POST",
    body: JSON.stringify(input),
  });
}

export type CustomerReminder = {
  id: string;
  title: string;
  message: string;
  createdAt: string;
  deliveries: { id: string; channel: string; destination: string; status: string; attempts: number; lastError: string | null; createdAt: string }[];
};

export function getCustomerReminders(customerId: string) {
  return apiRequest<{ data: CustomerReminder[] }>(`/customers/${encodeURIComponent(customerId)}/reminders`);
}

export function retryNotificationDelivery(deliveryId: string) {
  return apiRequest(`/notifications/deliveries/${encodeURIComponent(deliveryId)}/retry`, { method: "POST" });
}
