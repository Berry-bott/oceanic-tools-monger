export type ProductSpecificationInput = { name: string; value: string };

export function ProductSpecificationsEditor({
  specifications,
  onChange,
}: {
  specifications: ProductSpecificationInput[];
  onChange: (value: ProductSpecificationInput[]) => void;
}) {
  return (
    <section className="grid gap-4 rounded-xl border border-line bg-white p-5 sm:p-6" aria-labelledby="product-specifications-title">
      <div>
        <h2 id="product-specifications-title" className="m-0 text-lg font-semibold text-ink">Product specifications <span className="text-sm font-normal text-muted">(optional)</span></h2>
        <p className="mb-0 mt-1 text-sm text-muted">Add only the details that matter for this product.</p>
      </div>
      {specifications.map((item, index) => (
        <div key={index} className="grid gap-2 sm:grid-cols-[1fr_1.4fr_auto]">
          <label className="grid gap-1 text-sm text-[#536159]">Specification<input aria-label={`Specification ${index + 1} name`} value={item.name} onChange={(event) => onChange(specifications.map((row, rowIndex) => rowIndex === index ? { ...row, name: event.target.value } : row))} maxLength={100} placeholder="e.g. Power rating" className="h-10 rounded-lg border border-line px-3 text-ink" /></label>
          <label className="grid gap-1 text-sm text-[#536159]">Value<input aria-label={`Specification ${index + 1} value`} value={item.value} onChange={(event) => onChange(specifications.map((row, rowIndex) => rowIndex === index ? { ...row, value: event.target.value } : row))} maxLength={500} placeholder="e.g. 750W" className="h-10 rounded-lg border border-line px-3 text-ink" /></label>
          <button type="button" onClick={() => onChange(specifications.filter((_, rowIndex) => rowIndex !== index))} className="self-end rounded-lg border border-line px-3 py-2 text-sm text-[#a75043] hover:bg-[#fff5f2]">Remove</button>
        </div>
      ))}
      {specifications.length < 50 && <button type="button" onClick={() => onChange([...specifications, { name: "", value: "" }])} className="justify-self-start rounded-lg border border-line bg-white px-3 py-2 text-sm text-brand hover:bg-canvas">+ Add specification</button>}
    </section>
  );
}
