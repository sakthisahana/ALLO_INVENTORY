export const dynamic = "force-dynamic";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  // Protect the cron endpoint with a secret
  const authHeader = request.headers.get("authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const expiredReservations = await prisma.reservation.findMany({
      where: {
        status: "PENDING",
        expiresAt: { lt: new Date() },
      },
    });

    let released = 0;

    for (const reservation of expiredReservations) {
      await prisma.$transaction([
        prisma.reservation.update({
          where: { id: reservation.id },
          data: { status: "RELEASED" },
        }),
        prisma.stockLevel.update({
          where: {
            productId_warehouseId: {
              productId: reservation.productId,
              warehouseId: reservation.warehouseId,
            },
          },
          data: { reservedUnits: { decrement: reservation.quantity } },
        }),
      ]);
      released++;
    }

    console.log(`Cron: released ${released} expired reservations`);
    return NextResponse.json({ released, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error("Cron expire-reservations error:", error);
    return NextResponse.json({ error: "Cron job failed" }, { status: 500 });
  }
}
