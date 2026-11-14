import { getCatalog } from "./lib/catalog.mjs";
import { SUBURBS } from "./lib/suburbs.mjs";

// GET /api/zones -> live zone prices (from Square) and the suburb list, for the delivery map.
export default async () => {
  try {
    const data = await getCatalog();
    const zones = Object.values(data.zones).map(({ zone, price }) => ({ zone, price }));
    return new Response(JSON.stringify({ zones, suburbs: SUBURBS }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
        "Netlify-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    console.error("zones error", e);
    return new Response(JSON.stringify({ error: "unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
};

export const config = { path: "/api/zones" };
