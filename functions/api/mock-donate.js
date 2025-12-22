function sanitizeNick(nick) {
    return (nick || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 24);
  }
  
  function normalizeAmount(v) {
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    const rounded = Math.floor(n);
    if (rounded < 1) return null;
    if (rounded > 100000) return null;
    return rounded;
  }
  
  export async function onRequestPost({ request, env }) {
    let body;
    try {
      body = await request.json();
    } catch {
      return new Response("Bad JSON", { status: 400 });
    }
  
    const nick = sanitizeNick(body?.nick);
    const amount = normalizeAmount(body?.amount);
  
    if (!nick) return new Response("Bad nick", { status: 400 });
    if (amount === null) return new Response("Bad amount", { status: 400 });
  
    const raw = await env.DONATE_KV.get("leaderboard", "json");
    const state = raw || { totals: {} };
  
    const prev = Number(state.totals[nick] || 0);
    const next = Number((prev + amount).toFixed(2));
    state.totals[nick] = next;
  
    await env.DONATE_KV.put("leaderboard", JSON.stringify(state));
  
    return new Response(JSON.stringify({ ok: true, nick, total: next }), {
      headers: { "Content-Type": "application/json; charset=utf-8" },
    });
  }
  