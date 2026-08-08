/**
 * Release notes for LMU Stats Viewer.
 *
 * Le contenu peut être soit une chaîne anglaise simple (anciennes versions,
 * traduisibles à la volée via le bouton « Traduire »), soit un texte localisé
 * `{ en, fr, es, de }` affiché directement dans la langue de l'app (versions
 * récentes — pas besoin du bouton). Les libellés d'UI passent par i18n.
 */

export type ChangelogSectionKind =
  | "added"
  | "improved"
  | "fixed"
  | "changed"
  | "removed";

/** Texte localisé : chaîne (EN seul) ou variantes par langue (`en` requis). */
export type LocalizedText =
  | string
  | { en: string; fr?: string; es?: string; de?: string };

/**
 * Un item de changelog : un texte (localisé ou non), éventuellement enrichi
 * d'un flag `featured` pour mettre une nouveauté majeure « en avant ».
 */
export type ChangelogItem =
  | LocalizedText
  | { text: LocalizedText; featured?: boolean };

export interface ChangelogSection {
  kind: ChangelogSectionKind;
  items: ChangelogItem[];
}

export interface ChangelogEntry {
  version: string;
  date: string;
  /** Version encore en développement (badge distinct). */
  dev?: boolean;
  /** Entrée déjà traduite dans les 4 langues → masque le bouton « Traduire ». */
  localized?: boolean;
  sections: ChangelogSection[];
}

/** Résout un texte localisé pour la langue courante (repli sur l'anglais). */
export function pickLang(text: LocalizedText, lang: string): string {
  if (typeof text === "string") return text;
  const key = lang.slice(0, 2) as "en" | "fr" | "es" | "de";
  return text[key] ?? text.en;
}

/** Normalise un item en `{ text, featured }`. */
export function normalizeItem(item: ChangelogItem): {
  text: LocalizedText;
  featured: boolean;
} {
  if (typeof item === "string") return { text: item, featured: false };
  if ("text" in item)
    return { text: item.text, featured: item.featured ?? false };
  return { text: item, featured: false };
}

