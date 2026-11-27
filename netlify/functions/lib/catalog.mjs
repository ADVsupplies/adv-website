import { sq } from "./square.mjs";
import { placesEnabled } from "./places.mjs";
import { CONFIG } from "./config.mjs";
import { SUBURBS } from "./suburbs.mjs";

const TTL_MS = 5 * 60 * 1000;
let cache = { at: 0, data: null };

const VERSION_TAGS = ["CUSTOM", "FIXED", "TRADE", "ONLINE"];

function suffixTag(name) {
  const m = name.match(/\(([^)]*)\)\s*$/);
  const tag = m ? m[1].trim().toUpperCase() : "";
  return VERSION_TAGS.includes(tag) ? tag : "";
}

export function baseName(name) {
  return name
    .toUpperCase()
    .replace(/\((CUSTOM|FIXED|TRADE|ONLINE)\)\s*$/, "")
    .replace(/\bPER\s+(M3|CUBIC\s+MET(RE|ER)S?)\b/g, "")
    .replace(/\s+/g, " ")
    .replace(/[\s\-–]+$/, "")
    .trim();
}

export function niceName(name) {
  return name
    .toLowerCase()
    .replace(/(^|[\s(\/-])([a-z])/g, (m, p, c) => p + c.toUpperCase())
    .replace(/(\d)(Mm|Cm|M|Kg|L|Ml)\b/g, (m, d, u) => d + u.toLowerCase())
    .replace(/\b(Gp|Pvc|Abc|Adv|Diy|Ph|Npk)\b/g, (w) => w.toUpperCase());
}

function atLocation(obj) {
  const loc = CONFIG.locationId;
  if (obj.present_at_all_locations) return !(obj.absent_at_location_ids || []).includes(loc);
  return (obj.present_at_location_ids || []).includes(loc);
}

function fractionOf(variationName) {
  const tok = (variationName || "").trim().split(/\s+/)[0] || "";
  const [n, d] = tok.split("/").map((x) => parseFloat(x.replace(/[^0-9.]/g, "")));
  if (!isNaN(n) && !isNaN(d) && d > 0) return n / d;
  if (!isNaN(n) && n > 0) return n;
  return null;
}

async function fetchAllItems() {
  const objects = [];
  const related = [];
  let cursor;
  do {
    const r = await sq("/v2/catalog/search", {
      method: "POST",
      body: { object_types: ["ITEM"], include_related_objects: true, limit: 1000, cursor },
    });
    objects.push(...(r.objects || []));
    related.push(...(r.related_objects || []));
    cursor = r.cursor;
  } while (cursor);
  return { objects, related };
}

// Live stock counts from Square. Returns null if they can't be read (site then doesn't limit stock).
async function fetchCounts() {
  if (!CONFIG.enforceStock) return null;
  try {
    const counts = {};
    let cursor;
    do {
      const r = await sq("/v2/inventory/counts/batch-retrieve", {
        method: "POST",
        body: { location_ids: [CONFIG.locationId], states: ["IN_STOCK"], limit: 1000, cursor },
      });
      for (const c of r.counts || []) counts[c.catalog_object_id] = parseFloat(c.quantity);
      cursor = r.cursor;
    } while (cursor);
    return counts;
  } catch (e) {
    console.warn("stock counts unavailable, not limiting stock:", e.message);
    return null;
  }
}

// null = no limit (not tracked in Square); a number = how many can be sold
function stockOf(id, d, counts, whole = true) {
  if (!CONFIG.enforceStock || !counts) return null;
  const lo = (d.location_overrides || []).find((x) => x.location_id === CONFIG.locationId);
  if (lo && lo.sold_out) return 0;
  const tracked = lo && lo.track_inventory != null ? lo.track_inventory : d.track_inventory;
  if (!tracked || counts[id] == null) return null;
  const q = Math.max(0, counts[id]);
  return whole ? Math.floor(q) : q;
}

export function buildCatalog({ objects, related }, counts = null) {
  const images = {};
  const cats = {};
  let m3UnitIds = new Set();
  for (const o of related) {
    if (o.type === "IMAGE") images[o.id] = o.image_data?.url;
    if (o.type === "CATEGORY") cats[o.id] = o.category_data?.name;
    if (o.type === "MEASUREMENT_UNIT") {
      const u = o.measurement_unit_data?.measurement_unit?.custom_unit;
      if (u && /^(m3|m³|cubic\s*met)/i.test(u.abbreviation || u.name || "")) m3UnitIds.add(o.id);
    }
  }
  const hidden = new Set(CONFIG.hiddenCategories.map((c) => c.toUpperCase()));

  const zones = {};
  const live = objects.filter(
    (o) => o.type === "ITEM" && !o.is_deleted && !o.item_data?.is_archived && atLocation(o)
  );

  const sellableVariations = (item) =>
    (item.item_data.variations || [])
      .filter((v) => !v.is_deleted && atLocation(v))
      .map((v) => ({ id: v.id, d: v.item_variation_data || {} }))
      .filter((v) => v.d.sellable !== false && v.d.pricing_type === "FIXED_PRICING" && v.d.price_money?.amount > 0);

  // Delivery zone items
  for (const o of live) {
    const m = o.item_data.name.match(/^DELIVERY ZONE\.?\s*\(\s*(\d+)\s*\)/i);
    if (!m) continue;
    const v = sellableVariations(o)[0];
    if (v) zones[+m[1]] = { zone: +m[1], variationId: v.id, price: v.d.price_money.amount, name: o.item_data.name };
  }

  // FIXED fraction partners keyed by base name
  const fixed = {};
  for (const o of live) {
    if (suffixTag(o.item_data.name) !== "FIXED") continue;
    const fr = {};
    for (const v of sellableVariations(o)) {
      const f = fractionOf(v.d.name);
      if (f && f < 1 && [0.25, 0.5, 0.75].includes(f)) fr[f] = { id: v.id, price: v.d.price_money.amount };
    }
    fixed[baseName(o.item_data.name)] = fr;
  }
  const customBases = new Set(
    live.filter((o) => suffixTag(o.item_data.name) === "CUSTOM").map((o) => baseName(o.item_data.name))
  );

  const products = [];
  for (const o of live) {
    const i = o.item_data;
    const tag = suffixTag(i.name);
    if (tag === "FIXED" || tag === "TRADE") continue;
    if (tag === "ONLINE" && customBases.has(baseName(i.name))) continue;
    if (i.ecom_visibility === "HIDDEN") continue;
    const catNames = (i.categories || []).map((c) => cats[c.id]).filter(Boolean);
    if (catNames.some((c) => ["DELIVERY", "TRADE"].includes(c.toUpperCase()))) continue; // never sold as products online
    const category = catNames.find((c) => !hidden.has(c.toUpperCase()));
    if (!category) continue;
    const vars = sellableVariations(o);
    if (!vars.length) continue;

    const base = baseName(i.name);
    const isBulk = tag === "CUSTOM" || vars.some((v) => m3UnitIds.has(v.d.measurement_unit_id));
    const img = (i.image_ids || []).map((id) => images[id]).find(Boolean) || null;
    const p = {
      id: o.id,
      name: niceName(base),
      desc: (i.description_plaintext || i.description || "").trim().slice(0, 700),
      image: img,
      category,
      bulk: isBulk,
    };
    if (isBulk) {
      const v = vars.find((x) => /retail/i.test(x.d.name || "")) || vars[0];
      p.variationId = v.id;
      p.price = v.d.price_money.amount; // per m³
      const st = stockOf(v.id, v.d, counts, false);
      if (st != null) p.stock = st;
      p.out = st != null && st < CONFIG.bulkStep;
      const fr = fixed[base] || {};
      p.fractions = Object.fromEntries(Object.entries(fr).map(([k, x]) => [k, x.price]));
      p._fixed = fr;
    } else {
      p.variations = vars.map((v) => {
        const st = stockOf(v.id, v.d, counts);
        return { id: v.id, name: v.d.name || "", price: v.d.price_money.amount, ...(st != null ? { stock: st } : {}) };
      });
      p.price = Math.min(...p.variations.map((v) => v.price));
      p.out = p.variations.every((v) => v.stock === 0);
    }
    p.deliver =
      isBulk ||
      CONFIG.deliverNonBulk.some(
        (r) => category.toUpperCase() === r.category && base.includes(r.nameIncludes)
      );
    products.push(p);
  }
  products.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));

  const categories = [...new Set(products.map((p) => p.category))];
  return { products, categories, zones };
}

