import { API_BASE_URL } from "@/lib/api";

export interface CustomerProfile {
  id: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone?: string | null;
  address?: string | null;
  avatarUrl?: string | null;
  type?: string;
  createdAt?: string;
}

export interface CustomerOrderLine {
  id: string;
  productName: string;
  sku: string;
  quantity: number | string;
  unitPrice: number | string;
  lineTotal: number | string;
  product?: {
    id: string;
    name: string;
    sku: string;
    category: string;
    imageUrl?: string | null;
    productImages?: Array<{ mediaAsset?: { secureUrl?: string } }>;
  };
}

export interface CustomerOrder {
  id: string;
  number: string;
  status: string;
  fulfillmentMethod: string;
  deliveryAddress?: string | null;
  subtotal: number | string;
  discount: number | string;
  tax: number | string;
  deliveryFee: number | string;
  total: number | string;
  createdAt: string;
  updatedAt: string;
  lines: CustomerOrderLine[];
  branch?: { name: string; address?: string | null };
  payments: Array<{
    status: string;
    amount: number | string;
    paidAt?: string | null;
    reference: string;
    method?: string;
  }>;
}

export interface StatementEntry {
  saleId: string;
  number: string;
  date: string;
  dueAt?: string | null;
  total: number | string;
  paid: number;
  credits: number;
  balance: number;
  payments: Array<{ amount: number | string; method?: string; paidAt?: string | null; reference?: string }>;
  returns: Array<{ total: number | string; reference?: string; createdAt: string }>;
}

export interface CustomerStatement {
  entries: StatementEntry[];
  outstanding: number;
}

export interface CustomerReturnRequest {
  id: string;
  reference: string;
  reason: string;
  total: number | string;
  status: "REQUESTED" | "REJECTED" | "COMPLETED";
  resolutionNote?: string | null;
  createdAt: string;
  sale: { number: string };
  lines: Array<{ quantity: number | string; saleLine: { productName: string; sku: string } }>;
  refunds: Array<{ reference: string; amount: number | string; method: string; status: string; createdAt: string }>;
}

export const customerAccountService = {
  async getMe(): Promise<{ customer: CustomerProfile; email: string } | null> {
    try {
      const res = await fetch(`${API_BASE_URL}/customer-account/me`, {
        credentials: "include",
        cache: "no-store",
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data;
    } catch {
      return null;
    }
  },

  async login(payload: { email: string; password: string }): Promise<{ customer: CustomerProfile; email: string }> {
    const res = await fetch(`${API_BASE_URL}/customer-account/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Invalid email or password.");
    }
    return json.data;
  },

  async register(payload: { name: string; email: string; phone?: string; password: string }): Promise<{ email: string; verificationRequired: boolean }> {
    const res = await fetch(`${API_BASE_URL}/customer-account/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Could not register account. Please check your details.");
    }
    return json.data;
  },

  async loginWithGoogle(credential: string): Promise<{ customer: CustomerProfile; email: string }> {
    const res = await fetch(`${API_BASE_URL}/customer-account/google`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ credential }),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Google authentication failed. Please try again.");
    }
    return json.data;
  },

  async getOrders(): Promise<CustomerOrder[]> {
    const res = await fetch(`${API_BASE_URL}/customer-account/orders`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Could not load order history.");
    }
    return json.data || [];
  },

  async updateProfile(payload: { name?: string; phone?: string; address?: string; avatarUrl?: string | null }): Promise<CustomerProfile> {
    const res = await fetch(`${API_BASE_URL}/customer-account/profile`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(payload),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Could not update profile.");
    }
    return json.data;
  },

  async getStatement(): Promise<CustomerStatement> {
    const res = await fetch(`${API_BASE_URL}/customer-account/statement`, {
      credentials: "include",
      cache: "no-store",
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) {
      throw new Error(json?.error?.message || "Could not load account statement.");
    }
    return json.data || { entries: [], outstanding: 0 };
  },

  async getReturns(): Promise<CustomerReturnRequest[]> {
    const res = await fetch(`${API_BASE_URL}/customer-account/returns`, { credentials: "include", cache: "no-store" });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message || "Could not load return requests.");
    return json.data || [];
  },

  async requestReturn(orderNumber: string, input: { reason: string; lines: Array<{ sku: string; quantity: number }> }): Promise<CustomerReturnRequest> {
    const res = await fetch(`${API_BASE_URL}/customer-account/orders/${encodeURIComponent(orderNumber)}/return-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      cache: "no-store",
      body: JSON.stringify(input),
    });
    const json = await res.json().catch(() => null);
    if (!res.ok) throw new Error(json?.error?.message || "Could not submit your return request.");
    return json.data;
  },

  async logout(): Promise<void> {
    await fetch(`${API_BASE_URL}/customer-account/logout`, {
      method: "POST",
      credentials: "include",
    }).catch(() => null);
  },
};
