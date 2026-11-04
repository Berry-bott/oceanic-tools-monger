const pillBase = "inline-flex max-w-[110px] items-center overflow-hidden text-ellipsis whitespace-nowrap rounded-[4px] px-[6px] py-[3px] text-[12px] font-semibold capitalize";

export function statusPill(status: string): string {
  const normalized = status.toUpperCase().replaceAll("-", "_").replaceAll(" ", "_");
  const tone = ["COMPLETED", "DELIVERED", "POSTED", "RECEIVED", "COLLECTED", "ACTIVE", "IN_STOCK"].includes(normalized)
    ? "bg-[#edf6ef] text-[#47805b]"
    : ["PAID", "PROCESSING", "APPROVED", "IN_TRANSIT"].includes(normalized)
      ? "bg-[#edf4fa] text-[#517d9c]"
      : ["PENDING", "PENDING_PAYMENT", "SUBMITTED", "PARTIALLY_RECEIVED", "DRAFT", "LOW_STOCK", "OVERDUE"].includes(normalized)
        ? "bg-[#fff5e7] text-[#a6792e]"
        : ["CANCELLED", "PAYMENT_FAILED", "OUT_OF_STOCK", "ARCHIVED", "REJECTED"].includes(normalized)
          ? "bg-[#fff0ed] text-[#b86b59]"
          : "bg-[#f1f4f1] text-[#68756d]";

  return `${pillBase} ${tone}`;
}
