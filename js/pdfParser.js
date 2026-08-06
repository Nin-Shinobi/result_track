import * as pdfjsLib from "../lib/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../lib/pdf.worker.min.mjs", import.meta.url).href;

export const FIELDS = [
  { key: "nom", label: "Nom", regex: /^\s*nom(?!\s*d?u\s)*\b/i },
  { key: "prenom", label: "Prénom", regex: /^\s*pr[eé]nom\b/i },
  { key: "ue", label: "UE", regex: /^\s*(ue|unit[ée]s?\s+d['']enseignement|module)\b/i },
  { key: "intitule", label: "Intitulé / Matière", regex: /intitul[ée]|mat[iè]re|module|d[ée]signation|libell[ée]|d[ée]signation/i },
  { key: "note", label: "Note", regex: /^\s*(note|moyenne|r[ée]sultat)\b/i },
  { key: "credit", label: "Crédits", regex: /cr[ée]dits?|ects/i },
  { key: "semestre", label: "Semestre", regex: /^\s*semestres?\b|^\s*s\s?[1-6]\b/i },
];

const ROW_Y_TOL = 4;

async function extractLines(data, onProgress) {
  const pdf = await pdfjsLib.getDocument({
    data,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    onProgress: onProgress,
  }).promise;

  const lines = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    const items = tc.items
      .filter((it) => it.str && it.str.trim())
      .map((it) => {
        const [, , , , e, f] = it.transform;
        return { text: it.str.replace(/\s+/g, " ").trim(), x: e, y: f, page: p };
      });

    items.sort((a, b) => b.y - a.y || a.x - b.x);
    let curY = null;
    let row = [];
    for (const it of items) {
      if (curY === null || Math.abs(it.y - curY) > ROW_Y_TOL) {
        if (row.length) lines.push(row);
        row = [it];
        curY = it.y;
      } else {
        row.push(it);
      }
    }
    if (row.length) lines.push(row);
  }
  pdf.destroy?.();
  return lines;
}

function rowScore(row) {
  let score = 0;
  for (const it of row) {
    for (const f of FIELDS) {
      if (f.regex.test(it.text)) { score++; break; }
    }
  }
  return score;
}

function findHeaderRow(lines) {
  let best = null;
  let bestScore = 0;
  for (const row of lines) {
    const s = rowScore(row);
    if (s > bestScore) { bestScore = s; best = row; }
  }
  return bestScore >= 2 ? best : null;
}

function detectColumns(headerRow) {
  const sorted = [...headerRow].sort((a, b) => a.x - b.x);
  const assigned = {};
  const taken = new Set();
  for (const it of sorted) {
    for (const f of FIELDS) {
      if (!(f.key in assigned) && !taken.has(f.key) && f.regex.test(it.text)) {
        assigned[f.key] = { x: it.x, text: it.text };
        taken.add(f.key);
        break;
      }
    }
  }
  return assigned;
}

export function parseNumber(s) {
  if (!s) return null;
  const m = String(s).replace(/\s+/g, "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : null;
}

function nearestColumn(x, cols) {
  let best = null;
  let bestDist = Infinity;
  for (const key of Object.keys(cols)) {
    const d = Math.abs(x - cols[key].x);
    if (d < bestDist) { bestDist = d; best = key; }
  }
  return best;
}

export function parseRecords(lines, cols) {
  const records = [];
  for (const row of lines) {
    if (rowScore(row) >= 2) continue; // ligne d'en-tête / titre

    const cells = {};
    for (const it of row) {
      const key = nearestColumn(it.x, cols);
      if (!key) continue;
      (cells[key] = cells[key] || []).push(it);
    }

    const get = (key) =>
      (cells[key] || []).slice().sort((a, b) => a.x - b.x).map((i) => i.text).join(" ").trim();

    const nomRaw = get("nom");
    const prenomRaw = get("prenom");
    if (!nomRaw && !prenomRaw) continue;

    const hasUe = cols.ue && get("ue");
    const hasNote = cols.note && (cells.note || []).length;
    const hasIntitule = cols.intitule && get("intitule");
    if (!hasUe && !hasNote && !hasIntitule) continue;

    let nom = nomRaw;
    let prenom = prenomRaw;
    if (!prenom) {
      const tokens = nomRaw.split(/\s+/);
      if (tokens.length >= 2) {
        prenom = tokens.pop();
        nom = tokens.join(" ");
      }
    }

    const noteText = get("note");
    records.push({
      nom,
      prenom,
      ue: get("ue"),
      intitule: get("intitule"),
      note: parseNumber(noteText),
      noteText,
      credit: parseNumber(get("credit")),
      semestre: get("semestre"),
    });
  }
  return records;
}

export function extractColumnList(headerRow) {
  return [...headerRow]
    .sort((a, b) => a.x - b.x)
    .map((it, i) => ({ index: i, text: it.text, x: it.x }));
}

export async function parsePDF(arrayBuffer, onProgress) {
  const lines = await extractLines(arrayBuffer, onProgress);
  const headerRow = findHeaderRow(lines);
  let columns = [];
  let cols = {};
  let records = [];
  if (headerRow) {
    cols = detectColumns(headerRow);
    columns = extractColumnList(headerRow);
    records = parseRecords(lines, cols);
  }
  const unmatched = FIELDS.filter((f) => !cols[f.key]).map((f) => f.key);
  return { lines, columns, cols, records, unmatched, headerFound: !!headerRow };
}

export function parseWithMapping(lines, columns, assigned) {
  const cols = {};
  for (const key of Object.keys(assigned)) {
    const idx = assigned[key];
    if (idx === null || idx === undefined || idx === "") continue;
    const col = columns[idx];
    if (col) cols[key] = { x: col.x, text: col.text };
  }
  return { records: parseRecords(lines, cols), cols };
}
