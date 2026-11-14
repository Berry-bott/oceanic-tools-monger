export default function CheckoutLoading() {
  return (
    <div className="min-h-screen animate-pulse bg-cream">
      <div className="h-16 border-b border-peach-light bg-white" />
      <main
        className="mx-auto grid max-w-6xl gap-8 px-4 py-8 sm:px-6 lg:grid-cols-12"
        role="status"
        aria-label="Loading checkout"
        aria-busy="true"
      >
        <div className="space-y-6 lg:col-span-7">
          <div className="h-4 w-44 rounded bg-peach-light" />
          <div className="space-y-5 rounded-3xl border border-peach-light bg-white p-6 sm:p-7">
            <div className="h-7 w-48 rounded bg-peach-light" />
            <div className="h-11 rounded-xl bg-peach-light/70" />
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="h-11 rounded-xl bg-peach-light/70" />
              <div className="h-11 rounded-xl bg-peach-light/70" />
            </div>
          </div>
          <div className="space-y-4 rounded-3xl border border-peach-light bg-white p-6 sm:p-7">
            <div className="h-7 w-52 rounded bg-peach-light" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="h-24 rounded-2xl bg-peach-light/70" />
              <div className="h-24 rounded-2xl bg-peach-light/70" />
            </div>
            <div className="h-16 rounded-xl bg-peach-light/70" />
          </div>
          <div className="space-y-4 rounded-3xl border border-peach-light bg-white p-6 sm:p-7">
            <div className="h-7 w-44 rounded bg-peach-light" />
            <div className="h-20 rounded-2xl bg-peach-light/70" />
          </div>
        </div>
        <aside className="h-fit space-y-5 rounded-3xl border border-peach-light bg-white p-6 sm:p-7 lg:sticky lg:top-24 lg:col-span-5">
          <div className="h-8 w-48 rounded bg-peach-light" />
          {[0, 1, 2].map((item) => (
            <div key={item} className="flex items-center gap-3 border-b border-peach-light/60 py-3">
              <div className="h-14 w-14 rounded-2xl bg-peach-light/70" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-3/4 rounded bg-peach-light/70" />
                <div className="h-3 w-1/2 rounded bg-peach-light/70" />
              </div>
            </div>
          ))}
          <div className="h-24 rounded-xl bg-peach-light/70" />
          <div className="h-12 rounded-full bg-peach-light" />
        </aside>
      </main>
      <span className="sr-only">Loading checkout details</span>
    </div>
  );
}
