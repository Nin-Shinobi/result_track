import * as pdfjsLib from "../lib/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("../lib/pdf.worker.min.mjs", import.meta.url).href;

const NUM_RE = /^-?\d{1,3}(?:[.,]\d{1,3})?$/;
const LETTER_RE = /^[NV]{1,2}$/;
const ECU_MARKER_RE = /^ec(\d+)([rs]?)$/i;
const MUE_RE = /^mue(\d+)$/i;
const VUE_RE = /^vue(\d+)$/i;

const NUM_TOL = 16;
const LETTER_TOL = 20;
const HEADER_CLUSTER_TOL = 1.2;

const NAME_BAND_EXCLUDE = new Set([
  "COEF", "COEF.", "CC", "ET", "Rat", "Rat.", "MOY", "MOY.", "MOY. UE", "MOY ECU",
  "UE", "ECU", "NOM", "CECT", "CECTS", "CECTS Acquis", "Acquis",
  "Validation", "Validation UE", "Résultats UE", "Sessi", "Sessio", "Session",
  "Groupe", "Groupe 4", "nom__prenoms", "N°",
]);

export function parseNumber(s) {
  if (s === null || s === undefined) return null;
  const m = String(s).replace(/\s+/g, "").match(/-?\d+(?:[.,]\d+)?/);
  return m ? parseFloat(m[0].replace(",", ".")) : null;
}

function fmtNote(n) {
  if (n === null || n === undefined) return "";
  let out = Number.isInteger(n) ? String(n) : n.toFixed(2);
  out = out.replace(/\.?0+$/, "").replace(".", ",");
  return out;
}

function cleanItems(items) {
  return items
    .map((it) => ({
      t: String(it.str ?? it.t ?? "").trim(),
      x: typeof it.x === "number" ? it.x : it.transform?.[4],
      y: typeof it.y === "number" ? it.y : it.transform?.[5],
      w: it.width ?? it.w ?? 0,
    }))
    .filter((i) => i.t && typeof i.x === "number");
}

function clusterByY(items, tol) {
  const sorted = [...items].sort((a, b) => a.y - b.y || a.x - b.x);
  const rows = [];
  for (const it of sorted) {
    const last = rows[rows.length - 1];
    if (last && it.y - last.y <= tol) last.items.push(it);
    else rows.push({ y: it.y, items: [it] });
  }
  return rows;
}

function nearest(slots, x, tol) {
  let best = null;
  let bestD = Infinity;
  for (const s of slots) {
    const d = Math.abs(x - s.x);
    if (d < bestD) { bestD = d; best = s; }
  }
  return best && bestD <= tol ? best : null;
}

function splitName(name) {
  if (!name) return { nom: "", prenom: "" };
  const idx = name.indexOf(" ");
  if (idx === -1) return { nom: name, prenom: "" };
  return { nom: name.slice(0, idx), prenom: name.slice(idx + 1).trim() };
}

