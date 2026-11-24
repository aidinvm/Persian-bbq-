import { NextResponse } from "next/server";
import {
  cleanupExpiredReservations,
  getMenuItems,
  getPickupDates,
  getStoreSettings,
} from "@/lib/db";
import { isStripeConfigured } from "@/lib/stripe";
import { isDateAcceptingOrders } from "@/lib/time";
import type { PublicStorePayload } from "@/lib/types";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await cleanupExpiredReservations();
    const [settings, menu, dates] = await Promise.all([
      getStoreSettings(),
      getMenuItems(true),
      getPickupDates(true),
    ]);

    const grillItems = menu.filter((m) => m.countsTowardSlot);

    const publicDates = dates.map((d) => {
      const accepting = isDateAcceptingOrders(
        d.date,
        settings.cutoffEnabled,
        settings.cutoffHour
      );

      // A date is sold out if NO grill item has both stock > 0 AND at least one slot with remaining capacity > 0
      const hasAnyAvailableGrill = grillItems.some((item) => {
        const stock = Number(d.inventory[item.stockKey]) || 0;
        if (stock <= 0) return false;
        const slots = Object.entries(d.timeSlotLimits);
        return slots.some(([slotTime, limits]) => {
          const limit = Number(limits[item.stockKey]) || 0;
          const used = Number(d.timeSlotUsed[slotTime]?.[item.stockKey]) || 0;
          return limit - used > 0;
        });
      });

      const isSoldOut = grillItems.length > 0 && !hasAnyAvailableGrill;

      return {
        date: d.date,
        isAcceptingOrders: accepting,
        isSoldOut,
        inventory: d.inventory,
        timeSlotLimits: d.timeSlotLimits,
        timeSlotUsed: d.timeSlotUsed,
      };
    });

    const payload: PublicStorePayload = {
      settings: {
        isStoreOpen: settings.isStoreOpen,
        maintenanceMode: settings.maintenanceMode,
        paymentMode: settings.paymentMode,
        etransferEmail: settings.etransferEmail,
        pickupAddress: settings.pickupAddress,
        pickupPhone: settings.pickupPhone,
        cutoffEnabled: settings.cutoffEnabled,
        cutoffHour: settings.cutoffHour,
        announcementEn: settings.announcementEn,
        announcementFa: settings.announcementFa,
        stripeConfigured: isStripeConfigured(),
      },
      menu,
      dates: publicDates,
    };

    return NextResponse.json(payload);
  } catch (err) {
    console.error("GET /api/store error:", err);
    return NextResponse.json(
      { error: "Unable to load store availability. Please try again." },
      { status: 500 }
    );
  }
}
