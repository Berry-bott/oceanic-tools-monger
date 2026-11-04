import "dotenv/config";
import argon2 from "argon2";
import { prisma } from "../lib/prisma.js";
import { defaultAccounts } from "../lib/accounting.js";

const email = process.env.OWNER_EMAIL?.trim().toLowerCase();
const password = process.env.OWNER_PASSWORD;
const name = process.env.OWNER_NAME?.trim() || "Business Owner";
const businessName = process.env.BUSINESS_NAME?.trim() || "Oceanic Market";
const storeSlug = process.env.BUSINESS_SLUG?.trim().toLowerCase() || businessName.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

if (!email || !password || password.length < 12) {
  throw new Error("Set OWNER_EMAIL and OWNER_PASSWORD (at least 12 characters) before creating the initial owner.");
}

try {
  const existingUser = await prisma.user.findFirst({ where: { email }, select: { id: true } });
  if (existingUser) throw new Error("An account already uses OWNER_EMAIL.");
  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.$transaction(async (transaction) => {
    const business = await transaction.business.create({ data: { name: businessName, storeSlug } });
    await transaction.branch.create({ data: { businessId: business.id, name: "Main Store", isDefault: true } });
    await transaction.user.create({ data: { businessId: business.id, name, email, passwordHash, role: "OWNER" } });
    await transaction.account.createMany({ data: defaultAccounts.map((account) => ({ ...account, businessId: business.id })) });
  });
  console.info(`Initial owner created for ${businessName}.`);
} finally {
  await prisma.$disconnect();
}
