# OceanicToolsMonger Frontend

Next.js 16 admin application for the OceanicToolsMonger API.

## Local development

1. Copy `.env.example` to `.env.local`. Set `NEXT_PUBLIC_API_URL` to the API origin plus `/api/v1` (for example, `http://localhost:4000/api/v1`). This value is public configuration, never a secret.
2. Start the API and worker from `../backend` as described in the backend README. Set its `FRONTEND_ORIGIN` to `http://localhost:3000`.
3. Run `npm install`, then `npm run dev` from this directory and open `http://localhost:3000`.
4. Sign in with the owner or staff account created by the backend seed/admin workflow. The frontend sends requests with credentials and relies on the API's secure, HttpOnly session cookie.

## Dashboard data

The dashboard reads business, branch, report, inventory summary, activity, purchase, online-order, and notification data from the API. Financial views are requested only for roles authorized by the backend. Date filters use the business timezone. Failed sections show an error state instead of a fabricated zero.

The dashboard visual language takes cues from the `skipdq` admin shell while using OceanicToolsMonger colors and business workflows. `skipdq` itself remains a separate reference project.

## Admin workspaces

- `/products`: business-scoped search, category and stock filters, draft product creation, activate/deactivate, and Cloudinary image upload/replacement/removal.
- `/inventory`: branch balances, movement history, FEFO lot visibility, stock adjustments, inter-branch transfers, and stock-count submit/approve/post actions.
- `/purchasing`: receive goods from existing or new suppliers, record invoices, due dates and payments, and manage purchase-order approvals and receipts.
- `/sales`: branch stock-aware POS, cashier shift open/close and variance display, recent sales, item returns, and owner refund approval.
- `/finance`: profit and loss, balance sheet, supplier payables/payments, expenses, journal drafts and posting. Financial requests are available only to owner, accountant, and auditor roles; write actions are limited to owner and accountant.
- `/expenses`: owner-only manual expense and staff payment recording, with payment references, branch/date tracking, ledger posting, and searchable history. This does not calculate payroll or deductions.
- `/reports`: includes an expenses report with date and branch filters, category and staff-payment totals, transaction details, and CSV/XLSX/PDF export. Profit and loss continues to include posted expense ledger entries in its expense total.
- `/settings`: owner-only business details, branches, staff invitations, role changes, and account deactivation.

- `/orders`: business-scoped online-order queue with branch, status, and customer filters, payment and line-item details, and role-limited fulfillment transitions. The API returns the latest 200 orders per request.
- `/customers`: business-scoped customer directory with search, account edits, statements, consent-aware reminders, and allocated payment recording. The API returns up to 200 customers and statements include the latest 100 sales.

These pages use the API as the authority for permissions, stock checks, pricing, posting, and workflow transitions. The purchase-order composer creates one product line per order for now; receive actions collect one outstanding line at a time. The POS records a single full payment method per transaction. More advanced multi-line order entry and split tender can be added without changing backend contracts.
