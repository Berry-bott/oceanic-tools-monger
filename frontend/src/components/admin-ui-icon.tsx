import type { ReactNode } from "react";

export type AdminUiIconName = "plus" | "minus" | "folder" | "tag" | "edit" | "trash" | "close" | "image" | "box" | "search" | "eye" | "upload" | "check" | "receipt" | "company" | "person" | "money" | "clock" | "calendar" | "bell" | "return" | "cash" | "transfer" | "card" | "expand" | "collapse";

const iconPaths: Record<AdminUiIconName, ReactNode> = {
  plus: <path d="M12 5v14M5 12h14" />,
  minus: <path d="M5 12h14" />,
  folder: <><path d="M3.5 6.5h6l2 2h9v9a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-9a2 2 0 0 1 2-2Z" /><path d="M3.5 9h17" /></>,
  tag: <><path d="M20 13 13 20l-9-9V4h7l9 9Z" /><circle cx="8" cy="8" r="1" /></>,
  edit: <><path d="m14 5 5 5M4 20l4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" /><path d="M13 20h7" /></>,
  trash: <><path d="M4 7h16M10 11v6m4-6v6M5.5 7l1 13h11l1-13M9 7V4h6v3" /></>,
  close: <path d="m6 6 12 12M18 6 6 18" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></>,
  box: <><path d="m12 3 9 5-9 5-9-5 9-5Z" /><path d="M3 8v9l9 5 9-5V8m-9 5v9" /></>,
  search: <><circle cx="10.8" cy="10.8" r="6.8" /><path d="m16 16 4.5 4.5" /></>,
  eye: <><path d="M2.5 12s3.4-6 9.5-6 9.5 6 9.5 6-3.4 6-9.5 6-9.5-6-9.5-6Z" /><circle cx="12" cy="12" r="2.5" /></>,
  upload: <><path d="M12 16V4m-4 4 4-4 4 4" /><path d="M4 15v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4" /></>,
  check: <path d="m5 12 4 4L19 6" />,
  receipt: <><path d="M5 3h14v18l-3-2-4 2-4-2-3 2V3Z" /><path d="M8 8h8M8 12h8M8 16h4" /></>,
  company: <><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M9 21V9h6v12M7 7h.01M17 7h.01M7 11h.01M17 11h.01" /></>,
  person: <><path d="M16 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="10" cy="7" r="4" /><path d="M20 8v6m-3-3h6" /></>,
  money: <><rect x="3" y="5" width="18" height="15" rx="2" /><path d="M3 10h18m-5 4h2" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  calendar: <><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></>,
  bell: <><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9" /><path d="M10 21h4" /></>,
  return: <><path d="M9 14 4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-2" /></>,
  cash: <><rect x="3" y="5" width="18" height="14" rx="2" /><circle cx="12" cy="12" r="3" /><path d="M7 9h.01M17 15h.01" /></>,
  transfer: <><path d="M4 7h15l-3-3m4 13H5l3 3" /><path d="M19 7v3M5 17v-3" /></>,
  card: <><rect x="3" y="5" width="18" height="14" rx="2" /><path d="M3 10h18m-14 4h4" /></>,
  expand: <path d="M15 3h6v6m0-6-7 7M9 21H3v-6m0 6 7-7" />,
  collapse: <path d="M14 10V4m0 6h6m-6 0 7-7M10 14v6m0-6H4m6 0-7 7" />,
};

export function AdminUiIcon({ name, size = 16, className = "" }: { name: AdminUiIconName; size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      {iconPaths[name]}
    </svg>
  );
}
