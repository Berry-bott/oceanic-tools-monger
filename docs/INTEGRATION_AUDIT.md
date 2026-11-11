# Oceanic Tools Monger — Platform Integration & Technical Audit

> **Date:** November 9, 2026  
> **Brand:** Oceanic Tools Monger (`OceanicToolsMonger Ltd`)  
> **Target Production URLs:**  
> - Frontend: `http://localhost:3000` (Dev) / Production Domain  
> - Backend API: `http://localhost:4000/api/v1` (Dev) / Production Domain  

---

## Executive Summary

The **Oceanic Tools Monger** platform features an online e-commerce storefront paired with an ERP backoffice (inventory, orders, finance, procurement, and staff management).

While the storefront layout, branding, typography (`Playfair Display` + `Jost`), design system (Peach/Cream palette), and core catalog views are fully functional and compile with **0 errors**, several third-party services, environment credentials, and client-server workflows remain disconnected or operate on mock fallbacks.

This document details every pending connection, its current state, and the exact steps required to make it production-ready.

---

## 1. Payment Gateway & Webhooks (Paystack)

### Current State
- The backend features a payment workflow in [`backend/src/routes/store.ts`](../backend/src/routes/store.ts) with serializable stock lot reservations (FEFO), order creation, and Paystack transaction initialization.
- In [`backend/.env`](../backend/.env), the secret key is currently set to:
  ```env
  PAYSTACK_SECRET_KEY=sk_test_replace_me
  ```
- Because this key is a placeholder, any checkout attempt catches the API failure and falls back to a simulated order confirmation reference (`ORD-...`).

### Required Actions
1. **Supply Real Paystack Keys**:
   - Replace `PAYSTACK_SECRET_KEY` in `backend/.env` with your actual test secret key (`sk_test_...`) or live secret key (`sk_live_...`).
2. **Configure Webhook in Paystack Dashboard**:
   - Set the Webhook URL in Paystack Settings to:
     ```
     https://<your-api-domain>/api/v1/store/webhook/paystack
     ```
   - Store the Paystack webhook signature secret in `backend/.env` to secure automated payment confirmations.

---

## 2. Customer Accounts & Shopper Portal

### Current State
- **Backend**: A customer authentication router exists at [`backend/src/routes/customer-account.ts`](../backend/src/routes/customer-account.ts) with Argon2 password hashing, secure cookie sessions, and email verification tokens.
- **Frontend**: The storefront has **no customer login or registration interface**. The `Account` icon in the navbar currently points directly to the staff and admin login ([`/oceanicadminlogin`](../frontend/src/app/oceanicadminlogin/page.tsx)).
- Customers currently checkout exclusively via guest checkout.

### Required Actions
1. **Build Shopper Auth UI**:
   - Create customer login and sign-up modals or dedicated pages (`/customer/login`, `/customer/register`).
   - Wire customer sign-in directly to `POST /api/v1/customer-account/login` and `POST /api/v1/customer-account/register`.
2. **Customer Dashboard**:
   - Add a customer profile page displaying order history, delivery addresses, and saved equipment.

---

## 3. Wishlist State & Synchronization

### Current State
- [`frontend/src/app/wishlist/page.tsx`](../frontend/src/app/wishlist/page.tsx) uses a static slice (`useState(TOOLS_PRODUCTS.slice(0, 4))`).
- Product cards throughout the store display heart icons, but clicking them does not update a global state or persist saved items.

### Required Actions
1. **Implement Zustand Wishlist Store**:
   - Create `useWishlistStore` with `zustand/middleware/persist` saving to `localStorage` (similar to `useStoreCart`).
2. **Wire Product Card Action**:
   - Connect the heart toggle button on [`StoreProductCard`](../frontend/src/components/storefront/store-product-card.tsx) to add/remove items from the wishlist store.
3. **Connect Wishlist Page**:
   - Update `/wishlist` to read dynamically from `useWishlistStore`.

---

## 4. Live Order Tracking API

### Current State
- [`frontend/src/app/track-order/page.tsx`](../frontend/src/app/track-order/page.tsx) accepts an order number or waybill, but displays a hardcoded 5-step mock timeline regardless of the input.

### Required Actions
1. **Expose Public Order Lookup Endpoint**:
   - Create `GET /api/v1/store/orders/:orderNumber/track` in `backend/src/routes/store.ts`.
   - Query the `OnlineOrder` table by `number` to return the real-time status:
     - `PENDING_PAYMENT`
     - `PAID`
     - `PROCESSING`
     - `DISPATCHED` (with carrier & waybill details)
     - `DELIVERED` / `COLLECTED`
