# Oceanic Tools Landing Page — Product Requirements Document

## 1. Product summary

Create a polished, responsive storefront landing page for Oceanic Tools & Equipment. The page should help contractors and trade customers discover authentic tools, inspect products from multiple angles, and move confidently from browsing to the existing cart and checkout.

The visual direction should borrow the reference site's typography and light, editorial feel while staying credible for an industrial equipment retailer. The requested “3D” experience is an image-based 3D carousel: visitors can rotate through supplied product photographs. It is not a photorealistic 3D model unless model assets are supplied separately.

## 2. Goals

- Make the store's product range and value proposition clear immediately.
- Give the hero image a noticeable 3D rotation transition between featured products.
- Let visitors inspect a product's first, second, and third photos through a 3D-style viewer and explicit controls.
- Make category browsing, product details, add-to-cart, and checkout easy to reach.
- Keep the page fast, usable on mobile, accessible, and consistent with the existing storefront.

## 3. Audience

- Contractors, tradespeople, and workshop owners sourcing tools and safety equipment.
- Procurement and project teams buying equipment for job sites.
- Retail customers comparing product details, authenticity, availability, and price.

## 4. Page structure and requirements

### 4.1 Announcement bar and store navigation — P0

- Show a concise delivery, payment-security, or authenticity message.
- Provide clear navigation to the catalog, key product categories, search, and cart.
- Show an item count on the cart action when the cart is not empty.
- Keep the navigation usable on small screens through a mobile menu.

### 4.2 Hero carousel with 3D image transition — P0

- Feature one product or campaign at a time with an image, category label, headline, short description, current price, optional previous price/discount, and a primary shop CTA.
- Rotate the featured image around the vertical axis as slides change, with restrained depth and perspective. Keep headline and CTA legible over every image.
- Include previous/next controls and slide indicators; each indicator must identify its slide to assistive technology.
- Allow manual selection and pause automatic rotation while a visitor hovers over or focuses the carousel.
- Use a conservative autoplay interval (approximately 5–7 seconds); do not autoplay when the user has requested reduced motion.
- Link the primary CTA to the appropriate product or category, not to an unrelated generic destination.
- Use responsive image crops and a non-empty alt text that describes the featured product.

### 4.3 Trust and service benefits — P0

Show a compact set of verifiable buying assurances, such as genuine products, secure payment, jobsite delivery, and manufacturer warranty. Avoid unsupported guarantees or unverified delivery claims.

### 4.4 Category discovery — P0

- Display the primary store categories as image tiles with readable names and clear browse affordances.
- Each tile must link to the corresponding existing category listing.
- Include text labels so category meaning is not conveyed by imagery alone.

### 4.5 Featured products — P0

- Show a small selection of bestsellers, trending products, or new arrivals.
- Product cards should include a product image, name, brand, price, optional discount/badge, and a clear detail-page link.
- Add-to-cart actions must use the existing cart behavior and reflect stock availability.
- Keep image ratios consistent and reserve space for images to reduce layout shift.

### 4.6 Product image inspection — P0

- Provide a product-image viewer on the product detail page with explicit previous/next controls and selectable thumbnails.
- The first, second, and third images (when available) must be individually selectable; show the current image position, for example “2 of 3.”
- Animate image changes as a short 3D horizontal rotation/slide using perspective and `rotateY`, while keeping the selected photo clearly visible.
- Support mouse, touch, and keyboard-operated controls. Do not require a drag gesture as the only way to change images.
- If a product has fewer than three images, show only the available images; do not duplicate photos or imply extra angles.
- Provide a useful fallback when a product has no image, and keep the product name available as alternative text.
- Label this as a multi-image/3D-style viewer. Do not advertise a continuous 360-degree product model unless actual 3D model or sufficiently dense turntable imagery is available.

### 4.7 Campaign / use-case promotions — P1

Use one or two secondary banners to direct visitors to useful collections, such as cordless systems or site-safety equipment. Keep copy specific and route each CTA to a matching collection or product.

### 4.8 Newsletter and footer — P1

- Provide a concise email signup with validation and a clear success/error state if a newsletter service is connected.
- Include contact, store, delivery, returns, and policy links that actually resolve.
- Do not show a success confirmation unless the subscription request succeeds.

## 5. Visual design requirements

### Typography

Match the reference site's type pairing:

- **Jost** — body copy, navigation, labels, product data, and controls.
- **Playfair Display** — editorial/display headlines and selected brand treatments.

Use clear hierarchy and restrained use of the serif face so product information remains easy to scan. Prefer self-hosted/optimized font loading when the design is implemented.

### Color palette

Use the reference's warm, high-contrast palette as the starting point:

