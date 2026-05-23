import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(
  _request: NextRequest,
  { params }: { params: { id: string } }
) {
  const { id } = params;
  try {
    const reservation = await prisma.reservation.findUnique({
      where: { id },
      include: { product: true, warehouse: true },
    });
    if (!reservation) {
      return NextResponse.json({ error: "Reservation not found" }, { status: 404 });
    }
    return NextResponse.json(reservation);
  } catch (error) {
    console.error(`GET /api/reservations/${id} error:`, error);
    return NextResponse.json({ error: "Failed to fetch reservation" }, { status: 500 });
  }
}
