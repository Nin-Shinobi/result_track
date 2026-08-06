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
- **Bilan de la classe** — moyenne générale, taux de réussite, histogramme des moyennes, répartition par semestre, classement des étudiants.
- **Fiche étudiant** — moyenne, mention (Assez Bien / Bien / Très Bien), crédits validés, rang, notes par UE, absences.
- **Mise en page suisse** — grille 12 colonnes de style Müller-Brockmann, police Inter, baseline 8 px, accent rouge.
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

Les mentions suivent le barème LMD : validation ≥ 10, Assez Bien ≥ 12, Bien ≥ 14, Très Bien ≥ 16.

## Technologies

- **pdf.js 4.8.69** pour l'extraction du PDF
- **Vanilla JS (ES modules)** — aucun framework
- **CSS** — grille 12 colonnes, variables, `subgrid`
## Licence

À définir — projet interne.
