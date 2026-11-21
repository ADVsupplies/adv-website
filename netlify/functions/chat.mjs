// POST /api/chat — ADV Assist website chatbot (Claude). Needs ANTHROPIC_API_KEY in Netlify environment variables.
import { getCatalog } from "./lib/catalog.mjs";
import { systemPrompt, TOOLS } from "./lib/chatbrain.mjs";
import { saveLead } from "./lib/leads.mjs";
import { CONFIG } from "./lib/config.mjs";

const MODEL = process.env.CHAT_MODEL || "claude-haiku-5-5";
const MAX_MSGS = 30;
const MAX_CHARS = 1500;

// Light abuse guard (per warm function instance)
const hits = new Map();
function limited(ip) {
  const now = Date.now();
  const list = (hits.get(ip) || []).filter((t) => now - t < 10 * 60 * 1000);
  list.push(now);
  hits.set(ip, list);
  return list.length > 40;
}

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } });

const fallback = `Sorry, the chat isn't working right now. Please call us on ${CONFIG.phone} (8am to 4pm, 7 days).`;

export function cleanMessages(raw) {
  if (!Array.isArray(raw) || !raw.length) return null;
  const msgs = raw.slice(-MAX_MSGS).map((m) => ({
    role: m && m.role === "assistant" ? "assistant" : "user",
    content: String((m && m.content) || "").slice(0, MAX_CHARS).trim(),
  }));
  // Must start with user, alternate, and end with user
  while (msgs.length && msgs[0].role !== "user") msgs.shift();
  const out = [];
  for (const m of msgs) {
    if (!m.content) continue;
    if (out.length && out[out.length - 1].role === m.role) out[out.length - 1].content += "\n" + m.content;
    else out.push(m);
  }
  if (!out.length || out[out.length - 1].role !== "user") return null;
  return out;
}

async function claude(system, messages) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "content-type": "application/json",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 700, system, tools: TOOLS, messages }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${data.error?.message || "error"}`);
  return data;
}

export default async (req, context) => {
  if (req.method !== "POST") return json({ error: "POST only" }, 405);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set");
    return json({ reply: fallback });
  }
  const ip = context?.ip || req.headers.get("x-nf-client-connection-ip") || "?";
  if (limited(ip)) return json({ reply: `You've sent a lot of messages. Please call us on ${CONFIG.phone}.` }, 429);

  let body;
  try { body = await req.json(); } catch { return json({ error: "Bad request" }, 400); }
  const messages = cleanMessages(body.messages);
  if (!messages) return json({ error: "Bad request" }, 400);

  let catalog = null;
  try { catalog = await getCatalog(); } catch (e) { console.warn("chat: catalog unavailable", e.message); }
  const system = systemPrompt(catalog);
  const transcript = messages.map((m) => `${m.role === "user" ? "Customer" : "ADV Assist"}: ${m.content}`).join("\n");

  try {
    let convo = messages;
    let leadSaved = false;
    for (let turn = 0; turn < 3; turn++) {
      const r = await claude(system, convo);
      const toolUses = (r.content || []).filter((b) => b.type === "tool_use");
      if (r.stop_reason !== "tool_use" || !toolUses.length) {
        const text = (r.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n").trim();
        return json({ reply: text || fallback, lead: leadSaved });
      }
      const results = [];
      for (const t of toolUses) {
        let out = { ok: false, reason: "Unknown tool" };
        if (t.name === "save_lead" && !leadSaved) {
          out = await saveLead(t.input || {}, transcript);
          leadSaved = out.ok;
        } else if (t.name === "save_lead") {
          out = { ok: true, note: "Already saved in this chat." };
        }
        results.push({
          type: "tool_result",
          tool_use_id: t.id,
          content: out.ok ? "Saved. The team will follow up." : `Not saved (${out.reason || "system unavailable"}). Ask them to call ${CONFIG.phone}.`,
        });
      }
      convo = [...convo, { role: "assistant", content: r.content }, { role: "user", content: results }];
    }
    return json({ reply: `Thanks! For anything urgent, call us on ${CONFIG.phone}.`, lead: leadSaved });
  } catch (e) {
    console.error("chat error", e.message);
    return json({ reply: fallback }, 200);
  }
};

export const config = { path: "/api/chat" };
