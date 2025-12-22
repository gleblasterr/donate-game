export async function onRequestGet({ env }) {
  let raw = await env.DONATE_KV.get("leaderboard");

  let state;
  if (!raw) {
    state = { totals: {} };
  } else {
    try {
      state = JSON.parse(raw);
    } catch {
      state = { totals: {} };
    }
  }

  const top = Object.entries(state.totals)
    .map(([nick, total]) => ({ nick, total }))
    .sort((a, b) => b.total - a.total);

  return new Response(JSON.stringify({ top }), {
    headers: { "Content-Type": "application/json" }
  });
}
