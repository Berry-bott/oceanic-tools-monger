"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";
import {
  createJournalEntry,
  financeKeys,
  paySupplierInvoice,
  postJournalEntry,
  recordExpense,
} from "@/services/finance/finance.service";

export function useRecordExpense() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: recordExpense,
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: financeKeys.all }), invalidateAdminSummaries(queryClient)]),
  });
}

export function useCreateJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: createJournalEntry,
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: financeKeys.all }), invalidateAdminSummaries(queryClient)]),
  });
}

export function usePostJournalEntry() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: postJournalEntry,
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: financeKeys.all }), invalidateAdminSummaries(queryClient)]),
  });
}

export function usePaySupplierInvoice() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, input }: { id: string; input: Record<string, unknown> }) =>
      paySupplierInvoice(id, input),
    onSuccess: async () => Promise.all([queryClient.invalidateQueries({ queryKey: financeKeys.all }), invalidateAdminSummaries(queryClient)]),
  });
}
