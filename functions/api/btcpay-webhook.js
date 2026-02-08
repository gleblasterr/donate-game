function sanitizeNick(nick) {
  return String(nick || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

export async function onRequestPost({ request, env }) {
  const event = await request.json();

  // BTCPay sends different event types
  // We only care about settled (fully paid) invoices
  if (event.type !== "InvoiceSettled") {
    return new Response("ignored", { status: 200 });
  }

  const invoiceId = event.invoiceId;
  if (!invoiceId) {
    return new Response("no invoiceId", { status: 200 });
  }

  // Fetch full invoice details from BTCPay to get metadata and amount
  const invoiceRes = await fetch(
    `${env.BTCPAY_URL}/api/v1/stores/${env.BTCPAY_STORE_ID}/invoices/${invoiceId}`,
    {
      headers: {
        "Authorization": `token ${env.BTCPAY_API_KEY}`,
      },
    }
  );

  if (!invoiceRes.ok) {
    console.error("Failed to fetch invoice:", await invoiceRes.text());
    return new Response("fetch error", { status: 500 });
  }

  const invoice = await invoiceRes.json();

  const nick = sanitizeNick(invoice.metadata?.nick);
  const amount = Number(invoice.amount);

  if (!nick || !Number.isFinite(amount) || amount <= 0) {
    return new Response("missing fields", { status: 200 });
  }

  // Update KV leaderboard (same format as PayPal webhook)
  const raw = await env.DONATE_KV.get("leaderboard", "json");
  const state = raw || { totals: {} };
  state.totals[nick] = Number(
    (Number(state.totals[nick] || 0) + amount).toFixed(2)
  );
  await env.DONATE_KV.put("leaderboard", JSON.stringify(state));

  return new Response("ok", { status: 200 });
}
