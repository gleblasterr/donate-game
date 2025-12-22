function sanitizeNick(nick) {
    return String(nick || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 24);
  }
  
  export async function onRequestPost({ request, env }) {
    const body = await request.json().catch(() => ({}));
    const nick = sanitizeNick(body.nick);
    const amount = Number(body.amount);
  
    if (!nick) {
      return new Response("Bad nick", { status: 400 });
    }
    if (!Number.isFinite(amount) || amount <= 0) {
      return new Response("Bad amount", { status: 400 });
    }
  
    const raw = await env.DONATE_KV.get("leaderboard", "json");
    const state = raw || { totals: {} };
  
    const prev = Number(state.totals[nick] || 0);
    const next = Number((prev + amount).toFixed(2));
    state.totals[nick] = next;
  
    await env.DONATE_KV.put("leaderboard", JSON.stringify(state));
  
    return new Response(JSON.stringify({ ok: true, nick, total: next }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  