export const APP_VERSION: string = __APP_VERSION__;

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.0",
    date: "2026-08-09",
    dev: false,
    localized: true,
    sections: [
      {
        kind: "added",
        items: [
          {
            en: "First stable release — the app has been entirely rebuilt as a fast, native Windows application.",
            fr: "Première version stable — l'application a été entièrement reconstruite en une appli Windows native et rapide.",
            es: "Primera versión estable: la aplicación se ha reconstruido por completo como una app nativa de Windows, rápida.",
            de: "Erste stabile Version — die App wurde komplett als schnelle, native Windows-Anwendung neu aufgebaut.",
          },
          {
            text: {
              en: "In-game overlays (HUD): a full set of 20+ overlays you can show on top of the game — live delta, corner-by-corner delta, sectors, speed, standings, relative, rival, proximity radar, track map, flags, telemetry, G-force, driving aids, lift & coast, tyres, damage, fuel, session info, endurance, weather and dashboard. They're fully customisable: drag each one where you want it, pick its accent colour, and save complete layouts as profiles you can switch between.",
              fr: "Overlays en jeu (HUD) : une collection de 20+ overlays à afficher par-dessus le jeu — delta en direct, delta virage par virage, secteurs, vitesse, classement, relatif, rival, radar de proximité, carte du circuit, drapeaux, télémétrie, G-force, aides au pilotage, lift & coast, pneus, dégâts, carburant, infos session, endurance, météo et tableau de bord. Ils sont entièrement personnalisables : place chacun où tu veux, choisis sa couleur d'accent, et enregistre des dispositions complètes en profils interchangeables.",
              es: "Overlays en el juego (HUD): un conjunto de más de 20 overlays para mostrar sobre el juego — delta en vivo, delta curva por curva, sectores, velocidad, clasificación, relativo, rival, radar de proximidad, mapa del circuito, banderas, telemetría, fuerza G, ayudas a la conducción, lift & coast, neumáticos, daños, combustible, info de sesión, resistencia, clima y panel. Son totalmente personalizables: coloca cada uno donde quieras, elige su color de acento y guarda disposiciones completas como perfiles intercambiables.",
              de: "In-Game-Overlays (HUD): über 20 Overlays, die du über dem Spiel anzeigen kannst — Live-Delta, Delta Kurve für Kurve, Sektoren, Geschwindigkeit, Rangliste, Relativ, Rivale, Annäherungsradar, Streckenkarte, Flaggen, Telemetrie, G-Kraft, Fahrhilfen, Lift & Coast, Reifen, Schäden, Sprit, Session-Infos, Ausdauer, Wetter und Dashboard. Sie sind voll anpassbar: Ziehe jedes an die gewünschte Stelle, wähle seine Akzentfarbe und speichere ganze Layouts als umschaltbare Profile.",
            },
            featured: true,
          },
          {
            text: {
              en: "AI Coach: get a clear analysis of your race once it's over, and ask questions about your telemetry. The coach knows the ideal braking points for each corner and class, and points you to the right video lap guide for your track and car.",
              fr: "Coach IA : obtiens une analyse claire de ta course une fois terminée, et pose des questions sur ta télémétrie. Le coach connaît les points de freinage idéaux pour chaque virage et chaque catégorie, et te renvoie vers le bon guide vidéo pour ton circuit et ta voiture.",
              es: "Coach IA: obtén un análisis claro de tu carrera al terminar y haz preguntas sobre tu telemetría. El coach conoce los puntos de frenado ideales para cada curva y categoría, y te indica la guía en vídeo adecuada para tu circuito y coche.",
              de: "KI-Coach: Erhalte nach dem Rennen eine klare Analyse und stelle Fragen zu deiner Telemetrie. Der Coach kennt die idealen Bremspunkte für jede Kurve und Klasse und verweist dich auf das passende Video-Lap-Guide für Strecke und Auto.",
            },
            featured: true,
          },
          {
            text: {
              en: "Live voice coaching: short spoken call-outs while you drive, plus push-to-talk so you can ask the coach a question with your voice.",
              fr: "Coaching vocal en direct : de courtes annonces parlées pendant que tu roules, plus un push-to-talk pour poser une question au coach à la voix.",
              es: "Coaching de voz en directo: breves indicaciones habladas mientras conduces, además de push-to-talk para preguntar al coach con tu voz.",
              de: "Live-Sprachcoaching: kurze gesprochene Ansagen während der Fahrt, plus Push-to-Talk, um dem Coach per Stimme eine Frage zu stellen.",
            },
            featured: true,
          },
          {
            text: {
              en: "Voice race engineer (spotter): automatic spoken announcements while you drive — flags, fuel warnings, tyre wear, damage, positions, blue flag, personal best, purple sector, last lap and more. Ask it questions with your voice (gap, fuel, tyres, position, weather…): speech recognition runs 100% offline in 4 languages, and the text of every announcement can be customised.",
              fr: "Ingénieur de course vocal (spotter) : annonces parlées automatiques pendant que tu roules — drapeaux, alertes carburant, usure des pneus, dégâts, positions, drapeau bleu, record perso, secteur violet, dernier tour et plus. Pose-lui des questions à la voix (écart, carburant, pneus, position, météo…) : la reconnaissance vocale fonctionne 100 % hors-ligne en 4 langues, et le texte de chaque annonce est personnalisable.",
              es: "Ingeniero de carrera por voz (spotter): anuncios hablados automáticos mientras conduces — banderas, avisos de combustible, desgaste de neumáticos, daños, posiciones, bandera azul, récord personal, sector violeta, última vuelta y más. Hazle preguntas con tu voz (diferencia, combustible, neumáticos, posición, clima…): el reconocimiento de voz funciona 100 % sin conexión en 4 idiomas, y el texto de cada anuncio es personalizable.",
              de: "Sprach-Renningenieur (Spotter): automatische gesprochene Ansagen während der Fahrt — Flaggen, Sprit-Warnungen, Reifenverschleiß, Schäden, Positionen, blaue Flagge, persönliche Bestzeit, violetter Sektor, letzte Runde und mehr. Stelle ihm Fragen per Stimme (Abstand, Sprit, Reifen, Position, Wetter…): die Spracherkennung läuft zu 100 % offline in 4 Sprachen, und der Text jeder Ansage ist anpassbar.",
            },
            featured: true,
          },
          {
            text: {
              en: "Telemetry view: compare two laps channel by channel, import a reference lap to measure yourself against, see your theoretical best lap and a corner-by-corner breakdown of where you gain or lose time.",
              fr: "Vue Télémétrie : compare deux tours canal par canal, importe un tour de référence pour te situer, visualise ton meilleur tour théorique et un détail virage par virage de là où tu gagnes ou perds du temps.",
              es: "Vista de telemetría: compara dos vueltas canal por canal, importa una vuelta de referencia para medirte, mira tu mejor vuelta teórica y un desglose curva por curva de dónde ganas o pierdes tiempo.",
              de: "Telemetrie-Ansicht: Vergleiche zwei Runden Kanal für Kanal, importiere eine Referenzrunde als Maßstab, sieh deine theoretisch beste Runde und eine Aufschlüsselung Kurve für Kurve, wo du Zeit gewinnst oder verlierst.",
            },
            featured: true,
          },
          {
            text: {
              en: "References page: reference lap times (OhneSpeed) for every track and class, with your own level shown for each combo and a shortcut to the matching sessions.",
              fr: "Page Références : les temps de référence (OhneSpeed) pour chaque circuit et catégorie, avec ton propre niveau pour chaque combo et un raccourci vers les sessions correspondantes.",
              es: "Página de Referencias: tiempos de referencia (OhneSpeed) para cada circuito y categoría, con tu propio nivel en cada combinación y un acceso directo a las sesiones correspondientes.",
              de: "Referenzen-Seite: Referenzrundenzeiten (OhneSpeed) für jede Strecke und Klasse, mit deinem eigenen Niveau pro Kombination und einer Verknüpfung zu den passenden Sessions.",
            },
            featured: true,
          },
          {
            en: "Dashboard: global statistics and best lap times grouped by track.",
            fr: "Tableau de bord : statistiques globales et meilleurs temps au tour groupés par circuit.",
            es: "Panel: estadísticas globales y mejores tiempos por vuelta agrupados por circuito.",
            de: "Dashboard: globale Statistiken und beste Rundenzeiten, gruppiert nach Strecke.",
          },
          {
            en: "Sessions: a paginated, filterable and sortable list of all your sessions.",
            fr: "Sessions : une liste paginée, filtrable et triable de toutes tes sessions.",
            es: "Sesiones: una lista paginada, filtrable y ordenable de todas tus sesiones.",
            de: "Sessions: eine paginierte, filter- und sortierbare Liste all deiner Sessions.",
          },
          {
            en: "Race details: results, laps, best laps, strategy, incidents, penalties, chat and head-to-head driver comparison with charts.",
            fr: "Détails de course : résultats, tours, meilleurs tours, stratégie, incidents, pénalités, chat et comparaison de pilotes en tête-à-tête avec graphiques.",
            es: "Detalles de carrera: resultados, vueltas, mejores vueltas, estrategia, incidentes, penalizaciones, chat y comparación directa de pilotos con gráficos.",
            de: "Rennen-Details: Ergebnisse, Runden, beste Runden, Strategie, Vorfälle, Strafen, Chat und direkter Fahrervergleich mit Diagrammen.",
          },
          {
            en: "Records: an overview of all your records plus a detailed progression view per track and car.",
            fr: "Records : une vue d'ensemble de tous tes records plus une vue détaillée de la progression par circuit et voiture.",
            es: "Récords: una visión general de todos tus récords más una vista detallada de la progresión por circuito y coche.",
            de: "Rekorde: eine Übersicht all deiner Rekorde sowie eine detaillierte Verlaufsansicht pro Strecke und Auto.",
          },
          {
            en: "Garage: a complete setup editor (engine, tyres, suspension, dampers, chassis), with duplication, export and A/B comparison — and a picture of your car.",
            fr: "Garage : un éditeur de réglages complet (moteur, pneus, suspension, amortisseurs, châssis), avec duplication, export et comparaison A/B — et une image de ta voiture.",
            es: "Garaje: un editor de reglajes completo (motor, neumáticos, suspensión, amortiguadores, chasis), con duplicación, exportación y comparación A/B — y una imagen de tu coche.",
            de: "Garage: ein vollständiger Setup-Editor (Motor, Reifen, Fahrwerk, Dämpfer, Chassis) mit Duplizieren, Export und A/B-Vergleich — und einem Bild deines Autos.",
          },
          {
            en: "Live timing: real-time telemetry, full standings and a 2D track map that's remembered between sessions.",
            fr: "Live timing : télémétrie en temps réel, classement complet et carte 2D du circuit mémorisée entre les sessions.",
            es: "Live timing: telemetría en tiempo real, clasificación completa y un mapa 2D del circuito que se recuerda entre sesiones.",
            de: "Live-Timing: Echtzeit-Telemetrie, vollständige Rangliste und eine 2D-Streckenkarte, die zwischen Sessions gespeichert bleibt.",
          },
          {
            en: "Profile page: an activity heatmap of your online and offline races, plus consistency indicators.",
            fr: "Page Profil : une heatmap d'activité de tes courses en ligne et hors ligne, plus des indicateurs de régularité.",
            es: "Página de perfil: un mapa de calor de actividad de tus carreras en línea y fuera de línea, más indicadores de regularidad.",
            de: "Profilseite: eine Aktivitäts-Heatmap deiner Online- und Offline-Rennen sowie Konstanz-Indikatoren.",
          },
          {
            en: "Menu modules: turn the pages you don't use on or off to keep the app focused.",
            fr: "Modules de menu : active ou désactive les pages que tu n'utilises pas pour garder l'app épurée.",
            es: "Módulos de menú: activa o desactiva las páginas que no usas para mantener la app enfocada.",
            de: "Menü-Module: Schalte Seiten, die du nicht nutzt, ein oder aus, um die App schlank zu halten.",
          },
          {
            text: {
              en: "Corner-by-corner coaching: the coach measures every corner against your reference lap and calls out what to change — braking too late or too early, apex speed, getting back on power, trail braking, lockups and wheelspin. A drill mode lets you work one corner until it sticks, and it tells you how your stint and tyre risk are developing.",
              fr: "Coaching virage par virage : le coach mesure chaque virage face à ton tour de référence et t'annonce quoi corriger — freinage trop tard ou trop tôt, vitesse au point de corde, remise des gaz, trail braking, blocages et patinage. Un mode exercice te fait travailler un virage jusqu'à ce qu'il rentre, et il te dit comment évoluent ton relais et le risque pneus.",
              es: "Coaching curva por curva: el coach mide cada curva frente a tu vuelta de referencia y te indica qué corregir — frenada demasiado tarde o temprano, velocidad en el ápice, vuelta al acelerador, trail braking, bloqueos y patinado. Un modo ejercicio te hace trabajar una curva hasta dominarla, y te informa de cómo evolucionan tu relevo y el riesgo de neumáticos.",
              de: "Coaching Kurve für Kurve: Der Coach misst jede Kurve gegen deine Referenzrunde und sagt dir, was zu ändern ist — zu spät oder zu früh gebremst, Scheitelpunkt-Geschwindigkeit, Gasannahme, Trail Braking, blockierende Räder und Durchdrehen. Ein Übungsmodus lässt dich eine Kurve trainieren, bis sie sitzt, und er meldet, wie sich dein Stint und das Reifenrisiko entwickeln.",
            },
            featured: true,
          },
          {
            en: "Guided tour and built-in help on first launch, so you know where to start.",
            fr: "Visite guidée et aide intégrée au premier lancement, pour savoir par où commencer.",
            es: "Visita guiada y ayuda integrada en el primer arranque, para saber por dónde empezar.",
            de: "Geführte Tour und integrierte Hilfe beim ersten Start, damit du weißt, wo du anfängst.",
          },
          {
            en: "Voices and speech recognition are downloaded on demand: you only get the languages you actually use, so the install stays light.",
            fr: "Voix et reconnaissance vocale téléchargées à la demande : tu ne récupères que les langues dont tu te sers, l'installation reste légère.",
            es: "Voces y reconocimiento de voz descargados a demanda: solo obtienes los idiomas que usas, así la instalación se mantiene ligera.",
            de: "Stimmen und Spracherkennung werden bei Bedarf heruntergeladen: Du bekommst nur die Sprachen, die du wirklich nutzt — die Installation bleibt schlank.",
          },
          {
            en: "Car numbers shown in every driver table.",
            fr: "Numéro de voiture affiché dans tous les tableaux pilotes.",
            es: "Número de coche mostrado en todas las tablas de pilotos.",
            de: "Startnummern in allen Fahrertabellen sichtbar.",
          },
          {
            en: "Available in 4 languages: French, English, Spanish and German.",
            fr: "Disponible en 4 langues : français, anglais, espagnol et allemand.",
            es: "Disponible en 4 idiomas: francés, inglés, español y alemán.",
            de: "Verfügbar in 4 Sprachen: Französisch, Englisch, Spanisch und Deutsch.",
          },
        ],
      },
      {
        kind: "improved",
        items: [
          {
            en: "Much faster startup: only new or changed result files are read on each launch.",
            fr: "Démarrage bien plus rapide : seuls les fichiers de résultats nouveaux ou modifiés sont lus à chaque lancement.",
            es: "Inicio mucho más rápido: en cada arranque solo se leen los archivos de resultados nuevos o modificados.",
            de: "Deutlich schnellerer Start: Bei jedem Start werden nur neue oder geänderte Ergebnisdateien gelesen.",
          },
          {
            en: "Your live delta now compares you against your own best lap for that track and class, and keeps getting better as you improve.",
            fr: "Ton delta en direct te compare désormais à ton propre meilleur tour sur ce circuit et dans cette catégorie, et s'améliore au fur et à mesure que tu progresses.",
            es: "Tu delta en vivo ahora te compara con tu propia mejor vuelta en ese circuito y categoría, y mejora a medida que progresas.",
            de: "Dein Live-Delta vergleicht dich jetzt mit deiner eigenen besten Runde auf dieser Strecke und in dieser Klasse — und wird besser, je mehr du dich steigerst.",
          },
          {
            en: "Clearer distinction between the LMP2 WEC and LMP2 ELMS classes.",
            fr: "Distinction plus claire entre les catégories LMP2 WEC et LMP2 ELMS.",
            es: "Distinción más clara entre las categorías LMP2 WEC y LMP2 ELMS.",
            de: "Klarere Unterscheidung zwischen den Klassen LMP2 WEC und LMP2 ELMS.",
          },
          {
            en: "Light and dark themes in the Le Mans colours.",
            fr: "Thèmes clair et sombre aux couleurs du Mans.",
            es: "Temas claro y oscuro con los colores de Le Mans.",
            de: "Helles und dunkles Theme in den Farben von Le Mans.",
          },
          {
            en: "You can now type any AI model name yourself, with suggestions — useful for a model that has just come out.",
            fr: "Tu peux désormais saisir toi-même n'importe quel nom de modèle d'IA, avec suggestions — pratique pour un modèle tout juste sorti.",
            es: "Ahora puedes escribir tú mismo cualquier nombre de modelo de IA, con sugerencias — útil para un modelo recién salido.",
            de: "Du kannst jetzt jeden KI-Modellnamen selbst eingeben, mit Vorschlägen — praktisch für ein gerade erschienenes Modell.",
          },
        ],
      },
      {
        kind: "fixed",
        items: [
          {
            en: "The AI model name you type in yourself is no longer replaced on its own when the settings page opens.",
            fr: "Le nom du modèle d'IA que tu saisis toi-même n'est plus remplacé tout seul à l'ouverture de la configuration.",
            es: "El nombre del modelo de IA que escribes tú mismo ya no se reemplaza solo al abrir la configuración.",
            de: "Der von dir selbst eingegebene KI-Modellname wird beim Öffnen der Einstellungen nicht mehr von allein ersetzt.",
          },
          {
            en: "The voice coach no longer answers with an error when its setup is incomplete: it tells you what's missing.",
            fr: "Le coach vocal ne répond plus par une erreur quand sa configuration est incomplète : il te dit ce qui manque.",
            es: "El coach de voz ya no responde con un error cuando su configuración está incompleta: te dice qué falta.",
            de: "Der Sprach-Coach antwortet nicht mehr mit einem Fehler, wenn seine Einrichtung unvollständig ist: Er sagt dir, was fehlt.",
          },
          {
            en: "Dates now respect the timezone you selected.",
            fr: "Les dates respectent le fuseau horaire que tu as choisi.",
            es: "Las fechas respetan la zona horaria que has elegido.",
            de: "Datumsangaben berücksichtigen jetzt die von dir gewählte Zeitzone.",
          },
          {
            en: "Two tracks recorded at the same time no longer mix their sessions.",
            fr: "Deux circuits enregistrés à la même heure ne mélangent plus leurs sessions.",
            es: "Dos circuitos registrados a la misma hora ya no mezclan sus sesiones.",
            de: "Zwei zur gleichen Zeit aufgezeichnete Strecken vermischen ihre Sessions nicht mehr.",
          },
          {
            en: "The Lamborghini Huracán steering wheel image never showed up.",
            fr: "L'image du volant de la Lamborghini Huracán ne s'affichait jamais.",
            es: "La imagen del volante del Lamborghini Huracán nunca se mostraba.",
            de: "Das Lenkrad-Bild des Lamborghini Huracán wurde nie angezeigt.",
          },
          {
            en: "Some labels displayed the wrong text.",
            fr: "Certains libellés affichaient le mauvais texte.",
            es: "Algunas etiquetas mostraban el texto incorrecto.",
            de: "Einige Beschriftungen zeigten den falschen Text an.",
          },
        ],
      },
    ],
  },
  {
    version: "0.9.5",
    date: "2026-04-11",
    sections: [
      {
        kind: "added",
        items: [
          "SQLite cache — sessions load faster; only new or modified files are re-parsed on each start.",
          "Personal Records page — click the icon on any best-lap row to view the full progression history for a track / car combo, with an interactive chart.",
          "Dynamic Steam path detection — the configuration page now suggests your LMU results folder automatically.",
          "Live telemetry — circuit layout on the live page is now drawn from real car positions during a session.",
          "In-app changelog — version history readable directly from the app (Configuration → Release Notes).",
        ],
      },
      {
        kind: "improved",
        items: [
          "Update checker — version check result is cached for 1 hour; no more repeated requests on every page load.",
          "Responsive layout — the configuration page is fully usable on narrow screens.",
        ],
      },
      {
        kind: "fixed",
        items: [
          "Lamborghini Huracan steering wheel image was never displayed.",
          "Several translation keys were silently duplicated, causing some labels to show the wrong text.",
        ],
      },
    ],
  },
  {
    version: "0.9.4",
    date: "2026-04-02",
    sections: [
      {
        kind: "added",
        items: [
          "Automatic update checker — notifies and links to the latest release on GitHub / Overtake.gg.",
          "Car brand logos: Genesis GMR-001, Duqueine D09 P3.",
          "Circuit flags: Barcelona-Catalunya.",
          "Circuit layouts: Paul Ricard, Silverstone.",
          "Automatic update download & install from the in-app update page.",
          "System tray icon — right-click menu to open the app, access config, check for updates or quit.",
          "Launcher auto-start at Windows boot (InnoSetup option).",
          "Multi-language installer (FR / EN / ES / DE).",
          "First-launch redirect — automatically opens the configuration page on fresh install.",
        ],
      },
      {
        kind: "improved",
        items: [
          "Single source of truth for version number (version.txt).",
          "InnoSetup script: AppId, support URLs, installer icon.",
        ],
      },
    ],
  },
  {
    version: "0.9.3",
    date: "2025-09-23",
    sections: [
      {
        kind: "added",
        items: [
          "GTE class table.",
          "Race car summary.",
          "LMP3 support *(thanks @Antotitus22)*.",
          "LMP2 ELMS support *(thanks @Antotitus22)*.",
          "Driver comparison — overlay lap time curves for any two drivers.",
          "Game version display.",
        ],
      },
      {
        kind: "fixed",
        items: [
          "My Laps lap display bug.",
          "Finish position display bug in best laps table.",
        ],
      },
      {
        kind: "changed",
        items: [
          "Graphics improvements, code cleanup, translation fixes.",
        ],
      },
    ],
  },
  {
    version: "0.9.2",
    date: "",
    sections: [
      {
        kind: "fixed",
        items: [
          "Update checker not working.",
        ],
      },
    ],
  },
  {
    version: "0.9.1",
    date: "",
    sections: [
      {
        kind: "added",
        items: [
          "Automatic update availability check.",
          "Automatic refresh after update.",
        ],
      },
    ],
  },
  {
    version: "0.9",
    date: "",
    sections: [
      {
        kind: "added",
        items: [
          "Dark theme.",
          "Circuit layout support *(thanks @Tontonjp)*.",
          "New config.json system with driver name suggestion and log path detection.",
          "GTE class colour *(thanks @h55d)*.",
        ],
      },
      {
        kind: "changed",
        items: [
          "CSS colours for best sectors and optimal time — improved readability.",
          "CSS hover colours preserved.",
          "Purge session system reworked.",
        ],
      },
    ],
  },
  {
    version: "0.8",
    date: "",
    sections: [
      {
        kind: "fixed",
        items: [
          "Spa sector 2 times (missing minutes).",
          "German translation *(thanks @Texas-Edelweis)*.",
        ],
      },
    ],
  },
  {
    version: "0.7",
    date: "",
    sections: [
      {
        kind: "added",
        items: [
          "Strategy tab (tyres & fuel).",
          "Fuel at start / finish in race details ranking.",
          "Filters on the details table (sectors, V-max...).",
        ],
      },
      {
        kind: "changed",
        items: [
          "Best times ranking *(thanks @astroremucho)*.",
        ],
      },
    ],
  },
  {
    version: "0.6",
    date: "",
    sections: [
      {
        kind: "added",
        items: [
          "Class-based ranking for multi-class races.",
          "Class ranking column and class display in details.",
          "Long session support *(thanks @Botmeister)*.",
          "Incident types table.",
          "Car brand logos.",
        ],
      },
      {
        kind: "fixed",
        items: [
          "Invalid lap when a sector is missing *(thanks @Botmeister)*.",
        ],
      },
      {
        kind: "changed",
        items: [
          "Authorized Vehicles field value by class type.",
          "Session ranking order *(thanks @Botmeister)*.",
          "CSS updates.",
        ],
      },
    ],
  },
  {
    version: "0.5",
    date: "",
    sections: [
      {
        kind: "added",
        items: [
          "Gap to leader in details tables.",
          "Finishing position in best laps table on details page.",
          "V-max in race results table.",
          "Race date on details page.",
          "Gear icon link to configuration page.",
          "Button to purge sessions without lap times.",
          "Button to delete the cache file in %APPDATA% (bug recovery).",
          "Chat tab in race details.",
          "My Laps button on Race Details tab *(thanks @pcFiNCH85)*.",
        ],
      },
      {
        kind: "changed",
        items: [
          "Header CSS *(thanks @Botmeister)*.",
          "Translations updated.",
        ],
      },
    ],
  },
  {
    version: "0.4",
    date: "",
    sections: [
      {
        kind: "added",
        items: [
          "Online / offline filter.",
          "Filter on details page to quickly find your name in race laps.",
        ],
      },
    ],
  },
  {
    version: "0.3",
    date: "",
    sections: [
      {
        kind: "added",
        items: [
          "Filter to display only best times since LMU v1 *(thanks @Pillot69)*.",
          "Peugeot 9x8: differentiated 2023 vs 2024/25 variants *(thanks @Pillot69)*.",
        ],
      },
      {
        kind: "fixed",
        items: [
          "Cache not displaying new sessions.",
        ],
      },
    ],
  },
  {
    version: "0.2",
    date: "",
    sections: [
      {
        kind: "fixed",
        items: [
          "Configuration not saving the log path.",
        ],
      },
    ],
  },
];
