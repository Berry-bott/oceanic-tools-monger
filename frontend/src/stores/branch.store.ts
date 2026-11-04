import { create } from "zustand";

type BranchState = {
  selectedBranchId: string;
  branchSelectionInitialized: boolean;
  setSelectedBranchId: (branchId: string) => void;
  initializeBranchSelection: (defaultBranchId: string) => void;
  clearSelectedBranch: () => void;
};

// Keep this in memory only. Branch choice is shared UI state, never auth data.
export const useBranchStore = create<BranchState>((set) => ({
  selectedBranchId: "",
  branchSelectionInitialized: false,
  setSelectedBranchId: (selectedBranchId) => set({ selectedBranchId, branchSelectionInitialized: true }),
  initializeBranchSelection: (defaultBranchId) =>
    set((state) => state.branchSelectionInitialized
      ? state
      : { selectedBranchId: defaultBranchId, branchSelectionInitialized: true }),
  clearSelectedBranch: () => set({ selectedBranchId: "", branchSelectionInitialized: false }),
}));
