async function getPayPalAccessToken(env) {
    const auth = btoa(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_SECRET}`);
    const res = await fetch(env.PAYPAL_BASE_URL + "/v1/oauth2/token", {
      method: "POST",
      headers: {
        "Authorization": `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: "grant_type=client_credentials"
    });
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.access_token;
  }
  
  async function verifyWebhook(env, headers, webhookEvent) {
    const token = await getPayPalAccessToken(env);
  
    const verifyBody = {
      auth_algo: headers.get("paypal-auth-algo"),
      cert_url: headers.get("paypal-cert-url"),
      transmission_id: headers.get("paypal-transmission-id"),
      transmission_sig: headers.get("paypal-transmission-sig"),
      transmission_time: headers.get("paypal-transmission-time"),
      webhook_id: env.PAYPAL_WEBHOOK_ID,
      webhook_event: webhookEvent
    };
  
    const res = await fetch(env.PAYPAL_BASE_URL + "/v1/notifications/verify-webhook-signature", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(verifyBody)
    });
  
    if (!res.ok) throw new Error(await res.text());
    const data = await res.json();
    return data.verification_status === "SUCCESS";
  }
  
  function sanitizeNick(nick) {
    return String(nick || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
  }
  
  export async function onRequestPost({ request, env }) {
    const webhookEvent = await request.json();
  
    // 1) verify signature
    let ok = false;
    try {
      ok = await verifyWebhook(env, request.headers, webhookEvent);
    } catch (e) {
      return new Response("verify error", { status: 400 });
    }
    if (!ok) return new Response("bad signature", { status: 400 });
  
    // 2) мы учитываем только успешный capture
    if (webhookEvent.event_type !== "PAYMENT.CAPTURE.COMPLETED") {
      return new Response("ignored", { status: 200 });
    }
  
    const r = webhookEvent.resource || {};
    const nick = sanitizeNick(r.custom_id);
    const amount = Number(r?.amount?.value);
  
    if (!nick || !Number.isFinite(amount)) {
      return new Response("missing fields", { status: 200 });
    }
  
    // 3) update KV
    const raw = await env.DONATE_KV.get("leaderboard", "json");
    const state = raw || { totals: {} };
    state.totals[nick] = Number((Number(state.totals[nick] || 0) + amount).toFixed(2));
    await env.DONATE_KV.put("leaderboard", JSON.stringify(state));
  
    return new Response("ok", { status: 200 });
  }
  