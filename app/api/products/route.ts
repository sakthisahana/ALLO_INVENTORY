import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const products = await prisma.product.findMany({
      include: { stockLevels: { include: { warehouse: true } } },
      orderBy: { name: "asc" },
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result = products.map((p: any) => ({
      id: p.id,
      name: p.name,
      sku: p.sku,
      description: p.description,
      price: p.price,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      stockByWarehouse: p.stockLevels.map((sl: any) => ({
        warehouseId: sl.warehouseId,
        warehouseName: sl.warehouse.name,
        warehouseLocation: sl.warehouse.location,
        totalUnits: sl.totalUnits,
        reservedUnits: sl.reservedUnits,
        availableUnits: sl.totalUnits - sl.reservedUnits,
      })),
    }));

    return NextResponse.json(result);
  } catch (error) {
    console.error("GET /api/products error:", error);
    return NextResponse.json({ error: "Failed to fetch products" }, { status: 500 });
  }
}
