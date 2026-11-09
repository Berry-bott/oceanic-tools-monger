export interface StoreProduct {
  id: string;
  sku: string;
  slug: string;
  name: string;
  brand: string;
  category: string;
  categorySlug: string;
  price: number;
  originalPrice?: number;
  images: string[];
  badge?: "NEW" | "BEST SELLER" | "LIMITED" | "TRENDING";
  rating: number;
  reviewCount: number;
  inStock: boolean;
  stockCount?: number;
  description: string;
  benefits?: string[];
  ingredients?: string;
  skinType?: string;
  size?: string;
  isBestSeller?: boolean;
  isNew?: boolean;
  tags?: string[];
}

export interface HeroSlide {
  id: string;
  category: string;
  title: string;
  subtitle: string;
  price: number;
  originalPrice?: number;
  discount: number;
  image: string;
  productSlug: string;
  cta: string;
  accent: string;
}

export interface StoreCategory {
  name: string;
  slug: string;
  count: number;
  image: string;
  description: string;
}

export const HERO_SLIDES: HeroSlide[] = [
  {
    id: "h1",
    category: "NEW ARRIVAL",
    title: "Glow Essentials\nCollection",
    subtitle: "Discover your everyday skincare ritual — formulated for radiant Nigerian skin.",
    price: 75000,
    originalPrice: 95000,
    discount: 21,
    image: "https://images.unsplash.com/photo-1767360963892-3353defd6584?w=1200&h=700&fit=crop&auto=format",
    productSlug: "premium-skincare-collection",
    cta: "Shop Collection",
    accent: "#FFAB84",
  },
  {
    id: "h2",
    category: "BESTSELLER",
    title: "Luxury Rose\nEau de Parfum",
    subtitle: "A timeless signature scent crafted from Bulgarian rose absolute.",
    price: 45000,
    originalPrice: 52000,
    discount: 13,
    image: "https://images.unsplash.com/photo-1595425959632-34f2822322ce?w=1200&h=700&fit=crop&auto=format",
    productSlug: "luxury-rose-eau-de-parfum",
    cta: "Shop Fragrance",
    accent: "#F5C6C6",
  },
  {
    id: "h3",
    category: "TRENDING",
    title: "Pro-Age Night\nRepair Cream",
    subtitle: "Wake up to visibly firmer, brighter skin every morning.",
    price: 35000,
    originalPrice: 42000,
    discount: 17,
    image: "https://images.unsplash.com/photo-1782034493928-d8410275cfcd?w=1200&h=700&fit=crop&auto=format",
    productSlug: "anti-aging-night-cream",
    cta: "Shop Skincare",
    accent: "#FFD5B8",
  },
];

export const STORE_CATEGORIES: StoreCategory[] = [
  {
    name: "Skincare",
    slug: "skincare",
    count: 24,
    image: "https://images.unsplash.com/photo-1773187973415-2c85a99aaa82?w=400&h=500&fit=crop&auto=format",
    description: "Cleansers, serums, moisturizers and treatments.",
  },
  {
    name: "Fragrance",
    slug: "fragrance",
    count: 16,
    image: "https://images.unsplash.com/photo-1590736704728-f4730bb30770?w=400&h=500&fit=crop&auto=format",
    description: "Perfumes, body mists and fragrance sets.",
  },
  {
    name: "Body Care",
    slug: "body-care",
    count: 18,
    image: "https://images.unsplash.com/photo-1785581778868-79100f7fe56c?w=400&h=500&fit=crop&auto=format",
    description: "Lotions, scrubs, shower products and more.",
  },
  {
    name: "Makeup",
    slug: "makeup",
    count: 32,
    image: "https://images.unsplash.com/photo-1766101067640-b3ae41ba84bd?w=400&h=500&fit=crop&auto=format",
    description: "Foundation, lipstick, blush, mascara and more.",
  },
  {
    name: "Haircare",
    slug: "haircare",
    count: 14,
    image: "https://images.unsplash.com/photo-1547887537-6158d64c35b3?w=400&h=500&fit=crop&auto=format",
    description: "Shampoo, conditioner, oils and treatments.",
  },
  {
    name: "Personal Care",
    slug: "personal-care",
    count: 20,
    image: "https://images.unsplash.com/photo-1765882155864-c21b8587452c?w=400&h=500&fit=crop&auto=format",
    description: "Everyday personal care essentials.",
  },
];