2. **Connect Tracking Page**:
   - Fetch live order data in `TrackOrderPage` and dynamically highlight the current logistics step.

---

## 5. Automated SMS & Transactional Email

### Current State
- The backend configuration contains placeholders for email and SMS gateways:
  ```env
  RESEND_API_KEY=re_replace_me
  REMINDER_FROM_EMAIL=Oceanic Tools <billing@example.com>
  TERMII_API_KEY=replace_me
  TERMII_SENDER_ID=Oceanic
  ```

### Required Actions
1. **Resend (Email)**:
   - Provide a valid Resend API key (`re_...`).
   - Verify your custom domain (e.g. `orders@oceanictoolsmonger.com`) to send automated order confirmations and invoices.
2. **Termii (SMS)**:
   - Provide a valid Termii API key and registered Nigerian Sender ID (`Oceanic`).
   - Triggers dispatch alerts and arrival SMS notifications to customer mobile numbers.

---

## 6. Admin Inventory vs Storefront Database Sync

### Current State
- [`StorePageClient`](../frontend/src/components/storefront/store-page-client.tsx) queries `GET /api/v1/store/products`.
- If the PostgreSQL database has zero products or the backend is offline, the UI falls back seamlessly to [`frontend/src/data/tools-catalog.ts`](../frontend/src/data/tools-catalog.ts).

### Required Actions
1. **Publish Initial Database Inventory**:
   - Ensure products added or imported via the Admin portal (`/admin/products/new` or `/admin/products/import`) are marked `isPublished: true`.
   - Verify stock balances are assigned to the default branch so the storefront API flags them as available for purchase.

---

## 7. Interactive Reviews & Verified Ratings

### Current State
- Reviews on product detail pages ([`frontend/src/app/product/[sku]/page.tsx`](../frontend/src/app/product/[sku]/page.tsx)) are static testimonials from the local catalog.

### Required Actions
1. **Schema & API**:
   - Add a `ProductReview` model in Prisma linking verified buyer orders to product ratings (1-5 stars) and review text.
2. **Review Form UI**:
   - Add a "Write a Review" button and modal on product pages for confirmed purchasers.

---

## 8. Footer Links, Policies & Newsletter

### Current State
- Footer links in [`frontend/src/components/storefront/store-footer.tsx`](../frontend/src/components/storefront/store-footer.tsx) point to `#` placeholders:
  - *About Us*, *Privacy Policy*, *Terms of Sale*, *Warranty Terms*, *Jobsite Delivery Info*, and social media icons.
- Newsletter input only maintains local UI state without persisting subscribers.

### Required Actions
1. **Content & Legal Pages**:
   - Create route pages or informational modals for Terms of Sale, Warranty Policy, and Delivery Guidelines.
2. **Newsletter Integration**:
   - Connect the email subscription form to an audience list (Resend Audiences, Mailchimp, or a database subscriber table).

---

## 9. Frontend Environment Configuration

### Current State
- `frontend/.env.example` contains:
  ```env
  NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1
  ```
- No local `.env.local` or production environment configuration currently exists in `frontend/`.

### Required Actions
1. **Create `frontend/.env.local`**:
   - Ensure `NEXT_PUBLIC_API_URL` is set to `http://localhost:4000/api/v1` for local development.
2. **Production Deployment Setup**:
   - Update `NEXT_PUBLIC_API_URL` to the live domain URL on Vercel/production hosting.

---

## Quick Reference Priority Matrix

| Item | Priority | Complexity | Impact |
| :--- | :---: | :---: | :--- |
| **Paystack API Key & Webhook** | **High** | Low | Enables real monetary transactions and automated order confirmation |
| **Zustand Wishlist Persistence** | **Medium** | Low | Allows shoppers to save tools across browser sessions |
| **Live Order Tracking API** | **Medium** | Medium | Provides real-time visibility into order fulfillment and logistics |
| **Frontend `.env.local` Setup** | **High** | Trivial | Guarantees connection to the API across environments |
| **Customer Portal / Auth UI** | **Low** | Medium | Enables order history and repeat customer sign-in |
| **Resend & Termii Credentials** | **Medium** | Low | Delivers automated email receipts and dispatch SMS updates |
| **Policy & Footer Pages** | **Low** | Low | Enhances brand trust and compliance |
