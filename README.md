<p align="center">
  <a href="#"><img alt="Statut" src="https://img.shields.io/badge/statut-actif-2ea44f?style=for-the-badge"></a>
  <a href="#"><img alt="Privé" src="https://img.shields.io/badge/donn%C3%A9es-100%25%20locales-111315?style=for-the-badge"></a>
  <a href="#"><img alt="HTML5" src="https://img.shields.io/badge/HTML5-OK-e34f26?style=for-the-badge&logo=html5&logoColor=white"></a>
  <a href="#"><img alt="CSS3" src="https://img.shields.io/badge/CSS3-OK-1572b6?style=for-the-badge&logo=css3&logoColor=white"></a>
  <a href="#"><img alt="JavaScript" src="https://img.shields.io/badge/JavaScript-ES2020-f7df1e?style=for-the-badge&logo=javascript&logoColor=111315"></a>
  <a href="#"><img alt="pdf.js" src="https://img.shields.io/badge/PDF.js-4.8.69-f43059?style=for-the-badge"></a>
  <a href="#"><img alt="Serveur" src="https://img.shields.io/badge/z%C3%A9ro-serveur%20requis-6a737d?style=for-the-badge"></a>
</p>

# ResultTrack

**Tableau de bord des grilles de notes LMD** — importez votre grille de notes PDF et obtenez instantanément le bilan de la classe et de chaque étudiant : moyennes, mentions, crédits validés, taux de réussite. Sans serveur, sans envoi de données : tout s'exécute dans votre navigateur.

## Fonctionnalités

- **Grille de notes PDF → tableau de bord** — déposez la grille de notes (LMD) et tout est extrait et analysé automatiquement.
- **Semestre auto-détecté** — la plateforme s'adapte au semestre unique de la grille (détection dans le nom du fichier, p. ex. `Grille_Notes_L_IRT_Sem2_2025-2026`).
- **Bilan de la classe** — moyenne générale, taux de réussite (jauge circulaire Réussite / En retard), histogramme des moyennes, classement des étudiants (top 3 mis en avant).
- **Fiche étudiant** — moyenne, mention (Assez Bien / Bien / Très Bien), crédits validés, rang, notes par UE, absences.
- **Recherche d'étudiant** — liste triée par ordre alphabétique, filtre instantané avec compteur de résultats, bouton Valider et navigation au clavier (↑/↓/Entrée/Échap) ; sélectionner un étudiant ouvre directement sa fiche.
- **Mise en page suisse** — grille 12 colonnes de style Müller-Brockmann, police Inter, baseline 8 px, accent rouge.
- **Responsive** — tableaux de bord, recherche et classement s'adaptent du très grand écran au mobile.
- **100 % local** — vos données ne quittent jamais votre machine.

## Navigation

- **Accueil** — présentation et trois étapes d'utilisation.
- **À propos** — contexte, barème LMD et confidentialité.
- **Charger** — dépôt du PDF de la grille de notes.

## Démarrage rapide

```bash
# Depuis le dossier du projet
python3 -m http.server 8080
```

Ouvrez <http://localhost:8080> puis **déposez votre grille de notes PDF** (onglet « Charger »).

> Le fichier doit être servi via HTTP/HTTPS (les modules ES et le worker PDF.js ne sont pas accessibles en `file://`).

## Usage

1. Ouvrez l'onglet **Charger** et déposez votre grille de notes (PDF).
2. Le semestre est lu depuis le nom du fichier ; il apparaît en haut à droite (« Semestre 2 »).
3. Le tableau de bord s'affiche : **Vue classe** et **Vue étudiant** (recherche par nom).
4. En cas d'extraction ambiguë, une fenêtre de **mapping des colonnes** permet d'ajuster le rôle de chaque colonne.

## Structure

```
resultrack/
├── index.html                 # Page principale (navigation Accueil / À propos / Charger)
├── css/style.css              # Style Müller-Brockmann (12 colonnes, baseline 8 px)
├── js/
│   ├── app.js                 # Orchestration, import, semestre, navigation
│   ├── pdfParser.js           # Parser générique (relevés de notes)
│   ├── grilleParser.js        # Parser spécifique des grilles LMD + détection semestre
│   ├── lmd.js                 # Règles LMD : UE, crédits, mentions
│   └── dashboard.js           # Rendu du tableau de bord, graphiques
└── lib/pdf.min.mjs            # pdf.js 4.8.69
```

## Formats pris en charge

