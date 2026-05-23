import { prisma } from "@/lib/prisma";
import ProductList from "@/components/ProductList";

export const dynamic = "force-dynamic";

export default async function Home() {
  const products = await prisma.product.findMany({
    include: { stockLevels: { include: { warehouse: true } } },
    orderBy: { name: "asc" },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const serialized = (products as any[]).map((p) => ({
    id: p.id,
    name: p.name,
    sku: p.sku,
    description: p.description ?? "",
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

  return (
    <div>
      <div className="mb-8">
        <h2 className="text-2xl font-bold">Products</h2>
        <p className="text-muted-foreground mt-1">
          Browse products and reserve units from your nearest warehouse.
        </p>
      </div>
      <ProductList products={serialized} />
    </div>
  );
}
