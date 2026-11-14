WITH lot_totals AS (
  SELECT
    sb."productId",
    sb."branchId",
    sb."onHand",
    sb."reserved",
    p."costPrice",
    COALESCE(SUM(sl."quantity"), 0) AS lot_quantity,
    COALESCE(SUM(sl."reserved"), 0) AS lot_reserved,
    COALESCE(BOOL_OR(
      sl."id" IS NOT NULL
      AND (
        sl."condition" <> 'GOOD'
        OR (sl."expiresAt" IS NOT NULL AND sl."expiresAt" <= CURRENT_TIMESTAMP)
      )
    ), false) AS has_unusable_lots
  FROM "StockBalance" sb
  JOIN "Product" p ON p."id" = sb."productId"
  LEFT JOIN "StockLot" sl
    ON sl."productId" = sb."productId"
    AND sl."branchId" = sb."branchId"
  GROUP BY sb."productId", sb."branchId", sb."onHand", sb."reserved", p."costPrice"
)
INSERT INTO "StockLot" (
  "id",
  "productId",
  "branchId",
  "unitCost",
  "quantity",
  "reserved",
  "origin"
)
SELECT
  'reconciliation_lot_' || md5("productId" || ':' || "branchId" || ':20261113030000'),
  "productId",
  "branchId",
  "costPrice",
  "onHand" - lot_quantity,
  0,
  'RECONCILIATION'
FROM lot_totals
WHERE "onHand" > lot_quantity
  AND "reserved" = lot_reserved
  AND NOT has_unusable_lots
ON CONFLICT ("id") DO NOTHING;
