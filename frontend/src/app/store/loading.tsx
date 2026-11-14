function Skeleton({ className }: { className: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-peach-light/70 ${className}`} />;
}

function ProductCardSkeleton() {
  return (
    <article className="overflow-hidden rounded-2xl border border-peach-light/60 bg-white shadow-sm">
      <Skeleton className="aspect-[4/4.1] w-full rounded-none" />
      <div className="space-y-2.5 p-3">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-4/5" />
        <div className="flex items-start justify-between gap-3 pt-1">
          <Skeleton className="h-3 w-2/5" />
          <div className="w-1/2 space-y-1.5">
            <Skeleton className="ml-auto h-3 w-4/5" />
            <Skeleton className="ml-auto h-3 w-3/5" />
          </div>
        </div>
        <div className="flex items-center justify-between pt-1">
          <Skeleton className="h-5 w-2/5" />
          <Skeleton className="h-4 w-1/4" />
        </div>
      </div>
    </article>
  );
}

export default function StoreLoading() {
  return (
    <main
      className="min-h-screen bg-white font-sans"
      role="status"
      aria-label="Loading store"
      aria-busy="true"
    >
      <span className="sr-only">Loading store products</span>

      <div className="h-8 bg-charcoal" />
      <header className="border-b border-peach-light bg-white">
        <div className="mx-auto flex h-16 max-w-7xl items-center gap-5 px-4 sm:px-6">
          <Skeleton className="h-10 w-36 shrink-0" />
          <div className="hidden flex-1 items-center gap-3 lg:flex">
            <Skeleton className="h-8 w-14" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-28" />
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-24" />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Skeleton className="h-9 w-9 rounded-full" />
            <Skeleton className="h-9 w-9 rounded-full" />
          </div>
        </div>
      </header>

      <section className="border-b border-peach-light bg-peach-xlight">
        <div className="mx-auto grid max-w-7xl grid-cols-2 gap-4 px-4 py-4 sm:grid-cols-4 sm:px-6">
          {Array.from({ length: 4 }, (_, index) => (
            <div key={index} className="flex items-center gap-3">
              <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
              <div className="w-full space-y-2">
                <Skeleton className="h-3 w-3/4" />
                <Skeleton className="hidden h-2.5 w-full md:block" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-b border-peach-light bg-peach-xlight">
        <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 sm:py-10">
          <Skeleton className="mb-3 h-3 w-48" />
          <Skeleton className="h-9 w-64 max-w-full" />
          <Skeleton className="mt-3 h-4 w-28" />
        </div>
      </section>

      <div className="mx-auto flex max-w-7xl gap-8 px-4 py-6 sm:px-6 sm:py-8">
        <aside className="hidden w-60 shrink-0 space-y-8 lg:block" aria-hidden="true">
          <div className="space-y-3">
            <Skeleton className="h-4 w-28" />
            {Array.from({ length: 7 }, (_, index) => (
              <Skeleton key={index} className="h-9 w-full rounded-lg" />
            ))}
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full rounded-lg" />
            <Skeleton className="h-2 w-full rounded-full" />
          </div>
          <div className="space-y-3">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-5 w-32" />
          </div>
        </aside>

        <section className="min-w-0 flex-1" aria-hidden="true">
          <div className="mb-5 flex items-center justify-between gap-3">
            <Skeleton className="h-10 w-24 rounded-xl lg:hidden" />
            <Skeleton className="ml-auto h-10 w-36 rounded-xl" />
          </div>
          <div className="grid grid-cols-2 gap-3 sm:gap-4 md:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }, (_, index) => (
              <ProductCardSkeleton key={index} />
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
