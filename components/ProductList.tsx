"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type StockEntry = {
  warehouseId: string;
  warehouseName: string;
  warehouseLocation: string;
  totalUnits: number;
  reservedUnits: number;
  availableUnits: number;
};

type Product = {
  id: string;
  name: string;
  sku: string;
  description: string;
  price: number;
  stockByWarehouse: StockEntry[];
};

export default function ProductList({ products: initialProducts }: { products: Product[] }) {
  const router = useRouter();
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [reserving, setReserving] = useState<{
    product: Product;
    warehouse: StockEntry;
  } | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchProducts = useCallback(async () => {
    try {
      const res = await fetch("/api/products", { cache: "no-store" });
      if (res.ok) {
        const data = await res.json();
        setProducts(data);
      }
    } catch {
      // silent fail, keep existing data
    }
  }, []);

  // Poll every 5s for live availability updates
  useEffect(() => {
    const interval = setInterval(fetchProducts, 5000);
    return () => clearInterval(interval);
  }, [fetchProducts]);

  // Refresh immediately when the tab becomes visible again (user returns from checkout)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        fetchProducts();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [fetchProducts]);

  function openModal(product: Product, warehouse: StockEntry) {
    setReserving({ product, warehouse });
    setQuantity(1);
    setError(null);
  }

  function closeModal() {
    setReserving(null);
    setError(null);
  }

  async function handleReserve() {
    if (!reserving) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productId: reserving.product.id,
          warehouseId: reserving.warehouse.warehouseId,
          quantity,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        const msg =
          res.status === 409
            ? `Not enough stock. Only ${data.available ?? 0} unit(s) available.`
            : data.error ?? "Failed to reserve";
        setError(msg);
        return;
      }
      // Optimistically update stock in the UI immediately — no extra fetch needed
      setProducts((prev) =>
        prev.map((p) =>
          p.id !== reserving.product.id
            ? p
            : {
                ...p,
                stockByWarehouse: p.stockByWarehouse.map((s) =>
                  s.warehouseId !== reserving.warehouse.warehouseId
                    ? s
                    : {
                        ...s,
                        availableUnits: s.availableUnits - quantity,
                        reservedUnits: s.reservedUnits + quantity,
                      }
                ),
              }
        )
      );
      closeModal();
      router.push(`/reservation/${data.id}`);
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  if (products.length === 0) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        No products found. Run the seed script to populate data.
      </div>
    );
  }

  return (
    <>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {products.map((product) => {
          const totalAvailable = product.stockByWarehouse.reduce(
            (sum, s) => sum + s.availableUnits,
            0
          );
          return (
            <div
              key={product.id}
              className="border rounded-xl bg-white shadow-sm hover:shadow-md transition-shadow p-5 flex flex-col gap-4"
            >
              <div>
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-semibold text-base leading-tight">{product.name}</h3>
                  <span
                    className={`shrink-0 text-xs px-2 py-0.5 rounded-full font-medium ${
                      totalAvailable > 0
                        ? "bg-green-100 text-green-700"
                        : "bg-red-100 text-red-600"
                    }`}
                  >
                    {totalAvailable > 0 ? `${totalAvailable} avail.` : "Out of stock"}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">{product.sku}</p>
                {product.description && (
                  <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                    {product.description}
                  </p>
                )}
              </div>

              <div className="text-lg font-bold text-blue-600">
                ₹{product.price.toLocaleString("en-IN")}
              </div>

              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  Stock by warehouse
                </p>
                {product.stockByWarehouse.map((stock) => (
                  <div
                    key={stock.warehouseId}
                    className="flex items-center justify-between text-sm"
                  >
                    <div>
                      <span className="font-medium">{stock.warehouseName}</span>
                      <span className="text-muted-foreground ml-1">
                        · {stock.warehouseLocation}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      <span
                        className={`font-semibold ${
                          stock.availableUnits === 0 ? "text-red-500" : "text-green-600"
                        }`}
                      >
                        {stock.availableUnits}
                      </span>
                      {stock.availableUnits > 0 && (
                        <button
                          onClick={() => openModal(product, stock)}
                          className="text-xs bg-blue-600 hover:bg-blue-700 text-white px-2.5 py-1 rounded-md font-medium transition-colors"
                        >
                          Reserve
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>

      {/* Reserve Modal */}
      {reserving && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={(e) => e.target === e.currentTarget && closeModal()}
        >
          <div className="bg-white rounded-xl shadow-xl w-full max-w-md p-6 space-y-4">
            <div>
              <h2 className="text-lg font-bold">Reserve Units</h2>
              <p className="text-sm text-muted-foreground mt-0.5">
                This will hold the units for 10 minutes while you complete payment.
              </p>
            </div>

            <div className="bg-muted rounded-lg p-4 space-y-1.5 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Product</span>
                <span className="font-medium">{reserving.product.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Warehouse</span>
                <span className="font-medium">{reserving.warehouse.warehouseName}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Available</span>
                <span className="font-medium text-green-600">
                  {reserving.warehouse.availableUnits} units
                </span>
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium">Quantity</label>
              <input
                type="number"
                min={1}
                max={reserving.warehouse.availableUnits}
                value={quantity}
                onChange={(e) => setQuantity(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-full border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
                {error}
              </div>
            )}

            <div className="flex gap-3 pt-1">
              <button
                onClick={closeModal}
                disabled={loading}
                className="flex-1 border rounded-md px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleReserve}
                disabled={loading}
                className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {loading ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Reserving…
                  </>
                ) : (
                  "Confirm Reservation"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}