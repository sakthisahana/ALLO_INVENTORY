import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { acquireLock, releaseLock } from "@/lib/redis";
import { CreateReservationSchema } from "@/lib/schemas";
import { ZodError } from "zod";

export async function GET() {
  try {
    const reservations = await prisma.reservation.findMany({
      include: { product: true, warehouse: true },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json(reservations);
  } catch (error) {
    console.error("GET /api/reservations error:", error);
    return NextResponse.json({ error: "Failed to fetch reservations" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const input = CreateReservationSchema.parse(body);

    const idempotencyKey = request.headers.get("Idempotency-Key");
    if (idempotencyKey) {
      const existing = await prisma.reservation.findUnique({
        where: { idempotencyKey },
        include: { product: true, warehouse: true },
      });
      if (existing) return NextResponse.json(existing, { status: 200 });
    }

    const lockKey = `lock:stock:${input.productId}:${input.warehouseId}`;
    const lockValue = await acquireLock(lockKey);
    if (!lockValue) {
      return NextResponse.json(
        { error: "Service is temporarily busy. Please retry." },
        { status: 503 }
      );
    }

    try {
      const stockLevel = await prisma.stockLevel.findUnique({
        where: {
          productId_warehouseId: {
            productId: input.productId,
            warehouseId: input.warehouseId,
          },
        },
      });

      if (!stockLevel) {
        return NextResponse.json(
          { error: "Product not available in this warehouse" },
          { status: 404 }
        );
      }

      const availableUnits = stockLevel.totalUnits - stockLevel.reservedUnits;
      if (availableUnits < input.quantity) {
        return NextResponse.json(
          { error: "Not enough stock available", available: availableUnits, requested: input.quantity },
          { status: 409 }
        );
      }

      const expiresAt = new Date(Date.now() + 10 * 60 * 1000);

      const [reservation] = await prisma.$transaction([
        prisma.reservation.create({
          data: {
            productId: input.productId,
            warehouseId: input.warehouseId,
            quantity: input.quantity,
            status: "PENDING",
            expiresAt,
            ...(idempotencyKey ? { idempotencyKey } : {}),
          },
          include: { product: true, warehouse: true },
        }),
        prisma.stockLevel.update({
          where: {
            productId_warehouseId: {
              productId: input.productId,
              warehouseId: input.warehouseId,
            },
          },
          data: { reservedUnits: { increment: input.quantity } },
        }),
      ]);

      return NextResponse.json(reservation, { status: 201 });
    } finally {
      await releaseLock(lockKey, lockValue);
    }
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Invalid input", details: error.errors }, { status: 400 });
    }
    console.error("POST /api/reservations error:", error);
    return NextResponse.json({ error: "Failed to create reservation" }, { status: 500 });
  }
}
