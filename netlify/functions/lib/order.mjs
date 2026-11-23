import { CONFIG } from "./config.mjs";
import { SUBURBS } from "./suburbs.mjs";

export class InputError extends Error {}

const round2 = (n) => Math.round(n * 100) / 100;

export function findSuburb(name) {
  const k = String(name || "").trim().toLowerCase();
  return SUBURBS.find((s) => s.s.toLowerCase() === k) || null;
}

// Melbourne-local date "YYYY-MM-DD" for a Date
export function localDate(d, tz = CONFIG.timeZone) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// RFC3339 timestamp for a local date + hour in Melbourne (handles daylight saving)
export function localTimestamp(dateStr, hour, tz = CONFIG.timeZone) {
  const guess = new Date(`${dateStr}T${String(hour).padStart(2, "0")}:00:00Z`);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit",
    }).formatToParts(guess).map((p) => [p.type, p.value])
  );
  const asLocal = Date.UTC(+parts.year, +parts.month - 1, +parts.day, +parts.hour, +parts.minute);
  const offsetMin = Math.round((asLocal - guess.getTime()) / 60000);
  const sign = offsetMin >= 0 ? "+" : "-";
  const a = Math.abs(offsetMin);
  return `${dateStr}T${String(hour).padStart(2, "0")}:00:00${sign}${String(Math.floor(a / 60)).padStart(2, "0")}:${String(a % 60).padStart(2, "0")}`;
}

export function validDate(dateStr, now = new Date()) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateStr || "")) return false;
  const today = localDate(now);
  const day = (s) => Date.UTC(+s.slice(0, 4), +s.slice(5, 7) - 1, +s.slice(8, 10)) / 86400000;
  const diff = day(dateStr) - day(today);
  const wd = new Date(day(dateStr) * 86400000).getUTCDay();
  return diff >= CONFIG.firstDayOffset && diff <= CONFIG.maxDaysAhead && !CONFIG.closedWeekdays.includes(wd);
}

export function auPhone(p) {
  const d = String(p || "").replace(/[^\d+]/g, "");
  if (/^\+61\d{9}$/.test(d)) return d;
  if (/^61\d{9}$/.test(d)) return "+" + d;
  if (/^0\d{9}$/.test(d)) return "+61" + d.slice(1);
  return null;
}

// Turn the cart into Square line items. Prices always come from the Square catalog, never the browser.
export function buildLines(catalog, items) {
  if (!Array.isArray(items) || !items.length) throw new InputError("Your cart is empty.");
  const byId = Object.fromEntries(catalog.products.map((p) => [p.id, p]));
  const lines = [];
  let bulkCount = 0;
  const volumes = [];
  const noZone = [];
  for (const it of items) {
    const p = byId[it.id];
    if (!p) throw new InputError("One of the products in your cart is no longer available. Please refresh the page.");
    if (p.bulk) {
      const q = round2(+it.qty);
      const step = CONFIG.bulkStep;
      if (!(q >= step) || Math.abs(q / step - Math.round(q / step)) > 1e-9)
        throw new InputError(`${p.name}: choose a quantity in ${step} m³ steps.`);
      if (q > CONFIG.bulkMaxPerProduct)
        throw new InputError(`${p.name}: for 10 m³ or more please call us on ${CONFIG.phone}.`);
      if (p.stock != null && q > p.stock)
        throw new InputError(p.stock < step ? `${p.name} is out of stock. Please call ${CONFIG.phone}.` : `${p.name}: only ${p.stock} m³ in stock.`);
      bulkCount++;
      volumes.push(q);
      const fx = p._fixed && p._fixed[q];
      if (q < 1 && fx) lines.push({ catalog_object_id: fx.id, quantity: "1" });
      else
        // One clear line per material, e.g. "Tree Mulch x 2.5 m³" at the full price.
        // (Square's payment page rounds 2.5 m³ to "x 2" when the line is a catalog item.)
        // Make reads the cubic metres from the " x N" at the end of the name.
        lines.push({
          name: `${p.name} x ${String(q)} m³`.slice(0, 500),
          quantity: "1",
          base_price_money: { amount: Math.round(p.price * q), currency: "AUD" },
        });
    } else {
      if (!p.deliver) noZone.push(p.name);
      const v = p.variations.find((x) => x.id === it.variationId) || (p.variations.length === 1 ? p.variations[0] : null);
      if (!v) throw new InputError(`${p.name}: choose an option.`);
      const q = Math.floor(+it.qty);
      if (!(q >= 1 && q <= 999)) throw new InputError(`${p.name}: quantity must be between 1 and 999.`);
      if (v.stock != null && q > v.stock)
        throw new InputError(v.stock === 0 ? `${p.name} is out of stock. Please call ${CONFIG.phone}.` : `${p.name}: only ${v.stock} in stock.`);
      lines.push({ catalog_object_id: v.id, quantity: String(q) });
    }
  }
  return { lines, bulkCount, volumes, noZone };
}

// Can two materials (m³ each) share one truck's two compartments?
export function fitsTogether(a, b) {
  const hi = Math.max(a, b), lo = Math.min(a, b);
  return CONFIG.fleet.some((t) => t.splits.some(([x, y]) => hi <= x && lo <= y));
}

