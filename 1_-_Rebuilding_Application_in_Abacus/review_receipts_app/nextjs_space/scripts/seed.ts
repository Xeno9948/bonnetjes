import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("Seeding database...");

  // Create admin user
  const adminPassword = await bcrypt.hash("johndoe123", 10);
  const admin = await prisma.user.upsert({
    where: { email: "john@doe.com" },
    update: {},
    create: {
      email: "john@doe.com",
      name: "John Doe",
      password: adminPassword,
      role: "admin"
    }
  });
  console.log("Admin user created:", admin.email);

  // Create a sample regular user
  const userPassword = await bcrypt.hash("testuser123", 10);
  const user = await prisma.user.upsert({
    where: { email: "test@user.com" },
    update: {},
    create: {
      email: "test@user.com",
      name: "Test User",
      password: userPassword,
      role: "user"
    }
  });
  console.log("Test user created:", user.email);

  console.log("Seeding completed!");
}

main()
  .catch((e) => {
    console.error("Seeding error:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
