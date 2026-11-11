import { prisma } from "../lib/prisma.js";

const CATALOG_ITEMS = [
  {
    sku: "BOS-GSR180LI",
    name: "Bosch GSR 180-LI Cordless Drill 18V",
    brand: "Bosch Professional",
    category: "Power Tools",
    price: 150000,
    images: [
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 18,
    description: "The Bosch GSR 180-LI Professional cordless drill driver delivers heavy-duty power and durability. Features changeable carbon brushes for extended motor life, 2-speed gearbox, 54Nm max torque, and Electronic Cell Protection (ECP) preventing battery overload.",
    unit: "Kit (Drill + 2 Batt + Case)",
  },
  {
    sku: "DEW-CSAW-7",
    name: 'DeWalt DWE575 Heavy Duty 7-1/4" Circular Saw',
    brand: "DeWalt",
    category: "Saw & Cutting Tools",
    price: 185000,
    images: [
      "https://images.unsplash.com/photo-1581147036324-c17ac41dfa6c?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 12,
    description: "Among the lightest and most compact circular saws in its class at only 8.8 lbs. 15-Amp 1,800-watt high-torque motor effortlessly slices through framing lumber, hardwood, and composite panels with 57° beveling capacity.",
    unit: "Unit (Includes 24T Blade)",
  },
  {
    sku: "ING-01",
    name: "Ingco Cordless Screwdriver & Drill 4V Lithium-Ion",
    brand: "Ingco Industrial",
    category: "Power Tools",
    price: 15000,
    images: [
      "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 35,
    description: "Compact and ergonomic 4V cordless screwdriver engineered for furniture assembly, electrical panel work, drywall anchors, and household DIY. Equipped with worklight and USB-C fast charging.",
    unit: "Pack (Tool + 10 Bits)",
  },
  {
    sku: "CAT-BOOT-ST",
    name: "Caterpillar Heavy Duty Steel Toe Safety Boots",
    brand: "Caterpillar Safety",
    category: "Safety & Boots",
    price: 75000,
    images: [
      "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&h=700&fit=crop&auto=format",
      "https://images.unsplash.com/photo-1608256246200-53e635b5b65f?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 28,
    description: "ASTM certified industrial safety boots featuring rugged steel toe impact protection, EH electrical hazard resistance, oil and acid-resistant slip-proof rubber tread, and breathable padded ankle collar.",
    unit: "Pair",
  },
  {
    sku: "MAK-AG4530",
    name: 'Makita GA4530 4-1/2" Angle Grinder 720W',
    brand: "Makita Professional",
    category: "Power Tools",
    price: 68000,
    images: [
      "/makita-mixer.jpg",
      "/mixer.jpg",
    ],
    stockCount: 22,
    description: "Compact 720W angle grinder with small-circumference barrel grip (only 2-1/4\") for unmatched control and comfort during metal fabrication, rust removal, masonry cutting, and weld cleanup.",
    unit: "Unit (Grinder + Guard)",
  },
  {
    sku: "NL-01",
    name: "Heavy Duty Steel Framing Nails Box (5,000 pcs)",
    brand: "Oceanic Fasteners",
    category: "Fasteners & Nails",
    price: 25000,
    images: [
      "https://images.unsplash.com/photo-1586864387967-d02ef85d93e8?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 45,
    description: "High-tensile hot-dip galvanized framing nails designed for pneumatic nail guns and heavy structural timber framing, roofing rafters, subflooring, and formwork construction.",
    unit: "Box (5,000 pcs)",
  },
  {
    sku: "MILW-M18-IW",
    name: 'Milwaukee M18 FUEL 1/2" High Torque Impact Wrench',
    brand: "Milwaukee",
    category: "Power Tools",
    price: 240000,
    images: [
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 15,
    description: "Delivers an astounding 1,898 Nm of nut-busting torque, removing stubborn, corroded commercial lug nuts and structural anchor bolts with ease. 4-Mode DRIVE CONTROL with bolt removal mode.",
    unit: "Kit (Wrench + Battery)",
  },
  {
    sku: "TOT-MMA200",
    name: "Total Tools Inverter ARC Welding Machine 200A",
    brand: "Total Tools",
    category: "Welding & Equipment",
    price: 115000,
    images: [
      "https://images.unsplash.com/photo-1504328345606-18bbc8c9d7d1?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 18,
    description: "Advanced IGBT inverter welding machine designed for metal fabrication, pipeline repair, structural gate welding, and on-site maintenance. Highly stable current with anti-stick technology.",
    unit: "Set (Welder + Cables)",
  },
  {
    sku: "STAN-FM25",
    name: "Stanley FatMax 25ft Tape Measure + Heavy Duty Torpedo Level",
    brand: "Stanley Tools",
    category: "Hand Tools",
    price: 22500,
    images: [
      "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 40,
    description: "The gold standard jobsite measurement pair. Includes Stanley FatMax 8m/26ft tape with 14ft standout BladeArmor coating, paired with a heavy-duty magnetic 9-inch torpedo spirit level.",
    unit: "2-Piece Set",
  },
  {
    sku: "BOS-GBH226",
    name: "Bosch GBH 2-26 DRE Professional Rotary Hammer 800W",
    brand: "Bosch Professional",
    category: "Power Tools",
    price: 195000,
    images: [
      "https://images.unsplash.com/photo-1504148455328-c376907d081c?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 14,
    description: "The benchmark 2kg rotary hammer for heavy masonry and concrete drilling. 800W motor with 2.7J impact force and 3 operational modes (drilling, hammer drilling, and chiseling).",
    unit: "Unit (Drill + Case)",
  },
  {
    sku: "ING-SET142",
    name: "Ingco 142-Piece Professional Mechanics Tool Set",
    brand: "Ingco Industrial",
    category: "Hand Tools",
    price: 165000,
    images: [
      "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 12,
    description: "The complete mechanics and industrial maintenance set. Includes 1/4\", 3/8\", and 1/2\" 72-tooth ratchet handles, deep and shallow metric sockets, combination spanners, hex keys, and bits in a blow-molded heavy-duty case.",
    unit: "142-Piece Chest",
  },
  {
    sku: "SAF-HLMT-01",
    name: "Oceanic Pro Industrial Safety Helmet (ANSI Type 1)",
    brand: "Oceanic Safety",
    category: "Safety & Boots",
    price: 12500,
    images: [
      "https://images.unsplash.com/photo-1544816155-12df9643f363?w=600&h=700&fit=crop&auto=format",
    ],
    stockCount: 60,
    description: "High-density ABS shell protective hard hat with 6-point ratchet suspension, sweatband, and rain trough. Meets ANSI/ISEA Z89.1 Type 1, Class E & G requirements for electrical and impact protection.",
    unit: "Unit",
  },
];

async function main() {
  const business = await prisma.business.findFirst({
    include: { branches: true },
  });
  if (!business) throw new Error("No business found!");

  const defaultBranch = business.branches.find((b) => b.isDefault) || business.branches[0];
  if (!defaultBranch) throw new Error("No default branch found!");

  const owner = await prisma.user.findFirst({ where: { role: "OWNER" } });
  if (!owner) throw new Error("No owner user found!");

  console.log(`Syncing ${CATALOG_ITEMS.length} products to business ${business.name} (${business.id})...`);

  for (const item of CATALOG_ITEMS) {
    const unitSafe = (item.unit || "Unit").slice(0, 30);
    const existing = await prisma.product.findUnique({
      where: {
        businessId_sku: {
          businessId: business.id,
          sku: item.sku,
        },
      },
      include: { balances: true, productImages: true },
    });

    let productId: string;

    if (existing) {
      console.log(`- Updating existing: [${item.sku}] ${existing.name}`);
      const updated = await prisma.product.update({
        where: { id: existing.id },
        data: {
          state: "ACTIVE",
          isPublished: true,
          sellingPrice: item.price,
          unit: unitSafe,
          imageUrl: existing.imageUrl || item.images[0],
        },
      });
      productId = updated.id;

      // Ensure positive onHand stock balance exists on default branch
      const branchBalance = existing.balances.find((b) => b.branchId === defaultBranch.id);
      if (!branchBalance) {
        await prisma.stockBalance.create({
          data: {
            productId: updated.id,
            branchId: defaultBranch.id,
            onHand: item.stockCount,
            reserved: 0,
          },
        });
      } else if (Number(branchBalance.onHand) < 5) {
        await prisma.stockBalance.update({
          where: {
            productId_branchId: {
              productId: updated.id,
              branchId: defaultBranch.id,
            },
          },
          data: { onHand: item.stockCount },
        });
      }
    } else {
      console.log(`+ Creating new product: [${item.sku}] ${item.name}`);
      const created = await prisma.product.create({
        data: {
          businessId: business.id,
          createdById: owner.id,
          sku: item.sku,
          name: item.name.slice(0, 180),
          normalizedName: item.name.toLowerCase().trim().slice(0, 180),
          description: item.description,
          brand: (item.brand || "Oceanic Tools Monger").slice(0, 120),
          category: item.category.slice(0, 100),
          unit: unitSafe,
          costPrice: Math.round(item.price * 0.75),
          sellingPrice: item.price,
          imageUrl: item.images[0],
          state: "ACTIVE",
          isPublished: true,
          balances: {
            create: {
              branchId: defaultBranch.id,
              onHand: item.stockCount,
              reserved: 0,
            },
          },
        },
      });
      productId = created.id;
    }

    // Attach primary media asset if not already linked
    const existingImageCount = await prisma.productImage.count({ where: { productId } });
    if (existingImageCount === 0 && item.images.length > 0) {
      for (let i = 0; i < item.images.length; i++) {
        const url = item.images[i];
        const media = await prisma.mediaAsset.create({
          data: {
            businessId: business.id,
            productId,
            purpose: "PRODUCT_IMAGE",
            resourceType: "image",
            folder: "oceanic-tools/products",
            publicId: `prod_${item.sku.toLowerCase().replace(/[^a-z0-9]/g, "_")}_${i}_${Date.now()}`,
            secureUrl: url,
            status: "ACTIVE",
          },
        });
        await prisma.productImage.create({
          data: {
            productId,
            mediaAssetId: media.id,
            view: i === 0 ? "FRONT" : i === 1 ? "BACK" : "SIDE",
            position: i,
            isPrimary: i === 0,
          },
        });
      }
    }
  }

  console.log("ALL 12 PRODUCTS SYNCHRONIZED SUCCESSFULLY!");
}

main().catch(console.error).finally(() => prisma.$disconnect());
