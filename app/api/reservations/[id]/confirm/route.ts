import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { redis } from "@/lib/redis";
import { Prisma } from "@prisma/client";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      const cacheKey = `idempotency:confirm:${idempotencyKey}`;
      const cached = await redis.get(cacheKey).catch(() => null);
      if (cached) return NextResponse.json(JSON.parse(cached), { status: 200 });
    }

    type TxResult =
      | { kind: "notFound" }
      | { kind: "alreadyConfirmed"; data: object }
      | { kind: "alreadyReleased" }
      | { kind: "expired"; data: object }
      | { kind: "confirmed"; data: object };

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient): Promise<TxResult> => {
        const reservation = await tx.reservation.findUnique({ where: { id } });

        if (!reservation) return { kind: "notFound" };
        if (reservation.status === "CONFIRMED") return { kind: "alreadyConfirmed", data: reservation };
        if (reservation.status === "RELEASED") return { kind: "alreadyReleased" };

        if (reservation.expiresAt < new Date()) {
          const released = await tx.reservation.update({
            where: { id },
            data: { status: "RELEASED" },
            include: { product: true, warehouse: true },
          });
          await tx.stockLevel.update({
            where: { productId_warehouseId: { productId: reservation.productId, warehouseId: reservation.warehouseId } },
            data: { reservedUnits: { decrement: reservation.quantity } },
          });
          return { kind: "expired", data: released };
        }

        const confirmed = await tx.reservation.update({
          where: { id },
          data: { status: "CONFIRMED" },
          include: { product: true, warehouse: true },
        });
        await tx.stockLevel.update({
          where: { productId_warehouseId: { productId: reservation.productId, warehouseId: reservation.warehouseId } },
          data: {
            reservedUnits: { decrement: reservation.quantity },
            totalUnits: { decrement: reservation.quantity },
          },
        });
        return { kind: "confirmed", data: confirmed };
      }
    );

    if (result.kind === "notFound") return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    if (result.kind === "alreadyReleased") return NextResponse.json({ error: "Reservation has already been released" }, { status: 410 });
    if (result.kind === "expired") return NextResponse.json({ error: "Reservation has expired", reservation: result.data }, { status: 410 });

    const responseData = result.data;

    if (idempotencyKey) {
      await redis.set(`idempotency:confirm:${idempotencyKey}`, JSON.stringify(responseData), "EX", 86400).catch(() => {});
    }

    return NextResponse.json(responseData, { status: 200 });
  } catch (error) {
    console.error(`POST /api/reservations/${id}/confirm error:`, error);
    return NextResponse.json({ error: "Failed to confirm reservation" }, { status: 500 });
  }
}
