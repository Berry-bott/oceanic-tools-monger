import { Router } from "express";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs-hardened";
import { z } from "zod";
import { ApiError } from "../lib/errors.js";
import { prisma } from "../lib/prisma.js";
import { requireAuth, requireRoles, type AuthContext } from "../middleware/auth.js";

export const reportsRouter = Router();
reportsRouter.use(requireAuth, requireRoles("OWNER"));

function zonedMidnight(date: string, timeZone: string) {
  const [year, month, day] = date.split("-").map(Number);
  const utc = new Date(Date.UTC(year, month - 1, day));
  const offsetText = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(utc).find((part) => part.type === "timeZoneName")?.value ?? "GMT+0";
  const match = offsetText.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/);
  const offsetMinutes = match ? (match[1] === "+" ? 1 : -1) * (Number(match[2]) * 60 + Number(match[3] ?? 0)) : 0;
  return new Date(Date.UTC(year, month - 1, day) - offsetMinutes * 60_000);
}

function parseRange(query: Record<string, unknown>, timeZone: string) {
  const range = z.object({ from: z.iso.date().optional(), to: z.iso.date().optional(), branchId: z.string().optional() }).safeParse(query);
  if (!range.success) throw new ApiError(400, "Use YYYY-MM-DD for report date filters.", "INVALID_DATE_RANGE", range.error.issues);
  let fromDate = range.data.from;
  let toDate = range.data.to;
  if (!fromDate || !toDate) {
    const today = new Intl.DateTimeFormat("en-CA", { timeZone }).format(new Date());
    const localDate = new Date(`${today}T12:00:00Z`);
    const day = localDate.getUTCDay();
    localDate.setUTCDate(localDate.getUTCDate() - ((day + 6) % 7));
    const monday = localDate.toISOString().slice(0, 10);
    const sunday = new Date(localDate);
    sunday.setUTCDate(sunday.getUTCDate() + 6);
    fromDate ??= monday;
    toDate ??= sunday.toISOString().slice(0, 10);
  }
  const start = zonedMidnight(fromDate, timeZone);
  const end = new Date(zonedMidnight(toDate, timeZone).getTime() + 24 * 60 * 60 * 1000);
  if (start >= end) throw new ApiError(400, "The report start must be before the end.", "INVALID_DATE_RANGE");
  return { start, end, fromDate, toDate, branchId: range.data.branchId };
}