export const COSMETICS_PRODUCTS: StoreProduct[] = [
  {
    id: "p1",
    sku: "GLOW-VITC-01",
    slug: "glow-vitamin-c-serum",
    name: "Glow Vitamin C Serum",
    brand: "Ekemizi's Lab",
    category: "Skincare",
    categorySlug: "skincare",
    price: 28500,
    originalPrice: 35000,
    images: [
      "https://images.unsplash.com/photo-1773187973415-2c85a99aaa82?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1782034493928-d8410275cfcd?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "BEST SELLER",
    rating: 4.8,
    reviewCount: 324,
    inStock: true,
    stockCount: 48,
    description: "A potent 15% Vitamin C serum that visibly brightens, firms and evens skin tone. Formulated with stabilised L-ascorbic acid, ferulic acid and hyaluronic acid for maximum efficacy.",
    benefits: [
      "Brightens dull complexion in 2 weeks",
      "Reduces dark spots and hyperpigmentation",
      "Stimulates collagen production",
      "Provides antioxidant protection",
    ],
    ingredients: "Aqua, L-Ascorbic Acid (15%), Ferulic Acid, Hyaluronic Acid, Vitamin E, Niacinamide",
    skinType: "All skin types",
    size: "30ml",
    isBestSeller: true,
    tags: ["vitamin c", "brightening", "serum", "antioxidant"],
  },
  {
    id: "p2",
    sku: "RAD-MOIST-02",
    slug: "radiance-day-moisturizer",
    name: "Radiance Day Moisturizer",
    brand: "Ekemizi's Lab",
    category: "Skincare",
    categorySlug: "skincare",
    price: 22000,
    originalPrice: 27000,
    images: [
      "https://images.unsplash.com/photo-1783806706119-58cc39f90ff4?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1773187973415-2c85a99aaa82?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "NEW",
    rating: 4.6,
    reviewCount: 187,
    inStock: true,
    stockCount: 32,
    description: "A lightweight yet deeply nourishing day moisturiser with SPF 30 protection. Enriched with ceramides, peptides and antioxidants to hydrate, protect and restore.",
    benefits: [
      "24-hour hydration",
      "SPF 30 broad-spectrum protection",
      "Strengthens skin barrier",
      "Plumps and firms over time",
    ],
    ingredients: "Aqua, Ceramides NP, EG, AP, Niacinamide, Hyaluronic Acid, Peptide Complex",
    skinType: "Dry to Normal",
    size: "50ml",
    isNew: true,
    tags: ["moisturizer", "spf", "hydration", "day cream"],
  },
  {
    id: "p3",
    sku: "ROSE-PARFUM-03",
    slug: "luxury-rose-eau-de-parfum",
    name: "Luxury Rose Eau de Parfum",
    brand: "Ekemizi's Atelier",
    category: "Fragrance",
    categorySlug: "fragrance",
    price: 45000,
    originalPrice: 52000,
    images: [
      "https://images.unsplash.com/photo-1595425959632-34f2822322ce?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1615108395437-df128ad79e80?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "TRENDING",
    rating: 4.9,
    reviewCount: 512,
    inStock: true,
    stockCount: 15,
    description: "An intoxicating floral fragrance anchored by Bulgarian rose absolute, Damask rose, and warm sandalwood base notes. A timeless signature scent for the discerning woman.",
    benefits: [
      "Long-lasting 8-10 hour wear",
      "Rich Bulgarian rose heart",
      "Warm sandalwood dry-down",
      "Elegant frosted glass bottle",
    ],
    size: "50ml EDP",
    isBestSeller: true,
    tags: ["rose", "floral", "perfume", "eau de parfum"],
  },
  {
    id: "p4",
    sku: "CRYSTAL-PARFUM-04",
    slug: "crystal-clear-eau-de-parfum",
    name: "Crystal Clear Eau de Parfum",
    brand: "Ekemizi's Atelier",
    category: "Fragrance",
    categorySlug: "fragrance",
    price: 55000,
    images: [
      "https://images.unsplash.com/photo-1590736704728-f4730bb30770?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1543422655-ac1c6ca993ed?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "LIMITED",
    rating: 4.7,
    reviewCount: 203,
    inStock: true,
    stockCount: 8,
    description: "An airy, aquatic fragrance that opens with sea breeze and bergamot, evolving into a clean white musk and cedarwood base. Modern, fresh and utterly captivating.",
    benefits: [
      "Fresh aquatic opening",
      "Clean white musk base",
      "Unisex appeal",
      "Luxurious crystal flacon",
    ],
    size: "100ml EDP",
    tags: ["aquatic", "fresh", "unisex", "perfume"],
  },
  {
    id: "p5",
    sku: "NIGHT-REPAIR-05",
    slug: "anti-aging-night-cream",
    name: "Pro-Age Night Repair Cream",
    brand: "Ekemizi's Lab",
    category: "Skincare",
    categorySlug: "skincare",
    price: 35000,
    originalPrice: 42000,
    images: [
      "https://images.unsplash.com/photo-1782034493928-d8410275cfcd?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1783806706119-58cc39f90ff4?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "BEST SELLER",
    rating: 4.8,
    reviewCount: 441,
    inStock: true,
    stockCount: 27,
    description: "An intensive overnight repair cream with retinol, bakuchiol and peptides. Works while you sleep to visibly reduce fine lines, improve firmness and restore youthful luminosity.",
    benefits: [
      "Reduces fine lines visibly by week 4",
      "Boosts overnight cell renewal",
      "Retinol + Bakuchiol synergy",
      "Deeply nourishing texture",
    ],
    ingredients: "Retinol (0.3%), Bakuchiol, Niacinamide, Peptides, Squalane, Shea Butter",
    skinType: "All skin types",
    size: "50ml",
    isBestSeller: true,
    tags: ["retinol", "anti-aging", "night cream", "peptides"],
  },
  {
    id: "p6",
    sku: "MIST-FLORAL-06",
    slug: "floral-essence-body-mist",
    name: "Floral Essence Body Mist",
    brand: "Ekemizi's Atelier",
    category: "Fragrance",
    categorySlug: "fragrance",
    price: 18500,
    originalPrice: 22000,
    images: [
      "https://images.unsplash.com/photo-1615108395437-df128ad79e80?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1595425959632-34f2822322ce?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "NEW",
    rating: 4.5,
    reviewCount: 156,
    inStock: true,
    stockCount: 40,
    description: "A refreshing, all-over body mist infused with peony, jasmine, and citrus notes. Perfect for daily spritzing after shower or on-the-go refresh.",
    benefits: [
      "All-day light floral fragrance",
      "Hydrating aloe vera base",
      "Non-drying formula",
      "Generous mist spray",
    ],
    size: "150ml",
    isNew: true,
    tags: ["mist", "floral", "jasmine", "peony"],
  },
  {
    id: "p7",
    sku: "PREMIUM-SET-07",
    slug: "premium-skincare-collection",
    name: "Premium Skincare Collection",
    brand: "Ekemizi's Lab",
    category: "Skincare",
    categorySlug: "skincare",
    price: 75000,
    originalPrice: 95000,
    images: [
      "https://images.unsplash.com/photo-1767360963892-3353defd6584?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1785581778868-79100f7fe56c?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "LIMITED",
    rating: 4.9,
    reviewCount: 94,
    inStock: true,
    stockCount: 10,
    description: "The complete 4-step ritual: Cleanser, Vitamin C Serum, Day Moisturizer and Night Repair Cream. Packaged in a bespoke gift box with velvet lining.",
    benefits: [
      "Complete 4-step daily ritual",
      "Save 21% vs buying separately",
      "Bespoke luxury gift box",
      "Includes mini travel pouch",
    ],
    size: "4-Piece Set",
    tags: ["gift set", "collection", "skincare set", "luxury"],
  },
  {
    id: "p8",
    sku: "MICELLAR-08",
    slug: "hydrating-micellar-cleanser",
    name: "Hydrating Micellar Cleanser",
    brand: "Ekemizi's Lab",
    category: "Skincare",
    categorySlug: "skincare",
    price: 15000,
    images: [
      "https://images.unsplash.com/photo-1556228720-195a672e8a03?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1773187973415-2c85a99aaa82?w=600&h=700&fit=crop&auto=format",
    ],
    rating: 4.7,
    reviewCount: 230,
    inStock: true,
    stockCount: 55,
    description: "Gently removes makeup, dirt, and excess oil without stripping moisture. Infused with rosewater and chamomile extract to calm and soothe skin.",
    benefits: [
      "Removes waterproof makeup",
      "Calms irritated skin",
      "No rinse required",
      "Ophthalmologist tested",
    ],
    skinType: "Sensitive to All",
    size: "200ml",
    tags: ["cleanser", "micellar", "rosewater", "makeup remover"],
  },
  {
    id: "p9",
    sku: "FACIAL-OIL-09",
    slug: "radiant-glow-facial-oil",
    name: "Radiant Glow Facial Oil",
    brand: "Ekemizi's Lab",
    category: "Skincare",
    categorySlug: "skincare",
    price: 38000,
    originalPrice: 45000,
    images: [
      "https://images.unsplash.com/photo-1608248597359-009761352e85?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1782034493928-d8410275cfcd?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "TRENDING",
    rating: 4.8,
    reviewCount: 167,
    inStock: true,
    stockCount: 22,
    description: "A fast-absorbing, nutrient-rich face oil blending rosehip, marula, and argan oils. Locks in moisture and imparts a dewy, non-greasy glow.",
    benefits: [
      "Instant luminous glow",
      "Non-comedogenic formula",
      "Rich in omega fatty acids",
      "Fast absorption",
    ],
    skinType: "Dry, Normal, Combination",
    size: "30ml",
    tags: ["face oil", "rosehip", "marula", "glow"],
  },
  {
    id: "p10",
    sku: "GIOIA-PARFUM-10",
    slug: "sun-di-gioia-eau-de-parfum",
    name: "Sun di Gioia Eau de Parfum",
    brand: "Ekemizi's Atelier",
    category: "Fragrance",
    categorySlug: "fragrance",
    price: 48000,
    images: [
      "https://images.unsplash.com/photo-1543422655-ac1c6ca993ed?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1595425959632-34f2822322ce?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "TRENDING",
    rating: 4.8,
    reviewCount: 310,
    inStock: true,
    stockCount: 18,
    description: "Sun-drenched notes of iris, frangipani, and warm vanilla embrace the skin like a tropical sunset. Sensual, solar, and radiant.",
    benefits: [
      "Warm solar floral profile",
      "All-day longevity",
      "Hypnotic vanilla dry down",
      "Sculpted glass bottle",
    ],
    size: "75ml EDP",
    tags: ["warm", "vanilla", "solar", "perfume"],
  },
  {
    id: "p11",
    sku: "SIGNATURE-SET-11",
    slug: "signature-beauty-gift-set",
    name: "Signature Beauty Gift Set",
    brand: "Ekemizi's Lab",
    category: "Body Care",
    categorySlug: "body-care",
    price: 65000,
    originalPrice: 80000,
    images: [
      "https://images.unsplash.com/photo-1785581778868-79100f7fe56c?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1765882155864-c21b8587452c?w=600&h=700&fit=crop&auto=format",
    ],
    badge: "LIMITED",
    rating: 4.9,
    reviewCount: 88,
    inStock: true,
    stockCount: 12,
    description: "A curated trio of body scrub, nourishing body cream, and botanical shimmer oil. Delicately scented with honey blossom and almond milk.",
    benefits: [
      "Silk-smooth body care trio",
      "Exfoliates, nourishes & illuminates",
      "Comes in gold embossed presentation box",
    ],
    size: "3-Piece Box",
    tags: ["body care", "scrub", "gift set", "body cream"],
  },
  {
    id: "p12",
    sku: "BODY-SERUM-12",
    slug: "botanical-body-serum",
    name: "Botanical Body Serum",
    brand: "Ekemizi's Lab",
    category: "Body Care",
    categorySlug: "body-care",
    price: 19500,
    images: [
      "https://images.unsplash.com/photo-1765882155864-c21b8587452c?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1785581778868-79100f7fe56c?w=600&h=700&fit=crop&auto=format",
    ],
    rating: 4.6,
    reviewCount: 142,
    inStock: true,
    stockCount: 38,
    description: "An ultra-lightweight body treatment packed with hyaluronic acid, lactic acid, and niacinamide to smooth rough texture and hydrate dry limbs.",
    benefits: [
      "Smooths crepey and bumpy skin",
      "Exfoliates gently with lactic acid",
      "Absorbs in 30 seconds",
    ],
    size: "200ml",
    tags: ["body serum", "lactic acid", "hyaluronic", "smooth skin"],
  },
];

export const CUSTOMER_REVIEWS = [
  {
    name: "Amaka O.",
    rating: 5,
    text: "Absolutely love this! My skin has never felt so soft and radiant. Will definitely repurchase.",
    date: "2 weeks ago",
    verified: true,
  },
  {
    name: "Chidinma B.",
    rating: 5,
    text: "The 3D view feature is so cool! And the product itself is amazing — fast shipping to Lekki too.",
    date: "1 month ago",
    verified: true,
  },
  {
    name: "Fatima A.",
    rating: 4,
    text: "Great quality product. The packaging is luxurious and it smells wonderful. My only wish is for a bigger size.",
    date: "1 month ago",
    verified: true,
  },
  {
    name: "Ngozi E.",
    rating: 5,
    text: "Been using for 3 weeks and already seeing results. My dark spots are fading beautifully.",
    date: "2 months ago",
    verified: true,
  },
];
