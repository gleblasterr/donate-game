// public/main.js

function sanitizeNick(nick) {
  // Разрешаем только a-z A-Z 0-9 _ -
  return (nick || "").trim().replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 24);
}

function readLocalState() {
  try {
    const raw = localStorage.getItem("donate_game_state");
    if (!raw) return { totals: {} };
    const obj = JSON.parse(raw);
    if (!obj || typeof obj !== "object") return { totals: {} };
    if (!obj.totals || typeof obj.totals !== "object") return { totals: {} };
    return obj;
  } catch {
    return { totals: {} };
  }
}

function writeLocalState(state) {
  localStorage.setItem("donate_game_state", JSON.stringify(state));
}

function getLeaderboardRows(state) {
  return Object.entries(state.totals)
    .map(([nick, total]) => ({ nick, total: Number(total) || 0 }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 30);
}

function renderLeaderboard(rows) {
  const tbody = document.getElementById("lb");
  tbody.innerHTML = "";

  rows.forEach((row, idx) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `<td>${idx + 1}</td><td>${row.nick}</td><td>${row.total.toFixed(
      2
    )}</td>`;
    tbody.appendChild(tr);
  });
}

async function loadLeaderboard() {
  // Локальный режим: читаем из localStorage
  const state = readLocalState();
  const rows = getLeaderboardRows(state);
  renderLeaderboard(rows);
}

function setMessage(text) {
  const msgEl = document.getElementById("msg");
  msgEl.textContent = text || "";
}

function setError(text) {
  const errEl = document.getElementById("err");
  errEl.textContent = text || "";
}

function addDonationLocal({ nick, amount }) {
  const state = readLocalState();
  const prev = Number(state.totals[nick] || 0);
  const next = Number((prev + amount).toFixed(2));
  state.totals[nick] = next;
  writeLocalState(state);
}

function start() {
  // стартовая отрисовка
  loadLeaderboard();

  // авто-обновление (в локальном режиме это не обязательно, но пусть будет)
  setInterval(loadLeaderboard, 3000);

  // обработчик кнопки
  const btn = document.getElementById("payBtn");
  btn.addEventListener("click", async () => {
    setError("");
    setMessage("");

    const nickRaw = document.getElementById("nick").value;
    const nick = sanitizeNick(nickRaw);

    const amountRaw = document.getElementById("amount").value;
    const amount = Number(amountRaw);

    if (!nick) {
      setError("Ник пустой или содержит запрещённые символы.");
      return;
    }
    if (!Number.isFinite(amount) || amount < 1) {
      setError("Сумма должна быть числом >= 1.");
      return;
    }

    // “донат” локально
    addDonationLocal({ nick, amount: Math.round(amount * 100) / 100 });

    setMessage(`+${amount.toFixed(2)} USD добавлено для ${nick}`);
    await loadLeaderboard();
  });
}

start();
