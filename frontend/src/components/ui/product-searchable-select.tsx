"use client";

import { useState, useRef, useEffect } from "react";

interface Product {
  id: string;
  name: string;
  sku: string;
}

interface Props {
  products: Product[];
  onSelect: (productId: string) => void;
  selectedProductId?: string;
  placeholder?: string;
}

export function ProductSearchableSelect({ products, onSelect, selectedProductId, placeholder = "Search products..." }: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);

  const filteredProducts = products.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.sku.toLowerCase().includes(query.toLowerCase())
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
            placeholder="Type to search..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            autoFocus
          />
          <div className="max-h-60 overflow-auto">
            {filteredProducts.map((product) => (
              <div
                key={product.id}
                className="cursor-pointer p-2 text-sm hover:bg-[#f1f8f3]"
                onClick={() => {
                  onSelect(product.id);
                  setIsOpen(false);
                  setQuery("");
                }}
              >
                {product.name} <span className="text-muted text-xs">{product.sku}</span>
              </div>
            ))}
            {filteredProducts.length === 0 && <div className="p-2 text-sm text-muted">No products found</div>}
          </div>
        </div>
      )}
    </div>
  );
}
