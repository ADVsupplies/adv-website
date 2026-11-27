// ===== ADV website settings — edit here =====
export const CONFIG = {
  locationId: process.env.SQUARE_LOCATION_ID || "L1BHBSX7V7V23", // ADV Master Yard
  phone: "(03) 9799 6399",
  email: "sales@advsupplies.com.au",

  // Square categories that are internal groupings, not shop departments
  hiddenCategories: ["DELIVERY", "TRADE", "FIXED PRICES", "CUSTOM m3"],

  // Stock check is OFF (Square counts are not reliable). Set true to block items Square shows at zero.
  enforceStock: false,

  // Bulk (m³) ordering limits for online orders
  bulkStep: 0.25,          // customers order in quarter-metres
  bulkMaxPerProduct: 9.75, // 10 m³ or more = call the yard
  maxLoads: 4,             // the Detrack scenario creates at most 4 jobs per order

  // The six ADV trucks (same names as Detrack). single = most m³ of ONE material.
  // splits = the two-compartment options [bigger side, smaller side] for TWO materials.
  // Bags, hardware, blocks etc. ride in the cab (no extra load).
  fleet: [
    { id: "T1", single: 3, splits: [[1.5, 1.5]] },
    { id: "T2", single: 4, splits: [[2, 2]] },
    { id: "T3", single: 4, splits: [[2, 2]] },
    { id: "T4", single: 8, splits: [[4, 2], [3, 3]] },
    { id: "T5", single: 8, splits: [[4, 2], [3, 3]] },
    { id: "T6", single: 10, splits: [] },
  ],
  minBulkForDelivery: 1,
  // What can be delivered: every bulk (m³) product, plus the non-bulk products matched here.
  // Everything else is pick up only.
  deliverNonBulk: [{ category: "TIMBERS", nameIncludes: "SLEEPER" }],

  // Delivery / pickup dates
  firstDayOffset: 1,       // earliest = tomorrow
  maxDaysAhead: 30,
  closedWeekdays: [0],     // 0 = Sunday
  // Delivery times customers can pick (Mon-Sat). Latest time depends on the zone.
  deliveryTimes: {
    first: "08:00",        // earliest delivery time offered
    stepMinutes: 30,
    latestByZone: [        // first rule whose maxZone >= the zone wins
      { maxZone: 3, latest: "15:30" },
      { maxZone: 10, latest: "14:30" },
    ],
  },
  sundayMessage: "Sunday deliveries: please call the yard on (03) 9799 6399 for availability. A Sunday surcharge applies.",
  deliverHour: 12,         // midday Melbourne = same calendar date in UTC, so Make/Detrack never shift the day
  timeZone: "Australia/Melbourne",

  // Where the truck may tip. Trucks are insured on the road only, so no backyards.
  tipLocations: ["Driveway", "Crossover", "Nature strip"],
};
