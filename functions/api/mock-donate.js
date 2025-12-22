export async function onRequestPost({ request, env }) {
    const { nick, amount } = await request.json();
  
    const cleanNick = String(nick || "")
      .trim()
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 24);
  
    const cleanAmount = Number(amount);
  
    if (!cleanNick) return new Response("Bad nick", { status: 400 });
    if (!Number.isFinite(cleanAmount) || cleanAmount <= 0) {
      return new Response("Bad amount", { status: 400 });
    }
  
    const raw = await env.DONATE_KV.get("leaderboard", "json");
    const state = raw || { totals: {} };
  
    const prev = Number(state.totals[cleanNick] || 0);
    state.totals[cleanNick] = Number((prev + cleanAmount).toFixed(2));
  
    await env.DONATE_KV.put("leaderboard", JSON.stringify(state));
  
    return new Response(JSON.stringify({ ok: true, nick: cleanNick, total: state.totals[cleanNick] }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
  