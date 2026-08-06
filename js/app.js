import { parsePDF, parseWithMapping, FIELDS } from "./pdfParser.js";
import { parseGridPDF, hasGridMarkers } from "./grilleParser.js";
import { groupStudents, classStats } from "./lmd.js";
import {
  $, fmt, escapeHtml, renderClass, populateSelect, renderStudent, clearStudent, initials,
} from "./dashboard.js";

const state = {
  lines: null,
  columns: [],
  records: [],
  students: [],
  stats: null,
  semestre: "",
  currentKey: null,
};

/* ---------- Upload ---------- */

const dropzone = $("#dropzone");
const fileInput = $("#file-input");

dropzone.addEventListener("click", (e) => {
  if (e.target.id === "browse-btn" || e.target.tagName === "BUTTON") return;
  fileInput.click();
});
$("#browse-btn").addEventListener("click", (e) => {
  e.stopPropagation();
  fileInput.click();
});
fileInput.addEventListener("change", () => {
  if (fileInput.files[0]) loadFile(fileInput.files[0]);
});

/* ---------- Pages ---------- */

const pageNames = ["home", "about", "upload"];
const navBtns = document.querySelectorAll(".nav-btn");

function switchPage(page) {
  if (!pageNames.includes(page)) return;
  navBtns.forEach((b) => b.classList.toggle("active", b.dataset.page === page));
  pageNames.forEach((p) => $("#page-" + p).classList.toggle("hidden", p !== page));
  window.scrollTo(0, 0);
}

navBtns.forEach((btn) => btn.addEventListener("click", () => switchPage(btn.dataset.page)));
document.querySelectorAll("[data-go]").forEach((el) => el.addEventListener("click", () => switchPage(el.dataset.go)));

["dragover", "dragenter"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.add("dragover"); })
);
["dragleave", "drop"].forEach((evt) =>
  dropzone.addEventListener(evt, (e) => { e.preventDefault(); dropzone.classList.remove("dragover"); })
);
dropzone.addEventListener("drop", (e) => {
  const file = e.dataTransfer.files[0];
  if (file) loadFile(file);
});

$("#reload-btn").addEventListener("click", () => {
  $("#dashboard-section").classList.add("hidden");
  $("#upload-section").classList.remove("hidden");
  $("#mapping-section").classList.add("hidden");
  $("#file-status").textContent = "Aucune grille chargée";
  $("#grid-semestre").classList.add("hidden");
  fileInput.value = "";
});

function setProgress(pct, label) {
  $("#progress-fill").style.width = `${Math.round(pct)}%`;
  $("#progress-label").textContent = label;
}

async function loadFile(file) {
  const buf = await file.arrayBuffer();
  await loadArrayBuffer(buf, file.name);
}

async function loadArrayBuffer(buf, name) {
  $("#upload-section").classList.add("hidden");
  $("#mapping-section").classList.add("hidden");
  $("#load-progress").classList.remove("hidden");
  setProgress(5, "Lecture du PDF…");
  try {
    const result = await parsePDF(buf.slice(0), (p) => {
      setProgress(5 + 85 * (p.loaded / (p.total || p.loaded)), `Lecture du PDF… ${Math.round(100 * p.loaded / (p.total || p.loaded))}%`);
    });

    if (hasGridMarkers(result.lines.flat())) {
      const grid = await parseGridPDF(buf.slice(0), name, (p) => {
        setProgress(5 + 85 * (p.loaded / (p.total || p.loaded)), `Analyse de la grille… ${Math.round(100 * p.loaded / (p.total || p.loaded))}%`);
      });
      if (grid.records.length) {
        state.records = grid.records;
        state.semestre = grid.semestre || "";
        finalize(name);
        return;
      }
    }

    state.lines = result.lines;
    state.columns = result.columns;

    if (!result.headerFound || result.records.length === 0) {
      throw new Error("Impossible de détecter le tableau de notes. Vérifiez que le PDF est une grille de notes tabulaire.");
    }

    if (result.unmatched.length) {
      $("#load-progress").classList.add("hidden");
      state.records = [];
      buildMapping(result.unmatched, result.cols);
      return;
    }

    state.records = result.records;
    finalize(name);
  } catch (err) {
    $("#load-progress").classList.add("hidden");
    $("#upload-section").classList.remove("hidden");
    alert(err.message || "Erreur lors de la lecture du PDF.");
  }
}

/* ---------- Mapping manuel ---------- */

function buildMapping(unmatched, cols) {
  const rows = $("#mapping-rows");
  rows.innerHTML = "";
  const columnNames = ["(Ignorer)", ...state.columns.map((c) => c.text)];

  for (const key of unmatched) {
    const field = FIELDS.find((f) => f.key === key);
    const row = document.createElement("div");
    row.className = "mapping-row";
    row.innerHTML = `
      <label>${escapeHtml(field.label)}</label>
      <select data-key="${key}">
        ${columnNames.map((c, i) => `<option value="${i === 0 ? "" : i - 1}">${escapeHtml(c)}</option>`).join("")}
      </select>
      <span class="hint">colonne non détectée</span>`;
    rows.appendChild(row);

    const sel = row.querySelector("select");
    const guess = guessColumn(key, cols);
    if (guess !== null && guess < state.columns.length) sel.value = String(guess);
  }

  $("#mapping-section").classList.remove("hidden");
}

