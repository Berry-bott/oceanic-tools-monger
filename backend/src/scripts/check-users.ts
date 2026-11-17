import "dotenv/config";
import { prisma } from "../lib/prisma.js";

async function main() {
  const users = await prisma.user.findMany({
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      staffAccessRole: true,
      createdAt: true,
    },
  });

  console.log(`=== USERS IN USER TABLE (${users.length}) ===`);
  for (const u of users) {
    console.log(`Email: ${u.email} | Name: ${u.name} | Role: ${u.role} | ID: ${u.id}`);
  }

  const customers = await prisma.customer.count();
  const customerAccounts = await prisma.customerAccount.count();
  const products = await prisma.product.count();
  const media = await prisma.mediaAsset.count();
  const orders = await prisma.onlineOrder.count();
  const sales = await prisma.sale.count();
  const businesses = await prisma.business.count();
  const branches = await prisma.branch.count();

  console.log("\n=== OTHER TABLE RECORD COUNTS ===");
  console.log(`Customers: ${customers}`);
  console.log(`CustomerAccounts: ${customerAccounts}`);
  console.log(`Products: ${products}`);
  console.log(`MediaAssets: ${media}`);
  console.log(`OnlineOrders: ${orders}`);
  console.log(`Sales: ${sales}`);
  console.log(`Businesses: ${businesses}`);
  console.log(`Branches: ${branches}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
