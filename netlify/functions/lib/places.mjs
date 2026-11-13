// Google Places (New) address search. The key stays on the server (Netlify env var
// GOOGLE_MAPS_KEY) and is never sent to the browser. With no key set, address search
// is switched off and the site falls back to typed address fields.
const BASE = "https://places.googleapis.com/v1";
const YARD = { latitude: -38.0336, longitude: 145.2634 }; // Hampton Park

export const placesEnabled = () => !!process.env.GOOGLE_MAPS_KEY;

async function g(path, { method = "GET", body, mask } = {}) {
  const r = await fetch(BASE + path, {
    method,
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": process.env.GOOGLE_MAPS_KEY,
      ...(mask ? { "X-Goog-FieldMask": mask } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) {
    const e = new Error(`Google Places ${r.status}: ${j?.error?.message || "error"}`);
    e.status = r.status;
    throw e;
  }
  return j;
}

export const okSession = (s) => (/^[A-Za-z0-9_-]{8,36}$/.test(String(s || "")) ? String(s) : undefined);
export const okPlaceId = (s) => /^[A-Za-z0-9_-]{10,300}$/.test(String(s || ""));

export async function suggest(input, session) {
  const req = (types) =>
    g("/places:autocomplete", {
      method: "POST",
      mask: "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text",
      body: {
        input,
        includedRegionCodes: ["au"],
        languageCode: "en-AU",
        locationBias: { circle: { center: YARD, radius: 50000 } },
        ...(types ? { includedPrimaryTypes: types } : {}),
        ...(session ? { sessionToken: session } : {}),
      },
    });
  let j;
  try {
    j = await req(["street_address", "premise", "subpremise"]);
  } catch (e) {
    if (e.status !== 400) throw e;
    j = await req(null);
  }
  return (j.suggestions || [])
    .map((s) => s.placePrediction)
    .filter((p) => p?.placeId && p?.text?.text)
    .slice(0, 6)
    .map((p) => ({ id: p.placeId, text: p.text.text.replace(/, Australia$/, "") }));
}

// Returns { line1, suburb, postcode, state } or null when it is not a full street address.
export async function resolve(placeId, session) {
  const j = await g(
    `/places/${encodeURIComponent(placeId)}?languageCode=en-AU${session ? "&sessionToken=" + session : ""}`,
    { mask: "id,addressComponents" }
  );
  const pick = (type, short) => {
    const c = (j.addressComponents || []).find((x) => (x.types || []).includes(type));
    return c ? String((short ? c.shortText : c.longText) || c.longText || "").trim() : "";
  };
  const number = pick("street_number");
  const route = pick("route");
  const unit = pick("subpremise");
  const suburb = pick("locality") || pick("sublocality") || pick("postal_town");
  const postcode = pick("postal_code");
  const state = pick("administrative_area_level_1", true);
  if (!number || !route || !suburb || !/^\d{4}$/.test(postcode)) return null;
  return { line1: `${unit ? unit + "/" : ""}${number} ${route}`, suburb, postcode, state };
}
