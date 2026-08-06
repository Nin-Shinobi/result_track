import { mentionOf, mentionClass } from "./lmd.js";

export const $ = (sel) => document.querySelector(sel);

export function fmt(n, digits = 1) {
  if (n === null || n === undefined || isNaN(n)) return "";
  return n.toLocaleString("fr-FR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

export function noteClass(n) {
  if (n === null) return "bad";
  if (n >= 14) return "good";
  if (n >= 10) return "warn";
  return "bad";
}

export function ecuNoteClass(n) {
  if (n === null) return "bad";
  return n >= 7 ? "good" : "bad";
}

export function ueNoteClass(u) {
  if (u.note === null && !u.statut) return "bad";
  const valide = u.statut ? u.statut === "V" : u.note >= 10;
  return valide ? "good" : "bad";
}

export function escapeHtml(s = "") {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function initials(s = "") {
  const parts = s.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/* ---------- Charts ---------- */

export function barChart(container, entries, opts = {}) {
  const { max = 20, emptyText = "Aucune donnée" } = opts;
  container.innerHTML = "";
  const realEntries = entries.filter((e) => e.value !== null && e.value !== undefined);
  if (!realEntries.length) {
    container.innerHTML = `<p class="muted">${escapeHtml(emptyText)}</p>`;
    return;
  }
  const maxValue = opts.scale === "auto" ? Math.max(...realEntries.map((e) => e.value)) : max;
  const wrap = document.createElement("div");
  wrap.className = "bars";
  for (const e of realEntries) {
    const col = document.createElement("div");
    col.className = "bar-col";
    const height = maxValue ? Math.max((e.value / maxValue) * 100, 3) : 3;
    const bar = document.createElement("div");
    bar.className = `bar ${e.class || ""}`;
    bar.style.height = `${height}%`;
    bar.innerHTML = `<span class="bar-value">${fmt(e.value)}</span>`;
    col.appendChild(bar);
    const label = document.createElement("span");
    label.className = "bar-label";
    label.textContent = e.label;
    label.title = e.title || `${e.label} : ${fmt(e.value)}`;
    col.appendChild(label);
    wrap.appendChild(col);
  }
  container.appendChild(wrap);
}

export function donut(container, percentage, color, centerText, segments) {
  container.innerHTML = "";
  const wrap = document.createElement("div");
  wrap.className = "donut-wrap";
  const donut = document.createElement("div");
  donut.className = "donut";
  const clamped = Math.max(0, Math.min(100, percentage));
  donut.style.background = `conic-gradient(${color} ${clamped * 3.6}deg, var(--track) 0deg)`;
  donut.innerHTML = `<div class="donut-center">${escapeHtml(centerText)}</div>`;
  wrap.appendChild(donut);
  if (segments && segments.length) {
    const legend = document.createElement("div");
    legend.className = "donut-legend";
    for (const s of segments) {
      const item = document.createElement("div");
      item.className = "legend-item";
      item.innerHTML = `<span class="legend-dot" style="background:${s.color}"></span><span class="legend-label">${escapeHtml(s.label)}</span><strong class="legend-value">${fmt(s.value)}${s.unit || ""}</strong>`;
      legend.appendChild(item);
    }
    wrap.appendChild(legend);
  }
  container.appendChild(wrap);
}

/* ---------- Class view ---------- */

export function renderClass(container, stats, students) {
  const cards = container.querySelector("#class-cards");
  cards.innerHTML = [
    card(`${stats.effectif}`, "Étudiants"),
    card(fmt(stats.moyenneClasse), "Moyenne de la classe", mentionClass(stats.moyenneClasse)),
    card(`${stats.reussite}`, "Étudiants ≥ 10"),
    card(`${fmt(stats.tauxReussite)}%`, "Taux de réussite"),
  ].join("");

  barChart(container.querySelector("#class-histogram"), stats.distribution.map((d) => ({
    label: d.label,
    value: d.count,
    class: d.label === "<10" ? "bad" : d.label === "10-12" ? "warn" : "good",
  })), { scale: "auto", max: 1, emptyText: "Aucune moyenne calculée" });

  donut(container.querySelector("#class-semesters"), stats.tauxReussite, "#1a7f37", `${fmt(stats.tauxReussite)}%`, [
    { label: "Réussite", value: stats.reussite, color: "#1a7f37", unit: "" },
    { label: "En retard", value: stats.effectif - stats.reussite, color: "#e4002b", unit: "" },
  ]);

  const table = container.querySelector("#class-ranking");
  table.innerHTML = `
    <thead>
      <tr><th class="num">Rang</th><th>Étudiant</th><th class="num">Moyenne</th><th>Mention</th><th class="num">Semestres validés</th><th class="num">Crédits</th></tr>
    </thead>
    <tbody>
      ${students.map((s, i) => `
        <tr class="rank-row" data-key="${escapeHtml(s.key)}">
          <td class="num">${i + 1}</td>
          <td><strong>${escapeHtml(s.nomDisplay)}</strong></td>
          <td class="num"><span class="note-badge ${mentionClass(s.moyenne)}">${fmt(s.moyenne)}</span></td>
          <td><span class="pill ${mentionClass(s.moyenne)}">${escapeHtml(s.mention)}</span></td>
          <td class="num">${s.semestres.filter((sm) => sm.valide).length}/${s.semestres.length}</td>
          <td class="num">${s.creditsAcquis}/${s.creditsTotal}</td>
        </tr>`).join("")}
    </tbody>`;
  table.querySelectorAll(".rank-row").forEach((row) => {
    row.style.cursor = "pointer";
    row.addEventListener("click", () => {
      const evt = new CustomEvent("student-select", { detail: { key: row.dataset.key } });
      document.dispatchEvent(evt);
    });
  });
}

function card(value, label, color = "") {
  return `<div class="card stat-card"><div class="stat-value ${color}">${value}</div><div class="stat-label">${label}</div></div>`;
}

/* ---------- Student view ---------- */

export function populateSelect(select, students, selectedKey) {
  select.innerHTML = students.map((s) =>
    `<option value="${escapeHtml(s.key)}" ${s.key === selectedKey ? "selected" : ""}>${escapeHtml(s.nomDisplay)}</option>`
  ).join("");
}

function statusPill(u) {
  if (u.note === null && !u.statut) return '<span class="pill red">Absent</span>';
  const valide = u.statut ? u.statut === "V" : u.note >= 10;
  return valide
    ? '<span class="pill green">Validée</span>'
    : '<span class="pill red">Non validée</span>';
}

function ecuValidation(e) {
  if (e.moy !== null && e.moy !== undefined) return e.moy >= 7 ? "V" : "NV";
  return /^v$/i.test(e.validation || "") ? "V" : "";
}

function ecuDetailRows(u) {
  if (!u.ecus || !u.ecus.length) return "";
  return `
    <tr class="ecu-detail">
      <td colspan="5">
        <details>
          <summary>Détail des ECU (${u.ecus.length})</summary>
          <div class="table-wrap">
            <table class="table table-sm">
              <thead>
                <tr><th>ECU</th><th class="num">CC</th><th class="num">ET</th><th class="num">Rat.</th><th class="num">Moyenne</th><th>Valid.</th></tr>
              </thead>
              <tbody>
                ${u.ecus.map((e) => {
                  const v = ecuValidation(e);
                  return `
                    <tr>
                      <td>${escapeHtml(e.intitule)}</td>
                      <td class="num">${fmt(e.cc)}</td>
                      <td class="num">${fmt(e.et)}</td>
                      <td class="num">${fmt(e.rat)}</td>
                      <td class="num"><span class="note-badge ${ecuNoteClass(e.moy)}">${fmt(e.moy)}</span></td>
                      <td>${v
                        ? `<span class="pill ${v === "V" ? "green" : "red"}">${escapeHtml(v)}</span>`
                        : ""}</td>
                    </tr>`;
                }).join("")}
              </tbody>
            </table>
          </div>
        </details>
      </td>
    </tr>`;
}

export function renderStudent(root, student, stats, students) {
  root.querySelector("#student-empty").classList.add("hidden");
  const content = root.querySelector("#student-content");
  content.classList.remove("hidden");

  root.querySelector("#student-avatar").textContent = initials(student.nomDisplay);
  root.querySelector("#student-name").textContent = student.nomDisplay;
  root.querySelector("#student-subtitle").textContent =
    `${student.nbUes} UE · ${student.nbUesValidees} validées · ${student.nbAbsences} absence(s)`;

  const mentionTint = { green: "#1a7f37", amber: "#9a6b00", red: "#e4002b" };
  root.querySelector("#stat-moyenne").textContent = fmt(student.moyenne);
  root.querySelector("#stat-moyenne").style.color = mentionTint[mentionClass(student.moyenne)] || "#111315";
  root.querySelector("#stat-mention").textContent = student.mention;
  root.querySelector("#stat-mention").style.color = mentionTint[mentionClass(student.moyenne)] || "#111315";
  root.querySelector("#stat-credits").textContent = `${student.creditsAcquis}/${student.creditsTotal}`;
  root.querySelector("#stat-rang").textContent = student.rang ? `${student.rang}/${students.length}` : "";

  barChart(root.querySelector("#student-semester-chart"), student.semestres.map((sm) => ({
    label: sm.name,
    value: sm.moyenne,
    class: mentionClass(sm.moyenne),
    title: `${sm.name} : ${fmt(sm.moyenne)}`,
  })), { max: 20, emptyText: "Aucun semestre" });

  barChart(root.querySelector("#student-notes-chart"), student.ues.map((u) => ({
    label: u.code || u.label.slice(0, 8),
    value: u.note,
    class: ueNoteClass(u),
    title: `${u.code || u.label} (${u.semestre}) : ${u.noteText || "Absence"}`,
  })), { max: 20, emptyText: "Aucune note" });

  const semContainer = root.querySelector("#student-semesters");
  semContainer.innerHTML = student.semestres.map((sm) => `
    <div class="semestre">
      <div class="semestre-header">
        <h3>Semestre ${escapeHtml(sm.name.replace(/[Ss]emestre\s*/i, "")) || escapeHtml(sm.name)}</h3>
        <div class="semestre-stats">
          <span>Moyenne : <strong class="note-badge ${mentionClass(sm.moyenne)}">${fmt(sm.moyenne)}</strong></span>
          <span>Crédits : <strong>${sm.creditsAcquis}/${sm.ues.reduce((s, u) => s + (u.credit || 0), 0)}</strong></span>
          <span class="pill ${sm.valide ? "green" : "red"}">${sm.valide ? "Validé" : "Non validé"}</span>
        </div>
      </div>
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr><th>UE</th><th>Intitulé</th><th class="num">Note</th><th class="num">Crédits</th><th>Statut</th></tr>
          </thead>
          <tbody>
            ${sm.ues.map((u) => `
              <tr>
                <td><strong>${escapeHtml(u.code)}</strong></td>
                <td>${escapeHtml(u.label)}</td>
                <td class="num"><span class="note-badge ${ueNoteClass(u)}">${u.noteText || ""}</span></td>
                <td class="num">${u.credit}</td>
                <td>${statusPill(u)}</td>
              </tr>
              ${ecuDetailRows(u)}`).join("")}
          </tbody>
        </table>
      </div>
    </div>`).join("");
}

export function clearStudent(root) {
  root.querySelector("#student-content").classList.add("hidden");
  root.querySelector("#student-empty").classList.remove("hidden");
}
