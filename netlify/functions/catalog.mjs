import { getCatalog, publicCatalog } from "./lib/catalog.mjs";

export default async () => {
  try {
    const data = await getCatalog();
    return new Response(JSON.stringify(publicCatalog(data)), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=60",
        "Netlify-CDN-Cache-Control": "public, s-maxage=300, stale-while-revalidate=600",
      },
    });
  } catch (e) {
    console.error("catalog error", e);
    return new Response(JSON.stringify({ error: "Products couldn't be loaded. Please try again shortly." }), {
      status: 502,
      headers: { "Content-Type": "application/json" },
    });
  }
};

export const config = { path: "/api/catalog" };
