import "dotenv/config";
import { prisma } from "../lib/prisma.js";

async function main() {
  const user = await prisma.user.findFirst({ where: { email: "ezechrist4@gmail.com" } });
  console.log("Owner found:", user?.email, "Role:", user?.role);
  const products = await prisma.product.count();
  console.log("Products in catalog:", products);
  const orders = await prisma.onlineOrder.count();
  console.log("Online orders:", orders);
  const customers = await prisma.customer.count();
  console.log("Customers:", customers);
  const sales = await prisma.sale.count();
  console.log("Sales:", sales);
  const reviews = await prisma.productReview.count();
  console.log("Reviews:", reviews);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
