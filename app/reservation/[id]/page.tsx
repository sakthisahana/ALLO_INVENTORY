import { prisma } from "@/lib/prisma";
import { notFound } from "next/navigation";
import ReservationDetail from "@/components/ReservationDetail";

export const dynamic = "force-dynamic";

export default async function ReservationPage({
  params,
}: {
  params: { id: string };
}) {
  const reservation = await prisma.reservation.findUnique({
    where: { id: params.id },
    include: { product: true, warehouse: true },
  });

  if (!reservation) notFound();

  const serialized = {
    id: reservation.id,
    status: reservation.status,
    quantity: reservation.quantity,
    expiresAt: reservation.expiresAt.toISOString(),
    createdAt: reservation.createdAt.toISOString(),
    product: {
      id: reservation.product.id,
      name: reservation.product.name,
      sku: reservation.product.sku,
      price: reservation.product.price,
    },
    warehouse: {
      id: reservation.warehouse.id,
      name: reservation.warehouse.name,
      location: reservation.warehouse.location,
    },
  };

  return <ReservationDetail reservation={serialized} />;
}
