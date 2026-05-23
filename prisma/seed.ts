import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // Clean up existing data
  await prisma.reservation.deleteMany();
  await prisma.stockLevel.deleteMany();
  await prisma.product.deleteMany();
  await prisma.warehouse.deleteMany();

  // Create warehouses
  const warehouseA = await prisma.warehouse.create({
    data: { name: "Mumbai Central Warehouse", location: "Mumbai, Maharashtra" },
  });
  const warehouseB = await prisma.warehouse.create({
    data: { name: "Delhi North Warehouse", location: "Delhi, NCR" },
  });
  const warehouseC = await prisma.warehouse.create({
    data: { name: "Bangalore Tech Hub", location: "Bangalore, Karnataka" },
  });

  console.log("✅ Warehouses created");

  // Create products
  const products = await Promise.all([
    prisma.product.create({
      data: {
        name: "Wireless Noise-Cancelling Headphones",
        sku: "WNC-HDPH-001",
        description: "Premium over-ear headphones with 40hr battery life",
        price: 8999,
      },
    }),
    prisma.product.create({
      data: {
        name: "Mechanical Keyboard (TKL)",
        sku: "MECH-KB-TKL-002",
        description: "Tenkeyless mechanical keyboard with Cherry MX Red switches",
        price: 5499,
      },
    }),
    prisma.product.create({
      data: {
        name: "4K USB-C Monitor 27\"",
        sku: "MON-4K-27-003",
        description: "27-inch 4K IPS display with USB-C 65W charging",
        price: 34999,
      },
    }),
    prisma.product.create({
      data: {
        name: "Ergonomic Office Chair",
        sku: "ERGO-CHAIR-004",
        description: "Lumbar support mesh chair with adjustable armrests",
        price: 18999,
      },
    }),
    prisma.product.create({
      data: {
        name: "Portable SSD 1TB",
        sku: "SSD-PORT-1TB-005",
        description: "USB 3.2 Gen 2 portable SSD, up to 1050MB/s",
        price: 7299,
      },
    }),
  ]);

  console.log("✅ Products created");

  // Create stock levels
  const stockData = [
    // Headphones
    { productId: products[0].id, warehouseId: warehouseA.id, totalUnits: 50, reservedUnits: 0 },
    { productId: products[0].id, warehouseId: warehouseB.id, totalUnits: 3, reservedUnits: 0 },
    { productId: products[0].id, warehouseId: warehouseC.id, totalUnits: 1, reservedUnits: 0 },
    // Keyboard
    { productId: products[1].id, warehouseId: warehouseA.id, totalUnits: 25, reservedUnits: 0 },
    { productId: products[1].id, warehouseId: warehouseB.id, totalUnits: 2, reservedUnits: 0 },
    // Monitor
    { productId: products[2].id, warehouseId: warehouseA.id, totalUnits: 10, reservedUnits: 0 },
    { productId: products[2].id, warehouseId: warehouseC.id, totalUnits: 5, reservedUnits: 0 },
    // Chair
    { productId: products[3].id, warehouseId: warehouseB.id, totalUnits: 1, reservedUnits: 0 },
    { productId: products[3].id, warehouseId: warehouseC.id, totalUnits: 8, reservedUnits: 0 },
    // SSD
    { productId: products[4].id, warehouseId: warehouseA.id, totalUnits: 100, reservedUnits: 0 },
    { productId: products[4].id, warehouseId: warehouseB.id, totalUnits: 40, reservedUnits: 0 },
    { productId: products[4].id, warehouseId: warehouseC.id, totalUnits: 60, reservedUnits: 0 },
  ];

  await Promise.all(stockData.map((s) => prisma.stockLevel.create({ data: s })));

  console.log("✅ Stock levels created");
  console.log("🎉 Seeding complete!");
}

main()
  .catch((e) => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
