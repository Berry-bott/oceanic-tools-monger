type AdminPageSkeletonProps = {
  variant?: "table" | "form";
};

const pulse = "animate-pulse rounded-md bg-[#edf1ed]";

export function AdminPageSkeleton({ variant = "table" }: AdminPageSkeletonProps) {
  return (
    <main className="mx-auto w-full max-w-screen-2xl space-y-5 px-4 py-6 sm:px-6 lg:px-8" role="status" aria-label="Loading page" aria-busy="true">
      <div className="flex items-end justify-between gap-4">
        <div className="grid flex-1 gap-2">
          <div className={`${pulse} h-3 w-20`} />
          <div className={`${pulse} h-7 w-56 max-w-full`} />
          <div className={`${pulse} h-4 w-80 max-w-full`} />
        </div>
        <div className={`${pulse} hidden h-10 w-36 rounded-lg sm:block`} />
      </div>

      <section className="grid gap-3 sm:grid-cols-3" aria-hidden="true">
        {Array.from({ length: 3 }, (_, index) => (
          <article key={index} className="grid min-h-28 gap-3 rounded-xl border border-line bg-white p-4">
            <div className={`${pulse} h-3 w-2/3`} />
            <div className={`${pulse} h-7 w-1/2`} />
            <div className={`${pulse} h-3 w-4/5`} />
          </article>
        ))}
      </section>

      {variant === "form" ? (
        <section className="grid gap-5 rounded-xl border border-line bg-white p-5 sm:grid-cols-2" aria-hidden="true">
          <div className={`${pulse} h-5 w-48 sm:col-span-2`} />
          {Array.from({ length: 6 }, (_, index) => (
            <div key={index} className={`${pulse} h-10 w-full rounded-lg`} />
          ))}
          <div className={`${pulse} h-10 w-36 justify-self-end sm:col-span-2`} />
        </section>
      ) : (
        <section className="overflow-hidden rounded-xl border border-line bg-white" aria-hidden="true">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-line p-4">
            <div className={`${pulse} h-5 w-40`} />
            <div className={`${pulse} h-10 w-full max-w-xs rounded-lg`} />
          </div>
          <AdminTableSkeleton />
        </section>
      )}
    </main>
  );
}

export function AdminTableSkeleton({
  rows = 5,
  columns = 5,
}: {
  rows?: number;
  columns?: number;
}) {
  return (
    <div className="grid" role="status" aria-label="Loading records" aria-busy="true">
      {Array.from({ length: rows }, (_, row) => (
        <div key={row} className="grid min-h-[58px] items-center gap-4 border-t border-[#edf1ed] px-4 py-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, column) => (
            <div key={column} className={`${pulse} h-3 ${column === 0 ? "w-4/5" : "w-3/5"}`} />
          ))}
        </div>
      ))}
    </div>
  );
}
