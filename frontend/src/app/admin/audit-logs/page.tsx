"use client";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "@/lib/api";
import { useCurrentUser } from "@/hooks/queries/use-current-user";
import { AdminTableSkeleton } from "@/components/admin-loading-skeleton";

type AuditValue = Record<string, unknown> | null;
type AuditEntry = {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  reason?: string | null;
  before?: AuditValue;
  after?: AuditValue;
  createdAt: string;
  user: { name: string; email: string } | null;
};

const allowed = (role?: string) => role === "OWNER";

function fieldLabel(value: string) {
  if (value === "isDefault") return "Main store";
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .replace(/^./, (letter) => letter.toUpperCase());
}

function displayValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "Not set";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (Array.isArray(value)) return value.length ? `${value.length} items` : "None";
  return "Updated details";
}

function getChanges(entry: AuditEntry) {
  const before = entry.before && typeof entry.before === "object" ? entry.before : null;
  const after = entry.after && typeof entry.after === "object" ? entry.after : null;
  const keys = [...new Set([...Object.keys(before ?? {}), ...Object.keys(after ?? {})])]
    .filter((key) => !/password|secret|token|hash/i.test(key));

  return keys.flatMap((key) => {
    const previous = before?.[key];
    const next = after?.[key];
    if (JSON.stringify(previous) === JSON.stringify(next)) return [];
    return [{ key, label: fieldLabel(key), previous, next }];
  });
}

function formatAction(action: string) {
  return action.toLowerCase().replaceAll("_", " ");
}

function formatDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "Date unavailable";
  return new Intl.DateTimeFormat("en-NG", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function ChangeDetails({ entry }: { entry: AuditEntry }) {
  const changes = getChanges(entry);
  const created = !entry.before && Boolean(entry.after);
  const removed = Boolean(entry.before) && !entry.after;

  return (
    <details className="min-w-52">
      <summary className="cursor-pointer text-brand hover:underline">
        View changes
      </summary>
      {entry.reason && (
        <p className="mb-2 mt-2 text-sm text-muted">Reason: {entry.reason}</p>
      )}
      {changes.length ? (
        <ul className="mt-2 space-y-2 rounded-lg bg-canvas p-3 text-sm">
          {changes.map((change) => (
            <li key={change.key} className="grid gap-1">
              <strong className="font-medium text-ink">{change.label}</strong>
              {created ? (
                <span className="text-muted">{displayValue(change.next)}</span>
              ) : removed ? (
                <span className="text-muted">{displayValue(change.previous)}</span>
              ) : (
                <span className="text-muted">
                  {displayValue(change.previous)} <span aria-hidden="true">-&gt;</span>{" "}
                  {displayValue(change.next)}
                </span>
              )}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-0 mt-2 text-sm text-muted">
          No field details were recorded for this change.
        </p>
      )}
    </details>
  );
}

export default function AuditLogsPage() {
  const user = useCurrentUser();
  const [entityType, setEntityType] = useState("");
  const query = useQuery({
    queryKey: ["audit-logs"],
    queryFn: () => apiRequest<{ data: AuditEntry[] }>("/audit-logs"),
    enabled: allowed(user.data?.user.role),
  });
  const allEntries = query.data?.data ?? [];
  const entityTypes = useMemo(
    () => [...new Set(allEntries.map((entry) => entry.entityType))].sort(),
    [allEntries],
  );
  const entries = entityType
    ? allEntries.filter((entry) => entry.entityType === entityType)
    : allEntries;

  if (!allowed(user.data?.user.role)) {
    return (
      <main className="p-8 text-sm text-muted">
        Audit history is available to owners and auditors.
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-screen-2xl px-4 py-6 sm:px-8">
      <header className="mb-5">
        <p className="text-xs tracking-widest text-brand">BUSINESS RECORDS</p>
        <h1 className="mt-2 text-2xl font-bold">Audit history</h1>
        <p className="mt-1 text-sm text-muted">
          See who changed records and when. The list shows up to 200 latest records.
        </p>
      </header>

      <section className="overflow-hidden rounded-xl border border-line bg-white">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
          <div>
            <h2 className="m-0 text-lg font-semibold">Recent changes</h2>
            <p className="mb-0 mt-1 text-sm text-muted">
              {entries.length} records loaded
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            Record type
            <select
              value={entityType}
              onChange={(event) => setEntityType(event.target.value)}
              className="h-9 rounded-md border border-line px-2"
            >
              <option value="">All types</option>
              {entityTypes.map((type) => (
                <option key={type}>{type}</option>
              ))}
            </select>
          </label>
        </div>

        {query.isError ? (
          <p role="alert" className="p-5 text-sm text-red-700">
            {query.error.message}
          </p>
        ) : query.isLoading ? (
          <AdminTableSkeleton columns={5} rows={6} />
        ) : !entries.length ? (
          <p className="p-8 text-center text-sm text-muted">
            No audit records found.
          </p>
        ) : (
          <div className="overflow-auto">
            <table className="w-full min-w-[850px] text-left text-sm">
              <thead className="bg-[#f8faf8]">
                <tr>
                  <th className="p-3">When</th>
                  <th className="p-3">Who</th>
                  <th className="p-3">Action</th>
                  <th className="p-3">Record</th>
                  <th className="p-3">What changed</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id} className="border-t border-line align-top">
                    <td className="whitespace-nowrap p-3">
                      {formatDate(entry.createdAt)}
                    </td>
                    <td className="p-3">
                      {entry.user?.name ?? "System"}
                      <small className="block text-muted">
                        {entry.user?.email ?? ""}
                      </small>
                    </td>
                    <td className="p-3 capitalize">{formatAction(entry.action)}</td>
                    <td className="p-3">
                      {entry.entityType}
                      <small className="block max-w-40 overflow-hidden text-ellipsis text-muted">
                        {entry.entityId}
                      </small>
                    </td>
                    <td className="max-w-[440px] p-3">
                      <ChangeDetails entry={entry} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