function parsePage(items) {
  const rows = clusterByY(items, HEADER_CLUSTER_TOL);

  const isEcuMark = (t) => ECU_MARKER_RE.test(t);
  const countEcu = (row) => row.items.reduce((n, i) => n + (isEcuMark(i.t) ? 1 : 0), 0);
  let markerRow = rows[0];
  for (const r of rows) if (countEcu(r) > countEcu(markerRow)) markerRow = r;

  const numHdrRow = rows.find((r) => r.items.some((i) => i.t === "CC") && r.items.some((i) => i.t === "ET")) || null;
  const nameRow = rows.find((r) => r.items.some((i) => i.t === "N°") && r.items.some((i) => i.t === "UE")) || null;
  const creditRow = rows.find((r) => r.items.some((i) => i.t === "Résultats UE")) || null;

  /* ---- ECU columns ---- */
  const ecuTokens = markerRow.items.filter((i) => isEcuMark(i.t)).sort((a, b) => a.x - b.x);
  const ecus = {};
  const order = [];
  for (const it of ecuTokens) {
    const m = ECU_MARKER_RE.exec(it.t);
    const idx = parseInt(m[1], 10);
    const role = m[2] || "moy";
    if (!ecus[idx]) { ecus[idx] = { idx }; order.push(idx); }
    ecus[idx][role] = it.x;
  }

  const isNumLabel = (t) =>
    t === "CC" || t === "ET" || t === "Rat" || t === "Rat." || /^MOY(?=\s|ECU|$)/.test(t);
  const numHdrList = (numHdrRow ? numHdrRow.items : [])
    .filter((i) => isNumLabel(i.t))
    .sort((a, b) => a.x - b.x);

  let prevS = -1e9;
  for (const idx of order) {
    const s = ecus[idx].s;
    let cc = null, et = null, rat = null, moyN = null;
    for (const c of numHdrList) {
      if (c.x <= prevS || c.x > s) continue;
      if (c.t === "CC") cc = c.x;
      else if (c.t === "ET") et = c.x;
      else if (c.t === "Rat" || c.t === "Rat.") rat = c.x;
      else moyN = c.x;
    }
    ecus[idx].cc = cc;
    ecus[idx].et = et;
    ecus[idx].rat = rat;
    if (!ecus[idx].moy) ecus[idx].moy = moyN;
    prevS = s;
  }

  /* ---- UE markers (mueN / vueN) ---- */
  const ueMoy = {};
  const ueVal = {};
  const markerOrder = [];
  for (const it of markerRow.items) {
    const em = ECU_MARKER_RE.exec(it.t);
    if (em) { markerOrder.push({ type: "ecu", idx: parseInt(em[1], 10) }); continue; }
    const mm = MUE_RE.exec(it.t);
    if (mm) { ueMoy[parseInt(mm[1], 10)] = it.x; markerOrder.push({ type: "mue", idx: parseInt(mm[1], 10) }); continue; }
    const vm = VUE_RE.exec(it.t);
    if (vm) ueVal[parseInt(vm[1], 10)] = it.x;
  }

  /* ---- credits columns ("CECTS Acquis") ---- */
  const credColXs = [];
  for (const r of rows) for (const it of r.items) if (it.t === "CECTS Acquis") credColXs.push(it.x);
  credColXs.sort((a, b) => a - b);
  const ueCredCol = {};
  for (const idx of Object.keys(ueVal).map(Number)) {
    ueCredCol[idx] = credColXs.find((cx) => cx > ueVal[idx]) ?? null;
  }

  /* ---- UE names + credit values ---- */
  const nameTokens = (nameRow ? nameRow.items : [])
    .filter((it) => it.t.includes(" ") && it.t.length > 5 && !["N°", "UE", "nom__prenoms"].includes(it.t))
    .sort((a, b) => a.x - b.x)
    .map((it) => ({ x: it.x, t: it.t, credits: null }));

  const creditTokens = (creditRow ? creditRow.items : [])
    .filter((it) => /^\d{1,3}$/.test(it.t))
    .sort((a, b) => a.x - b.x);

  for (const c of creditTokens) {
    let best = null, bd = Infinity;
    for (const n of nameTokens) {
      const d = Math.abs(c.x - n.x);
      if (d < bd) { bd = d; best = n; }
    }
    if (best && bd < 120) best.credits = parseNumber(c.t);
  }

  const mueOrder = Object.keys(ueMoy).map(Number).sort((a, b) => ueMoy[a] - ueMoy[b]);
  const maxMue = mueOrder.length ? Math.max(...mueOrder) : 0;
  const ueInfo = {};
  for (const n of nameTokens) {
    let ueIdx = mueOrder.find((idx) => ueMoy[idx] > n.x);
    if (ueIdx === undefined) ueIdx = maxMue + 1;
    ueInfo[ueIdx] = ueInfo[ueIdx] || { name: "", credits: null };
    if (!ueInfo[ueIdx].name) ueInfo[ueIdx].name = n.t;
    if (n.credits != null) ueInfo[ueIdx].credits = n.credits;
  }

  /* ---- ECU names (multi-line header band) ---- */
  const bandMinY = numHdrRow ? numHdrRow.y + 5 : 0;
  const bandMaxY = nameRow ? nameRow.y - 5 : Infinity;
  const nameItems = [];
  for (const r of rows) {
    if (r.y <= bandMinY || r.y >= bandMaxY) continue;
    for (const it of r.items) {
      const t = it.t;
      if (!t || NAME_BAND_EXCLUDE.has(t)) continue;
      if (/\d/.test(t)) continue;
      if (t.length <= 3) continue;
      nameItems.push({ x: it.x, w: it.w, y: r.y, t });
    }
  }
  const groups = [];
  for (const it of nameItems) {
    const c = it.x + it.w / 2;
    const g = groups.find((g) => Math.abs(g.center - c) <= 8);
    if (g) g.parts.push(it);
    else groups.push({ center: c, parts: [it] });
  }
  const ecuNames = {};
  if (groups.length) {
    for (const g of groups) {
      g.parts.sort((a, b) => b.y - a.y);
      g.text = g.parts.map((p) => p.t).join(" ");
      g.center = g.parts.reduce((s, p) => s + (p.x + p.w / 2), 0) / g.parts.length;
    }
    for (const idx of order) {
      const center = ((ecus[idx].moy || 0) + (ecus[idx].s || 0)) / 2;
      let best = null, bd = Infinity;
      for (const g of groups) {
        const d = Math.abs(g.center - center);
        if (d < bd) { bd = d; best = g; }
      }
      if (best && bd <= 60) ecuNames[idx] = best.text;
    }
  }

  /* ---- data rows ---- */
  const headerBottom = Math.min(
    markerRow.y, numHdrRow ? numHdrRow.y : Infinity,
    nameRow ? nameRow.y : Infinity, creditRow ? creditRow.y : Infinity,
  );

  const nameCols = [];
  if (numHdrRow) for (const it of numHdrRow.items) if (it.t === "NOM") nameCols.push(it.x);
  if (nameRow) for (const it of nameRow.items) if (it.t === "nom__prenoms") nameCols.push(it.x);
  nameCols.sort((a, b) => a - b);

  const ccSlots = [];
  const midSlots = [];
  const letterSlots = [];
  for (const idx of order) {
    const e = ecus[idx];
    if (e.cc != null) ccSlots.push({ key: "cc" + idx, x: e.cc });
    if (e.et != null) midSlots.push({ key: "et" + idx, x: e.et });
    if (e.rat != null) midSlots.push({ key: "rat" + idx, x: e.rat });
    if (e.moy != null) midSlots.push({ key: "moy" + idx, x: e.moy });
    if (e.s != null) letterSlots.push({ key: "s" + idx, x: e.s });
  }
  for (const idx of Object.keys(ueMoy).map(Number)) {
    midSlots.push({ key: "umoy" + idx, x: ueMoy[idx] });
    if (ueCredCol[idx] != null) midSlots.push({ key: "ucr" + idx, x: ueCredCol[idx] });
  }
  for (const idx of Object.keys(ueVal).map(Number)) {
    letterSlots.push({ key: "uval" + idx, x: ueVal[idx] });
  }

  const letterItems = items.filter((i) => LETTER_RE.test(i.t));
  const letterClusters = clusterByY(letterItems, 1.0).filter((r) => r.y < headerBottom - 3);
  const all = items;

  const students = [];
  for (const cluster of letterClusters) {
    const ys = cluster.items.map((i) => i.y);
    const yB = ys.reduce((a, b) => a + b, 0) / ys.length;

    const region = all.filter((i) => i.y >= yB - 3.5 && i.y <= yB + 3.5);
    const subRows = clusterByY(region, 0.7);
    const bIdx = subRows.findIndex((r) => Math.abs(r.y - yB) <= 0.6);
    const lineB = bIdx >= 0 ? subRows[bIdx] : { y: yB, items: [] };

    const above = subRows.slice(bIdx + 1).find((r) => r.items.some((i) => NUM_RE.test(i.t)));
    const below = subRows.slice(0, bIdx).reverse().find((r) => r.items.some((i) => i.t.includes(" ") && i.t.length >= 8));
    const lineA = above ? above : { y: yB, items: [] };
    const nameRowItems = below ? below.items : [];

    const nearNameCol = (x) => nameCols.some((nc) => Math.abs(x - nc) <= 20);

    let studentName = null;
    for (const it of nameRowItems) {
      if (it.t.includes(" ") && it.t.length >= 8 && (studentName === null || it.x < studentName.x)) {
        studentName = it;
      }
    }

    let numero = null;
    for (const it of lineB.items) {
      if (/^\d{1,2}$/.test(it.t) && nearNameCol(it.x)) { numero = parseInt(it.t, 10); break; }
    }

    const numeroTokens = new Set(lineB.items.filter((i) => /^\d{1,2}$/.test(i.t) && nearNameCol(i.x)));

    const vals = {};
    for (const it of lineA.items) {
      if (!NUM_RE.test(it.t) || numeroTokens.has(it)) continue;
      const s = nearest(ccSlots, it.x, NUM_TOL);
      if (s) vals[s.key] = parseNumber(it.t);
    }
    for (const it of lineB.items) {
      if (numeroTokens.has(it)) continue;
      if (NUM_RE.test(it.t)) {
        const s = nearest(midSlots, it.x, NUM_TOL);
        if (s) vals[s.key] = parseNumber(it.t);
      } else if (LETTER_RE.test(it.t)) {
        const s = nearest(letterSlots, it.x, LETTER_TOL);
        if (s) vals[s.key] = it.t;
      }
    }

    const ecuResults = {};
    for (const idx of order) {
      ecuResults[idx] = {
        cc: vals["cc" + idx] ?? null,
        et: vals["et" + idx] ?? null,
        rat: vals["rat" + idx] ?? null,
        moy: vals["moy" + idx] ?? null,
        s: vals["s" + idx] || null,
      };
    }
    const ueResults = {};
    for (const idx of Object.keys(ueMoy).map(Number)) {
      ueResults[idx] = {
        moy: vals["umoy" + idx] ?? null,
        val: vals["uval" + idx] || "",
        credits: vals["ucr" + idx] ?? null,
      };
    }

    students.push({ numero, name: studentName ? studentName.t : null, ecuResults, ueResults });
  }

  students.sort((a, b) => (b.name || "") < (a.name || "") ? 1 : -1);
  students.sort((a, b) => {
    if (a.numero != null && b.numero != null) return a.numero - b.numero;
    return 0;
  });

  return { students, ecus, ueMoy, ueVal, ueCredCol, ueInfo, ecuNames, markerOrder };
}

