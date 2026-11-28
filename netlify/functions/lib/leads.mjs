// Save a chat lead: HubSpot contact + note (HUBSPOT_TOKEN), and optionally a Make webhook (LEAD_WEBHOOK_URL) for Notion.
import { auPhone } from "./order.mjs";

const HS = "https://api.hubapi.com";

export async function hs(path, body) {
  const res = await fetch(HS + path, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.HUBSPOT_TOKEN}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`HubSpot ${res.status}: ${json.message || "error"}`);
  return json;
}

const clean = (s, n = 200) => String(s || "").replace(/[\u0000-\u001f]/g, " ").trim().slice(0, n);

export function tidyLead(input) {
  const name = clean(input.name, 100);
  const [firstname, ...rest] = name.split(/\s+/);
  const email = clean(input.email, 150).toLowerCase();
  const phoneRaw = clean(input.phone, 40);
  return {
    name,
    firstname: firstname || "",
    lastname: rest.join(" "),
    email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : "",
    phone: auPhone(phoneRaw) || phoneRaw,
    suburb: clean(input.suburb, 80),
    customer_type: ["home", "trade"].includes(input.customer_type) ? input.customer_type : "unknown",
    summary: clean(input.summary, 1500),
  };
}

// Create or update a HubSpot contact (matched on email when there is one). Empty fields never overwrite.
export async function upsertContact(email, properties) {
  const props = { ...properties };
  for (const k of Object.keys(props)) if (!props[k]) delete props[k];
  let id;
  if (email) {
    const r = await hs("/crm/v3/objects/contacts/batch/upsert", {
      inputs: [{ idProperty: "email", id: email, properties: { ...props, email } }],
    });
    id = r.results?.[0]?.id;
  } else {
    const r = await hs("/crm/v3/objects/contacts", { properties: props });
    id = r.id;
  }
  if (!id) throw new Error("HubSpot returned no contact id");
  return id;
}

export async function addNote(contactId, html) {
  await hs("/crm/v3/objects/notes", {
    properties: { hs_timestamp: new Date().toISOString(), hs_note_body: html },
    associations: [{ to: { id: contactId }, types: [{ associationCategory: "HUBSPOT_DEFINED", associationTypeId: 202 }] }],
  });
}

async function toHubSpot(l, transcript) {
  const id = await upsertContact(l.email, { firstname: l.firstname, lastname: l.lastname, phone: l.phone, city: l.suburb, hs_lead_status: "NEW", website_lead_source: "Website chat" });
  const body =
    `<p><b>Website chat lead (ADV Assist)</b></p>` +
    `<p>${esc(l.summary)}</p>` +
    `<p>Suburb: ${esc(l.suburb || "-")} · Customer: ${esc(l.customer_type)}</p>` +
    (transcript ? `<p><b>Chat</b><br>${esc(transcript).replace(/\n/g, "<br>")}</p>` : "");
  await addNote(id, body);
  return id;
}

export const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export async function saveLead(input, transcript = "") {
  const l = tidyLead(input);
  if (!l.name || (!l.email && !l.phone)) return { ok: false, reason: "Need a name and a phone number or email." };
  const out = { ok: false, saved: [] };
  if (process.env.HUBSPOT_TOKEN) {
    try {
      out.hubspotId = await toHubSpot(l, transcript);
      out.saved.push("hubspot");
    } catch (e) {
      console.error("lead -> HubSpot failed", e.message);
    }
  }
  if (process.env.LEAD_WEBHOOK_URL) {
    try {
      const r = await fetch(process.env.LEAD_WEBHOOK_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...l, source: "website chat", at: new Date().toISOString(), hubspotId: out.hubspotId || null, transcript }),
      });
      if (r.ok) out.saved.push("webhook");
      else console.error("lead -> webhook failed", r.status);
    } catch (e) {
      console.error("lead -> webhook failed", e.message);
    }
  }
  if (!out.saved.length) console.log("LEAD (not saved anywhere, set HUBSPOT_TOKEN):", JSON.stringify(l));
  out.ok = out.saved.length > 0;
  return out;
}
