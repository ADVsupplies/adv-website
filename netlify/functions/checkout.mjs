import { getCatalog } from "./lib/catalog.mjs";
import { buildOrder, InputError } from "./lib/order.mjs";
import { sq } from "./lib/square.mjs";

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
    const built = buildOrder(catalog, body);
    const site = (process.env.URL || new URL(req.url).origin).replace(/\/$/, "");

    const delivery = built.mode === "delivery";
    const buyer = { buyer_email: built.contact.email, buyer_phone_number: built.contact.phone };
    const link = (askAddress) =>
      sq("/v2/online-checkout/payment-links", {
        method: "POST",
        body: {
          idempotency_key: crypto.randomUUID(),
          description: `ADV website order ${built.ref}`,
          order: built.order,
          checkout_options: {
            redirect_url: `${site}/thanks.html?ref=${encodeURIComponent(built.ref)}&m=${built.mode}`,
            ask_for_shipping_address: askAddress,
            merchant_support_email: "sales@advsupplies.com.au",
            accepted_payment_methods: { apple_pay: true, google_pay: true },
          },
          pre_populated_data: askAddress
            ? {
                ...buyer,
                buyer_address: {
                  first_name: built.contact.first,
                  last_name: built.contact.last,
                  address_line_1: built.address.line1,
                  locality: built.address.suburb,
                  administrative_district_level_1: "VIC",
                  postal_code: built.address.postcode,
                  country: "AU",
                },
              }
            : buyer,
        },
      });

    // Delivery orders show the address on Square's payment page (pre-filled) so it
    // lands on the Square order and receipt. Detrack still uses the address stored
    // in the order metadata, which is the one the delivery zone was charged for.
    let r;
    try {
      r = await link(delivery);
    } catch (e) {
      if (!delivery) throw e;
      console.error("payment link with address step failed, retrying without it", e);
      r = await link(false);
    }

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
