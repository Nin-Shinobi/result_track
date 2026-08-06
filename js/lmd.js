export function normalizeName(s = "") {
  return String(s)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''\u2019]/g, " ")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function mentionOf(moyenne) {
  if (moyenne === null || isNaN(moyenne)) return "";
  if (moyenne >= 18) return "Très Bien";
  if (moyenne >= 16) return "Bien";
  if (moyenne >= 14) return "Assez Bien";
  if (moyenne >= 10) return "Passable";
  return "Échec";
}

export function mentionClass(moyenne) {
  if (moyenne === null || isNaN(moyenne)) return "red";
  if (moyenne >= 14) return "green";
  if (moyenne >= 10) return "amber";
  return "red";
}

function semesterOrder(s) {
  const m = String(s).match(/(\d+)/);
  return m ? parseInt(m[1], 10) : 999;
}

function acquired(u) {
  if (u.statut) return u.statut === "V";
  return u.note !== null && u.note >= 10;
}

function weightedAverage(ues) {
  const withNote = ues.filter((u) => u.note !== null && u.credit > 0);
  if (!withNote.length) return null;
  const totalCredit = withNote.reduce((s, u) => s + u.credit, 0);
  if (!totalCredit) return null;
  return withNote.reduce((s, u) => s + u.note * u.credit, 0) / totalCredit;
}

function displayName(student) {
  return student.prenom ? `${student.prenom} ${student.nom}` : student.nom;
}

export function groupStudents(records) {
  const map = new Map();

  for (const r of records) {
    if (!r.nom && !r.prenom) continue;
    const key = normalizeName(`${r.prenom || ""} ${r.nom || ""}`);
    if (!key) continue;

    let st = map.get(key);
    if (!st) {
      st = {
        key,
        nom: r.nom || "",
        prenom: r.prenom || "",
        ues: [],
      };
      map.set(key, st);
    }
    st.ues.push({
      code: r.ue || "",
      label: r.intitule || r.ue || "",
      note: r.note,
      noteText: r.noteText || "",
      credit: r.credit || 0,
      semestre: r.semestre || "",
      statut: r.statut || "",
      ecus: r.ecus || [],
    });
  }

  const students = [...map.values()];

  for (const st of students) {
    const semSet = new Set(st.ues.map((u) => u.semestre).filter(Boolean));
    const sems = [...semSet].sort((a, b) => semesterOrder(a) - semesterOrder(b));

    st.semestres = sems.map((name) => {
      const ues = st.ues.filter((u) => u.semestre === name);
      const moyenne = weightedAverage(ues);
      const valide = moyenne !== null && moyenne >= 10;
      const creditsAcquis = ues.filter(acquired).reduce((s, u) => s + (u.credit || 0), 0);
      return { name, ues, moyenne, valide, creditsAcquis };
    });

    st.moyenne = weightedAverage(st.ues);
    st.mention = mentionOf(st.moyenne);
    st.creditsAcquis = st.semestres.reduce((s, sm) => s + sm.creditsAcquis, 0);
    st.creditsTotal = st.ues.reduce((s, u) => s + (u.credit || 0), 0);
    st.nbUes = st.ues.length;
    st.nbUesValidees = st.ues.filter(acquired).length;
    st.nbAbsences = st.ues.filter((u) => u.note === null).length;
    st.nomDisplay = displayName(st);
  }

  students.sort((a, b) => (b.moyenne ?? -1) - (a.moyenne ?? -1));
  students.forEach((st, i) => {
    st.rang = i + 1;
    if (st.moyenne === null) st.rang = null;
  });

  return students;
}

export function classStats(students) {
  const withMoy = students.filter((s) => s.moyenne !== null);
  const moyenneClasse = withMoy.length
    ? withMoy.reduce((s, x) => s + x.moyenne, 0) / withMoy.length
    : null;
  const reussite = withMoy.filter((s) => s.moyenne >= 10).length;

  const buckets = [
    { label: "<10", min: 0, max: 10 },
    { label: "10-12", min: 10, max: 12 },
    { label: "12-14", min: 12, max: 14 },
    { label: "14-16", min: 14, max: 16 },
    { label: "16-20", min: 16, max: 20 },
  ];
  const distribution = buckets.map((b) => ({
    label: b.label,
    count: withMoy.filter((s) => s.moyenne >= b.min && s.moyenne < b.max).length,
  }));

  const semSet = new Set();
  students.forEach((s) => s.semestres.forEach((sm) => semSet.add(sm.name)));
  const semestres = [...semSet].sort((a, b) => semesterOrder(a) - semesterOrder(b)).map((name) => {
    const eligible = students.filter((s) => s.semestres.some((sm) => sm.name === name && sm.moyenne !== null));
    const valid = eligible.filter((s) => s.semestres.find((sm) => sm.name === name).valide).length;
    return {
      name,
      taux: eligible.length ? (valid / eligible.length) * 100 : 0,
      count: eligible.length,
    };
  });

  const creditMax = students.length ? Math.max(...students.map((s) => s.creditsAcquis)) : 0;

  return {
    effectif: students.length,
    moyenneClasse,
    reussite,
    tauxReussite: withMoy.length ? (reussite / withMoy.length) * 100 : 0,
    distribution,
    semestres,
    creditMax,
  };
}
