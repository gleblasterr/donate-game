export async function onRequestGet({ env }) {
    const raw = await env.DONATE_KV.get("leaderboard", "json");
    const state = raw || { totals: {} };
  
    const rows = Object.entries(state.totals)
      .map(([nick, total]) => ({ nick, total }))
      .sort((a, b) => b.total - a.total)
      .slice(0, 30);
  
    return new Response(JSON.stringify({ top: rows }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "no-store" }
    });
  }
  