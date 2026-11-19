import "dotenv/config";
import { prisma } from "../lib/prisma.js";
import { defaultAccounts } from "../lib/accounting.js";

async function main() {
  console.log("=== Syncing all default accounts ===");
  const business = await prisma.business.findFirst();
  if (!business) {
    console.error("No business found!");
    return;
  }

  for (const acc of defaultAccounts) {
    const existing = await prisma.account.findFirst({
      where: { businessId: business.id, code: acc.code }
    });

    if (!existing) {
      await prisma.account.create({
        data: {
          businessId: business.id,
          code: acc.code,
          name: acc.name,
          type: acc.type as any,
          isActive: true
        }
      });
      console.log(`Created: ${acc.code} ${acc.name}`);
    } else if (!existing.isActive) {
      await prisma.account.update({
        where: { id: existing.id },
        data: { isActive: true }
      });
      console.log(`Activated: ${acc.code} ${acc.name}`);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
