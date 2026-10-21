// Vide la file discord_out de l'outil de guilde : poste chaque message en attente par le webhook du salon.
// Appelée par la page après le dépôt d'un message. Le webhook reste dans le secret DISCORD_WEBHOOK.
import { createClient } from "npm:@supabase/supabase-js@2";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...cors, "Content-Type": "application/json" } });

// message simple, ou sondage Discord natif quand le document porte un champ poll {question, answers[], hours, multi}
function payload(d: Record<string, unknown>) {
  const body: Record<string, unknown> = { allowed_mentions: { parse: [] } };
  const content = String(d.content || "").slice(0, 1990);
  if (content) body.content = content;
  const p = d.poll as { question?: string; answers?: string[]; hours?: number; multi?: boolean } | undefined;
  if (p && p.question && Array.isArray(p.answers) && p.answers.length >= 2) {
    body.poll = {
      question: { text: String(p.question).slice(0, 300) },
      answers: p.answers.slice(0, 10).map((t) => ({ poll_media: { text: String(t).slice(0, 55) } })),
      duration: Math.max(1, Math.min(768, Number(p.hours) || 168)),
      allow_multiselect: !!p.multi,
      layout_type: 1,
    };
  }
  return body;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const sb = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });

  // seuls les joueurs connectés peuvent déclencher l'envoi
  const token = (req.headers.get("Authorization") || "").replace(/^Bearer\s+/i, "");
  const { data: u, error: ue } = await sb.auth.getUser(token);
  if (ue || !u?.user) return json({ ok: false, error: "unauthorized" }, 401);

  const hook = Deno.env.get("DISCORD_WEBHOOK");
  if (!hook) return json({ ok: false, error: "no_webhook" });

  const { data: cfg } = await sb.from("docs").select("data").eq("col", "guilde").eq("id", "discord").maybeSingle();
  if (!cfg?.data?.on) return json({ ok: true, sent: 0, off: true });

  const { data: rows, error } = await sb.from("docs").select("id,data").eq("col", "discord_out").filter("data->>status", "eq", "attente");
  if (error) return json({ ok: false, error: error.message }, 500);

  const save = (id: string, data: Record<string, unknown>) => sb.from("docs").update({ data }).eq("col", "discord_out").eq("id", id);
  const list = (rows || []).sort((a, b) => (Number(a.data?.createdAt) || 0) - (Number(b.data?.createdAt) || 0)).slice(0, 10);
  let sent = 0, errs = 0, expired = 0;
  for (const r of list) {
    const d = (r.data || {}) as Record<string, unknown>;
    // réservation : évite qu'un message parte deux fois si deux pages appellent en même temps
    const { data: got } = await sb.from("docs").update({ data: { ...d, status: "envoi" } }).eq("col", "discord_out").eq("id", r.id).filter("data->>status", "eq", "attente").select("id");
    if (!got || !got.length) continue;
    if (Date.now() - (Number(d.createdAt) || 0) > 48 * 3600e3) { await save(r.id, { ...d, status: "expire" }); expired++; continue; }
    const res = await fetch(hook + (hook.includes("?") ? "&" : "?") + "wait=true", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload(d)),
    });
    if (res.ok) { await save(r.id, { ...d, status: "envoye", sentAt: Date.now() }); sent++; }
    else if (res.status === 429) { await save(r.id, { ...d, status: "attente" }); break; }
    else { const why = (await res.text().catch(() => "")).slice(0, 300); await save(r.id, { ...d, status: "erreur", err: res.status, why }); errs++; }
  }
  return json({ ok: true, sent, errs, expired });
});