| Format | Détection | Colonnes attendues |
| --- | --- | --- |
| **Grille LMD** | en-têtes « Note », « Crédits », « Semestre » | Nom, Prénom, UE, Note, Crédits, Semestre |
| **Relevé générique** | sans marqueurs de grille | Nom, Prénom, UE, Note, Crédits (mapping manuel possible) |

Les mentions suivent le barème : Très Bien ≥ 16, Bien ≥ 14, Assez Bien ≥ 12, Passable ≥ 10, Échec < 10. Un ECU est validé à partir de 7/20. Les moyennes générales portent la couleur de leur mention ; les notes et moyennes simples UE et ECU portent la couleur de leur validation.

## Technologies

- **pdf.js 4.8.69** pour l'extraction du PDF
- **Vanilla JS (ES modules)** — aucun framework
- **CSS** — grille 12 colonnes, variables, `subgrid`

## Contribuer

### Mise en route

```bash
git clone <url-du-dépôt> result-track
cd result-track
python3 -m http.server 8080     # sert le projet sur http://localhost:8080
```

Un serveur HTTP local est indispensable : les modules ES et le worker PDF.js refusent de s'exécuter en `file://`.

### Flux de contribution

1. Créez une branche : `git checkout -b feature/ma-fonctionnalite`.
2. Faites vos modifications en respectant les conventions ci-dessous.
3. Vérifiez la syntaxe : `node --check js/*.js` (aucun build, pas de dépendance à installer).
4. Testez dans le navigateur avec une grille de notes réelle (voir *Jeux de test*).
5. Ouvrez une pull request décrivant le changement et le test effectué.

### Architecture (comment circule une grille)

```
PDF (fichier déposé)
  └─ app.js ─ loadFile() ─ parsePDF()          pdfParser.js   : texte + colonnes génériques
       │                   └─ hasGridMarkers() grilleParser.js : détection du format grille LMD
       │                       └─ parseGridPDF()                extraction records (UE/ECU/crédits/notes)
       ▼
  records[]  ── groupStudents() / classStats() ── lmd.js        : règle du jeu LMD (moyennes, crédits, mentions)
       ▼
  students[] + stats  ── renderClass() / renderStudent() ── dashboard.js : rendu DOM + graphiques
```

- **`lmd.js`** est la seule source du barème : seuils de mention (16/14/12/10), validation UE ≥ 10, ECU ≥ 7. Aucune de ces règles ne doit vivre ailleurs.
- **`dashboard.js`** ne fait que de l'affichage : il reçoit des données déjà calculées, il n'applique pas de règle métier.
- **`app.js`** orchestre : import du fichier, navigation (Accueil / À propos / Charger), onglets Classe / Étudiant, recherche et mapping manuel.

### Conventions

- **JS** : modules ES natifs, pas de framework ni de dépendance. Variables en camelCase, fonctions nommées. Une fonction exportée = un comportement testable.
- **Interface** : textes en français, avec accents (évitez les messages en anglais).
- **CSS** : grille 12 colonnes Müller-Brockmann, baseline 8 px (`--bl`), interligne 24 px (`--lh`). Tous les paramètres de grille et couleurs vivent dans `:root` (tokens `--accent`, `--ok`, `--warn`, `--err`). Seul le rouge `--accent` est une couleur d'accent ; le vert/ambre/rouge codent validation et mentions.
- **Accessibilité** : respectez `:focus-visible`, `aria-label` sur les contrôles, hiérarchie de titres `h1 → h2 → h3`, et testez au clavier (la recherche est navigable ↑/↓/Entrée/Échap).
- **Responsive** : points de rupture 1000 / 720 / 640 / 420 px. Le picker étudiant ne passe à la ligne qu'à partir de 640 px.

### Jeux de test

- Grille de référence : `Grille_Notes_L_IRT_Sem2_2025-2026 Groupe 4.pdf` (60 étudiants, 1 semestre).
- Après import, vérifiez : 60 étudiants dans la classe, rang 1 = moyenne la plus haute, couleurs des mentions (vert/ambre/rouge), fiche étudiant complète (avatar, crédits `x/y`, rang, absences).
- Vérifiez le responsive à 1280, 900, 700 et 390 px (aucun débordement horizontal ; le picker ne se replie qu'à ≤ 640 px).

## Licence

Projet développé par [Nin-Shinobi](https://github.com/Nin-Shinobi) sous **licence libre (MIT)**. Vous pouvez librement utiliser, modifier et redistribuer ce projet, à condition de conserver la mention de l'auteur.
