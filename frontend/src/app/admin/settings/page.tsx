"use client";

import { useCallback, useState } from "react";
import Link from "next/link";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { AdminPageSkeleton } from "@/components/admin-loading-skeleton";
import { useSettingsOverview } from "@/hooks/queries/use-settings-overview";
import {
  createBranch as createBranchRequest,
  settingsKeys,
  updateBranch as updateBranchRequest,
  updateBusinessSettings,
} from "@/services/settings/settings.service";
import { businessKeys } from "@/services/business/business.service";
import { branchKeys } from "@/services/branches/branch.service";
import { useQueryClient } from "@tanstack/react-query";
import { invalidateAdminSummaries } from "@/lib/invalidate-admin-data";

type User = { id: string; name: string; email: string; role: string };
type Branch = {
  id: string;
  name: string;
  isDefault: boolean;
  isActive?: boolean;
};
type Business = {
  id: string;
  name: string;
  currency: string;
  timezone: string;
  storeSlug?: string | null;
  branches: Branch[];
};
export default function SettingsPage() {
  const currentUserQuery = useCurrentUser();
  const user = currentUserQuery.data?.user as User | undefined;
  const settingsQuery = useSettingsOverview<Business, Branch>(user?.role === "OWNER");
  const queryClient = useQueryClient();
  const business = settingsQuery.data?.business;
  const branches = settingsQuery.data?.branches ?? [];
  const loading = settingsQuery.isLoading;
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const reload = useCallback(async () => {
    setError("");
    await settingsQuery.refetch();
  }, [settingsQuery.refetch]);

  async function saveBusiness(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("business");
    setError("");
    setNotice("");
    try {
      await updateBusinessSettings({
          name: form.get("name"),
          currency: form.get("currency"),
          timezone: form.get("timezone"),
          storeSlug: form.get("storeSlug") || undefined,
      });
      await queryClient.invalidateQueries({ queryKey: settingsKeys.all });
      await queryClient.invalidateQueries({ queryKey: businessKeys.current });
      await invalidateAdminSummaries(queryClient);
      setNotice("Business settings saved.");
    } catch (e) {
      setError(
        e instanceof Error
          ? e.message
          : "Business settings could not be saved.",
      );
    } finally {
      setBusy("");
    }
  }
  async function addBranch(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    setBusy("branch");
    setError("");
    setNotice("");
    try {
      await createBranchRequest({
          name: form.get("name"),
          isDefault: form.get("isDefault") === "on",
      });
      setNotice("Branch created.");
      await queryClient.invalidateQueries({ queryKey: branchKeys.all });
      await invalidateAdminSummaries(queryClient);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Branch could not be created.");
    } finally {
      setBusy("");
    }
  }
  async function updateBranch(
    branch: Branch,
    changes: Partial<Pick<Branch, "name" | "isDefault">>,
  ) {
    setBusy(branch.id);
    setError("");
    setNotice("");
    try {
      await updateBranchRequest(branch.id, changes);
      setNotice(`${branch.name} updated.`);
      await queryClient.invalidateQueries({ queryKey: branchKeys.all });
      await invalidateAdminSummaries(queryClient);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Branch update failed.");
    } finally {
      setBusy("");
    }
  }

  if (!user)
    return <AdminPageSkeleton variant="form" />;
  if (user.role !== "OWNER")
    return (
      <main className="min-h-screen grid [align-content:center] [justify-items:center] gap-3 text-center p-6 [&_h1]:text-[22px] [&_h1]:m-0 [&_p]:text-sm [&_p]:text-[#75827a]">
        <h1>Only the owner can open this page</h1>
        <p>
          Only the business owner can change staff, shops and business details.
        </p>
        <Link
          href="/admin"
          className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
        >
          Return to dashboard
        </Link>
      </main>
    );
  return (
    <div className="min-h-screen">
      <main className="min-h-screen">
        <div className="mx-auto w-full max-w-screen-2xl px-4 py-6 sm:px-6 lg:px-8">
          <div className="flex items-end justify-between [margin-bottom:19px] gap-4 [&_h1]:text-[25px] [&_h1]:leading-[1.2] [&_h1]:m-0 [&_h1]:tracking-tight [&_h1]:font-bold [&_h1]:text-[#1a2a22] max-[620px]:items-start max-[620px]:flex-col max-[620px]:mb-4 max-[620px]:[&_h1]:text-[22px]">
            <div>
              <span className="text-sm tracking-wide text-[#718b79] font-normal">
                BUSINESS ADMINISTRATION
              </span>
              <h1>Settings</h1>
              <p>Manage company information, locations and team access.</p>
            </div>
          </div>
          {error && (
            <div
              className="[&_strong]:text-[#a5554a] [&_p]:text-[#8e7974] m-0 text-[#b44f44] text-sm leading-normal"
              role="alert"
            >
              {error}
              <button
                className="flex items-center gap-1 text-[#38765a] text-sm font-normal [&:hover]:[text-decoration:underline]"
                onClick={() => void reload()}
              >
                Reload
              </button>
            </div>
          )}
          {notice && (
            <div
              className="mb-3 border border-[#dcebe0] bg-[#f1f8f3] rounded-lg py-2.5 px-3 text-[#4b7557] text-sm flex items-center justify-between gap-3 [&_button]:[border:0] [&_button]:bg-transparent [&_button]:text-inherit [&_button]:text-[15px]"
              role="status"
            >
              {notice}
              <button
                onClick={() => setNotice("")}
                aria-label="Dismiss"
              ></button>
            </div>
          )}
          <div className="grid grid-cols-2 gap-3 items-start mb-3 max-[900px]:grid-cols-1">
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-[15px] [&>.panel-heading]:mb-3 [&_form]:grid [&_form]:gap-3 [&_.form-field]:text-sm [&_.form-field_input]:h-[36px] [&_.form-field_input]:text-sm [&_.form-field_select]:h-[36px] [&_.form-field_select]:text-sm [&_.form-field_small]:text-sm [&_.form-field_small]:text-[#8b978f] [&_.button-primary]:h-[34px] [&_.button-primary]:text-sm max-[620px]:[&_.form-row]:grid-cols-1">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Business details</h2>
                  <p>Organization-wide defaults and public store identifier.</p>
                </div>
              </div>
              <form onSubmit={(event) => void saveBusiness(event)}>
                <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                  Business name
                  <input
                    name="name"
                    defaultValue={business?.name || ""}
                    key={`business-name-${business?.name}`}
                    required
                    maxLength={180}
                  />
                </label>
                <div className="grid grid-cols-2 gap-3 max-[620px]:grid-cols-1">
                  <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                    Currency
                    <input
                      name="currency"
                      defaultValue={business?.currency || "NGN"}
                      key={`currency-${business?.currency}`}
                      required
                      minLength={3}
                      maxLength={3}
                    />
                  </label>
                  <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                    Timezone
                    <input
                      name="timezone"
                      defaultValue={business?.timezone || "Africa/Lagos"}
                      key={`timezone-${business?.timezone}`}
                      required
                      maxLength={80}
                      placeholder="Africa/Lagos"
                    />
                  </label>
                </div>
                <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                  Store slug
                  <input
                    name="storeSlug"
                    defaultValue={business?.storeSlug || ""}
                    key={`slug-${business?.storeSlug}`}
                    maxLength={80}
                    placeholder="my-store"
                  />
                </label>
                <button
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                  disabled={busy === "business"}
                >
                  {busy === "business" ? "Saving" : "Save business"}
                </button>
              </form>
            </section>
            <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-[15px] [&>.panel-heading]:mb-3 [&_form]:grid [&_form]:gap-3 [&_.form-field]:text-sm [&_.form-field_input]:h-[36px] [&_.form-field_input]:text-sm [&_.form-field_select]:h-[36px] [&_.form-field_select]:text-sm [&_.form-field_small]:text-sm [&_.form-field_small]:text-[#8b978f] [&_.button-primary]:h-[34px] [&_.button-primary]:text-sm max-[620px]:[&_.form-row]:grid-cols-1">
              <div className="flex items-start justify-between gap-3 mb-3 [&_h2]:text-sm [&_h2]:m-0 [&_h2]:font-bold [&_h2]:tracking-[-.1px] [&_p]:text-sm [&_p]:text-[#8d9991] [&_p]:mt-1 mx-0 mb-0">
                <div>
                  <h2>Add a branch</h2>
                  <p>Add another shop or branch.</p>
                </div>
              </div>
              <form onSubmit={(event) => void addBranch(event)}>
                <label className="grid gap-1.5 text-[#536159] font-normal text-sm [&_input]:h-[39px] [&_input]:border border-[#dfe6e0] [&_input]:rounded-md [&_input]:px-2.5 [&_input]:text-[#34413a] [&_input]:[outline:0] [&_input]:bg-white [&_input]:text-sm [&_input:focus]:[border-color:#6e9e7d] [&_input:focus]:shadow-[0_0_0_3px_#eaf3ec] [&_input::placeholder]:text-[#aab3ac] [&_select]:h-[39px] [&_select]:border border-[#dfe6e0] [&_select]:rounded-md [&_select]:px-2.5 [&_select]:text-[#34413a] [&_select]:bg-white [&_select]:text-sm">
                  Branch name
                  <input
                    name="name"
                    required
                    maxLength={120}
                    placeholder="e.g. Ikeja Store"
                  />
                </label>
                <label className="flex items-center gap-2 text-sm text-[#637268] [&_input]:[accent-color:#286b51]">
                  <input type="checkbox" name="isDefault" /> Set as default
                  branch
                </label>
                <button
                  className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-white bg-brand border border-brand shadow-[0_1px_2px_#183f3318] [&:hover]:bg-brand-dark [&:disabled]:[opacity:.65]"
                  disabled={busy === "branch"}
                >
                  {busy === "branch" ? "Creating" : "Create branch"}
                </button>
              </form>
            </section>
          </div>
          <section className="min-w-0 bg-white border border-line rounded-xl p-[15px] shadow-[0_1px_2px_#24333704] min-[1500px]:p-[17px] max-[620px]:p-3 p-0 overflow-hidden mb-3">
            <div className="flex items-center justify-between gap-[15px] py-[17px] px-[18px] [border-bottom:1px_solid_#edf1ed] [&_h2]:text-sm [&_h2]:mt-0 mx-0 mb-1 [&_p]:text-sm [&_p]:text-[#929d95] [&_p]:m-0 max-[1000px]:items-start max-[1000px]:flex-col max-[620px]:p-[13px]">
              <div>
                <h2>Branches</h2>
                <p>
                  Default branch is used when workflows need a primary location.
                </p>
              </div>
            </div>
            <div className="overflow-auto">
              <table className="w-full [border-collapse:collapse] [min-width:850px] text-left [&_th]:h-[39px] [&_th]:px-[13px] [&_th]:bg-[#fafbfa] [&_th]:text-[#8c9990] [&_th]:text-sm [&_th]:font-normal [&_th]:tracking-[.55px] [&_th]:whitespace-nowrap [&_th:first-child]:[padding-left:18px] [&_td:first-child]:[padding-left:18px] [&_td]:h-[61px] [&_td]:[border-top:1px_solid_#f0f3f0] [&_td]:py-2 px-[13px] [&_td]:text-[#5c6b61] [&_td]:text-sm [&_td]:whitespace-nowrap [&_td>strong]:text-sm [&_td>strong]:text-[#3d4e43] [&_td>strong]:font-normal">
                <thead>
                  <tr>
                    <th>BRANCH</th>
                    <th>DEFAULT</th>
                    <th>ACTIONS</th>
                  </tr>
                </thead>
                <tbody>
                  {branches.map((branch) => (
                    <tr key={branch.id}>
                      <td>
                        <strong>{branch.name}</strong>
                      </td>
                      <td>
                        {branch.isDefault ? (
                          <span className="inline-flex py-1 px-[7px] rounded text-sm font-normal [text-transform:capitalize] bg-[#edf6ef] text-[#4d805a]">
                            Default
                          </span>
                        ) : (
                          ""
                        )}
                      </td>
                      <td>
                        <div className="flex gap-1 [&_.button-primary]:h-[27px] [&_.button-primary]:py-0 px-2 [&_.button-primary]:text-sm [&_.button-secondary]:h-[27px] [&_.button-secondary]:py-0 px-2 [&_.button-secondary]:text-sm">
                          <button
                            className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                            disabled={busy === branch.id}
                            onClick={() => {
                              const name = window.prompt(
                                "Update branch name",
                                branch.name,
                              );
                              if (name?.trim() && name !== branch.name)
                                void updateBranch(branch, {
                                  name: name.trim(),
                                });
                            }}
                          >
                            Rename
                          </button>
                          {!branch.isDefault && (
                            <button
                              className="h-[35px] px-3 rounded-lg inline-flex items-center justify-center gap-2 text-sm font-normal transition-colors text-[#4e5e54] bg-white border border-[#e0e7e1] [&:hover]:bg-[#f8faf8] [&:hover]:[border-color:#ccd9ce]"
                              disabled={busy === branch.id}
                              onClick={() =>
                                void updateBranch(branch, { isDefault: true })
                              }
                            >
                              Set default
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!branches.length && !loading && (
              <p className="text-sm text-[#929e96] py-2.5 px-1 m-0">
                No branches found.
              </p>
            )}
          </section>
          <section className="mb-3 flex flex-wrap items-center justify-between gap-4 rounded-xl border border-line bg-white p-5 shadow-sm">
            <div>
              <h2 className="m-0 text-base font-bold text-[#26372d]">Staff accounts</h2>
              <p className="mb-0 mt-1 text-sm text-muted">Create accounts, update staff details, or turn off access.</p>
            </div>
            <Link href="/admin/staff" className="inline-flex h-10 items-center justify-center rounded-lg bg-brand px-4 text-sm text-white hover:bg-brand-dark">
              Manage staff
            </Link>
          </section>
          <footer className="flex items-center justify-between pt-[13px] px-[1px] pb-0 [border-top:1px_solid_#e9eeea] text-[#9aa49d] text-sm max-[620px]:gap-2 max-[620px]:items-start max-[620px]:flex-col max-[620px]:text-sm">
            <span>OceanicToolsMonger Business settings</span>
            <span>
              Turning off access signs the staff member out straight away.
            </span>
          </footer>
        </div>
      </main>
    </div>
  );
}