function respondCsv(response: import("express").Response, rows: Record<string, unknown>[], filename: string) {
  const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
  const quote = (input: unknown) => {
    let value = input == null ? "" : typeof input === "object" ? JSON.stringify(input) : String(input);
    if (/^[=+\-@\t\r]/.test(value)) value = `'${value}`;
    return `"${value.replaceAll('"', '""')}"`;
  };
  const csv = [columns.map(quote).join(","), ...rows.map((row) => columns.map((column) => quote(row[column])).join(","))].join("\r\n");
  response.set({ "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${filename}"`, "Cache-Control": "no-store" }).send(`\uFEFF${csv}`);
}

function exportValue(input: unknown) {
  const value = input == null ? "" : input instanceof Date ? input.toISOString() : typeof input === "object" ? JSON.stringify(input) : String(input);
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

export async function respondReportExport(response: import("express").Response, format: unknown, rows: Record<string, unknown>[], filename: string, title: string) {
  if (format === undefined || format === "json") return false;
  if (format !== "csv" && format !== "xlsx" && format !== "pdf") throw new ApiError(400, "Report format must be csv, xlsx, or pdf.", "INVALID_REPORT_FORMAT");
  const extension = format;
  const downloadName = filename.replace(/\.[^.]+$/, `.${extension}`);
  if (format === "csv") respondCsv(response, rows, downloadName);
  if (format === "xlsx") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Report", { views: [{ state: "frozen", ySplit: 1 }] });
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    sheet.columns = columns.map((key) => ({ header: key, key, width: Math.min(42, Math.max(14, key.length + 2)) }));
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF17324D" } };
    for (const row of rows) {
      const values: Record<string, string | number> = {};
      for (const key of columns) {
        const raw = row[key];
        values[key] = typeof raw === "number" && Number.isFinite(raw) ? raw : exportValue(raw);
      }
      sheet.addRow(values);
    }
    if (columns.length) sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
    const data = await workbook.xlsx.writeBuffer();
    response.set({ "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${downloadName}"`, "Cache-Control": "no-store" }).send(Buffer.from(data));
  }
  if (format === "pdf") {
    const columns = [...new Set(rows.flatMap((row) => Object.keys(row)))];
    const document = new PDFDocument({ size: "A4", layout: "landscape", margin: 32, bufferPages: true });
    response.set({ "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${downloadName}"`, "Cache-Control": "no-store" });
    document.pipe(response);
    document.fontSize(16).font("Helvetica-Bold").text(title, { continued: false });
    document.moveDown(0.5).fontSize(8).font("Helvetica").text(`${rows.length} rows`);
    const pageWidth = document.page.width - document.page.margins.left - document.page.margins.right;
    const widths = columns.map(() => pageWidth / Math.max(columns.length, 1));
    const drawHeader = () => {
    document.font("Helvetica-Bold").fontSize(7);
      const y = document.y;
      let x = document.page.margins.left;
      columns.forEach((column, index) => { document.text(column, x, y, { width: widths[index], height: 24, ellipsis: true }); x += widths[index]; });
      document.y = y + 14;
      document.font("Helvetica").fontSize(7);
    };
    if (columns.length) drawHeader();
    for (const row of rows) {
      const cells = columns.map((column) => exportValue(row[column]).replace(/[\r\n]+/g, " ").slice(0, 500));
      const heights = cells.map((cell, index) => document.heightOfString(cell, { width: widths[index] - 4 }));
      const height = Math.max(12, ...heights) + 4;
      if (document.y + height > document.page.height - document.page.margins.bottom) { document.addPage(); drawHeader(); }
      const y = document.y;
      let x = document.page.margins.left;
      cells.forEach((cell, index) => { document.text(cell, x, y, { width: widths[index] - 4, height, ellipsis: true }); x += widths[index]; });
      document.y = y + height;
      document.moveTo(document.page.margins.left, document.y).lineTo(document.page.width - document.page.margins.right, document.y).strokeColor("#d9e1e8").lineWidth(0.3).stroke();
    }
    document.end();
  }
  return true;
}

reportsRouter.get("/weekly-performance", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true, currency: true } });
  const range = parseRange(request.query, business.timezone);
  if (range.branchId && !await prisma.branch.findFirst({ where: { id: range.branchId, businessId: auth.businessId } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const sales = await prisma.sale.findMany({ where: { businessId: auth.businessId, createdAt: { gte: range.start, lt: range.end }, status: { not: "CANCELLED" }, ...(range.branchId ? { branchId: range.branchId } : {}) }, include: { lines: true, payments: { include: { payment: { select: { status: true, method: true, amount: true, fee: true } } } }, returns: { include: { lines: true } } } });
  const expenses = await prisma.expense.findMany({ where: { businessId: auth.businessId, incurredAt: { gte: range.start, lt: range.end }, ...(range.branchId ? { branchId: range.branchId } : {}) }, select: { amount: true } });
  const customerPayments = await prisma.payment.findMany({ where: { businessId: auth.businessId, status: "SUCCEEDED", paidAt: { gte: range.start, lt: range.end }, saleAllocations: { some: { sale: { businessId: auth.businessId, ...(range.branchId ? { branchId: range.branchId } : {}) } } } }, include: { saleAllocations: { where: { sale: { businessId: auth.businessId, ...(range.branchId ? { branchId: range.branchId } : {}) } }, include: { sale: { select: { channel: true } } } } } });
  const gatewayFees = Number((await prisma.gatewaySettlement.aggregate({ where: { businessId: auth.businessId, settledAt: { gte: range.start, lt: range.end } }, _sum: { feeAmount: true } }))._sum.feeAmount ?? 0);
  const grossSales = sales.reduce((sum, sale) => sum + Number(sale.subtotal), 0);
  const discounts = sales.reduce((sum, sale) => sum + Number(sale.discount), 0);
  const salesReturns = sales.reduce((sum, sale) => sum + sale.returns.reduce((returnSum, returned) => returnSum + (Number(sale.total) > 0 ? Number(returned.total) * (Number(sale.subtotal) - Number(sale.discount)) / Number(sale.total) : 0), 0), 0);
  const netSales = grossSales - discounts - salesReturns;
  const cogs = sales.reduce((sum, sale) => sum + sale.lines.reduce((lineSum, line) => lineSum + Number(line.unitCost) * Number(line.quantity), 0) - sale.returns.reduce((returnSum, returned) => returnSum + returned.lines.filter((line) => line.restock).reduce((lineSum, line) => lineSum + Number(line.quantity) * Number(sale.lines.find((saleLine) => saleLine.id === line.saleLineId)?.unitCost ?? 0), 0), 0), 0);
  const grossProfit = netSales - cogs;
  const operatingExpenses = expenses.reduce((sum, expense) => sum + Number(expense.amount), 0);
  const cashCollected = customerPayments.reduce((sum, payment) => sum + payment.saleAllocations.reduce((allocationSum, entry) => allocationSum + Number(entry.amount), 0), 0);
  const paymentBreakdown = new Map<string, number>();
  const channelBreakdown = new Map<string, number>();
  const dailyBreakdown = new Map<string, { date: string; netSales: number; grossProfit: number }>();
  const productBreakdown = new Map<string, { productId: string; product: string; sku: string; quantity: number; revenue: number; costOfGoodsSold: number; grossProfit: number; lossMakingSales: number; lossOnLossMakingSales: number }>();
  const lossMakingSaleIds = new Map<string, Set<string>>();
  for (const sale of sales) {
    const channelReturns = sale.returns.reduce((sum, returned) => sum + (Number(sale.total) > 0 ? Number(returned.total) * (Number(sale.subtotal) - Number(sale.discount)) / Number(sale.total) : 0), 0);
    const saleNetSales = Number(sale.subtotal) - Number(sale.discount) - channelReturns;
    channelBreakdown.set(sale.channel, (channelBreakdown.get(sale.channel) ?? 0) + saleNetSales);
    const saleCogs = sale.lines.reduce((lineSum, line) => lineSum + Number(line.unitCost) * Number(line.quantity), 0) - sale.returns.reduce((returnSum, returned) => returnSum + returned.lines.filter((line) => line.restock).reduce((lineSum, line) => lineSum + Number(line.quantity) * Number(sale.lines.find((saleLine) => saleLine.id === line.saleLineId)?.unitCost ?? 0), 0), 0);
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: business.timezone }).format(sale.createdAt);
    const daily = dailyBreakdown.get(date) ?? { date, netSales: 0, grossProfit: 0 };
    daily.netSales += saleNetSales;
    daily.grossProfit += saleNetSales - saleCogs;
    dailyBreakdown.set(date, daily);
    for (const line of sale.lines) {
      const returnedLines = sale.returns.flatMap((returned) => returned.lines).filter((returnedLine) => returnedLine.saleLineId === line.id);
      const returnedQuantity = returnedLines.reduce((sum, returnedLine) => sum + Number(returnedLine.quantity), 0);
      const restockedQuantity = returnedLines.filter((returnedLine) => returnedLine.restock).reduce((sum, returnedLine) => sum + Number(returnedLine.quantity), 0);
      const key = line.productId;
      const product = productBreakdown.get(key) ?? { productId: key, product: line.productName, sku: line.sku, quantity: 0, revenue: 0, costOfGoodsSold: 0, grossProfit: 0, lossMakingSales: 0, lossOnLossMakingSales: 0 };
      const lineQuantity = Number(line.quantity);
      const netQuantity = Number(line.quantity) - returnedQuantity;
      const discountMultiplier = Number(sale.subtotal) > 0 ? Math.max(0, (Number(sale.subtotal) - Number(sale.discount)) / Number(sale.subtotal)) : 1;
      const netRevenue = lineQuantity > 0 ? Math.max(0, Number(line.lineTotal) * discountMultiplier * netQuantity / lineQuantity) : 0;
      const retainedCost = Math.max(0, (lineQuantity - restockedQuantity) * Number(line.unitCost));
      const lineGrossProfit = netRevenue - retainedCost;
      product.quantity += netQuantity;
      product.revenue += netRevenue;
      product.costOfGoodsSold += retainedCost;
      product.grossProfit += lineGrossProfit;
      if (lineGrossProfit < 0) {
        const saleIds = lossMakingSaleIds.get(key) ?? new Set<string>();
        saleIds.add(sale.id);
        lossMakingSaleIds.set(key, saleIds);
        product.lossMakingSales = saleIds.size;
        product.lossOnLossMakingSales += Math.abs(lineGrossProfit);
      }
      productBreakdown.set(key, product);
    }
  }
  for (const payment of customerPayments) for (const allocation of payment.saleAllocations) paymentBreakdown.set(payment.method, (paymentBreakdown.get(payment.method) ?? 0) + Number(allocation.amount));
  const products = [...productBreakdown.values()];
  const report = { period: { from: range.fromDate, to: range.toDate, timezone: business.timezone }, currency: business.currency, salesCount: sales.length, grossSales, discounts, salesReturns, netSales, cashCollected, cogs, grossProfit, grossMargin: netSales > 0 ? grossProfit / netSales : 0, operatingExpenses, gatewayFees, netProfit: grossProfit - operatingExpenses - gatewayFees, byDay: [...dailyBreakdown.values()].sort((a, b) => a.date.localeCompare(b.date)), byChannel: [...channelBreakdown].map(([channel, amount]) => ({ channel, amount })), byPaymentMethod: [...paymentBreakdown].map(([method, amount]) => ({ method, amount })), topProducts: [...products].sort((a, b) => b.revenue - a.revenue).slice(0, 5), lossProducts: products.filter((product) => product.lossMakingSales > 0).sort((a, b) => b.lossOnLossMakingSales - a.lossOnLossMakingSales) };
  if (request.query.format !== undefined && request.query.format !== "json") {
    const metricRows = Object.entries(report).filter(([key]) => !["period", "byDay", "byChannel", "byPaymentMethod", "topProducts", "lossProducts"].includes(key)).map(([metric, value]) => ({ metric, value }));
    const exportRows = [...metricRows, ...report.byDay.map((entry) => ({ metric: `day:${entry.date}:netSales`, value: entry.netSales })), ...report.byDay.map((entry) => ({ metric: `day:${entry.date}:grossProfit`, value: entry.grossProfit })), ...report.byChannel.map((entry) => ({ metric: `channel:${entry.channel}`, value: entry.amount })), ...report.byPaymentMethod.map((entry) => ({ metric: `payment:${entry.method}`, value: entry.amount })), ...report.topProducts.map((entry) => ({ metric: `topProduct:${entry.sku}`, value: { product: entry.product, quantity: entry.quantity, revenue: entry.revenue, grossProfit: entry.grossProfit } })), ...report.lossProducts.map((entry) => ({ metric: `lossProduct:${entry.sku}`, value: { product: entry.product, quantity: entry.quantity, revenue: entry.revenue, costOfGoodsSold: entry.costOfGoodsSold, grossProfit: entry.grossProfit, lossMakingSales: entry.lossMakingSales, lossOnLossMakingSales: entry.lossOnLossMakingSales } }))];
    await respondReportExport(response, request.query.format, exportRows, `weekly-performance-${range.fromDate}-${range.toDate}.csv`, "Weekly performance");
    return;
  }
  else response.json({ data: report });
});

reportsRouter.get("/purchases", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true } });
  const range = parseRange(request.query, business.timezone);
  const receipts = await prisma.goodsReceipt.findMany({ where: { purchaseOrder: { businessId: auth.businessId }, receivedAt: { gte: range.start, lt: range.end }, ...(range.branchId ? { branchId: range.branchId } : {}) }, include: { purchaseOrder: { include: { supplier: { select: { name: true } } } }, lines: { include: { product: { select: { name: true, sku: true } } } } }, orderBy: { receivedAt: "desc" } });
  const data = receipts.flatMap((receipt) => receipt.lines.map((line) => ({ receipt: receipt.reference, date: receipt.receivedAt, supplier: receipt.purchaseOrder.supplier.name, product: line.product.name, sku: line.product.sku, quantity: Number(line.acceptedQuantity), rejected: Number(line.rejectedQuantity), unitCost: Number(line.unitCost), total: Number(line.acceptedQuantity) * Number(line.unitCost) })));
  if (await respondReportExport(response, request.query.format, data, `purchases-${range.fromDate}-${range.toDate}.csv`, "Purchases report")) return;
  else response.json({ data, summary: { acceptedValue: data.reduce((sum, line) => sum + line.total, 0), acceptedUnits: data.reduce((sum, line) => sum + line.quantity, 0), rejectedUnits: data.reduce((sum, line) => sum + line.rejected, 0), supplierPaymentsMade: await sumSupplierPayments(auth.businessId, range.start, range.end) }, period: { from: range.fromDate, to: range.toDate, timezone: business.timezone } });
});

reportsRouter.get("/tax", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true, currency: true } });
  const range = parseRange(request.query, business.timezone);
  if (range.branchId && !await prisma.branch.findFirst({ where: { id: range.branchId, businessId: auth.businessId } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const scope = { businessId: auth.businessId, ...(range.branchId ? { branchId: range.branchId } : {}) };
  const [sales, returns] = await Promise.all([
    prisma.sale.findMany({ where: { ...scope, createdAt: { gte: range.start, lt: range.end }, status: { not: "CANCELLED" } }, select: { number: true, createdAt: true, subtotal: true, discount: true, tax: true } }),
    prisma.saleReturn.findMany({ where: { createdAt: { gte: range.start, lt: range.end }, sale: scope }, include: { sale: { select: { subtotal: true, discount: true, tax: true, total: true } } } }),
  ]);
  const rows = [
    ...sales.map((sale) => ({ date: sale.createdAt, type: "SALE", reference: sale.number, taxableSales: Number(sale.subtotal) - Number(sale.discount), taxCollected: Number(sale.tax), taxReversed: 0 })),
    ...returns.map((entry) => {
      const taxRatio = Number(entry.sale.total) > 0 ? Number(entry.sale.tax) / Number(entry.sale.total) : 0;
      const taxReversed = Number(entry.total) * taxRatio;
      return { date: entry.createdAt, type: "RETURN", reference: entry.reference, taxableSales: -(Number(entry.total) - taxReversed), taxCollected: 0, taxReversed };
    }),
  ].sort((a, b) => a.date.getTime() - b.date.getTime());
  const totals = rows.reduce((sum, row) => ({ taxableSales: sum.taxableSales + row.taxableSales, taxCollected: sum.taxCollected + row.taxCollected, taxReversed: sum.taxReversed + row.taxReversed }), { taxableSales: 0, taxCollected: 0, taxReversed: 0 });
  const summary = { ...totals, netTaxPayable: totals.taxCollected - totals.taxReversed, currency: business.currency };
  if (await respondReportExport(response, request.query.format, rows.map((row) => ({ ...row, date: row.date.toISOString() })), `tax-report-${range.fromDate}-${range.toDate}.csv`, "Tax report")) return;
  else response.json({ data: rows, summary, period: { from: range.fromDate, to: range.toDate, timezone: business.timezone }, basis: "Tax adjustments recorded on sales and proportional tax reversals on returns. Configure jurisdiction-specific rates and filings with your accountant." });
});

async function sumSupplierPayments(businessId: string, from: Date, to: Date) {
  const allocations = await prisma.supplierPaymentAllocation.findMany({ where: { payment: { businessId, status: "SUCCEEDED", paidAt: { gte: from, lt: to } } }, select: { amount: true } });
  return allocations.reduce((sum, allocation) => sum + Number(allocation.amount), 0);
}

reportsRouter.get("/inventory-valuation", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const balances = await prisma.stockBalance.findMany({ where: { branch: { businessId: auth.businessId } }, include: { product: { select: { id: true, name: true, sku: true, category: true, costPrice: true, reorderLevel: true } }, branch: { select: { id: true, name: true } } } });
  const data = balances.map(({ product, branch, onHand, reserved }) => ({ productId: product.id, name: product.name, sku: product.sku, category: product.category, branch: branch.name, onHand: Number(onHand), reserved: Number(reserved), available: Number(onHand) - Number(reserved), unitCost: Number(product.costPrice), inventoryValue: Number(onHand) * Number(product.costPrice), reorderLevel: Number(product.reorderLevel) }));
  if (await respondReportExport(response, request.query.format, data, "inventory-valuation.csv", "Inventory valuation")) return;
  else response.json({ data, totalValue: data.reduce((sum, row) => sum + row.inventoryValue, 0) });
});

reportsRouter.get("/stock-operations", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const filter = z.object({ branchId: z.string().optional() }).safeParse(request.query);
  if (!filter.success) throw new ApiError(400, "Check the stock report filters.", "VALIDATION_ERROR", filter.error.issues);
  const branchId = auth.role === "STAFF" ? auth.branchId : filter.data.branchId;
  if (auth.role === "STAFF" && !branchId) throw new ApiError(403, "Your staff account is not assigned to a branch.", "STAFF_BRANCH_REQUIRED");
  if (filter.data.branchId && auth.role === "STAFF" && filter.data.branchId !== auth.branchId) throw new ApiError(403, "You can only view reports for your assigned branch.", "BRANCH_ACCESS_DENIED");
  if (branchId && !await prisma.branch.findFirst({ where: { id: branchId, businessId: auth.businessId }, select: { id: true } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");
  const branchScope = { businessId: auth.businessId, ...(branchId ? { id: branchId } : {}) };
  const [balances, lots, movements, transfers, counts] = await Promise.all([
    prisma.stockBalance.findMany({ where: { branch: branchScope }, include: { product: { select: { id: true, name: true, sku: true, category: true, unit: true, reorderLevel: true } }, branch: { select: { id: true, name: true } } }, orderBy: [{ branch: { name: "asc" } }, { product: { name: "asc" } }] }),
    prisma.stockLot.findMany({ where: { branch: branchScope, quantity: { gt: 0 } }, include: { product: { select: { name: true, sku: true, unit: true } }, branch: { select: { name: true } } }, orderBy: [{ branch: { name: "asc" } }, { expiresAt: "asc" }], take: 10000 }),
    prisma.stockMovement.findMany({ where: { product: { businessId: auth.businessId }, ...(branchId ? { branchId } : {}) }, include: { product: { select: { name: true, sku: true, unit: true } }, branch: { select: { name: true } }, user: { select: { name: true, email: true } } }, orderBy: { createdAt: "desc" }, take: 5000 }),
    prisma.stockTransfer.findMany({ where: { businessId: auth.businessId, ...(branchId ? { OR: [{ sourceBranchId: branchId }, { destinationBranchId: branchId }] } : {}) }, include: { sourceBranch: { select: { name: true } }, destinationBranch: { select: { name: true } }, createdBy: { select: { name: true, email: true } }, approvedBy: { select: { name: true, email: true } }, receivedBy: { select: { name: true, email: true } }, lines: { include: { product: { select: { name: true, sku: true, unit: true } } } } }, orderBy: { createdAt: "desc" }, take: 2000 }),
    prisma.stockCount.findMany({ where: { businessId: auth.businessId, ...(branchId ? { branchId } : {}) }, include: { branch: { select: { name: true } }, createdBy: { select: { name: true, email: true } }, approvedBy: { select: { name: true, email: true } }, postedBy: { select: { name: true, email: true } }, lines: { include: { product: { select: { name: true, sku: true, unit: true } } } } }, orderBy: { createdAt: "desc" }, take: 2000 }),
  ]);
  const now = new Date();
  const sellableLots = new Map<string, number>();
  for (const lot of lots) {
    if (lot.condition !== "GOOD" || (lot.expiresAt && lot.expiresAt <= now)) continue;
    const key = `${lot.productId}:${lot.branchId}`;
    sellableLots.set(key, (sellableLots.get(key) ?? 0) + Math.max(0, Number(lot.quantity) - Number(lot.reserved)));
  }
  const stockRows = balances.map((balance) => {
    const available = sellableLots.get(`${balance.productId}:${balance.branchId}`) ?? 0;
    const reorderLevel = Number(balance.product.reorderLevel);
    return { section: "Stock by branch", branch: balance.branch.name, product: balance.product.name, sku: balance.product.sku, category: balance.product.category, unit: balance.product.unit, onHand: Number(balance.onHand), reserved: Number(balance.reserved), available, reorderLevel, stockStatus: available <= 0 ? "out of stock" : reorderLevel > 0 && available <= reorderLevel ? "low stock" : "in stock", updatedAt: balance.updatedAt.toISOString() };
  });
  const rows: Record<string, unknown>[] = [
    ...stockRows,
    ...movements.map((movement) => ({ section: "Stock movement", branch: movement.branch.name, product: movement.product.name, sku: movement.product.sku, unit: movement.product.unit, changeType: movement.type, quantity: Number(movement.quantity), reference: movement.reference, reason: movement.reason, recordedBy: movement.user?.name, recordedByEmail: movement.user?.email, date: movement.createdAt.toISOString() })),
    ...transfers.flatMap((transfer) => transfer.lines.map((line) => ({ section: "Branch transfer", reference: transfer.reference, status: transfer.status, fromBranch: transfer.sourceBranch.name, toBranch: transfer.destinationBranch.name, product: line.product.name, sku: line.product.sku, unit: line.product.unit, sent: Number(line.quantity), arrived: line.receivedQuantity === null ? null : Number(line.receivedQuantity), difference: line.receivedQuantity === null ? null : Number(line.receivedQuantity) - Number(line.quantity), reason: line.discrepancyReason, startedBy: transfer.createdBy.name, approvedBy: transfer.approvedBy?.name, receivedBy: transfer.receivedBy?.name, date: transfer.createdAt.toISOString() }))),
    ...counts.flatMap((count) => count.lines.map((line) => ({ section: "Stock count", reference: count.reference, status: count.status, branch: count.branch.name, product: line.product.name, sku: line.product.sku, unit: line.product.unit, systemQuantity: Number(line.systemQuantity), physicalQuantity: Number(line.countedQuantity), difference: Number(line.variance), reason: count.reason, countedBy: count.createdBy.name, approvedBy: count.approvedBy?.name, postedBy: count.postedBy?.name, date: count.createdAt.toISOString() }))),
    ...lots.filter((lot) => lot.condition !== "GOOD" || (lot.expiresAt && lot.expiresAt <= now)).map((lot) => ({ section: "Damaged or quarantined batch", branch: lot.branch.name, product: lot.product.name, sku: lot.product.sku, batch: lot.batchNumber, unit: lot.product.unit, quantity: Number(lot.quantity), reserved: Number(lot.reserved), condition: lot.expiresAt && lot.expiresAt <= now ? "EXPIRED" : lot.condition, expiryDate: lot.expiresAt?.toISOString() ?? null, origin: lot.origin })),
    ...lots.map((lot) => ({ section: "Batch", branch: lot.branch.name, product: lot.product.name, sku: lot.product.sku, batch: lot.batchNumber, unit: lot.product.unit, quantity: Number(lot.quantity), reserved: Number(lot.reserved), condition: lot.expiresAt && lot.expiresAt <= now ? "EXPIRED" : lot.condition, expiryDate: lot.expiresAt?.toISOString() ?? null, origin: lot.origin })),
  ];
  const summary = { productBranchBalances: stockRows.length, lowStockItems: stockRows.filter((row) => row.stockStatus === "low stock").length, outOfStockItems: stockRows.filter((row) => row.stockStatus === "out of stock").length, movements: movements.length, transfers: transfers.length, transferDifferences: transfers.flatMap((transfer) => transfer.lines).filter((line) => line.receivedQuantity !== null && !line.receivedQuantity.equals(line.quantity)).length, countDifferences: counts.flatMap((count) => count.lines).filter((line) => !line.variance.isZero()).length, damagedOrQuarantinedBatches: lots.filter((lot) => lot.condition !== "GOOD" || (lot.expiresAt && lot.expiresAt <= now)).length, batches: lots.length };
  if (await respondReportExport(response, request.query.format, rows, "stock-operations.csv", "Stock operations")) return;
  response.json({ data: rows, summary, branchId: branchId ?? null });
});

reportsRouter.get("/receivables-aging", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const sales = await prisma.sale.findMany({ where: { businessId: auth.businessId, customerId: { not: null }, status: { not: "CANCELLED" } }, include: { payments: { include: { payment: { select: { status: true } } } }, returns: { select: { total: true } }, customer: { select: { name: true } } } });
  const now = Date.now();
  const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
  const rows = sales.map((sale) => {
    const paid = sale.payments.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const credits = sale.returns.reduce((sum, entry) => sum + Number(entry.total), 0);
    const balance = Math.max(0, Number(sale.total) - paid - credits);
    if (balance <= 0) return null;
    const days = sale.dueAt ? Math.max(0, Math.floor((now - sale.dueAt.getTime()) / 86_400_000)) : 0;
    const bucket = days === 0 ? "current" : days <= 30 ? "days1to30" : days <= 60 ? "days31to60" : days <= 90 ? "days61to90" : "over90";
    buckets[bucket] += balance;
    return { saleId: sale.id, number: sale.number, customer: sale.customer?.name, dueAt: sale.dueAt, daysOverdue: days, outstanding: balance, bucket };
  }).filter(Boolean);
  if (await respondReportExport(response, request.query.format, rows.filter((row): row is NonNullable<typeof row> => row !== null), "receivables-aging.csv", "Receivables aging")) return;
  else response.json({ data: rows, buckets, totalOutstanding: Object.values(buckets).reduce((sum, amount) => sum + amount, 0) });
});

reportsRouter.get("/payables-aging", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const invoices = await prisma.supplierInvoice.findMany({ where: { businessId: auth.businessId }, include: { supplier: { select: { name: true } }, allocations: { include: { payment: { select: { status: true } } } }, returns: { select: { creditAmount: true } } } });
  const now = Date.now();
  const buckets = { current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
  const rows = invoices.map((invoice) => {
    const paid = invoice.allocations.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const credited = invoice.returns.reduce((sum, entry) => sum + Number(entry.creditAmount), 0);
    const balance = Math.max(0, Number(invoice.totalAmount) - paid - credited);
    if (balance <= 0) return null;
    const days = invoice.dueAt ? Math.max(0, Math.floor((now - invoice.dueAt.getTime()) / 86_400_000)) : 0;
    const bucket = days === 0 ? "current" : days <= 30 ? "days1to30" : days <= 60 ? "days31to60" : days <= 90 ? "days61to90" : "over90";
    buckets[bucket] += balance;
    return { invoiceId: invoice.id, invoiceNumber: invoice.invoiceNumber, supplier: invoice.supplier.name, dueAt: invoice.dueAt, daysOverdue: days, outstanding: balance, bucket };
  }).filter(Boolean);
  if (await respondReportExport(response, request.query.format, rows.filter((row): row is NonNullable<typeof row> => row !== null), "payables-aging.csv", "Payables aging")) return;
  else response.json({ data: rows, buckets, totalOutstanding: Object.values(buckets).reduce((sum, amount) => sum + amount, 0) });
});

reportsRouter.get("/customer-payments", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true, currency: true } });
  const range = parseRange(request.query, business.timezone);
  if (range.branchId && !await prisma.branch.findFirst({ where: { id: range.branchId, businessId: auth.businessId } })) throw new ApiError(404, "Branch not found.", "BRANCH_NOT_FOUND");

  const payments = await prisma.payment.findMany({
    where: {
      businessId: auth.businessId,
      status: "SUCCEEDED",
      paidAt: { gte: range.start, lt: range.end },
      saleAllocations: { some: { sale: { businessId: auth.businessId, ...(range.branchId ? { branchId: range.branchId } : {}) } } },
    },
    include: {
      saleAllocations: {
        where: { sale: { businessId: auth.businessId, ...(range.branchId ? { branchId: range.branchId } : {}) } },
        include: { sale: { include: { customer: { select: { name: true } }, branch: { select: { name: true } } } } },
      },
    },
    orderBy: { paidAt: "desc" },
  });

  const rows = payments.flatMap((payment) => payment.saleAllocations.map((allocation) => ({
    date: payment.paidAt?.toISOString() ?? "",
    customer: allocation.sale.customer?.name ?? "Walk-in customer",
    sale: allocation.sale.number,
    branch: allocation.sale.branch.name,
    method: payment.method,
    reference: payment.reference,
    amount: Number(allocation.amount),
  })));
  const totalReceived = rows.reduce((sum, row) => sum + row.amount, 0);
  if (await respondReportExport(response, request.query.format, rows, `customer-payments-${range.fromDate}-${range.toDate}.csv`, "Customer payments")) return;
  response.json({ data: rows, summary: { paymentCount: payments.length, allocationCount: rows.length, totalReceived, currency: business.currency }, period: { from: range.fromDate, to: range.toDate, timezone: business.timezone } });
});

reportsRouter.get("/supplier-balances", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { currency: true } });
  const invoices = await prisma.supplierInvoice.findMany({
    where: { businessId: auth.businessId },
    include: { supplier: { select: { id: true, name: true } }, allocations: { include: { payment: { select: { status: true } } } }, returns: { select: { creditAmount: true } } },
  });
  const now = Date.now();
  const suppliers = new Map<string, { supplier: string; invoiceCount: number; totalBilled: number; totalPaid: number; credits: number; outstanding: number; current: number; days1to30: number; days31to60: number; days61to90: number; over90: number }>();

  for (const invoice of invoices) {
    const paid = invoice.allocations.filter((entry) => entry.payment.status === "SUCCEEDED").reduce((sum, entry) => sum + Number(entry.amount), 0);
    const credits = invoice.returns.reduce((sum, entry) => sum + Number(entry.creditAmount), 0);
    const billed = Number(invoice.totalAmount);
    const outstanding = Math.max(0, billed - paid - credits);
    const row = suppliers.get(invoice.supplierId) ?? { supplier: invoice.supplier.name, invoiceCount: 0, totalBilled: 0, totalPaid: 0, credits: 0, outstanding: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 };
    row.totalBilled += billed;
    row.totalPaid += paid;
    row.credits += credits;
    row.outstanding += outstanding;
    if (outstanding > 0) {
      row.invoiceCount += 1;
      const days = invoice.dueAt ? Math.max(0, Math.floor((now - invoice.dueAt.getTime()) / 86_400_000)) : 0;
      const bucket = days === 0 ? "current" : days <= 30 ? "days1to30" : days <= 60 ? "days31to60" : days <= 90 ? "days61to90" : "over90";
      row[bucket] += outstanding;
    }
    suppliers.set(invoice.supplierId, row);
  }

  const data = [...suppliers.values()].sort((a, b) => b.outstanding - a.outstanding);
  const summary = data.reduce((totals, row) => ({
    supplierCount: totals.supplierCount + Number(row.outstanding > 0),
    totalBilled: totals.totalBilled + row.totalBilled,
    totalPaid: totals.totalPaid + row.totalPaid,
    credits: totals.credits + row.credits,
    totalOutstanding: totals.totalOutstanding + row.outstanding,
    current: totals.current + row.current,
    days1to30: totals.days1to30 + row.days1to30,
    days31to60: totals.days31to60 + row.days31to60,
    days61to90: totals.days61to90 + row.days61to90,
    over90: totals.over90 + row.over90,
  }), { supplierCount: 0, totalBilled: 0, totalPaid: 0, credits: 0, totalOutstanding: 0, current: 0, days1to30: 0, days31to60: 0, days61to90: 0, over90: 0 });

  if (await respondReportExport(response, request.query.format, data, "supplier-balances.csv", "Supplier balances")) return;
  response.json({ data, summary: { ...summary, currency: business.currency } });
});

reportsRouter.get("/purchase-cohort", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true } });
  const range = parseRange(request.query, business.timezone);
  const receipts = await prisma.goodsReceiptLine.findMany({ where: { goodsReceipt: { purchaseOrder: { businessId: auth.businessId }, receivedAt: { gte: range.start, lt: range.end } } }, include: { product: { select: { id: true, name: true, sku: true, costPrice: true } }, goodsReceipt: { select: { reference: true, receivedAt: true } } } });
  const byProduct = new Map<string, { product: string; sku: string; received: number; receiptValue: number; unitCost: number }>();
  for (const line of receipts) {
    const entry = byProduct.get(line.productId) ?? { product: line.product.name, sku: line.product.sku, received: 0, receiptValue: 0, unitCost: 0 };
    entry.received += Number(line.acceptedQuantity);
    entry.receiptValue += Number(line.acceptedQuantity) * Number(line.unitCost);
    entry.unitCost = entry.received > 0 ? entry.receiptValue / entry.received : 0;
    byProduct.set(line.productId, entry);
  }
  const rows = [];
  for (const [productId, cohort] of byProduct) {
    const sold = await prisma.saleLine.aggregate({ where: { productId, sale: { businessId: auth.businessId, createdAt: { gte: range.start, lt: range.end }, status: { not: "CANCELLED" } } }, _sum: { quantity: true, lineTotal: true } });
    const quantitySold = Number(sold._sum.quantity ?? 0);
    const revenue = Number(sold._sum.lineTotal ?? 0);
    const currentBalance = await prisma.stockBalance.aggregate({ where: { productId, branch: { businessId: auth.businessId } }, _sum: { onHand: true } });
    const remaining = Math.min(cohort.received, Number(currentBalance._sum.onHand ?? 0));
    const costOfSold = Math.max(0, cohort.receiptValue - remaining * cohort.unitCost);
    rows.push({ productId, ...cohort, quantitySold, attributableRevenue: revenue, costOfSold, grossProfit: revenue - costOfSold, remainingQuantityEstimate: remaining, remainingValueEstimate: remaining * cohort.unitCost });
  }
  if (await respondReportExport(response, request.query.format, rows, `purchase-cohort-${range.fromDate}-${range.toDate}.csv`, "Purchase cohort")) return;
  else response.json({ data: rows, period: { from: range.fromDate, to: range.toDate, timezone: business.timezone }, costingMethod: "WEIGHTED_AVERAGE_ESTIMATE", note: "Product sales during the receipt window are attributed using weighted-average cost. Physical units from a specific receipt cannot be identified by this costing method." });
});

reportsRouter.get("/profit-loss", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true, currency: true } });
  const range = parseRange(request.query, business.timezone);
  const lines = await prisma.journalLine.groupBy({ by: ["accountId"], where: { journalEntry: { businessId: auth.businessId, status: "POSTED", postingDate: { gte: range.start, lt: range.end } } }, _sum: { debit: true, credit: true } });
  const accounts = await prisma.account.findMany({ where: { businessId: auth.businessId, id: { in: lines.map((line) => line.accountId) } }, orderBy: { code: "asc" } });
  const byId = new Map(lines.map((line) => [line.accountId, line]));
  const data = accounts.map((account) => {
    const line = byId.get(account.id)!;
    const debit = Number(line._sum.debit ?? 0);
    const credit = Number(line._sum.credit ?? 0);
    const balance = account.type === "CONTRA_REVENUE" || account.type === "EXPENSE" ? debit - credit : credit - debit;
    return { code: account.code, account: account.name, type: account.type, amount: balance };
  }).filter((line) => line.amount !== 0);
  const revenue = data.filter((line) => line.type === "REVENUE").reduce((sum, line) => sum + line.amount, 0);
  const contraRevenue = data.filter((line) => line.type === "CONTRA_REVENUE").reduce((sum, line) => sum + line.amount, 0);
  const costOfGoodsSold = data.filter((line) => line.code === "5000").reduce((sum, line) => sum + line.amount, 0);
  const grossProfit = revenue - contraRevenue - costOfGoodsSold;
  const expenses = data.filter((line) => line.type === "EXPENSE" && line.code !== "5000").reduce((sum, line) => sum + line.amount, 0);
  const otherIncome = data.filter((line) => line.type === "OTHER_INCOME").reduce((sum, line) => sum + line.amount, 0);
  const summary = { revenue, contraRevenue, netSales: revenue - contraRevenue, costOfGoodsSold, grossProfit, expenses, otherIncome, netProfit: grossProfit - expenses + otherIncome, currency: business.currency };
  if (await respondReportExport(response, request.query.format, data, `profit-loss-${range.fromDate}-${range.toDate}.csv`, "Profit and loss")) return;
  else response.json({ data, summary, period: { from: range.fromDate, to: range.toDate, timezone: business.timezone } });
});

reportsRouter.get("/expenses", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true, currency: true } });
  const range = parseRange(request.query, business.timezone);
  const expenses = await prisma.expense.findMany({
    where: {
      businessId: auth.businessId,
      incurredAt: { gte: range.start, lt: range.end },
      ...(range.branchId ? { branchId: range.branchId } : {}),
    },
    include: {
      payment: { select: { method: true, reference: true, status: true } },
      branch: { select: { name: true } },
      user: { select: { name: true } },
    },
    orderBy: [{ incurredAt: "desc" }, { id: "desc" }],
  });
  const data = expenses.map((expense) => ({
    incurredAt: expense.incurredAt.toISOString().slice(0, 10),
    category: expense.category,
    description: expense.description,
    amount: Number(expense.amount),
    paymentMethod: expense.payment?.method ?? "Unspecified",
    paymentStatus: expense.payment?.status ?? "Unspecified",
    reference: expense.payment?.reference ?? "—",
    branch: expense.branch?.name ?? "Business-wide",
    recordedBy: expense.user.name,
  }));
  const byCategory = [...expenses.reduce((totals, expense) => {
    const category = expense.category;
    totals.set(category, (totals.get(category) ?? 0) + Number(expense.amount));
    return totals;
  }, new Map<string, number>())]
    .map(([category, amount]) => ({ category, amount }))
    .sort((left, right) => right.amount - left.amount);
  const totalExpenses = expenses.reduce((total, expense) => total + Number(expense.amount), 0);
  const staffPayments = expenses
    .filter((expense) => expense.category.trim().toLowerCase() === "staff payment")
    .reduce((total, expense) => total + Number(expense.amount), 0);
  const summary = { totalExpenses, expenseCount: expenses.length, staffPayments, byCategory, currency: business.currency };
  if (await respondReportExport(response, request.query.format, data, `expenses-${range.fromDate}-${range.toDate}.csv`, "Expenses")) return;
  response.json({ data, summary, period: { from: range.fromDate, to: range.toDate, timezone: business.timezone } });
});

reportsRouter.get("/balance-sheet", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true, currency: true } });
  const parsed = z.object({ asOf: z.iso.date().optional() }).safeParse(request.query);
  if (!parsed.success) throw new ApiError(400, "Use YYYY-MM-DD for the balance sheet date.", "INVALID_DATE", parsed.error.issues);
  const asOfDate = parsed.data.asOf ?? new Intl.DateTimeFormat("en-CA", { timeZone: business.timezone }).format(new Date());
  const through = new Date(zonedMidnight(asOfDate, business.timezone).getTime() + 86_400_000);
  const lines = await prisma.journalLine.groupBy({ by: ["accountId"], where: { journalEntry: { businessId: auth.businessId, status: "POSTED", postingDate: { lt: through } } }, _sum: { debit: true, credit: true } });
  const accounts = await prisma.account.findMany({ where: { businessId: auth.businessId, id: { in: lines.map((line) => line.accountId) } }, orderBy: { code: "asc" } });
  const byId = new Map(lines.map((line) => [line.accountId, line]));
  const accountLines = accounts.map((account) => {
    const line = byId.get(account.id)!;
    const debit = Number(line._sum.debit ?? 0);
    const credit = Number(line._sum.credit ?? 0);
    return { code: account.code, account: account.name, type: account.type, debit, credit, balance: account.type === "ASSET" ? debit - credit : credit - debit };
  });
  const data = accountLines.filter((account) => ["ASSET", "LIABILITY", "EQUITY"].includes(account.type) && account.balance !== 0).map(({ code, account, type, balance }) => ({ code, account, type, balance }));
  const assets = data.filter((line) => line.type === "ASSET").reduce((sum, line) => sum + line.balance, 0);
  const liabilities = data.filter((line) => line.type === "LIABILITY").reduce((sum, line) => sum + line.balance, 0);
  const equity = data.filter((line) => line.type === "EQUITY").reduce((sum, line) => sum + line.balance, 0);
  const currentEarnings = accountLines.reduce((sum, line) => sum + (line.type === "REVENUE" || line.type === "OTHER_INCOME" ? line.credit - line.debit : line.type === "CONTRA_REVENUE" || line.type === "EXPENSE" ? line.debit - line.credit : 0), 0);
  if (await respondReportExport(response, request.query.format, data, `balance-sheet-${asOfDate}.csv`, "Balance sheet")) return;
  else response.json({ data, summary: { assets, liabilities, equity, currentEarnings, totalEquity: equity + currentEarnings, liabilitiesAndEquity: liabilities + equity + currentEarnings, outOfBalance: assets - liabilities - equity - currentEarnings, currency: business.currency }, asOf: asOfDate });
});

function classifyCashFlowAccount(account: { code: string; type: string; name: string }) {
  const code = Number(account.code);
  const normalizedName = account.name.toLocaleLowerCase("en-US");
  // Working-capital accounts and the standard operating chart remain operating activities.
  if (["REVENUE", "CONTRA_REVENUE", "OTHER_INCOME", "EXPENSE"].includes(account.type) || (code >= 1100 && code <= 1299) || (code >= 2000 && code <= 2299)) return "OPERATING";
  if ((code >= 1300 && code <= 1999) || /property|plant|equipment|fixed asset|long.term investment/.test(normalizedName)) return "INVESTING";
  if (account.type === "EQUITY" || (account.type === "LIABILITY" && code >= 2300) || (code >= 3000 && code <= 3999)) return "FINANCING";
  return "UNCLASSIFIED";
}

reportsRouter.get("/cash-flow", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true, currency: true } });
  const range = parseRange(request.query, business.timezone);
  if (range.branchId) throw new ApiError(400, "Cash-flow classification is business-wide because journal entries are not branch-dimensioned.", "BRANCH_FILTER_UNAVAILABLE");
  const entries = await prisma.journalEntry.findMany({
    where: { businessId: auth.businessId, status: "POSTED", postingDate: { gte: range.start, lt: range.end } },
    select: { id: true, lines: { select: { debit: true, credit: true, account: { select: { code: true, name: true, type: true } } } } },
    orderBy: [{ postingDate: "asc" }, { id: "asc" }],
  });
  const cashCodes = new Set(["1000", "1010", "1020"]);
  const isCashAccount = (account: { code: string; type: string; name: string }) => cashCodes.has(account.code) || (account.type === "ASSET" && /\b(cash|bank|payment gateway clearing)\b/i.test(account.name));
  const classified = new Map<string, { category: string; code: string; account: string; inflows: number; outflows: number; net: number }>();
  let cashChange = 0;
  for (const entry of entries) {
    const cashLines = entry.lines.filter((entryLine) => isCashAccount(entryLine.account));
    if (!cashLines.length) continue;
    const entryCashChange = cashLines.reduce((sum, cashLine) => sum + Number(cashLine.debit) - Number(cashLine.credit), 0);
    cashChange += entryCashChange;
    if (Math.abs(entryCashChange) < 0.005) continue; // Transfers between cash-equivalent accounts are not cash flows.
    const counterpartLines = entry.lines.filter((entryLine) => !isCashAccount(entryLine.account));
    for (const counterpart of counterpartLines) {
      // In a balanced journal, the signed counterpart amount (credit minus debit) reconciles to the cash movement.
      const amount = Number(counterpart.credit) - Number(counterpart.debit);
      if (Math.abs(amount) < 0.005) continue;
      const category = classifyCashFlowAccount(counterpart.account);
      const key = `${category}:${counterpart.account.code}`;
      const item = classified.get(key) ?? { category, code: counterpart.account.code, account: counterpart.account.name, inflows: 0, outflows: 0, net: 0 };
      item.net += amount;
      if (amount > 0) item.inflows += amount;
      else item.outflows += Math.abs(amount);
      classified.set(key, item);
    }
  }
  const data = [...classified.values()].sort((a, b) => a.category.localeCompare(b.category) || a.code.localeCompare(b.code));
  const summary = {
    operating: data.filter((row) => row.category === "OPERATING").reduce((sum, row) => sum + row.net, 0),
    investing: data.filter((row) => row.category === "INVESTING").reduce((sum, row) => sum + row.net, 0),
    financing: data.filter((row) => row.category === "FINANCING").reduce((sum, row) => sum + row.net, 0),
    unclassified: data.filter((row) => row.category === "UNCLASSIFIED").reduce((sum, row) => sum + row.net, 0),
    netCashChange: cashChange,
    currency: business.currency,
  };
  const reconciliationDifference = cashChange - summary.operating - summary.investing - summary.financing - summary.unclassified;
  if (await respondReportExport(response, request.query.format, data, `cash-flow-${range.fromDate}-${range.toDate}.csv`, "Cash flow")) return;
  else response.json({ data, summary, reconciliationDifference, period: { from: range.fromDate, to: range.toDate, timezone: business.timezone }, basis: "Direct cash movements from posted journal entries in cash-on-hand, bank, and gateway-clearing accounts (1000, 1010, 1020). Investing and financing groups use account codes/types; review UNCLASSIFIED accounts and reconciliationDifference before relying on the report." });
});

reportsRouter.get("/cash-reconciliation", async (request, response) => {
  const auth = response.locals.auth as AuthContext;
  const business = await prisma.business.findUniqueOrThrow({ where: { id: auth.businessId }, select: { timezone: true, currency: true } });
  const range = parseRange(request.query, business.timezone);
  const shifts = await prisma.cashShift.findMany({ where: { businessId: auth.businessId, closedAt: { gte: range.start, lt: range.end }, ...(range.branchId ? { branchId: range.branchId } : {}) }, include: { user: { select: { name: true } }, branch: { select: { name: true } } }, orderBy: { closedAt: "desc" } });
  const successful = await prisma.payment.findMany({ where: { businessId: auth.businessId, provider: "PAYSTACK", status: "SUCCEEDED", settlementLines: { none: {} }, ...(range.branchId ? { onlineOrder: { branchId: range.branchId } } : {}) }, select: { id: true, reference: true, providerReference: true, amount: true, paidAt: true } });
  const data = shifts.map((shift) => ({ shiftId: shift.id, cashier: shift.user.name, branch: shift.branch.name, openedAt: shift.openedAt, closedAt: shift.closedAt, openingCash: Number(shift.openingCash), expectedCash: Number(shift.expectedClosingCash ?? 0), countedCash: Number(shift.closingCash ?? 0), variance: Number(shift.closingCash ?? 0) - Number(shift.expectedClosingCash ?? 0) }));
  const unsettledGatewayPayments = successful.map((payment) => ({ ...payment, amount: Number(payment.amount) }));
  const exportRows = [
    ...data.map((row) => ({ recordType: "CASH_SHIFT", ...row })),
    ...unsettledGatewayPayments.map((payment) => ({ recordType: "UNSETTLED_GATEWAY_PAYMENT", ...payment })),
  ];
  if (await respondReportExport(response, request.query.format, exportRows, `cash-reconciliation-${range.fromDate}-${range.toDate}.csv`, "Cash reconciliation")) return;
  response.json({ data, unsettledGatewayPayments, summary: { shiftsClosed: data.length, totalVariance: data.reduce((sum, shift) => sum + shift.variance, 0), unsettledGatewayAmount: successful.reduce((sum, payment) => sum + Number(payment.amount), 0), currency: business.currency }, period: { from: range.fromDate, to: range.toDate, timezone: business.timezone } });
});
