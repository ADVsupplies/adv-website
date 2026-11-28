// POST /api/signup — website sign-ups into HubSpot (needs HUBSPOT_TOKEN).
//   { kind: "trade", business, abn, name, mobile, email, trade, suburbs }
//   { kind: "news", email, name? }
//   { kind: "quote", name, email, phone?, suburb?, mode?, items }  (from the cart prompt in nudge.js)
// Netlify Forms keeps its own copy (the browser posts there too), so nothing is lost if HubSpot is down.
import { upsertContact, addNote, esc } from "./lib/leads.mjs";
import { auPhone } from "./lib/order.mjs";

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const clean = (s, n = 200) => String(s == null ? "" : s).replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);
const validEmail = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e);

function splitName(name) {
  const [first, ...rest] = clean(name, 100).split(/\s+/);
  return { firstname: first || "", lastname: rest.join(" ") };
}

export function tradeContact(b) {
  const email = clean(b.email, 150).toLowerCase();
  const abn = clean(b.abn, 20).replace(/\D/g, "");
  if (!validEmail(email)) return { error: "Please enter a valid email." };
  if (abn.length !== 11) return { error: "Please enter your 11-digit ABN." };
  if (!clean(b.business) || !clean(b.name)) return { error: "Please fill in your business and your name." };
  const mobile = clean(b.mobile, 40);
  return {
    email,
    props: { ...splitName(b.name), phone: auPhone(mobile) || mobile, company: clean(b.business, 150), hs_lead_status: "NEW", website_lead_source: "Trade application" },
    note:
      `<p><b>Trade account application (website)</b></p>` +
      `<p>Business: ${esc(clean(b.business, 150))}<br>ABN: ${esc(abn)}<br>Name: ${esc(clean(b.name, 100))}<br>` +
      `Mobile: ${esc(mobile)}<br>Email: ${esc(email)}<br>Trade: ${esc(clean(b.trade, 60) || "-")}<br>` +
      `Suburbs: ${esc(clean(b.suburbs, 300) || "-")}</p><p>Status: waiting for approval. Set them up as trade in Square once approved.</p>`,
  };
}

export function newsContact(b) {
  const email = clean(b.email, 150).toLowerCase();
  if (!validEmail(email)) return { error: "Please enter a valid email." };
  return {
    email,
    props: { ...splitName(b.name), website_lead_source: "Email sign-up" },
    note: `<p><b>Signed up to ADV emails (website footer)</b></p><p>Agreed to receive offers and news by email on ${new Date().toISOString().slice(0, 10)}.</p>`,
  };
}

export function quoteContact(b) {
  const email = clean(b.email, 150).toLowerCase();
  if (!validEmail(email)) return { error: "Please enter a valid email." };
  if (!clean(b.name)) return { error: "Please enter your first name." };
  const phone = clean(b.phone, 40);
  const items = String(b.items || "").slice(0, 1500).split(/\n/).map((i) => clean(i, 150)).filter(Boolean).slice(0, 20);
  if (!items.length) return { error: "Your cart is empty." };
  const suburb = clean(b.suburb, 80);
  return {
    email,
    props: { ...splitName(b.name), phone: auPhone(phone) || phone, city: suburb, hs_lead_status: "NEW", website_lead_source: "Quote request" },
    note:
      `<p><b>Quote request from the website cart</b></p>` +
      `<p>${items.map((i) => esc(i)).join("<br>")}</p>` +
      `<p>${b.mode === "pickup" ? "Pick up" : "Delivery to: " + esc(suburb || "suburb not chosen yet")}<br>` +
      `Phone: ${esc(phone || "-")} · Email: ${esc(email)}</p><p>Please send them the quote or give them a call.</p>`,
  };
}

// SMS alert to the yard mobile via Make → ClickSend (scenario "Website lead → SMS alert").
const SMS_HOOK = process.env.LEAD_SMS_WEBHOOK_URL || "https://hook.us2.make.com/r2ygivoj1y42iih4paqhi4u5w2jngfqw";
export function smsText(kind, b) {
  const name = clean(b.name, 60), phone = clean(b.phone || b.mobile, 30);
  if (kind === "trade") return `New ADV trade application: ${name}, ${clean(b.business, 60)}, ${phone}. Suburbs: ${clean(b.suburbs, 60) || "-"}. Check HubSpot.`;
  if (kind === "quote") {
    const items = String(b.items || "").split(/\n/).map((i) => clean(i, 60)).filter(Boolean).slice(0, 3).join("; ");
    return `New ADV quote request: ${name}, ${phone || clean(b.email, 60)}, ${clean(b.suburb, 40) || "suburb n/a"}. ${items}. Check HubSpot.`;
  }
  return null;
}
async function smsAlert(kind, b) {
  const text = smsText(kind, b);
  if (!text || !SMS_HOOK) return;
  try {
    await fetch(SMS_HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ text: text.slice(0, 300), kind }) });
  } catch (e) {
    console.error("sms alert failed", e.message);
  }
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  let b;
  try { b = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  if (clean(b.company_website) || clean(b.hp)) return json({ ok: true }); // bot honeypot

  const c =
    b.kind === "trade" ? tradeContact(b) : b.kind === "news" ? newsContact(b) : b.kind === "quote" ? quoteContact(b) : { error: "Bad request" };
  if (c.error) return json({ error: c.error }, 400);

  await smsAlert(b.kind, b);

  if (!process.env.HUBSPOT_TOKEN) {
    console.error("signup: HUBSPOT_TOKEN not set", b.kind, c.email);
    return json({ ok: true, hubspot: false });
  }
  try {
    const id = await upsertContact(c.email, c.props);
    await addNote(id, c.note);
    return json({ ok: true, hubspot: true });
  } catch (e) {
    console.error("signup -> HubSpot failed", b.kind, e.message);
    return json({ ok: true, hubspot: false }); // Netlify Forms still has it
  }
};

export const config = { path: "/api/signup" };
