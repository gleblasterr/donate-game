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
  
  export async function onRequestPost({ request, env }) {
    const { nick, amount } = await request.json();
  
    const cleanNick = String(nick || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
    const cleanAmount = Math.floor(Number(amount));
  
    if (!cleanNick) return new Response("Bad nick", { status: 400 });
    if (!Number.isFinite(cleanAmount) || cleanAmount < 1) return new Response("Bad amount", { status: 400 });
  
    const token = await getPayPalAccessToken(env);
  
    const createRes = await fetch(env.PAYPAL_BASE_URL + "/v2/checkout/orders", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        intent: "CAPTURE",
        purchase_units: [{
          amount: { currency_code: "USD", value: cleanAmount.toFixed(2) },
          custom_id: cleanNick
        }],
        application_context: {
          brand_name: "DONATE GAME",
          user_action: "PAY_NOW",
          return_url: env.APP_BASE_URL + "/thanks.html",
          cancel_url: env.APP_BASE_URL + "/"
        }
      })
    });
  
    if (!createRes.ok) return new Response(await createRes.text(), { status: 502 });
  
    const order = await createRes.json();
    const approve = (order.links || []).find(l => l.rel === "approve");
    if (!approve) return new Response("No approve link", { status: 502 });
  
    return new Response(JSON.stringify({ approveUrl: approve.href }), {
      headers: { "Content-Type": "application/json" }
    });
  }
  