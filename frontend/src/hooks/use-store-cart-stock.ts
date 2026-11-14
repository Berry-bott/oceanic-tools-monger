"use client";

import { useCallback, useEffect } from "react";
import { fetchStoreStock } from "@/services/store/store.service";
import { useStoreCart } from "@/stores/store-cart.store";

export function useStoreCartStock(storeSlug?: string) {
  const items = useStoreCart((state) => state.items);
  const setItemAvailability = useStoreCart((state) => state.setItemAvailability);
  const itemIds = items.map((item) => item.productId).join("|");

  const refreshStock = useCallback(async () => {
    if (!itemIds) return;
    const stock = await fetchStoreStock(storeSlug);
    const availableById = new Map(stock.map((item) => [item.productId, item.available]));
    for (const productId of itemIds.split("|")) {
      setItemAvailability(productId, availableById.get(productId) ?? 0);
    }
  }, [itemIds, setItemAvailability, storeSlug]);

  useEffect(() => {
    if (!itemIds) return;
    void refreshStock().catch(() => undefined);
    const interval = window.setInterval(() => void refreshStock().catch(() => undefined), 30_000);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void refreshStock().catch(() => undefined);
    };
    window.addEventListener("focus", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshWhenVisible);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, [itemIds, refreshStock]);

  return { refreshStock };
}
