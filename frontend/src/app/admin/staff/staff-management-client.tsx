"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { useMemo, useState, type FormEvent } from "react";
import { useCreateStaffMember, useRemoveStaffMember, useUpdateStaffMember } from "@/hooks/mutations/use-staff-mutations";
import { useStaffMembers } from "@/hooks/queries/use-staff-members";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import type { StaffMember } from "@/services/staff/staff.service";
import { useBranches } from "@/hooks/queries/use-branches";
import { AdminDialogPanel } from "@/components/admin-motion";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";

function LoadingMark() {
  return <span aria-hidden="true" className="size-4 animate-spin rounded-full border-2 border-current border-r-transparent" />;
}

export default function StaffManagementClient() {
  const currentUser = useCurrentUser();
  const isOwner = currentUser.data?.user.role === "OWNER";
  const staffQuery = useStaffMembers(isOwner);
  const branchQuery = useBranches<{ id: string; name: string }>(isOwner);
  const createStaff = useCreateStaffMember();
  const updateStaff = useUpdateStaffMember();
  const removeStaff = useRemoveStaffMember();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [branchId, setBranchId] = useState("");
  const [staffAccessRole, setStaffAccessRole] = useState<"CASHIER" | "SENIOR_STAFF">("SENIOR_STAFF");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editBranchId, setEditBranchId] = useState("");
  const [editStaffAccessRole, setEditStaffAccessRole] = useState<"CASHIER" | "SENIOR_STAFF">("SENIOR_STAFF");

  const staff = useMemo(() => staffQuery.data ?? [], [staffQuery.data]);
  const visibleStaff = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return staff.filter((member) =>
      !query || `${member.name} ${member.email}`.toLocaleLowerCase().includes(query),
    );
  }, [search, staff]);
  const activeCount = staff.filter((member) => member.role === "STAFF" && member.isActive).length;

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError("");
    setNotice("");
    try {
      await createStaff.mutateAsync({ name: name.trim(), email: email.trim(), password, branchId, staffAccessRole });
      setName("");
      setEmail("");
      setPassword("");
      setBranchId("");
      setStaffAccessRole("SENIOR_STAFF");
      setPasswordVisible(false);
      setCreateOpen(false);
      setNotice("Staff account created. Share the temporary password privately.");
    } catch (cause) {
      const error = cause as Error & { code?: string; requestId?: string };
      setFormError(error.code === "STAFF_ROLE_MIGRATION_REQUIRED"
        ? error.message
        : error.code === "DATABASE_TRANSACTION_RETRY"
        ? `${error.message}${error.requestId ? ` Reference: ${error.requestId}` : ""}`
        : error.code === "DATABASE_SCHEMA_OUTDATED"
        ? `The database needs its latest schema migration before staff can be created${error.requestId ? ` (reference: ${error.requestId})` : ""}.`
        : error.code === "INTERNAL_ERROR"
        ? `The server could not create this staff account${error.requestId ? ` (reference: ${error.requestId})` : ""}. Check the API terminal for the matching request ID to see the exact cause.`
        : error.message || "Could not create the staff account. Check the details and try again.");
    }
  }

  async function saveName(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    setFormError("");
    setNotice("");
    try {
      await updateStaff.mutateAsync({ id: editing.id, changes: { name: editName.trim(), branchId: editBranchId, staffAccessRole: editStaffAccessRole } });
      setNotice("Staff details saved.");
      setEditing(null);
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not save the staff details.");
    }
  }

  async function toggleAccess(member: StaffMember) {
    setFormError("");
    setNotice("");
    try {
      if (member.isActive) {
        const confirmed = window.confirm(`Remove ${member.name}'s access? Their records will stay in your business history.`);
        if (!confirmed) return;
        await removeStaff.mutateAsync(member.id);
        setNotice(`${member.name}'s access has been removed.`);
      } else {
        await updateStaff.mutateAsync({ id: member.id, changes: { isActive: true } });
        setNotice(`${member.name}'s access has been restored.`);
      }
    } catch (cause) {
      setFormError(cause instanceof Error ? cause.message : "Could not update this staff account.");
    }
  }

  if (currentUser.isPending) {
    return <AdminPageSkeleton />;
  }

  if (!isOwner) {
    return <main className="mx-auto grid min-h-[60vh] max-w-xl content-center gap-3 px-5 text-center"><h1 className="m-0 text-2xl font-bold">Only the owner can manage staff</h1><p className="m-0 text-sm text-muted">Ask the owner to update staff accounts or access.</p><Link href="/staff/dashboard" className="mx-auto rounded-lg bg-brand px-4 py-2 text-sm text-white">Back to your work</Link></main>;
  }

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-[#e5ece6] bg-gradient-to-r from-white to-[#f5f9f5] p-5 sm:p-6">
        <div>
          <p className="mb-1 text-[10px] font-semibold tracking-[.16em] text-[#718b79]">BUSINESS ADMINISTRATION</p>
          <h1 className="m-0 text-2xl font-bold tracking-tight text-[#1a2a22] sm:text-3xl">Manage staff</h1>
          <p className="mb-0 mt-2 text-sm text-[#75827a]">Create staff accounts, assign access, and manage sign-in status.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link href="/admin/settings" className="inline-flex h-10 items-center rounded-lg border border-[#dfe7e0] bg-white px-4 text-sm font-medium text-[#4e5e54] shadow-sm transition hover:bg-[#f8faf8]">Business settings</Link>
          <button type="button" onClick={() => { setFormError(""); setCreateOpen(true); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-brand bg-brand px-4 text-sm font-medium text-white shadow-sm transition hover:bg-brand-dark"><span aria-hidden="true" className="text-lg leading-none">+</span>Add staff</button>
        </div>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <article className="flex items-center justify-between rounded-xl border border-[#e5ece6] bg-white p-4 shadow-[0_2px_8px_#1c302408]">
          <div><span className="text-sm text-[#75827a]">Active staff</span><small className="mt-1 block text-xs text-[#9aa49d]">Accounts able to sign in</small></div>
          <strong className="grid size-12 place-items-center rounded-xl bg-[#edf5f0] text-xl font-semibold text-[#2a6a51]">{staffQuery.isLoading ? <span className="inline-block h-6 w-6 animate-pulse rounded bg-[#dce9df]" aria-label="Loading staff count" /> : activeCount}</strong>
        </article>
        <article className="rounded-xl border border-[#e5ece6] bg-white p-4 shadow-[0_2px_8px_#1c302408]">
          <span className="text-sm text-[#75827a]">Staff access</span>
          <strong className="mt-2 block text-sm font-medium leading-5 text-[#34463a]">Cashier and Senior staff roles have separate permissions.</strong>
        </article>
      </div>

      {(formError || staffQuery.isError) && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#f0d2cd] bg-[#fff5f2] p-3 text-sm text-[#a75043]">
          <span>{formError || (staffQuery.error instanceof Error ? staffQuery.error.message : "Staff list could not be loaded.")}</span>
          {staffQuery.isError && <button type="button" onClick={() => void staffQuery.refetch()} className="rounded border border-[#e6c4bd] bg-white px-3 py-1.5 text-sm">Try again</button>}
        </div>
      )}
      {branchQuery.isError && <div role="alert" className="mb-4 rounded-lg border border-[#f0d2cd] bg-[#fff5f2] p-3 text-sm text-[#a75043]">Branches could not be loaded: {branchQuery.error instanceof Error ? branchQuery.error.message : "Please try again."}</div>}
      {notice && <div role="status" className="mb-4 rounded-lg border border-[#dcebe0] bg-[#f1f8f3] p-3 text-sm text-[#4b7557]">{notice}</div>}

      <div>
        <section className="overflow-hidden rounded-2xl border border-[#e3ebe4] bg-white shadow-[0_4px_16px_#1c30240b]">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eaf0eb] bg-[#fbfcfb] p-4 sm:p-5">
            <div><p className="mb-1 text-[10px] font-semibold tracking-[.14em] text-[#718b79]">YOUR TEAM</p><h2 className="m-0 text-lg font-bold text-[#26372d]">Staff accounts <span className="ml-1 text-sm font-medium text-[#89948b]">{staffQuery.isLoading ? "" : visibleStaff.length}</span></h2><p className="mb-0 mt-1 text-sm text-[#89948b]">Inactive accounts remain in your records and can be reactivated.</p></div>
            <input aria-label="Search staff" className="h-10 w-full rounded-lg border border-[#dfe7e0] bg-white px-3 text-sm outline-none transition placeholder:text-[#a1aba4] focus:border-[#6e9e7d] focus:ring-2 focus:ring-[#eaf3ec] sm:w-64" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="divide-y divide-[#edf1ed]">
            {staffQuery.isLoading && Array.from({ length: 4 }, (_, index) => <div key={`loading-${index}`} className="flex items-center gap-3 px-5 py-4"><span className="size-10 animate-pulse rounded-xl bg-[#edf1ed]"/><span className="grid flex-1 gap-2"><span className="h-4 w-1/3 animate-pulse rounded bg-[#edf1ed]"/><span className="h-3 w-1/2 animate-pulse rounded bg-[#f2f4f2]"/></span><span className="h-8 w-28 animate-pulse rounded bg-[#f5f7f5]"/></div>)}
            {!staffQuery.isLoading && visibleStaff.map((member) => <div key={member.id} className="flex flex-wrap items-center gap-x-4 gap-y-3 px-5 py-4 transition-colors hover:bg-[#fbfdfb]">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#edf5f0] text-xs font-semibold text-[#2a6a51]">{member.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()}</span>
              <div className="min-w-[150px] flex-1"><strong className="block truncate text-sm font-semibold text-[#35453b]">{member.name}</strong><span className="mt-1 block truncate text-xs text-[#89948b]">{member.email}</span></div>
              <span className="min-w-[120px] flex-1 text-xs text-[#718078]">{member.branch?.name ?? "No branch assigned"}</span>
              <span className={`inline-flex shrink-0 rounded-full px-2.5 py-1 text-xs font-medium ${member.role === "OWNER" ? "bg-[#edf4f9] text-[#517d9c]" : member.staffAccessRole === "CASHIER" ? "bg-[#f4f3eb] text-[#827443]" : "bg-[#edf6ef] text-[#4d805a]"}`}>{member.role === "OWNER" ? "Admin" : member.staffAccessRole === "CASHIER" ? "Cashier" : "Senior staff"}</span>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${member.isActive ? "bg-[#edf6ef] text-[#4d805a]" : "bg-[#f0f2f0] text-[#7e8982]"}`}><span className={`size-1.5 rounded-full ${member.isActive ? "bg-[#4d805a]" : "bg-[#929b94]"}`} />{member.isActive ? "Active" : "Inactive"}</span>
              {member.role === "STAFF" ? <div className="ml-auto flex shrink-0 gap-2">
                <button type="button" onClick={() => { setEditing(member); setEditName(member.name); setEditBranchId(member.branchId ?? ""); setEditStaffAccessRole(member.staffAccessRole ?? "SENIOR_STAFF"); }} className="h-9 rounded-lg border border-[#dfe7e0] bg-white px-3 text-xs font-medium text-[#4e5e54] transition hover:bg-[#f5f8f5]">Edit</button>
                <button type="button" disabled={updateStaff.isPending || removeStaff.isPending} onClick={() => void toggleAccess(member)} className={`h-9 rounded-lg border bg-white px-3 text-xs font-medium transition disabled:opacity-50 ${member.isActive ? "border-[#f0d8d3] text-[#a75043] hover:bg-[#fff5f2]" : "border-[#dcebe0] text-[#4b7557] hover:bg-[#f1f8f3]"}`}>{updateStaff.isPending || removeStaff.isPending ? "Saving..." : member.isActive ? "Remove" : "Reactivate"}</button>
              </div> : <span className="ml-auto text-xs text-[#89948b]">Owner account</span>}
            </div>)}
            {!staffQuery.isLoading && !visibleStaff.length && <div className="grid min-h-44 place-content-center justify-items-center px-5 text-center"><strong className="text-sm font-semibold text-[#34463a]">{search ? "No staff found" : "No staff accounts yet"}</strong><p className="mb-0 mt-1 text-sm text-[#89948b]">{search ? "Try a different name or email." : "Add your first team member with the form."}</p></div>}
          </div>
        </section>
      </div>

      {createOpen && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#14201e66] p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget && !createStaff.isPending) setCreateOpen(false); }}>
        <AdminDialogPanel role="dialog" aria-modal="true" aria-labelledby="create-staff-title" onEscape={() => { if (!createStaff.isPending) setCreateOpen(false); }} className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto rounded-2xl border border-[#e5ebe6] bg-white p-5 shadow-[0_24px_70px_rgba(12,25,25,.24)] sm:p-6">
          <div className="mb-5 flex items-start justify-between gap-4">
            <div><h2 id="create-staff-title" className="m-0 text-xl font-bold text-[#26372d]">Add staff member</h2><p className="mb-0 mt-1 text-sm text-muted">Create a sign-in account and assign a branch and role.</p></div>
            <button type="button" aria-label="Close dialog" disabled={createStaff.isPending} onClick={() => setCreateOpen(false)} className="grid size-9 shrink-0 place-items-center rounded-lg border border-line text-muted hover:bg-canvas disabled:opacity-50">×</button>
          </div>
          {formError && <p role="alert" className="mb-4 rounded-lg border border-[#f0d2cd] bg-[#fff5f2] p-3 text-sm text-[#a75043]">{formError}</p>}
          {branchQuery.isLoading ? <p className="text-sm text-muted">Loading branches…</p> : branchQuery.isError ? (
            <p role="alert" className="rounded-lg border border-[#f0d2cd] bg-[#fff5f2] p-3 text-sm text-[#a75043]">Branches could not be loaded: {branchQuery.error instanceof Error ? branchQuery.error.message : "Please try again."}</p>
          ) : (branchQuery.data?.data ?? []).length === 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Create a branch in <Link className="font-semibold underline" href="/admin/settings">Business settings</Link> before adding staff.</div>
          ) : <form className="grid gap-4" onSubmit={(event) => void handleCreate(event)}>
            <label className="grid gap-1.5 text-sm text-[#536159]">Full name<input autoFocus className="h-11 rounded-lg border border-line px-3 text-sm" value={name} onChange={(event) => setName(event.target.value)} required maxLength={180} placeholder="Staff member’s name" /></label>
            <label className="grid gap-1.5 text-sm text-[#536159]">Email address<input type="email" autoComplete="email" className="h-11 rounded-lg border border-line px-3 text-sm" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} placeholder="name@example.com" /></label>
            <label className="grid gap-1.5 text-sm text-[#536159]">Temporary password<div className="flex gap-2"><input type={passwordVisible ? "text" : "password"} autoComplete="new-password" className="h-11 min-w-0 flex-1 rounded-lg border border-line px-3 text-sm" value={password} onChange={(event) => setPassword(event.target.value)} required minLength={6} maxLength={6} placeholder="Exactly 6 characters" /><button type="button" onClick={() => setPasswordVisible((visible) => !visible)} className="rounded-lg border border-line px-3 text-sm text-muted">{passwordVisible ? "Hide" : "Show"}</button></div><span className="text-xs text-muted">The staff member must replace this temporary password after signing in.</span></label>
            <label className="grid gap-1.5 text-sm text-[#536159]">Staff role<select className="h-11 rounded-lg border border-line bg-white px-3 text-sm" value={staffAccessRole} onChange={(event) => setStaffAccessRole(event.target.value as "CASHIER" | "SENIOR_STAFF")}><option value="CASHIER">Cashier</option><option value="SENIOR_STAFF">Senior staff</option></select></label>
            <label className="grid gap-1.5 text-sm text-[#536159]">Assigned branch<select className="h-11 rounded-lg border border-line bg-white px-3 text-sm" value={branchId} onChange={(event) => setBranchId(event.target.value)} required><option value="">Choose a branch</option>{(branchQuery.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <div className="flex justify-end gap-2 border-t border-line pt-4"><button type="button" disabled={createStaff.isPending} onClick={() => setCreateOpen(false)} className="rounded-lg border border-line px-4 py-2 text-sm disabled:opacity-50">Cancel</button><button type="submit" disabled={createStaff.isPending || branchQuery.isError} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-60">{createStaff.isPending ? <><LoadingMark /> Creating…</> : "Create staff account"}</button></div>
          </form>}
        </AdminDialogPanel>
      </div>, document.body)}

      {editing && createPortal(<div className="fixed inset-0 z-[100] grid place-items-center overflow-y-auto bg-[#14201e66] p-4 backdrop-blur-sm" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
        <AdminDialogPanel role="dialog" aria-modal="true" aria-labelledby="edit-staff-title" onEscape={() => setEditing(null)} className="my-auto max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-[14px] border border-line bg-white p-4 shadow-xl">
          <h2 id="edit-staff-title" className="m-0 text-xl font-bold text-[#26372d]">Edit staff details</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Update the name and assigned branch for {editing.email}.</p>
          <form className="grid gap-4" onSubmit={(event) => void saveName(event)}>
            <label className="grid gap-1.5 text-sm text-[#536159]">Full name<input autoFocus className="h-11 rounded-lg border border-line px-3 text-sm" value={editName} onChange={(event) => setEditName(event.target.value)} required maxLength={180} /></label>
            <label className="grid gap-1.5 text-sm text-[#536159]">Staff role<select className="h-11 rounded-lg border border-line bg-white px-3 text-sm" value={editStaffAccessRole} onChange={(event) => setEditStaffAccessRole(event.target.value as "CASHIER" | "SENIOR_STAFF")}><option value="CASHIER">Cashier</option><option value="SENIOR_STAFF">Senior staff</option></select></label><label className="grid gap-1.5 text-sm text-[#536159]">Assigned branch<select className="h-11 rounded-lg border border-line bg-white px-3 text-sm" value={editBranchId} onChange={(event) => setEditBranchId(event.target.value)} required>{(branchQuery.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={updateStaff.isPending} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-60">{updateStaff.isPending ? <><LoadingMark /> Saving...</> : "Save changes"}</button></div>
          </form>
        </AdminDialogPanel>
      </div>, document.body)}
    </main>
  );
}