export async function getCatalog() {
  if (cache.data && Date.now() - cache.at < TTL_MS) return cache.data;
  const [items, counts] = await Promise.all([fetchAllItems(), fetchCounts()]);
  const data = buildCatalog(items, counts);
  cache = { at: Date.now(), data };
  return data;
}

export function publicCatalog(data) {
  return {
    products: data.products.map(({ _fixed, ...p }) => p),
    categories: data.categories,
    zones: Object.values(data.zones).map(({ zone, price }) => ({ zone, price })),
    suburbs: SUBURBS,
    settings: {
      phone: CONFIG.phone,
      email: CONFIG.email,
      bulkStep: CONFIG.bulkStep,
      bulkMaxPerProduct: CONFIG.bulkMaxPerProduct,
      maxLoads: CONFIG.maxLoads,
      fleet: CONFIG.fleet,
      minBulkForDelivery: CONFIG.minBulkForDelivery,
      tipLocations: CONFIG.tipLocations,
      firstDayOffset: CONFIG.firstDayOffset,
      maxDaysAhead: CONFIG.maxDaysAhead,
      closedWeekdays: CONFIG.closedWeekdays,
      deliveryTimes: CONFIG.deliveryTimes,
      sundayMessage: CONFIG.sundayMessage,
      addressSearch: placesEnabled(),
    },
  };
}
