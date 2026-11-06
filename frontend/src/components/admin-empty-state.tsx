import type { ReactNode } from "react";
import { AdminUiIcon, type AdminUiIconName } from "@/components/admin-ui-icon";

export function AdminEmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon: AdminUiIconName;
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-10 text-center">
      <span className="mb-1 grid size-11 place-items-center rounded-lg bg-[#edf5ef] text-brand">
        <AdminUiIcon name={icon} size={20} />
      </span>
      <strong className="text-sm font-medium text-[#35453b]">{title}</strong>
      <p className="m-0 max-w-sm text-sm text-muted">{description}</p>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
