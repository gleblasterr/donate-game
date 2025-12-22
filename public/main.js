function sanitizeNick(nick) {
  return (nick || "")
    .trim()
    .replace(/[^a-zA-Z0-9_-]/g, "")
    .slice(0, 24);
}

function normalizeAmount(v) {
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  // для “игры” оставим целые доллары
  const rounded = Math.floor(n);
  if (rounded < 1) return null;
  if (rounded > 100000) return null;
  return rounded;
}

async function loadLeaderboard() {
  const res = await fetch("/api/leaderboard", { cache: "no-store" });
  if (!res.ok) throw new Error("leaderboard http " + res.status);

  const data = await res.json();
  const tbody = document.getElementById("lb");
  tbody.innerHTML = "";

  (data.top || []).forEach((row, idx) => {
    const totalNum = Number(row.total) || 0;

    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${idx + 1}</td>
      <td>${row.nick}</td>
      <td>${totalNum.toFixed(2)}</td>
    `;
    tbody.appendChild(tr);
  });
}

async function mockDonate(nick, amount) {
  const res = await fetch("/api/mock-donate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ nick, amount }),
  });

  if (!res.ok) {
    const t = await res.text();
    throw new Error(t || "mock-donate failed");
  }

  return await res.json();
}

function setMsg(text) {
  document.getElementById("msg").textContent = text || "";
}

function setErr(text) {
  document.getElementById("err").textContent = text || "";
}

async function startPolling() {
  // первый показ
  try {
    await loadLeaderboard();
  } catch (e) {
    setErr("Не могу загрузить leaderboard: " + (e?.message || e));
  }

  // дальше автоподгрузка
  setInterval(async () => {
    try {
      await loadLeaderboard();
    } catch (e) {
      // не спамим ошибками, просто молча
      console.warn(e);
    }
  }, 3000);
}

document.getElementById("payBtn").addEventListener("click", async () => {
  setErr("");
  setMsg("");

  const nickRaw = document.getElementById("nick").value;
  const nick = sanitizeNick(nickRaw);

  const amountRaw = document.getElementById("amount").value;
  const amount = normalizeAmount(amountRaw);

  if (!nick) return setErr("Ник пустой или содержит запрещённые символы (разрешено: a-z, 0-9, _ -).");
  if (amount === null) return setErr("Сумма должна быть целым числом >= 1.");

  setMsg("Донат отправляется…");

  try {
    await mockDonate(nick, amount);
    setMsg("OK. Ты в игре.");
    await loadLeaderboard();
  } catch (e) {
    setErr("Ошибка доната: " + (e?.message || e));
    setMsg("");
  }
});

startPolling();
