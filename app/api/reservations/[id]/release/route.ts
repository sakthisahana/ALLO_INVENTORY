import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";

export async function POST(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;

  try {
    type TxResult =
      | { kind: "notFound" }
      | { kind: "alreadyConfirmed" }
      | { kind: "released"; data: object };

    const result = await prisma.$transaction(
      async (tx: Prisma.TransactionClient): Promise<TxResult> => {
        const reservation = await tx.reservation.findUnique({ where: { id } });

        if (!reservation) return { kind: "notFound" };
        if (reservation.status === "CONFIRMED") return { kind: "alreadyConfirmed" };
        if (reservation.status === "RELEASED") {
          return { kind: "released", data: reservation };
        }

        const released = await tx.reservation.update({
          where: { id },
          data: { status: "RELEASED" },
          include: { product: true, warehouse: true },
        });
        await tx.stockLevel.update({
          where: { productId_warehouseId: { productId: reservation.productId, warehouseId: reservation.warehouseId } },
          data: { reservedUnits: { decrement: reservation.quantity } },
        });
        return { kind: "released", data: released };
      }
    );

    if (result.kind === "notFound") return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    if (result.kind === "alreadyConfirmed") return NextResponse.json({ error: "Cannot release a confirmed reservation" }, { status: 409 });

    return NextResponse.json(result.data, { status: 200 });
  } catch (error) {
    console.error(`POST /api/reservations/${id}/release error:`, error);
    return NextResponse.json({ error: "Failed to release reservation" }, { status: 500 });
  }
}
