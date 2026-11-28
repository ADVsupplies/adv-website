// Team alerts via Make (scenario "Website lead → sales@ email + SMS"):
// every website lead emails sales@advsupplies.com.au; trade applications and quote requests also text the yard mobile.
const HOOK = process.env.LEAD_SMS_WEBHOOK_URL || "https://hook.us2.make.com/r2ygivoj1y42iih4paqhi4u5w2jngfqw";

const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export function alertHtml(title, rows, note) {
  const tr = rows
    .filter(([, v]) => v)
    .map(([k, v]) => `<tr><td style="padding:6px 14px 6px 0;color:#666;vertical-align:top;white-space:nowrap;">${esc(k)}</td><td style="padding:6px 0;font-weight:bold;">${esc(v).replace(/\n/g, "<br>")}</td></tr>`)
    .join("");
  return (
    `<div style="font-family:Arial,sans-serif;font-size:15px;color:#1A1A1A;max-width:560px;">` +
    `<div style="background:#1A1A1A;color:#fff;padding:12px 16px;border-bottom:4px solid #C80000;font-weight:bold;font-size:17px;">${esc(title)}</div>` +
    `<table style="border-collapse:collapse;margin:14px 16px;">${tr}</table>` +
    (note ? `<p style="margin:0 16px 16px;color:#444;">${esc(note)}</p>` : "") +
    `<p style="margin:0 16px 16px;font-size:12px;color:#888;">From the advsupplies.com.au website. The contact is in HubSpot.</p></div>`
  );
}

export async function sendAlert({ kind, subject, html, text, sms = false }) {
  if (!HOOK) return;
  try {
    await fetch(HOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, subject: String(subject).slice(0, 200), html, text: String(text || subject).slice(0, 300), sms }),
    });
  } catch (e) {
    console.error("alert failed", kind, e.message);
  }
}