// Fewest truck loads for a list of bulk volumes (m³), using the real fleet in config.
export function loadsFor(volumes) {
  const v = volumes.filter((x) => x > 0);
  if (!v.length) return 1; // bags / hardware only
  const maxSingle = Math.max(...CONFIG.fleet.map((t) => t.single));
  let loads = 0;
  const left = [];
  for (const q of v) {
    loads += Math.floor(q / maxSingle);
    const rest = Math.round((q % maxSingle) * 100) / 100;
    if (rest > 0) left.push(rest);
  }
  left.sort((x, y) => y - x);
  if (left.length > 10) return loads + left.length;
  const best = (list) => {
    if (!list.length) return 0;
    const [a, ...rest] = list;
    let m = 1 + best(rest);
    for (let j = 0; j < rest.length; j++)
      if (fitsTogether(a, rest[j])) m = Math.min(m, 1 + best(rest.filter((_, i) => i !== j)));
    return m;
  };
  return loads + best(left);
}

export function buildOrder(catalog, body, now = new Date()) {
  const mode = body.mode === "pickup" ? "pickup" : "delivery";
  const c = body.contact || {};
  const first = String(c.first || "").trim().slice(0, 60);
  const last = String(c.last || "").trim().slice(0, 60);
  const email = String(c.email || "").trim().slice(0, 120);
  const phone = auPhone(c.phone);
  if (!first || !last) throw new InputError("Please enter your first and last name.");
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new InputError("Please enter a valid email address.");
  if (!phone) throw new InputError("Please enter a valid Australian phone number.");
  if (!validDate(body.date, now)) throw new InputError("Please choose a valid date (Monday to Saturday, from tomorrow).");
  let notes = String(body.notes || "").trim().slice(0, 400);
  if (mode === "delivery") {
    const tip = CONFIG.tipLocations.find((t) => t.toLowerCase() === String(body.tip || "").toLowerCase());
    if (!tip) throw new InputError("Please choose where to tip it: " + CONFIG.tipLocations.join(", ") + ".");
    notes = "TIP ON: " + tip.toUpperCase() + (notes ? " | " + notes : "");
  }

  const { lines, bulkCount, volumes, noZone } = buildLines(catalog, body.items);
  if (mode === "pickup" && volumes.reduce((x, y) => x + y, 0) >= CONFIG.minBulkForDelivery)
    throw new InputError(`Bulk orders of ${CONFIG.minBulkForDelivery} m³ or more are delivery only. Please choose delivery.`);
  const display = `${first} ${last}`;
  const ref = "WEB-" + now.getTime().toString(36).toUpperCase().slice(-6) + Math.random().toString(36).slice(2, 4).toUpperCase();

  let zoneLine = null;
  let suburb = null;
  let address = null;
  if (mode === "delivery") {
    suburb = findSuburb(body.suburb);
    if (!suburb) throw new InputError(`We don't have a set rate for that suburb. Please call ${CONFIG.phone} to arrange delivery.`);
    const zone = catalog.zones[suburb.z];
    if (!zone) throw new InputError(`Delivery to Zone ${suburb.z} isn't available online right now. Please call ${CONFIG.phone}.`);
    const line1 = String(body.address?.line1 || "").trim().slice(0, 120);
    const line2 = String(body.address?.line2 || "").trim().slice(0, 120);
    const postcode = String(body.address?.postcode || suburb.pc || "").trim();
    if (line1.length < 4) throw new InputError("Please enter the street address for delivery.");
    if (!/^\d{4}$/.test(postcode)) throw new InputError("Please enter a 4-digit postcode.");
    if (noZone.length)
      throw new InputError(`Pick up only: ${noZone.join(", ")}. We deliver bulk materials and timber sleepers. Remove ${noZone.length > 1 ? "these items" : "this item"} or choose pick up.`);
    const totalBulk = volumes.reduce((a, b) => a + b, 0);
    if (bulkCount && totalBulk < CONFIG.minBulkForDelivery)
      throw new InputError(`Minimum delivery is ${CONFIG.minBulkForDelivery} m³. Anything less is pick up only. Please choose pick up.`);
    const loads = loadsFor(volumes);
    if (loads > CONFIG.maxLoads)
      throw new InputError(`That order needs more than ${CONFIG.maxLoads} truck loads. Please call ${CONFIG.phone} and we'll organise it.`);
    lines.push({ catalog_object_id: zone.variationId, quantity: String(loads) });
    address = { line1: line2 ? `${line1}, ${line2}` : line1, suburb: suburb.s, postcode };
    zoneLine = lines[lines.length - 1];
  }

  // Delivery details travel on the Square order in a note on the delivery line:
  //   DELIVER TO: address | date | name | phone | email | TIP ON: X | customer notes
  // Make splits it on " | " to build the Detrack job. Square payment links keep neither a
  // delivery fulfillment nor order metadata, so nothing relies on those.
  const clip = (s, n = 250) => String(s).slice(0, n);
  const bar = (s) => String(s).replace(/\s*\|\s*/g, " "); // keep the note's " | " separators unambiguous
  const metadata = { adv_mode: mode, adv_name: clip(display), adv_phone: phone, adv_email: clip(email), adv_date: body.date };
  if (notes) metadata.adv_note = clip(notes);
  if (mode === "delivery") {
    metadata.adv_line1 = clip(address.line1);
    metadata.adv_suburb = address.suburb;
    metadata.adv_postcode = address.postcode;
    zoneLine.note = clip(
      `DELIVER TO: ${address.line1}, ${address.suburb} VIC ${address.postcode} | ${body.date} | ${bar(display)} | ${phone} | ${bar(email)}${notes ? " | " + notes : ""}`,
      480
    );
  } else {
    lines[0].note = clip(`PICK UP: ${body.date} | ${bar(display)} | ${phone} | ${bar(email)}${notes ? " | " + notes : ""}`, 480);
  }

  const order = {
    location_id: CONFIG.locationId,
    reference_id: ref,
    source: { name: "ADV Website" },
    pricing_options: { auto_apply_taxes: true },
    line_items: lines,
    metadata,
  };
  return { order, ref, mode, contact: { first, last, email, phone }, address, suburb, notes };
}
