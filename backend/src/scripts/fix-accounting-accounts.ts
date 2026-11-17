import "dotenv/config";
import { prisma } from "../lib/prisma.js";

async function main() {
  console.log("=== Checking Account Codes 1200 and 3000 ===");
  
  const accounts = await prisma.account.findMany({
    where: {
      code: { in: ["1200", "3000"] }
    },
    select: {
      id: true,
      code: true,
      name: true,
      isActive: true,
      businessId: true
    }
  });

  console.table(accounts);

  const business = await prisma.business.findFirst();
  if (!business) {
    console.error("No business found!");
    return;
  }

  const codesToEnsure = ["1200", "3000"];
  for (const code of codesToEnsure) {
    const existing = accounts.find(a => a.code === code);
    if (!existing) {
      const name = code === "1200" ? "Inventory" : "Opening Balance Equity";
      const type = code === "1200" ? "ASSET" : "EQUITY";
      await prisma.account.create({
        data: {
          businessId: business.id,
          code,
          name,
          type,
          isActive: true
        }
      });
      console.log(`Created missing account: ${code} (${name})`);
    } else if (!existing.isActive) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { isActive: true }
      });
      console.log(`Activated account: ${code}`);
    }
  }
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
