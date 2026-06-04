import bcrypt from "bcryptjs";
import prisma from "../config/prisma.js";

async function main() {
  const passwordHash = await bcrypt.hash("admin123", 12);

  // Create admin user if not exists
  await prisma.user.upsert({
    where: { email: "admin@example.com" },
    update: {},
    create: {
      name: "Admin",
      email: "admin@example.com",
      password: passwordHash,
      role: "ADMIN",
    },
  });

  // Optional: sample supplier
  const supplier = await prisma.supplier.upsert({
    where: { supplierName: "Default Supplier" },
    update: {},
    create: {
      supplierName: "Default Supplier",
      contactNumber: null,
      email: null,
      address: null,
    },
  });

  // Optional: sample product
  await prisma.product.upsert({
    where: { imei: "TEST-IMEI-0001" },
    update: {},
    create: {
      brand: "TestBrand",
      model: "TestModel",
      variant: "Default",
      storage: "128GB",
      ram: "8GB",
      color: "Black",
      imei: "TEST-IMEI-0001",
      supplierId: supplier.id,
      purchasePrice: 100.0,
      sellingPrice: 150.0,
      quantity: 10,
      imageUrl: null,
      status: "IN_STOCK",
    },
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
