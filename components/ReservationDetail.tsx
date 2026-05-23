"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type ReservationData = {
  id: string;
  status: string;
  quantity: number;
  expiresAt: string;
  createdAt: string;
  product: { id: string; name: string; sku: string; price: number };
  warehouse: { id: string; name: string; location: string };
};

function formatCountdown(ms: number): string {
  if (ms <= 0) return "00:00";
  const totalSecs = Math.floor(ms / 1000);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

export default function ReservationDetail({
  reservation: initial,
}: {
  reservation: ReservationData;
}) {
  const router = useRouter();
  const [reservation, setReservation] = useState(initial);
  const [timeLeft, setTimeLeft] = useState(
    new Date(initial.expiresAt).getTime() - Date.now()
  );
  const [loading, setLoading] = useState<"confirm" | "cancel" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Live countdown
  useEffect(() => {
    if (reservation.status !== "PENDING") return;
    const interval = setInterval(() => {
      const left = new Date(reservation.expiresAt).getTime() - Date.now();
      setTimeLeft(left);
      if (left <= 0) clearInterval(interval);
    }, 500);
    return () => clearInterval(interval);
  }, [reservation.expiresAt, reservation.status]);

  const isExpired = timeLeft <= 0;
  const isPending = reservation.status === "PENDING";

  const refreshReservation = useCallback(async () => {
    const res = await fetch(`/api/reservations/${reservation.id}`);
    if (res.ok) {
      const data = await res.json();
      setReservation(data);
    }
  }, [reservation.id]);

  async function handleConfirm() {
    setLoading("confirm");
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/confirm`, {
        method: "POST",
      });
      const data = await res.json();
      if (res.status === 410) {
        setError("Your reservation expired before payment could be confirmed.");
        await refreshReservation();
        return;
      }
      if (!res.ok) {
        setError(data.error ?? "Failed to confirm purchase.");
        return;
      }
      setReservation(data);
      setMessage("Purchase confirmed! Your order is being processed.");
      router.refresh(); // Invalidate Next.js cache so main page reflects stock change instantly
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  async function handleCancel() {
    setLoading("cancel");
    setError(null);
    try {
      const res = await fetch(`/api/reservations/${reservation.id}/release`, {
        method: "POST",
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Failed to cancel.");
        return;
      }
      setReservation(data);
      setMessage("Reservation cancelled. Stock has been released.");
      router.refresh(); // Invalidate Next.js cache so main page reflects released stock instantly
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(null);
    }
  }

  const statusConfig = {
    PENDING: { label: "Pending", color: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    CONFIRMED: { label: "Confirmed", color: "bg-green-100 text-green-700 border-green-200" },
    RELEASED: { label: "Released / Cancelled", color: "bg-gray-100 text-gray-600 border-gray-200" },
  }[reservation.status] ?? { label: reservation.status, color: "bg-gray-100 text-gray-600 border-gray-200" };

  return (
    <div className="max-w-lg mx-auto space-y-6">
      <div className="flex items-center gap-2">
        <Link href="/" className="text-sm text-blue-600 hover:underline">
          ← Back to products
        </Link>
      </div>

      <div className="border rounded-xl bg-white shadow-sm p-6 space-y-5">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-xl font-bold">Checkout</h2>
            <p className="text-xs text-muted-foreground mt-0.5 font-mono">{reservation.id}</p>
          </div>
          <span className={`text-xs px-2.5 py-1 rounded-full border font-medium ${statusConfig.color}`}>
            {statusConfig.label}
          </span>
        </div>

        {/* Countdown Timer */}
        {isPending && (
          <div
            className={`rounded-lg p-4 text-center border ${
              isExpired
                ? "bg-red-50 border-red-200"
                : timeLeft < 60000
                ? "bg-orange-50 border-orange-200"
                : "bg-blue-50 border-blue-200"
            }`}
          >
            {isExpired ? (
              <div>
                <p className="text-red-600 font-semibold">Reservation Expired</p>
                <p className="text-red-500 text-sm mt-0.5">
                  Your hold has expired. Please start a new reservation.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-1">
                  Time remaining to complete payment
                </p>
                <p
                  className={`text-4xl font-mono font-bold ${
                    timeLeft < 60000 ? "text-orange-600" : "text-blue-600"
                  }`}
                >
                  {formatCountdown(timeLeft)}
                </p>
              </div>
            )}
          </div>
        )}

        {/* Order Details */}
        <div className="space-y-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Product</span>
            <span className="font-medium text-right max-w-xs">{reservation.product.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">SKU</span>
            <span className="font-mono">{reservation.product.sku}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Warehouse</span>
            <span className="font-medium">{reservation.warehouse.name}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">Quantity</span>
            <span className="font-medium">{reservation.quantity}</span>
          </div>
          <div className="flex justify-between border-t pt-3 mt-1">
            <span className="font-semibold">Total</span>
            <span className="font-bold text-blue-600 text-base">
              ₹{(reservation.product.price * reservation.quantity).toLocaleString("en-IN")}
            </span>
          </div>
        </div>

        {/* Error / Success Messages */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
            {error}
          </div>
        )}
        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
            {message}
          </div>
        )}

        {/* Actions */}
        {isPending && !isExpired && (
          <div className="flex gap-3 pt-1">
            <button
              onClick={handleCancel}
              disabled={loading !== null}
              className="flex-1 border rounded-md px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
            >
              {loading === "cancel" ? "Cancelling…" : "Cancel"}
            </button>
            <button
              onClick={handleConfirm}
              disabled={loading !== null}
              className="flex-1 bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2.5 text-sm font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {loading === "confirm" ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Confirming…
                </>
              ) : (
                "Confirm Purchase"
              )}
            </button>
          </div>
        )}

        {(reservation.status === "CONFIRMED" || reservation.status === "RELEASED") && (
          <Link
            href="/"
            className="block text-center w-full bg-blue-600 hover:bg-blue-700 text-white rounded-md px-4 py-2.5 text-sm font-medium transition-colors"
          >
            Back to Products
          </Link>
        )}

        {isPending && isExpired && (
          <Link
            href="/"
            className="block text-center w-full border rounded-md px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
          >
            Browse Products
          </Link>
        )}
      </div>
    </div>
  );
}