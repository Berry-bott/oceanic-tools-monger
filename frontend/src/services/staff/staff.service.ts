import { apiRequest } from "@/lib/api";

export type StaffMember = {
  id: string;
  name: string;
  email: string;
  role: "OWNER" | "STAFF";
  staffAccessRole: "CASHIER" | "SENIOR_STAFF" | null;
  branchId: string | null;
  branch?: { name: string } | null;
  isActive: boolean;
  createdAt: string;
};

export type CreateStaffInput = {
  name: string;
  email: string;
  password?: string;
  branchId: string;
  staffAccessRole: "CASHIER" | "SENIOR_STAFF";
};

export const staffKeys = {
  all: ["staff"] as const,
  list: () => [...staffKeys.all, "list"] as const,
};

export async function getStaffMembers() {
  const response = await apiRequest<{ data: StaffMember[] }>("/users");
  return response.data;
}

export type CreatedStaffMember = StaffMember & {
  emailSent?: boolean;
};

export async function createStaffMember(input: CreateStaffInput) {
  const response = await apiRequest<{ data: CreatedStaffMember }>("/users", {
    method: "POST",
    body: JSON.stringify(input),
  });
  return response.data;
}

export async function updateStaffMember(
  id: string,
  input: { name?: string; isActive?: boolean; branchId?: string; staffAccessRole?: "CASHIER" | "SENIOR_STAFF" },
) {
  const response = await apiRequest<{ data: StaffMember }>(
    `/users/${encodeURIComponent(id)}`,
    { method: "PATCH", body: JSON.stringify(input) },
  );
  return response.data;
}

export function removeStaffMember(id: string) {
  return apiRequest<void>(`/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}
