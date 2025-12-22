async function loadLeaderboard() {
  const res = await fetch("/api/leaderboard");
  const data = await res.json();

  const tbody = document.querySelector("#leaderboard-body");
  tbody.innerHTML = "";

  data.top.forEach((row, index) => {
    const tr = document.createElement("tr");

    tr.innerHTML = `
      <td>${index + 1}</td>
      <td>${row.nick}</td>
      <td>$${row.total}</td>
    `;

    tbody.appendChild(tr);
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadLeaderboard();
});