function guessColumn(key, cols) {
  const col = cols[key];
  if (!col) return null;
  const idx = state.columns.findIndex((c) => c.text === col.text && c.x === col.x);
  return idx;
}

$("#mapping-apply").addEventListener("click", () => {
  const assigned = {};
  for (const sel of $("#mapping-rows").querySelectorAll("select")) {
    assigned[sel.dataset.key] = sel.value === "" ? null : parseInt(sel.value, 10);
  }
  const { records } = parseWithMapping(state.lines, state.columns, assigned);
  if (!records.length) {
    alert("Aucune ligne reconnue avec cette configuration.");
    return;
  }
  state.records = records;
  $("#mapping-section").classList.add("hidden");
  finalize("grille importée");
});

$("#mapping-cancel").addEventListener("click", () => {
  $("#mapping-section").classList.add("hidden");
  $("#upload-section").classList.remove("hidden");
});

/* ---------- Finalisation ---------- */

function finalize(name) {
  state.students = groupStudents(state.records);
  state.stats = classStats(state.students);
  state.currentKey = state.students[0]?.key || null;

  $("#file-status").textContent = "Document Chargé";
  const sem = $("#grid-semestre");
  if (state.semestre) {
    sem.textContent = `Semestre ${state.semestre}`;
    sem.classList.remove("hidden");
  } else {
    sem.classList.add("hidden");
  }
  $("#load-progress").classList.add("hidden");
  $("#upload-section").classList.add("hidden");
  $("#mapping-section").classList.add("hidden");
  $("#dashboard-section").classList.remove("hidden");

  renderClassView();
  renderStudentView();
  $("#student-select").dispatchEvent(new Event("change"));
  switchTab("class");
}

/* ---------- Tabs ---------- */

const tabButtons = document.querySelectorAll(".tab-btn");
tabButtons.forEach((btn) => {
  btn.addEventListener("click", () => switchTab(btn.dataset.tab));
});

function switchTab(tab) {
  tabButtons.forEach((b) => b.classList.toggle("active", b.dataset.tab === tab));
  $("#view-class").classList.toggle("hidden", tab !== "class");
  $("#view-student").classList.toggle("hidden", tab !== "student");
}

/* ---------- Class view ---------- */

function renderClassView() {
  renderClass($("#view-class"), state.stats, state.students);
}

/* ---------- Student view ---------- */

function renderStudentView() {
  const select = $("#student-select");
  populateSelect(select, state.students, state.currentKey);
  selectStudent(state.currentKey);
}

function selectStudent(key) {
  if (!key) {
    clearStudent($("#view-student"));
    return;
  }
  state.currentKey = key;
  const student = state.students.find((s) => s.key === key);
  if (!student) return;
  renderStudent($("#view-student"), student, state.stats, state.students);
}

$("#student-select").addEventListener("change", (e) => {
  selectStudent(e.target.value);
});

$("#student-search").addEventListener("input", (e) => {
  const q = e.target.value.trim().toLowerCase();
  const select = $("#student-select");
  const prev = select.value;
  const filtered = q
    ? state.students.filter((s) => s.nomDisplay.toLowerCase().includes(q) || s.key.includes(q))
    : state.students;
  populateSelect(select, filtered, prev);
  if (filtered.length) selectStudent(select.value);
});

document.addEventListener("student-select", (e) => {
  $("#student-search").value = "";
  $("#student-select").value = e.detail.key;
  selectStudent(e.detail.key);
  switchTab("student");
});

/* ---------- Optical alignment (display ink on the line, not the box) ---------- */

(function optical() {
  const cvs = document.createElement("canvas");
  const ctx = cvs.getContext("2d");
  const sel = ".masthead, .shead, .numeral, .stat-value";

  function align() {
    document.querySelectorAll(sel).forEach((el) => {
      el.style.marginLeft = "0px";
      const cs = getComputedStyle(el);
      const ch = (el.textContent || "").trim().charAt(0);
      if (!ch) return;
      const g = cs.textTransform === "uppercase" ? ch.toUpperCase() : ch;
      ctx.font = `${cs.fontStyle} ${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
      ctx.textAlign = "left";
      const abl = ctx.measureText(g).actualBoundingBoxLeft;
      if (isFinite(abl)) el.style.marginLeft = `${abl.toFixed(2)}px`;
    });
  }

  if (document.fonts && document.fonts.ready) document.fonts.ready.then(align);
  align();
  let t;
  window.addEventListener("resize", () => { clearTimeout(t); t = setTimeout(align, 120); });
})();
