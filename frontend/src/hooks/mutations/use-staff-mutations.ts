"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createStaffMember,
  removeStaffMember,
  staffKeys,
  updateStaffMember,
  type CreateStaffInput,
} from "@/services/staff/staff.service";

function useRefreshStaffList() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: staffKeys.all });
}

export function useCreateStaffMember() {
  const refresh = useRefreshStaffList();
  return useMutation({
    mutationFn: (input: CreateStaffInput) => createStaffMember(input),
    onSuccess: refresh,
  });
}

export function useUpdateStaffMember() {
  const refresh = useRefreshStaffList();
  return useMutation({
    mutationFn: ({ id, changes }: { id: string; changes: { name?: string; isActive?: boolean; branchId?: string; staffAccessRole?: "CASHIER" | "SENIOR_STAFF" } }) =>
      updateStaffMember(id, changes),
    onSuccess: refresh,
  });
}

export function useRemoveStaffMember() {
  const refresh = useRefreshStaffList();
  return useMutation({
    mutationFn: (id: string) => removeStaffMember(id),
    onSuccess: refresh,
  });
}
