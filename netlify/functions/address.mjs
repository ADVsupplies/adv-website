import { placesEnabled, suggest, resolve, okSession, okPlaceId } from "./lib/places.mjs";
import { findSuburb } from "./lib/order.mjs";

const json = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

// GET /api/address?q=12 smith&s=<session>   -> { items: [{ id, text }] }
// GET /api/address?id=<placeId>&s=<session> -> { line1, suburb, postcode, zone } | { error }
export default async (req) => {
  if (req.method !== "GET") return json(405, { error: "Method not allowed" });
  if (!placesEnabled()) return json(503, { error: "Address search is not switched on." });

  // Only answer our own pages (keeps other sites from using the lookup).
  const url = new URL(req.url);
  const from = req.headers.get("origin") || req.headers.get("referer") || "";
  const site = process.env.URL || url.origin;
  let host = "";
  try { host = new URL(from).host; } catch {}
  if (host !== url.host && host !== new URL(site).host) return json(403, { error: "Forbidden" });

  const session = okSession(url.searchParams.get("s"));
  try {
    const id = url.searchParams.get("id");
    if (id) {
      if (!okPlaceId(id)) return json(400, { error: "Bad request" });
      const a = await resolve(id, session);
      if (!a) return json(422, { error: "Please pick a full street address, including the street number." });
      if (a.state && a.state !== "VIC") return json(422, { error: "We only deliver in Victoria." });
      const sub = findSuburb(a.suburb);
      return json(200, { line1: a.line1, suburb: sub ? sub.s : a.suburb, postcode: a.postcode, zone: sub ? sub.z : null });
    }
    const q = String(url.searchParams.get("q") || "").trim().slice(0, 80);
    if (q.length < 4) return json(200, { items: [] });
    return json(200, { items: await suggest(q, session) });
  } catch (e) {
    console.error("address lookup error", e);
    return json(502, { error: "Address search isn't working right now." });
  }
};

export const config = { path: "/api/address" };
