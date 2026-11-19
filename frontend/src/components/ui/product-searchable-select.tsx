"use client";

import { useState, useRef, useEffect } from "react";
import { smartSearchMatch } from "@/lib/smart-search";

export interface SearchableProduct {
  id: string;
  name: string;
  sku: string;
  brand?: string | null;
  model?: string | null;
  category?: string | null;
  specifications?: Array<{ name: string; value: string }> | null;
}

interface Props {
  products: SearchableProduct[];
  onSelect: (productId: string) => void;
  selectedProductId?: string;
  placeholder?: string;
}

export function ProductSearchableSelect({ products, onSelect, selectedProductId, placeholder = "Search products..." }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredProducts = products.filter((p) =>
    smartSearchMatch(
      [
        p.name,
        p.sku,
        p.brand,
        p.model,
        p.category,
        ...(p.specifications?.map((s) => `${s.name} ${s.value}`) ?? []),
      ],
      query
    )
  );

  const selectedProduct = products.find((p) => p.id === selectedProductId);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={containerRef}>
      <div
        className="h-10 w-full cursor-pointer rounded-md border border-[#dce5de] bg-white px-3 py-2 text-sm text-[#45564b] focus-within:border-[#8aab91] focus-within:ring-2 focus-within:ring-[#e5efe7]"
        onClick={() => setIsOpen(!isOpen)}
      >
        {selectedProduct ? `${selectedProduct.name} (${selectedProduct.sku})` : placeholder}
      </div>

      {isOpen && (
        <div className="absolute z-50 mt-1 w-full rounded-md border border-[#dce5de] bg-white shadow-lg">
          <input
            type="text"
            className="w-full border-b border-[#dce5de] p-2 text-sm outline-none"
            placeholder="Search by name, model, SKU, spec (e.g. AG 950-115L)..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="max-h-60 overflow-auto">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="cursor-pointer p-2 text-sm hover:bg-[#f1f8f3] flex items-center justify-between gap-2"
                onClick={() => {
                  onSelect(product.id);
                  setIsOpen(false);
                  setQuery("");
                }}
              >
                <div className="min-w-0">
                  <div className="font-medium text-[#2d3b32] truncate">{product.name}</div>
                  <div className="text-muted text-xs flex gap-1 items-center">
                    <span>{product.sku}</span>
                    {product.model && <span>• {product.model}</span>}
                    {product.brand && <span>• {product.brand}</span>}
                  </div>
                </div>
              </div>
            ))}
            {filteredProducts.length === 0 && <div className="p-2 text-sm text-muted">No products found</div>}
          </div>
        </div>
      )}
    </div>
  );
}
