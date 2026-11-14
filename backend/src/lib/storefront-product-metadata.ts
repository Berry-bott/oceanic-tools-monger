import { prisma } from "./prisma.js";

const fulfilledOrderStatuses = [
  "PAID",
  "PROCESSING",
  "READY_FOR_COLLECTION",
  "DISPATCHED",
  "DELIVERED",
  "COLLECTED",
  "PARTIALLY_FULFILLED",
] as const;

type ProductQuantityTotal = { productId: string; _sum: { quantity: unknown } };

function addTotals(
  totals: ProductQuantityTotal[],
  target: Map<string, number>,
  multiplier = 1,
) {
  for (const row of totals) {
    target.set(
      row.productId,
      (target.get(row.productId) ?? 0) + Number(row._sum.quantity ?? 0) * multiplier,
    );
  }
}

export async function getStorefrontTrendingProductIds(businessId: string) {
  const recentSalesFrom = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const [recentPosSales, recentOnlineSales, recentReturns] = await Promise.all([
    prisma.saleLine.groupBy({
      by: ["productId"],
      where: {
        product: { businessId, state: "ACTIVE", isPublished: true },
        sale: {
          businessId,
          status: { in: ["COMPLETED", "PARTIALLY_RETURNED"] },
          createdAt: { gte: recentSalesFrom },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.onlineOrderLine.groupBy({
      by: ["productId"],
      where: {
        product: { businessId, state: "ACTIVE", isPublished: true },
        order: {
          businessId,
          status: { in: [...fulfilledOrderStatuses] },
          createdAt: { gte: recentSalesFrom },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.saleReturnLine.groupBy({
      by: ["productId"],
      where: {
        product: { businessId, state: "ACTIVE", isPublished: true },
        saleReturn: {
          sale: {
            businessId,
            status: { in: ["COMPLETED", "PARTIALLY_RETURNED"] },
            createdAt: { gte: recentSalesFrom },
          },
        },
      },
      _sum: { quantity: true },
    }),
  ]);
  const recentUnits = new Map<string, number>();
  addTotals(recentPosSales, recentUnits);
  addTotals(recentOnlineSales, recentUnits);
  addTotals(recentReturns, recentUnits, -1);

  return [...recentUnits.entries()]
    .filter(([, units]) => units >= 3)
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([productId]) => productId);
}

export async function getStorefrontProductMetadata(
  businessId: string,
  productIds: string[],
  rankedTrendingProductIds?: string[],
) {
  const metadata = new Map<string, { badge: string | null; averageRating: number | null; reviewCount: number }>();
  if (!productIds.length) return metadata;

  const requestedProductIds = [...new Set(productIds)];
  const [allPosSales, allOnlineSales, allReturns, trendingProductIds, reviews] = await Promise.all([
    prisma.saleLine.groupBy({
      by: ["productId"],
      where: {
        productId: { in: requestedProductIds },
        product: { businessId, state: "ACTIVE", isPublished: true },
        sale: {
          businessId,
          status: { in: ["COMPLETED", "PARTIALLY_RETURNED"] },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.onlineOrderLine.groupBy({
      by: ["productId"],
      where: {
        productId: { in: requestedProductIds },
        product: { businessId, state: "ACTIVE", isPublished: true },
        order: {
          businessId,
          status: { in: [...fulfilledOrderStatuses] },
        },
      },
      _sum: { quantity: true },
    }),
    prisma.saleReturnLine.groupBy({
      by: ["productId"],
      where: {
        productId: { in: requestedProductIds },
        product: { businessId, state: "ACTIVE", isPublished: true },
        saleReturn: { sale: { businessId, status: { in: ["COMPLETED", "PARTIALLY_RETURNED"] } } },
      },
      _sum: { quantity: true },
    }),
    rankedTrendingProductIds
      ? Promise.resolve(rankedTrendingProductIds)
      : getStorefrontTrendingProductIds(businessId),
    prisma.productReview.groupBy({
      by: ["productId"],
      where: { businessId, productId: { in: requestedProductIds } },
      _avg: { rating: true },
      _count: { _all: true },
    }),
  ]);

  const lifetimeUnits = new Map<string, number>();
  addTotals(allPosSales, lifetimeUnits);
  addTotals(allOnlineSales, lifetimeUnits);
  addTotals(allReturns, lifetimeUnits, -1);
  const trendingIds = new Set(trendingProductIds);
  const reviewByProduct = new Map(reviews.map((row) => [
    row.productId,
    { averageRating: row._avg.rating, reviewCount: row._count._all },
  ]));

  for (const productId of requestedProductIds) {
    const lifetime = Math.max(0, lifetimeUnits.get(productId) ?? 0);
    const review = reviewByProduct.get(productId);
    metadata.set(productId, {
      badge: trendingIds.has(productId)
        ? "TRENDING"
        : lifetime >= 20
          ? "BEST SELLER"
          : lifetime >= 5
            ? "POPULAR"
            : null,
      averageRating: review?.averageRating ?? null,
      reviewCount: review?.reviewCount ?? 0,
    });
  }
  return metadata;
}