| Token | Hex | Intended use |
|---|---:|---|
| White | `#FFFFFF` | Main surfaces and cards |
| Soft cream | `#FFF8F3` | Page canvas and quiet section backgrounds |
| Pale peach | `#FFF3EC` | Subtle highlights and image-stage backgrounds |
| Peach tint | `#FFE8D9` | Borders, separators, and soft fills |
| Warm peach | `#FFAB84` | Secondary accents and decorative details |
| Coral | `#E8724A` | Primary actions, active states, and key highlights |
| Deep coral | `#C85A32` | Hover/pressed states and stronger accent contrast |
| Charcoal | `#2A2A2A` | Primary text and dark surfaces |
| Muted charcoal | `#555555` | Secondary text |
| Warm gray | `#F5F0ED` | Neutral section backgrounds |
| Teal accent | `#149E8F` | Optional trust/status accent; use sparingly and consistently |

Use charcoal or white text on coral controls only after checking contrast. Do not use pale peach for small text or essential icon strokes. Maintain a distinct, consistent focus indicator.

### Imagery and composition

- Prefer authentic, high-resolution product imagery on clean or transparent backgrounds for product inspection.
- Use jobsite/context photos for hero and campaign sections only when the featured product remains recognizable.
- Keep photo direction, crop, lighting, and color treatment consistent across each section.
- Give the product viewer a light, quiet stage so controls and product details stay prominent.
- Use generous whitespace, simple cards, subtle borders/shadows, and restrained motion; avoid ornamental effects that compete with product photography.

## 6. Interaction and motion

- Hero transitions use a short 3D Y-axis rotation with opacity/position support, not a long spinning animation.
- Product image selection uses a brief rotation/slide, and snaps cleanly to the selected image.
- Provide visible hover, focus, active, selected, loading, empty, and unavailable states where relevant.
- Respect `prefers-reduced-motion`; replace non-essential movement with an immediate or simple fade change.
- Ensure carousel controls cannot create overlapping or stale transitions when clicked repeatedly.

## 7. Responsive behavior

- **Mobile:** single-column hero content, touch-sized carousel/gallery controls, compact category grid, and two-column product cards where space permits.
- **Tablet:** balanced hero image/text composition and two- or three-column product/category layouts.
- **Desktop:** full navigation, wider hero composition, and multi-column product grids.
- Prevent horizontal overflow at all breakpoints. Keep primary content and actions usable without hover.

## 8. Accessibility and content requirements

- Use semantic headings in order, landmarks, descriptive link/button names, and meaningful image alternatives.
- Ensure all carousel and gallery actions are keyboard accessible and have visible focus.
- Announce the selected product image/position when it changes without making autoplay excessively chatty.
- Maintain readable contrast and sufficiently large touch targets.
- Do not rely on color, 3D motion, or image content alone to communicate selection or status.
- Use correct prices, stock state, category names, product routes, warranty terms, and delivery claims from store data.

## 9. Performance, SEO, and integration

- Keep the homepage server-rendered where it already fetches store data; isolate interactive carousel/gallery behavior to client components.
- Reuse existing product, category, cart, and checkout data/services rather than creating duplicate storefront data flows.
- Lazy-load below-the-fold imagery and provide explicit image dimensions/aspect ratios where possible.
- Avoid continuous request-animation-frame state updates for a static product-image carousel.
- Provide page title/description and meaningful product/category link text.
- Confirm imagery and font loading do not cause avoidable layout shifts.

## 10. Success criteria

The landing page is ready for release when:

1. The hero image visibly transitions with a 3D rotation and can also be navigated manually.
2. A product with three images can be switched directly to image 1, image 2, or image 3, with the selected position clear.
3. Products with one or two images do not show fake or duplicated views.
4. Product, category, and add-to-cart links lead to the corresponding existing storefront flows.
5. Layout and controls remain usable at mobile, tablet, and desktop sizes.
6. Keyboard navigation, focus visibility, screen-reader labels, and reduced-motion behavior are verified.
7. Page content uses Jost and Playfair Display and the documented warm palette.
8. No unsupported promotional, stock, warranty, or delivery claims are introduced.

## 11. Out of scope for the initial landing-page release

- Building photorealistic 3D meshes, a WebGL viewer, or a full 360-degree capture pipeline.
- Replacing the existing product catalog, cart, payment, or checkout systems.
- Introducing new recommendation, account, loyalty, or inventory-management services.
- Adding a newsletter backend unless a supported service and endpoint are provided.

## 12. Assumptions and dependencies

- Product images come from the existing product data/API; each image is a distinct angle or view when available.
- Product and category destinations are supplied by the existing storefront routes.
- The reference font names are **Jost** and **Playfair Display**, as declared by the reference site's stylesheet.
- The requested 3D interaction is an image carousel that simulates depth; genuine 3D model rotation requires separate model/turntable assets.
