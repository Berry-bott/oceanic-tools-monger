"use client";

import Link from "next/link";
import { useMemo, useState, type FormEvent } from "react";
import { useCreateStaffMember, useRemoveStaffMember, useUpdateStaffMember } from "@/hooks/mutations/use-staff-mutations";
import { useStaffMembers } from "@/hooks/queries/use-staff-members";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import type { StaffMember } from "@/services/staff/staff.service";
import { useBranches } from "@/hooks/queries/use-branches";

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
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState("");
  const [editing, setEditing] = useState<StaffMember | null>(null);
  const [editName, setEditName] = useState("");
  const [editBranchId, setEditBranchId] = useState("");

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
      await createStaff.mutateAsync({ name: name.trim(), email: email.trim(), password, branchId });
      setName("");
      setEmail("");
      setPassword("");
      setBranchId("");
      setPasswordVisible(false);
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
      await updateStaff.mutateAsync({ id: editing.id, changes: { name: editName.trim(), branchId: editBranchId } });
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
    return <main className="grid min-h-[60vh] place-items-center text-sm text-muted"><span className="flex items-center gap-2"><LoadingMark /> Loading staff access...</span></main>;
  }

  if (!isOwner) {
    return <main className="mx-auto grid min-h-[60vh] max-w-xl content-center gap-3 px-5 text-center"><h1 className="m-0 text-2xl font-bold">Only the owner can manage staff</h1><p className="m-0 text-sm text-muted">Ask the owner to update staff accounts or access.</p><Link href="/staff/dashboard" className="mx-auto rounded-lg bg-brand px-4 py-2 text-sm text-white">Back to your work</Link></main>;
  }

  return (
    <main className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-2 text-sm tracking-widest text-[#718b79]">BUSINESS ADMINISTRATION</p>
          <h1 className="m-0 text-3xl font-bold tracking-tight text-[#1a2a22]">Manage staff</h1>
          <p className="mb-0 mt-2 text-sm text-muted">Create staff accounts, update names, and control who can sign in.</p>
        </div>
        <Link href="/admin/settings" className="rounded-lg border border-line bg-white px-4 py-2 text-sm text-[#4e5e54] hover:bg-[#f8faf8]">Business settings</Link>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <article className="rounded-xl border border-line bg-white p-4 shadow-sm">
          <span className="text-sm text-muted">Active staff</span>
          <strong className="mt-2 block text-2xl font-normal text-[#26372d]">{staffQuery.isLoading ? "Loading..." : activeCount}</strong>
        </article>
        <article className="rounded-xl border border-line bg-white p-4 shadow-sm">
          <span className="text-sm text-muted">Staff access</span>
          <strong className="mt-2 block text-base font-normal text-[#26372d]">Stock, sales, orders and money</strong>
        </article>
      </div>

      {(formError || staffQuery.isError) && (
        <div role="alert" className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[#f0d2cd] bg-[#fff5f2] p-3 text-sm text-[#a75043]">
          <span>{formError || (staffQuery.error instanceof Error ? staffQuery.error.message : "Staff list could not be loaded.")}</span>
          {staffQuery.isError && <button type="button" onClick={() => void staffQuery.refetch()} className="rounded border border-[#e6c4bd] bg-white px-3 py-1.5 text-sm">Try again</button>}
        </div>
      )}
      {notice && <div role="status" className="mb-4 rounded-lg border border-[#dcebe0] bg-[#f1f8f3] p-3 text-sm text-[#4b7557]">{notice}</div>}

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(300px,0.8fr)_minmax(0,1.6fr)]">
        <section className="rounded-xl border border-line bg-white p-5 shadow-sm">
          <div className="mb-4">
            <h2 className="m-0 text-lg font-bold text-[#26372d]">Add staff member</h2>
            <p className="mb-0 mt-1 text-sm text-muted">Every staff account works from one assigned branch.</p>
          </div>
          <form className="grid gap-4" onSubmit={(event) => void handleCreate(event)}>
            <label className="grid gap-1.5 text-sm text-[#536159]">Full name
              <input className="h-11 rounded-lg border border-[#dfe6e0] px-3 text-sm text-[#34413a] outline-none focus:border-[#6e9e7d] focus:ring-4 focus:ring-[#eaf3ec]" name="name" value={name} onChange={(event) => setName(event.target.value)} required maxLength={180} autoComplete="name" />
            </label>
            <label className="grid gap-1.5 text-sm text-[#536159]">Email address
              <input className="h-11 rounded-lg border border-[#dfe6e0] px-3 text-sm text-[#34413a] outline-none focus:border-[#6e9e7d] focus:ring-4 focus:ring-[#eaf3ec]" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} required maxLength={254} autoComplete="email" />
            </label>
            <label className="grid gap-1.5 text-sm text-[#536159]">Assigned branch
              <select className="h-11 rounded-lg border border-[#dfe6e0] bg-white px-3 text-sm text-[#34413a]" value={branchId} onChange={(event) => setBranchId(event.target.value)} required disabled={branchQuery.isLoading || !branchQuery.data?.data.length}>
                <option value="">{branchQuery.isLoading ? "Loading branches..." : "Choose a branch"}</option>
                {(branchQuery.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
              </select>
              {!branchQuery.isLoading && !branchQuery.data?.data.length && <small className="text-xs text-[#a75043]">Create a branch before adding staff.</small>}
            </label>
            <label className="grid gap-1.5 text-sm text-[#536159]">Temporary password
              <span className="relative block">
                <input className="h-11 w-full rounded-lg border border-[#dfe6e0] px-3 !pr-12 text-sm text-[#34413a] outline-none focus:border-[#6e9e7d] focus:ring-4 focus:ring-[#eaf3ec]" name="password" type={passwordVisible ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} required minLength={12} maxLength={200} autoComplete="new-password" />
                <button type="button" aria-label={passwordVisible ? "Hide password" : "Show password"} aria-pressed={passwordVisible} onClick={() => setPasswordVisible((visible) => !visible)} className="absolute inset-y-1 right-1 grid w-9 place-items-center rounded-md text-[#75827c] hover:bg-[#f1f6f2] hover:text-[#28644c] focus-visible:outline focus-visible:outline-2 focus-visible:outline-[#6e9e7d]">
                  {passwordVisible ? <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="m3 3 18 18" /><path d="M10.6 10.6a2 2 0 0 0 2.8 2.8" /><path d="M9.9 5.2A10.7 10.7 0 0 1 12 5c5 0 8.3 4.1 9 7-.2 1-.9 2.2-2 3.3M6.2 6.2C4.4 7.4 3.3 9.3 3 12c.7 2.9 4 7 9 7 1 0 2-.2 2.9-.5" /></svg> : <svg aria-hidden="true" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12s3.3-7 9-7 9 7 9 7-3.3 7-9 7-9-7-9-7Z" /><circle cx="12" cy="12" r="2.5" /></svg>}
                </button>
              </span>
              <small className="text-xs text-muted">Use at least 12 characters. Share it privately.</small>
            </label>
            <button type="submit" disabled={createStaff.isPending} className="inline-flex h-11 items-center justify-center gap-2 rounded-lg bg-brand px-4 text-sm text-white hover:bg-brand-dark disabled:cursor-wait disabled:opacity-60">
              {createStaff.isPending ? <><LoadingMark /> Creating account...</> : "Create staff account"}
            </button>
          </form>
        </section>

        <section className="overflow-hidden rounded-xl border border-line bg-white shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4 sm:p-5">
            <div><h2 className="m-0 text-lg font-bold text-[#26372d]">Staff accounts</h2><p className="mb-0 mt-1 text-sm text-muted">Removed accounts stay in your records and can be reactivated.</p></div>
            <input aria-label="Search staff" className="h-10 w-full rounded-lg border border-line px-3 text-sm sm:w-64" placeholder="Search name or email" value={search} onChange={(event) => setSearch(event.target.value)} />
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[650px] border-collapse text-left">
              <thead className="bg-[#fafbfa] text-xs tracking-wide text-[#8c9990]"><tr><th className="px-4 py-3 font-normal">TEAM MEMBER</th><th className="px-4 py-3 font-normal">ROLE</th><th className="px-4 py-3 font-normal">STATUS</th><th className="px-4 py-3 font-normal">ACTIONS</th></tr></thead>
              <tbody className="divide-y divide-line text-sm text-[#5c6b61]">
                {staffQuery.isLoading && Array.from({ length: 4 }, (_, index) => <tr key={`loading-${index}`}><td className="px-4 py-5" colSpan={4}><span className="block h-4 animate-pulse rounded bg-[#edf1ed]" /></td></tr>)}
                {!staffQuery.isLoading && visibleStaff.map((member) => <tr key={member.id}>
                  <td className="px-4 py-4"><strong className="block font-normal text-[#35453b]">{member.name}</strong><span className="mt-1 block text-xs text-muted">{member.email}</span><span className="mt-1 block text-xs text-[#4f8060]">{member.branch?.name ?? "No branch assigned"}</span></td>
                  <td className="px-4 py-4"><span className={`rounded px-2 py-1 text-xs ${member.role === "OWNER" ? "bg-[#edf4f9] text-[#517d9c]" : "bg-[#edf6ef] text-[#4d805a]"}`}>{member.role === "OWNER" ? "Owner" : "Staff"}</span></td>
                  <td className="px-4 py-4"><span className={`rounded px-2 py-1 text-xs ${member.isActive ? "bg-[#edf6ef] text-[#4d805a]" : "bg-[#f0f2f0] text-[#7e8982]"}`}>{member.isActive ? "Active" : "Inactive"}</span></td>
                  <td className="px-4 py-4">{member.role === "STAFF" ? <div className="flex gap-2"><button type="button" onClick={() => { setEditing(member); setEditName(member.name); setEditBranchId(member.branchId ?? ""); }} className="rounded-lg border border-line bg-white px-3 py-2 text-xs hover:bg-[#f8faf8]">Edit</button><button type="button" disabled={updateStaff.isPending || removeStaff.isPending} onClick={() => void toggleAccess(member)} className="rounded-lg border border-line bg-white px-3 py-2 text-xs hover:bg-[#f8faf8] disabled:opacity-50">{updateStaff.isPending || removeStaff.isPending ? "Saving..." : member.isActive ? "Remove" : "Reactivate"}</button></div> : <span className="text-xs text-muted">Owner account</span>}</td>
                </tr>)}
                {!staffQuery.isLoading && !visibleStaff.length && <tr><td colSpan={4} className="px-4 py-12 text-center text-sm text-muted">{search ? "No staff match your search." : "No staff accounts yet. Add the first one using the form."}</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      {editing && <div className="fixed inset-0 z-50 grid place-items-center bg-[#14201e66] p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditing(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="edit-staff-title" className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl">
          <h2 id="edit-staff-title" className="m-0 text-xl font-bold text-[#26372d]">Edit staff details</h2>
          <p className="mb-4 mt-1 text-sm text-muted">Update the name and assigned branch for {editing.email}.</p>
          <form className="grid gap-4" onSubmit={(event) => void saveName(event)}>
            <label className="grid gap-1.5 text-sm text-[#536159]">Full name<input autoFocus className="h-11 rounded-lg border border-line px-3 text-sm" value={editName} onChange={(event) => setEditName(event.target.value)} required maxLength={180} /></label>
            <label className="grid gap-1.5 text-sm text-[#536159]">Assigned branch<select className="h-11 rounded-lg border border-line bg-white px-3 text-sm" value={editBranchId} onChange={(event) => setEditBranchId(event.target.value)} required>{(branchQuery.data?.data ?? []).map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
            <div className="flex justify-end gap-2"><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-line px-4 py-2 text-sm">Cancel</button><button type="submit" disabled={updateStaff.isPending} className="inline-flex items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm text-white disabled:opacity-60">{updateStaff.isPending ? <><LoadingMark /> Saving...</> : "Save changes"}</button></div>
          </form>
        </section>
      </div>}
    </main>
  );
}
