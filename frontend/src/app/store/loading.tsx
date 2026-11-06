export default function StoreLoading() {
  return (
    <main className="mx-auto min-h-screen max-w-6xl space-y-6 px-4 py-8" role="status" aria-label="Loading store" aria-busy="true">
      <div className="grid gap-3">
        <div className="h-4 w-28 animate-pulse rounded-md bg-[#edf1ed]" />
        <div className="h-8 w-64 max-w-full animate-pulse rounded-md bg-[#edf1ed]" />
      </div>
      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-hidden="true">
        {Array.from({ length: 8 }, (_, index) => (
          <article key={index} className="grid gap-3 rounded-xl border border-line bg-white p-4">
            <div className="aspect-square animate-pulse rounded-lg bg-[#edf1ed]" />
            <div className="h-4 w-3/4 animate-pulse rounded-md bg-[#edf1ed]" />
            <div className="h-4 w-1/3 animate-pulse rounded-md bg-[#edf1ed]" />
          </article>
        ))}
      </section>
    </main>
  );
}
