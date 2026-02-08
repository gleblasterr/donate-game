function sanitizeNick(nick) {
  return String(nick || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

export async function onRequestPost({ request, env }) {
  const { nick, amount } = await request.json();

  const cleanNick = sanitizeNick(nick);
  const cleanAmount = Math.floor(Number(amount));

  if (!cleanNick) return new Response("Bad nick", { status: 400 });
  if (!Number.isFinite(cleanAmount) || cleanAmount < 1 || cleanAmount > 100000) {
    return new Response("Bad amount", { status: 400 });
  }

  const res = await fetch(
    `${env.BTCPAY_URL}/api/v1/stores/${env.BTCPAY_STORE_ID}/invoices`,
    {
      method: "POST",
      headers: {
        "Authorization": `token ${env.BTCPAY_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        amount: cleanAmount,
        currency: "USD",
        metadata: {
          nick: cleanNick,
          orderId: `donate-${cleanNick}-${Date.now()}`,
        },
        checkout: {
          redirectURL: `${env.APP_BASE_URL || "https://donategame.com"}/?paid=1`,
          redirectAutomatically: true,
        },
      }),
    }
  );

  if (!res.ok) {
    const text = await res.text();
    console.error("BTCPay error:", text);
    return new Response("Failed to create invoice", { status: 502 });
  }

  const invoice = await res.json();

  return new Response(
    JSON.stringify({ checkoutUrl: invoice.checkoutLink }),
    { headers: { "Content-Type": "application/json" } }
  );
}