export function parseGridPages(pagesItems, semester = "1") {
  const pages = pagesItems.map(cleanItems).map(parsePage);

  const globalMarkers = [];
  for (const p of pages) globalMarkers.push(...p.markerOrder);
  const muePos = globalMarkers.map((m, i) => ({ ...m, i })).filter((m) => m.type === "mue");
  const lastMue = muePos.length ? muePos[muePos.length - 1].idx : 0;
  const ecuUE = {};
  globalMarkers.forEach((m, i) => {
    if (m.type !== "ecu") return;
    const next = muePos.find((mp) => mp.i > i);
    ecuUE[m.idx] = next ? next.idx : lastMue + 1;
  });

  const ueInfo = {};
  const ecuNames = {};
  for (const p of pages) {
    for (const [k, v] of Object.entries(p.ueInfo)) {
      ueInfo[k] = ueInfo[k] || { name: "", credits: null };
      if (v.name && !ueInfo[k].name) ueInfo[k].name = v.name;
      if (v.credits != null) ueInfo[k].credits = v.credits;
    }
    Object.assign(ecuNames, p.ecuNames);
  }

  const byNum = new Map();
  pages.forEach((p, pi) => {
    p.students.forEach((st, si) => {
      const key = st.numero != null ? st.numero : `${pi}_${si}`;
      if (!byNum.has(key)) byNum.set(key, { numero: st.numero, name: null, ecuResults: {}, ueResults: {} });
      const agg = byNum.get(key);
      if (agg.name === null && st.name) agg.name = st.name;
      Object.assign(agg.ecuResults, st.ecuResults);
      Object.assign(agg.ueResults, st.ueResults);
    });
  });

  const students = [...byNum.values()].sort((a, b) => {
    if (a.numero != null && b.numero != null) return a.numero - b.numero;
    return 0;
  });

  const records = [];
  const ueIdxs = Object.keys(ueInfo).map(Number).sort((a, b) => a - b);
  for (const st of students) {
    const { nom, prenom } = splitName(st.name);
    for (const idx of ueIdxs) {
      const info = ueInfo[idx] || { name: "", credits: null };
      const ur = st.ueResults[idx] || {};
      const credits = ur.credits != null ? ur.credits : info.credits;
      const ecus = Object.keys(ecuUE)
        .filter((e) => ecuUE[e] === idx)
        .map(Number)
        .sort((a, b) => a - b)
        .map((e) => {
          const r = st.ecuResults[e] || {};
          return {
            intitule: ecuNames[e] || "ECU " + e,
            cc: r.cc ?? null,
            et: r.et ?? null,
            rat: r.rat ?? null,
            moy: r.moy ?? null,
            validation: r.moy != null ? (r.moy >= 7 ? "V" : "NV") : (r.s || ""),
          };
        });
      records.push({
        numero: st.numero ?? null,
        nom,
        prenom,
        ue: "UE " + idx,
        intitule: info.name || "UE " + idx,
        note: ur.moy ?? null,
        noteText: ur.moy != null ? fmtNote(ur.moy) : "",
        credit: credits ?? 0,
        semestre: String(semester),
        statut: ur.val || "",
        ecus,
      });
    }
  }

  return { records, students: students.length, semestre: String(semester) };
}

export function hasGridMarkers(items) {
  return items.some((it) => /^ec\d+s$/i.test(String(it.text ?? it.t ?? "").trim()));
}

export function detectSemester(name = "", pagesItems = []) {
  const m = String(name).match(/sem(?:estres?)?[\s_.-]*(\d)/i);
  if (m) return m[1];
  for (const pg of pagesItems) {
    const t = pg.map((i) => String(i.t ?? "")).join(" ");
    const mm = t.match(/semestre\s*(\d)/i);
    if (mm) return mm[1];
  }
  return "1";
}

export async function parseGridPDF(arrayBuffer, filename, onProgress) {
  const pdf = await pdfjsLib.getDocument({
    data: arrayBuffer,
    disableFontFace: true,
    isEvalSupported: false,
    useSystemFonts: true,
    onProgress,
  }).promise;

  const pages = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const tc = await page.getTextContent();
    pages.push(tc.items.map((it) => ({ t: it.str, x: it.transform[4], y: it.transform[5], w: it.width })));
  }
  pdf.destroy?.();
  return parseGridPages(pages, detectSemester(filename, pages));
}
