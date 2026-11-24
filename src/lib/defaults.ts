import type { MenuItem, PickupDateSchedule, StoreSettings } from "./types";
import { getUpcomingWeekendDates } from "./time";

export const DEFAULT_MENU_ITEMS: MenuItem[] = [
  {
    id: "koobideh-rice",
    stockKey: "koobideh",
    category: "grill",
    countsTowardSlot: true,
    nameEn: "Koobideh with Saffron Rice",
    nameFa: "کباب کوبیده با برنج زعفرانی",
    descriptionEn:
      "Two skewers of seasoned halal ground beef (250g each), grilled over hardwood charcoal with grilled tomato & saffron basmati rice.",
    descriptionFa:
      "دو سیخ کباب کوبیده زغالی با گوشت حلال تازه (هر سیخ ۲۵۰ گرم) به همراه گوجه کبابی و برنج ایرانی زعفرانی.",
    badgeEn: "Serves 2",
    badgeFa: "مناسب ۲ نفر",
    priceCents: 3100,
    sortOrder: 1,
    isActive: true,
  },
  {
    id: "joojeh-bone-in",
    stockKey: "joojeh",
    category: "grill",
    countsTowardSlot: true,
    nameEn: "Bone-In Saffron Joojeh",
    nameFa: "جوجه‌کباب با استخوان زعفرانی",
    descriptionEn:
      "Marinated in fresh lemon, onion, and Iranian saffron, charcoal-grilled to smoky perfection with saffron basmati rice.",
    descriptionFa:
      "جوجه‌کباب با استخوان مزه‌دار شده با زعفران اصیل، لیمو تازه و پیاز، کباب‌شده روی ذغال طبیعی همراه برنج زعفرانی.",
    badgeEn: "Serves 2",
    badgeFa: "مناسب ۲ نفر",
    priceCents: 2900,
    sortOrder: 2,
    isActive: true,
  },
  {
    id: "saffron-tiramisu",
    stockKey: "tiramisu",
    category: "dessert",
    countsTowardSlot: false,
    nameEn: "Signature Tiramisu",
    nameFa: "تیرامیسو مخصوص خانگی",
    descriptionEn:
      "House-made creamy mascarpone tiramisu crafted fresh for the weekend. Does not count toward grill time-slot limits.",
    descriptionFa:
      "تیرامیسو خانگی تازه با کرم ماسکارپونه مخصوص آخر هفته. محدودیت ظرفیت زمانی کباب شامل این دسر نمی‌شود.",
    badgeEn: "House-Made",
    badgeFa: "خانگی",
    priceCents: 1200,
    sortOrder: 3,
    isActive: true,
  },
];

export const DEFAULT_STORE_SETTINGS: StoreSettings = {
  isStoreOpen: true,
  maintenanceMode: false,
  paymentMode: "stripe",
  etransferEmail: "aidinvm@gmail.com",
  pickupAddress: "409 Citadel Hills Cir NW, Calgary, AB",
  pickupPhone: "(587) 806-0864",
  cutoffEnabled: true,
  cutoffHour: 21,
  emailAlertsEnabled: true,
  announcementEn: "",
  announcementFa: "",
  masterInventory: {
    koobideh: 24,
    joojeh: 15,
    tiramisu: 30,
  },
  masterTimeSlots: {
    "12:00 PM": { koobideh: 4, joojeh: 3 },
    "1:00 PM": { koobideh: 4, joojeh: 3 },
    "2:00 PM": { koobideh: 4, joojeh: 2 },
    "5:00 PM": { koobideh: 4, joojeh: 3 },
    "6:00 PM": { koobideh: 4, joojeh: 2 },
    "7:00 PM": { koobideh: 4, joojeh: 2 },
  },
};

export function createDefaultPickupDates(): PickupDateSchedule[] {
  const dates = getUpcomingWeekendDates();
  return dates.map((date) => ({
    date,
    isActive: true,
    inventory: { ...DEFAULT_STORE_SETTINGS.masterInventory },
    timeSlotLimits: structuredClone(DEFAULT_STORE_SETTINGS.masterTimeSlots),
    timeSlotUsed: {},
  }));
}
