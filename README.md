# 🏁 LMU Stats Viewer

<div align="center">

![Version](https://img.shields.io/badge/version-0.9.3-blue)
![Platform](https://img.shields.io/badge/platform-Windows-lightgrey)
![PHP](https://img.shields.io/badge/PHP-8.x-777BB4)
![Langues](https://img.shields.io/badge/langues-FR%20%7C%20EN%20%7C%20ES%20%7C%20DE-green)
![Licence](https://img.shields.io/badge/licence-MIT-orange)

**Un outil de statistiques pour [Le Mans Ultimate](https://www.lemansultimate.com/) — suivez vos meilleurs temps, résultats de course et progression.**

[📥 Télécharger](#installation) · [🐛 Signaler un bug](https://github.com/cparfait/lmustatsviewer/issues) · [💬 Discord](https://discord.gg/G9ng9GdvSU)

</div>

---

## 📸 Captures d'écran

> *(Captures à ajouter prochainement)*

<!--
![Vue principale](docs/screenshot_main.png)
![Détails de course](docs/screenshot_details.png)
![Mode sombre](docs/screenshot_dark.png)
-->

---

## ✨ Fonctionnalités

### 📊 Tableau de bord
- **Meilleurs temps** par circuit, layout et voiture — avec détail des secteurs (S1 / S2 / S3)
- **Temps optimal** (meilleur temps théorique en combinant vos meilleurs secteurs)
- **Vitesse maximale** (V-max) par session
- **Statistiques globales** : temps de conduite total, tours effectués, circuit et voiture favoris
- **Meilleur résultat en ligne** et meilleure progression (grille → arrivée)

### 🏎️ Support multi-classes
Toutes les classes de Le Mans Ultimate sont supportées :
`Hypercar` · `LMP2 ELMS` · `LMP2` · `LMP3` · `GT3` · `GTE`

### 📋 Détails de course
- Classement par session et par classe avec écart au leader
- Détail tour par tour pour chaque pilote
- Analyse des relais, stratégie carburant (% départ → % arrivée), pneumatiques et usure
- Incidents, pénalités et log de chat
- **Comparaison de pilotes** — superposition des courbes de temps

### 📈 Graphiques interactifs
- Courbe de progression des temps au tour (clic sur n'importe quelle cellule de temps)
- Écart au meilleur tour au survol
- Meilleur tour mis en évidence

### 🔍 Filtres
- Circuit / Layout / Classe / Voiture
- Type de session (Essais / Qualification / Course)
- Type de réglage (En ligne / Week-end de course)
- Filtre par version du jeu

### 🌐 Langues disponibles
| 🇫🇷 Français | 🇬🇧 English | 🇪🇸 Español | 🇩🇪 Deutsch |
|---|---|---|---|
| ✅ | ✅ | ✅ | ✅ |

### 🎨 Thèmes
Mode clair et mode sombre — bascule en un clic, mémorisé entre les sessions.

### ⚡ Performance
- Système de cache MD5 — rechargement instantané si aucun nouveau fichier détecté
- Cache stocké dans `%APPDATA%\LMU_Stats_Viewer\`

### 🔄 Mises à jour automatiques
Vérificateur de mise à jour intégré — vous avertit dès qu'une nouvelle version est disponible sur GitHub.

---

## 🖥️ Prérequis

| Composant | Détail |
|---|---|
| Système | Windows 10 / 11 |
| Jeu | [Le Mans Ultimate](https://www.lemansultimate.com/) (Steam) |
| PHP | Inclus dans l'installeur — rien à installer |

---

## 📥 Installation

1. Rendez-vous sur la page [**Releases**](https://github.com/cparfait/lmustatsviewer/releases)
2. Téléchargez le dernier `SETUP-LSV-x.x.x.exe`
3. Lancez l'installeur
4. Double-cliquez sur **LMU Stats Viewer** depuis le bureau ou le menu Démarrer

L'application démarre un serveur PHP local en arrière-plan et ouvre votre navigateur automatiquement.
Une icône apparaît dans la **barre système** — clic droit pour accéder à la Configuration, aux Mises à jour ou pour Quitter.

> 💡 Les fichiers de résultats se trouvent généralement ici :
> `C:\Program Files (x86)\Steam\steamapps\common\Le Mans Ultimate\UserData\Log\Results`
> Le chemin est détecté automatiquement au premier lancement et peut être modifié dans la **Configuration**.

---

## ⚙️ Configuration

Cliquez sur l'icône ⚙️ dans l'en-tête de l'application ou clic droit sur l'icône tray → **Configuration**.

| Paramètre | Description |
|---|---|
| Nom du joueur | Votre pseudo en jeu (utilisé pour mettre vos tours en évidence) |
| Répertoire des résultats | Chemin vers les fichiers XML de résultats LMU |
| Fuseau horaire | Pour l'affichage correct des horodatages de session |
| Langue | FR / EN / ES / DE |
| Filtre version par défaut | Filtrer les résultats à partir d'une version du jeu |

### Maintenance
- **Vider le cache** — force le rechargement complet de toutes les sessions
- **Purger les sessions vides** — supprime les sessions sans tour enregistré (globale ou par joueur)

---

## 🗂️ Fonctionnement

```
Le Mans Ultimate
    └── UserData/Log/Results/*.xml   ← fichiers de résultats (XML)
            │
            ▼
    LMU Stats Viewer (PHP)
            │   analyse et met en cache les données
            ▼
    Navigateur (localhost)           ← votre tableau de bord
```

LMU Stats Viewer lit les fichiers XML générés par le jeu après chaque session (Essais, Qualification, Course), analyse les temps au tour, temps secteurs, informations pilotes et événements de course, puis présente le tout dans une interface web interactive en local.

---

## 📁 Structure du projet

```
LMU_Stats_Viewer/
├── LMU_Stats_Viewer.exe    ← launcher (démarre PHP + ouvre le navigateur)
├── htdocs/                 ← application web
│   ├── index.php           ← tableau de bord principal
│   ├── race_details.php    ← détails de session
│   ├── config.php          ← page de configuration
│   ├── update.php          ← vérificateur de mises à jour
│   ├── css/style.css
│   ├── js/
│   ├── lang/               ← fichiers de traduction (fr/en/es/de)
│   ├── logos/              ← logos des marques automobiles
│   └── flags/              ← drapeaux des circuits
└── php/                    ← runtime PHP (inclus par l'installeur)
```

---

## 🛠️ Compiler depuis les sources

### Prérequis
- [PHP 8.x pour Windows](https://windows.php.net/download/) — version **Thread Safe (TS) x64**, à extraire dans le dossier `php/`
- [Python 3.10+](https://python.org) (pour le launcher)
- [InnoSetup 6](https://jrsoftware.org/isinfo.php) (pour l'installeur)

### Configuration PHP requise

Dans `php/php.ini`, activer l'extension **intl** en décommentant la ligne :

```ini
extension=intl
```

> 💡 Vous pouvez copier `php.ini-production` en `php.ini` et décommenter uniquement cette ligne.

### Compiler le launcher
```bat
cd launcher
build.bat
```
Génère `LMU_Stats_Viewer.exe` à la racine du projet.

### Compiler l'installeur
Ouvrez `setup.iss` avec InnoSetup et cliquez sur **Compiler**.

---

## 📝 Changelog

### v0.9.3
- Ajout : tableau GTE
- Ajout : résumé des voitures de course
- Ajout : support LMP3 et LMP2 ELMS
- Ajout : comparaison de pilotes
- Correction : bug d'affichage des tours
- Correction : bug d'affichage de la position d'arrivée dans les meilleurs temps
- Modification : améliorations graphiques, nettoyage du code, corrections de traductions

### v0.9.2
- Correction : vérificateur de mise à jour non fonctionnel

### v0.9.1
- Ajout : vérificateur de mise à jour automatique

### v0.9
- Ajout : thème sombre
- Ajout : support des layouts de circuits *(merci @Tontonjp)*
- Ajout : nouveau système config.json avec suggestion du nom de pilote
- Modification : système de purge de sessions, améliorations CSS

### v0.8
- Correction : temps secteur 2 à Spa
- Correction : traduction allemande *(merci @Texas-Edelweis)*

### v0.7
- Ajout : onglet stratégie (pneus & carburant)
- Ajout : carburant départ/arrivée dans les détails de course
- Ajout : filtres sur le tableau de détails
- Modification : classement des meilleurs temps *(merci @astroremucho)*

### v0.6
- Ajout : classement multi-classes (Hyper / LMP2 / GT3...)
- Ajout : tableau des types d'incidents
- Correction : tour invalide sur secteur manquant *(merci @Botmeister)*

### v0.5
- Ajout : système de cache (`%APPDATA%`)
- Ajout : onglet chat dans les détails de course
- Ajout : page de configuration avec outils de purge

### v0.4
- Ajout : filtre En ligne / Week-end de course

### v0.3
- Ajout : filtre par version du jeu *(merci @Pillot69)*

### v0.2
- Correction : la configuration ne sauvegardait pas le chemin des logs

---

## 🤝 Contribuer

Les contributions, rapports de bugs et suggestions sont les bienvenus !
N'hésitez pas à ouvrir une [issue](https://github.com/cparfait/lmustatsviewer/issues) ou à soumettre une pull request.

💬 Rejoignez aussi la communauté sur **[Discord](https://discord.gg/G9ng9GdvSU)**.

---

## 👤 Auteur

**Cris Tof**
Fait avec ❤️ pour la communauté Le Mans Ultimate.

Si l'outil vous est utile, vous pouvez me remercier avec un café ☕

[![Buy Me A Coffee](https://img.shields.io/badge/Buy%20me%20a%20coffee-cristof-FFDD00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/cristof)

---

## 📄 Licence

Ce projet est sous licence [MIT](LICENSE).

> *LMU Stats Viewer n'est pas affilié à Studio 397 ou Le Mans Ultimate.*
