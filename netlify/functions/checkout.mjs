import { getCatalog } from "./lib/catalog.mjs";
import { buildOrder, InputError } from "./lib/order.mjs";
import { sq } from "./lib/square.mjs";
import { placesEnabled, resolve, okPlaceId } from "./lib/places.mjs";

const json = (status, obj) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

export default async (req) => {
  if (req.method !== "POST") return json(405, { error: "Method not allowed" });
  let body;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "Bad request" });
  }

  try {
    const catalog = await getCatalog();

    // Delivery address: the customer picks it from the address search, and the street,
    // suburb and postcode are taken from that one pick here on the server, so the
    // suburb (and its delivery zone) can never differ from the street address.
    if (body.mode !== "pickup" && placesEnabled()) {
      const id = body.address?.placeId;
      if (!okPlaceId(id)) throw new InputError("Please search for your delivery address and pick it from the list.");
      const a = await resolve(id);
      if (!a) throw new InputError("Please pick a full street address, including the street number.");
      if (a.state && a.state !== "VIC") throw new InputError("We only deliver in Victoria.");
      body.suburb = a.suburb;
      body.address = { line1: a.line1, line2: body.address?.line2, postcode: a.postcode };
    }
    const built = buildOrder(catalog, body);
    const site = (process.env.URL || new URL(req.url).origin).replace(/\/$/, "");

    const delivery = built.mode === "delivery";
    // Square's own address step stays off: the address is locked in on our site, and with
    // it on, Square Pay swaps in the buyer's saved address and adds a "Shipping" line.
    const r = await sq("/v2/online-checkout/payment-links", {
      method: "POST",
      body: {
        idempotency_key: crypto.randomUUID(),
        description: `ADV website order ${built.ref}`,
        order: built.order,
        checkout_options: {
          redirect_url: `${site}/thanks.html?ref=${encodeURIComponent(built.ref)}&m=${built.mode}`,
          ask_for_shipping_address: false,
          merchant_support_email: "sales@advsupplies.com.au",
          accepted_payment_methods: { apple_pay: true, google_pay: true },
        },
        pre_populated_data: { buyer_email: built.contact.email, buyer_phone_number: built.contact.phone },
      },
    });

    // Safety net: never send the customer to pay unless Square kept the note that
    // carries the delivery details (Make reads it to build the Detrack job).
    const saved =
      r.related_resources?.orders?.[0] || (await sq(`/v2/orders/${r.payment_link.order_id}`)).order;
    const want = delivery ? "DELIVER TO: " : "PICK UP: ";
    const ok = (saved?.line_items || []).some((l) => String(l.note || "").startsWith(want));
    if (!ok) {
      console.error("order note missing on Square order", r.payment_link.order_id);
      throw new Error("order details not stored");
    }
    return json(200, { url: r.payment_link.url, ref: built.ref });
  } catch (e) {
    if (e instanceof InputError) return json(400, { error: e.message });
    console.error("checkout error", e);
    return json(502, { error: "Sorry, checkout isn't working right now. Please call (03) 9799 6399 and we'll take your order." });
  }
};

export const config = { path: "/api/checkout" };
