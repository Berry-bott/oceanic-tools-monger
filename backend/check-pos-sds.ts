import { prisma } from "./src/lib/prisma";

async function main() {
  const products = await prisma.product.findMany({
    where: {
      OR: [
        { name: { contains: "SDS", mode: "insensitive" } },
        { sku: { contains: "SDS", mode: "insensitive" } },
        { model: { contains: "SDS", mode: "insensitive" } },
        { name: { contains: "hammer drill bit", mode: "insensitive" } },
      ],
    },
    include: {
      balances: {
        include: {
          branch: true,
        },
      },
      specifications: true,
    },
  });

  console.log("Found products:", JSON.stringify(products, null, 2));
}

main().finally(() => process.exit(0));
