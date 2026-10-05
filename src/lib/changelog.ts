/**
 * Release notes for LMU Stats Viewer.
 *
 * Le contenu peut être soit une chaîne anglaise simple (anciennes versions,
 * traduisibles à la volée via le bouton « Traduire »), soit un texte localisé
 * `{ en, fr, es, de, it }` affiché directement dans la langue de l'app (versions
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
  | { en: string; fr?: string; es?: string; de?: string; it?: string };

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
  /** Entrée déjà traduite dans les langues de l'app → masque le bouton « Traduire ». */
  localized?: boolean;
  sections: ChangelogSection[];
}

/** Résout un texte localisé pour la langue courante (repli sur l'anglais). */
export function pickLang(text: LocalizedText, lang: string): string {
  if (typeof text === "string") return text;
  const key = lang.slice(0, 2) as "en" | "fr" | "es" | "de" | "it";
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
    version: "1.0.9",
    date: "2026-10-05",
    dev: false,
    localized: true,
    sections: [
      {
        kind: "added",
        items: [
          {
            text: {
              en: "The app is now available in Italian, its 5th language: the whole interface, the race engineer's voice callouts (two Italian Piper voices to download from Settings → Voice), offline voice commands, and the AI coach, which answers in Italian.",
              fr: "L'application est disponible en italien, sa 5ᵉ langue : toute l'interface, les annonces vocales de l'ingénieur (deux voix Piper italiennes à télécharger dans Configuration → Voix), les commandes vocales hors ligne et le coach IA, qui répond en italien.",
              es: "La aplicación ya está disponible en italiano, su 5.º idioma: toda la interfaz, los avisos de voz del ingeniero (dos voces Piper italianas para descargar en Configuración → Voz), los comandos de voz sin conexión y el coach IA, que responde en italiano.",
              de: "Die App gibt es jetzt auf Italienisch, ihrer 5. Sprache: die ganze Oberfläche, die Sprachansagen des Ingenieurs (zwei italienische Piper-Stimmen zum Herunterladen unter Einstellungen → Stimme), die Offline-Sprachbefehle und der KI-Coach, der auf Italienisch antwortet.",
              it: "L'app è ora disponibile in italiano, la sua 5ª lingua: tutta l'interfaccia, gli annunci vocali dell'ingegnere di pista (due voci Piper italiane da scaricare in Impostazioni → Voce), i comandi vocali offline e il coach IA, che risponde in italiano.",
            },
            featured: true,
          },
          {
            en: "Leaderboards: your country (taken from your game profile) shows as a flag next to your name, along with your Steam avatar. Already sharing? One click on the Leaderboards page fetches your avatar. Neither is shown in anonymous mode; you can remove the avatar (Settings → Community), which also makes the server forget your Steam ID.",
            fr: "Classements : votre pays (celui de votre profil dans le jeu) s'affiche en drapeau à côté de votre nom, avec votre avatar Steam. Vous partagez déjà ? Un clic sur la page Classements récupère votre avatar. Ni l'un ni l'autre en mode anonyme ; vous pouvez retirer l'avatar (Configuration → Communauté), ce qui efface aussi votre identifiant Steam du serveur.",
            es: "Clasificaciones: tu país (el de tu perfil del juego) aparece como bandera junto a tu nombre, con tu avatar de Steam. ¿Ya compartes? Un clic en la página Clasificaciones recupera tu avatar. Nada de ello en modo anónimo; puedes quitar el avatar (Configuración → Comunidad), lo que también borra tu identificador de Steam del servidor.",
            de: "Ranglisten: Dein Land (aus deinem Spielprofil) erscheint als Flagge neben deinem Namen, zusammen mit deinem Steam-Avatar. Du teilst bereits? Ein Klick auf der Seite Ranglisten holt deinen Avatar. Im anonymen Modus nichts davon; du kannst den Avatar entfernen (Einstellungen → Community), wodurch auch deine Steam-ID vom Server gelöscht wird.",
            it: "Classifiche: il tuo paese (preso dal tuo profilo di gioco) appare come bandiera accanto al tuo nome, insieme al tuo avatar Steam. Condividi già? Un clic sulla pagina Classifiche recupera il tuo avatar. Nessuno dei due viene mostrato in modalità anonima; puoi rimuovere l'avatar (Impostazioni → Community), e così il server dimentica anche il tuo ID Steam.",
          },
        ],
      },
      {
        kind: "fixed",
        items: [
          {
            en: "AI coach: the brake bias read from telemetry was given as the rear share only (e.g. “46 %” for a 54:46 setting), so the coach took it for the front bias and gave inverted advice. It now receives front:rear like the game (54.0:46.0), and the BB value on the Telemetry page uses the same format.",
            fr: "Coach IA : la répartition de freinage lue dans la télémétrie lui était transmise en part arrière seule (ex. « 46 % » pour un réglage 54:46) ; il la prenait pour la part avant et donnait des conseils inversés. Il reçoit désormais avant:arrière comme dans le jeu (54.0:46.0), et la valeur BB de la page Télémétrie suit le même format.",
            es: "Coach IA: el reparto de frenada leído de la telemetría se le enviaba solo como parte trasera (p. ej. «46 %» para un reglaje 54:46), así que lo tomaba por la parte delantera y daba consejos invertidos. Ahora recibe delante:detrás como en el juego (54.0:46.0), y el valor BB de la página Telemetría usa el mismo formato.",
            de: "KI-Coach: Die Bremsbalance aus der Telemetrie wurde nur als Hinterachsanteil übergeben (z. B. „46 %“ bei 54:46), sodass der Coach sie für den Vorderachsanteil hielt und umgekehrte Ratschläge gab. Er erhält jetzt vorne:hinten wie im Spiel (54.0:46.0), und der BB-Wert auf der Telemetrie-Seite nutzt dasselbe Format.",
            it: "Coach IA: il bilanciamento di frenata letto dalla telemetria gli veniva passato solo come quota posteriore (es. «46 %» per una regolazione 54:46), quindi il coach lo scambiava per la quota anteriore e dava consigli invertiti. Ora riceve anteriore:posteriore come nel gioco (54.0:46.0), e il valore BB nella pagina Telemetria usa lo stesso formato.",
          },
          {
            en: "ohne_speed level: track variants (Bahrain Paddock or Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) were compared with the main layout, so almost every lap showed “Alien”; each variant now uses its own reference, and a variant missing from the reference sheet shows “—”. The level was also one notch too generous (a lap at 103.6 % showed “Good” instead of “Midpack”).",
            fr: "Niveau ohne_speed : les variantes de circuit (Bahreïn Paddock ou Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) étaient comparées au tracé principal, d'où « Alien » presque à chaque tour ; chaque variante utilise désormais sa propre référence, et une variante absente de la feuille de référence affiche « — ». Le niveau était aussi trop généreux d'un cran (un tour à 103,6 % affichait « Bon » au lieu de « Peloton »).",
            es: "Nivel ohne_speed: las variantes de circuito (Baréin Paddock u Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) se comparaban con el trazado principal, de ahí «Alien» casi en cada vuelta; cada variante usa ahora su propia referencia, y una variante ausente de la hoja de referencia muestra «—». El nivel también era un escalón demasiado generoso (una vuelta al 103,6 % mostraba «Bueno» en lugar de «Pelotón»).",
            de: "ohne_speed-Stufe: Streckenvarianten (Bahrain Paddock oder Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) wurden mit der Hauptvariante verglichen, daher fast jede Runde „Alien“; jede Variante nutzt jetzt ihre eigene Referenz, und eine Variante ohne Eintrag in der Referenztabelle zeigt „—“. Die Stufe war außerdem eine Stufe zu großzügig (eine Runde mit 103,6 % zeigte „Gut“ statt „Mittelfeld“).",
            it: "Livello ohne_speed: le varianti di circuito (Bahrain Paddock o Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) venivano confrontate con il tracciato principale, per cui quasi ogni giro risultava «Alien»; ora ogni variante usa il proprio riferimento, e una variante assente dalla tabella di riferimento mostra «—». Il livello era anche di un gradino troppo generoso (un giro al 103,6 % mostrava «Buono» invece di «Centro gruppo»).",
          },
          {
            en: "Telemetry: the speed, throttle, brake… graphs of a lap could stay flat and show only a few metres of track when the lap started or ended right on the line, or began in the pit lane (out lap); they now always cover the whole lap.",
            fr: "Télémétrie : les courbes (vitesse, accélérateur, frein…) d'un tour pouvaient rester plates et ne montrer que quelques mètres de piste quand le tour commençait ou finissait pile sur la ligne, ou partait de la voie des stands (tour de sortie) ; elles couvrent désormais toujours le tour entier.",
            es: "Telemetría: las gráficas (velocidad, acelerador, freno…) de una vuelta podían quedarse planas y mostrar solo unos metros de pista cuando la vuelta empezaba o terminaba justo en la línea, o salía del pit lane (vuelta de salida); ahora cubren siempre la vuelta completa.",
            de: "Telemetrie: Die Kurven (Geschwindigkeit, Gas, Bremse…) einer Runde konnten flach bleiben und nur wenige Meter Strecke zeigen, wenn die Runde genau auf der Linie begann oder endete oder in der Boxengasse startete (Out-Lap); sie decken jetzt immer die ganze Runde ab.",
            it: "Telemetria: i grafici (velocità, acceleratore, freno…) di un giro potevano restare piatti e mostrare solo pochi metri di pista quando il giro iniziava o finiva esattamente sulla linea, o partiva dalla corsia box (giro di uscita); ora coprono sempre l'intero giro.",
          },
          {
            en: "Telemetry: sector 2 and sector 3 times of the selected lap were wrong (S2 included S1, S3 was almost zero).",
            fr: "Télémétrie : les temps des secteurs 2 et 3 du tour affiché étaient faux (S2 incluait S1, S3 était presque nul).",
            es: "Telemetría: los tiempos de los sectores 2 y 3 de la vuelta mostrada eran erróneos (S2 incluía S1, S3 era casi nulo).",
            de: "Telemetrie: Die Zeiten von Sektor 2 und 3 der angezeigten Runde waren falsch (S2 enthielt S1, S3 war fast null).",
            it: "Telemetria: i tempi del settore 2 e del settore 3 del giro selezionato erano sbagliati (S2 includeva S1, S3 era quasi zero).",
          },
          {
            en: "Telemetry: at the very start of a lap, the value under the graphs showed the end of the lap instead of the start.",
            fr: "Télémétrie : au tout début d'un tour, la valeur sous les courbes affichait la fin du tour au lieu du départ.",
            es: "Telemetría: al principio de una vuelta, el valor bajo las gráficas mostraba el final de la vuelta en lugar de la salida.",
            de: "Telemetrie: Ganz am Anfang einer Runde zeigte der Wert unter den Kurven das Rundenende statt des Starts.",
            it: "Telemetria: proprio all'inizio di un giro, il valore sotto i grafici mostrava la fine del giro invece della partenza.",
          },
          {
            en: "Sessions page opened from the Profile, Records or References: the car or layout filter of the link was dropped, so the list showed every car of the class or every layout of the track.",
            fr: "Page Sessions ouverte depuis le Profil, les Records ou les Références : le filtre voiture ou tracé du lien était perdu, la liste montrait donc toutes les voitures de la classe ou tous les tracés du circuit.",
            es: "Página Sesiones abierta desde el Perfil, los Récords o las Referencias: se perdía el filtro de coche o de trazado del enlace, así que la lista mostraba todos los coches de la clase o todos los trazados del circuito.",
            de: "Seite Sessions aus Profil, Rekorden oder Referenzen geöffnet: Der Fahrzeug- oder Layout-Filter des Links ging verloren, die Liste zeigte also alle Fahrzeuge der Klasse oder alle Layouts der Strecke.",
            it: "Pagina Sessioni aperta da Profilo, Record o Riferimenti: il filtro vettura o tracciato del link andava perso, quindi l'elenco mostrava tutte le vetture della classe o tutti i tracciati del circuito.",
          },
        ],
      },
      {
        kind: "improved",
        items: [
          {
            en: "Multi-class races: your position in your class now comes first, with the overall position next to it, in the Live page header, the Dashboard and Endurance overlays, and the live AI coach (which also gets the gaps to the class leader and to the class car ahead, instead of cars from other classes). The Standings and Relative overlays number cars by class position; untick “Class position” in their Content tab to get overall numbers back.",
            fr: "Courses multiclasses : votre position dans votre classe passe en premier, avec la position générale à côté, dans l'en-tête de la page Live, les overlays Tableau de bord et Endurance et le coach IA en live (qui reçoit aussi les écarts au leader de la classe et à la voiture de la classe devant vous, au lieu de voitures d'autres classes). Les overlays Classement et Relatif numérotent les voitures par position en classe ; décochez « Position en classe » dans leur onglet Contenu pour revenir à la numérotation générale.",
            es: "Carreras multiclase: tu posición en tu clase aparece primero, con la posición general al lado, en la cabecera de la página Live, los overlays Tablero y Resistencia y el coach IA en directo (que además recibe las diferencias con el líder de la clase y con el coche de la clase que va delante, en lugar de coches de otras clases). Los overlays Clasificación y Relativo numeran los coches por posición en clase; desmarca «Posición en clase» en su pestaña Contenido para volver a la numeración general.",
            de: "Mehrklassenrennen: Deine Position in deiner Klasse steht jetzt an erster Stelle, die Gesamtposition daneben – im Kopf der Live-Seite, in den Overlays Übersicht und Langstrecke und beim Live-KI-Coach (der außerdem die Abstände zum Klassenführenden und zum Klassenvordermann erhält statt zu Autos anderer Klassen). Die Overlays Wertung und Relativ nummerieren nach Klassenposition; entferne im Tab Inhalt das Häkchen bei „Klassenposition“, um wieder die Gesamtnummerierung zu sehen.",
            it: "Gare multiclasse: la tua posizione nella tua classe ora viene per prima, con la posizione assoluta accanto, nell'intestazione della pagina Live, negli overlay Dashboard ed Endurance e nel coach IA live (che riceve anche i distacchi dal leader di classe e dalla vettura della tua classe davanti, invece che da vetture di altre classi). Gli overlay Classifica e Relativo numerano le vetture per posizione di classe; togli la spunta a «Posizione di classe» nella loro scheda Contenuto per tornare alla numerazione assoluta.",
          },
          {
            en: "Filters are kept on every page: leave a page and come back, and you find the same filters, sort order, page and view (Dashboard, Sessions, Records, Leaderboards, References, Telemetry, Setups, Live class filter). They start again from scratch when the app restarts.",
            fr: "Les filtres sont conservés sur chaque page : quittez une page et revenez-y, vous retrouvez les mêmes filtres, le même tri, la même page et la même vue (Tableau de bord, Sessions, Records, Classements, Références, Télémétrie, Setups, filtre de classes du Live). Ils repartent à zéro au redémarrage de l'app.",
            es: "Los filtros se conservan en cada página: sal de una página y vuelve, y encontrarás los mismos filtros, el mismo orden, la misma página y la misma vista (Panel, Sesiones, Récords, Clasificaciones, Referencias, Telemetría, Setups, filtro de clases del Live). Se reinician al reiniciar la app.",
            de: "Filter bleiben auf jeder Seite erhalten: Verlasse eine Seite und kehre zurück, und du findest dieselben Filter, dieselbe Sortierung, dieselbe Seite und dieselbe Ansicht (Dashboard, Sessions, Rekorde, Ranglisten, Referenzen, Telemetrie, Setups, Klassenfilter im Live). Beim Neustart der App werden sie zurückgesetzt.",
            it: "I filtri vengono mantenuti su ogni pagina: esci da una pagina e torna indietro, e ritrovi gli stessi filtri, lo stesso ordinamento, la stessa pagina e la stessa vista (Dashboard, Sessioni, Record, Classifiche, Riferimenti, Telemetria, Setup, filtro classi del Live). Si azzerano al riavvio dell'app.",
          },
          {
            en: "Leaderboards page: every community leaderboard is now listed, with its record and record holder, even on tracks you have not driven; the “My combos” button shows only yours, highlighted in orange. A click on a track name opens its full leaderboard with every driver of every class (as on the website); a click on a class badge there keeps only that class.",
            fr: "Page Classements : tous les classements de la communauté sont listés, avec leur record et le pilote du record, même sur les circuits que vous n'avez pas roulés ; le bouton « Mes combos » n'affiche que les vôtres, en évidence en orange. Un clic sur le nom d'un circuit ouvre son classement complet, tous les pilotes de toutes les classes (comme sur le site) ; un clic sur le badge d'une classe n'y garde que cette classe.",
            es: "Página Clasificaciones: se listan todas las clasificaciones de la comunidad, con su récord y el piloto del récord, incluso en circuitos que no has rodado; el botón «Mis combos» muestra solo las tuyas, resaltadas en naranja. Un clic en el nombre de un circuito abre su clasificación completa, todos los pilotos de todas las clases (como en la web); un clic en la insignia de una clase deja solo esa clase.",
            de: "Seite Ranglisten: Alle Community-Ranglisten werden aufgeführt, mit Rekord und Rekordhalter, auch auf Strecken, die du nicht gefahren bist; der Knopf „Meine Kombos“ zeigt nur deine, orange hervorgehoben. Ein Klick auf einen Streckennamen öffnet die komplette Rangliste mit allen Fahrern aller Klassen (wie auf der Website); ein Klick auf das Abzeichen einer Klasse zeigt nur diese Klasse.",
            it: "Pagina Classifiche: ora sono elencate tutte le classifiche della community, con il loro record e il detentore del record, anche sui circuiti su cui non hai mai guidato; il pulsante «Le mie combo» mostra solo le tue, evidenziate in arancione. Un clic sul nome di un circuito apre la sua classifica completa con tutti i piloti di tutte le classi (come sul sito); lì, un clic sul badge di una classe mantiene solo quella classe.",
          },
          {
            en: "Leaderboards page, details: the full leaderboard (sectors, version, date, your row highlighted) under a “Your position” card, like on the website, then the lap time spread with the matching leaderboard positions. The record holder now comes right after the class, and “Position” and “Top” are merged into one column. The open leaderboard is clearly highlighted (tinted row, orange bar down to the end of its details, everything else greyed out) and its title names the layout and class.",
            fr: "Page Classements, détail : le classement complet (secteurs, version, date, votre ligne surlignée) sous une carte « Votre position », comme sur le site, puis la répartition des temps avec les places correspondantes. Le pilote du record vient juste après la classe, et « Position » et « Top » ne forment plus qu'une colonne. Le classement ouvert est nettement mis en évidence (ligne teintée, barre orange jusqu'au bas de son détail, tout le reste grisé) et son titre indique le tracé et la classe.",
            es: "Página Clasificaciones, detalle: la clasificación completa (sectores, versión, fecha, tu fila resaltada) bajo una tarjeta «Tu posición», como en la web, y luego el reparto de tiempos con los puestos correspondientes. El piloto del récord aparece justo después de la clase, y «Posición» y «Top» forman una sola columna. La clasificación abierta se resalta claramente (fila tintada, barra naranja hasta el final de su detalle, todo lo demás en gris) y su título indica el trazado y la clase.",
            de: "Seite Ranglisten, Details: die komplette Rangliste (Sektoren, Version, Datum, deine Zeile hervorgehoben) unter einer Karte „Deine Position“ wie auf der Website, darunter die Zeitverteilung mit den passenden Platzierungen. Der Rekordhalter steht direkt nach der Klasse, und „Position“ und „Top“ sind zu einer Spalte zusammengefasst. Die geöffnete Rangliste ist deutlich hervorgehoben (getönte Zeile, orangefarbener Balken bis zum Ende ihrer Details, alles andere ausgegraut), und ihr Titel nennt Layout und Klasse.",
            it: "Pagina Classifiche, dettaglio: la classifica completa (settori, versione, data, la tua riga evidenziata) sotto un riquadro «La tua posizione», come sul sito, poi la distribuzione dei tempi con le posizioni corrispondenti in classifica. Il detentore del record ora viene subito dopo la classe, e «Posizione» e «Top» sono unite in un'unica colonna. La classifica aperta è chiaramente evidenziata (riga colorata, barra arancione fino in fondo al suo dettaglio, tutto il resto in grigio) e il suo titolo indica il tracciato e la classe.",
          },
          {
            en: "Leaderboards page: the details of a leaderboard now open with the eye icon at the start of the row, as on the other pages.",
            fr: "Page Classements : le détail d'un classement s'ouvre désormais avec l'icône en forme d'œil en début de ligne, comme sur les autres pages.",
            es: "Página Clasificaciones: el detalle de una clasificación se abre ahora con el icono del ojo al principio de la fila, como en las demás páginas.",
            de: "Seite Ranglisten: Die Details einer Rangliste öffnen sich jetzt über das Augen-Symbol am Zeilenanfang, wie auf den anderen Seiten.",
            it: "Pagina Classifiche: il dettaglio di una classifica ora si apre con l'icona a forma di occhio all'inizio della riga, come nelle altre pagine.",
          },
          {
            en: "Leaderboards page: the gap to the fastest now sits right after your time, and a “Version” column shows the game version of each leaderboard.",
            fr: "Page Classements : l'écart au plus rapide est placé juste après votre temps, et une colonne « Version » indique la version du jeu de chaque classement.",
            es: "Página Clasificaciones: la diferencia con el más rápido aparece justo después de tu tiempo, y una columna «Versión» indica la versión del juego de cada clasificación.",
            de: "Seite Ranglisten: Der Abstand zum Schnellsten steht jetzt direkt nach deiner Zeit, und eine Spalte „Version“ zeigt die Spielversion jeder Rangliste.",
            it: "Pagina Classifiche: il distacco dal più veloce ora si trova subito dopo il tuo tempo, e una colonna «Versione» indica la versione del gioco di ogni classifica.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.8",
    date: "2026-09-27",
    dev: false,
    localized: true,
    sections: [
      {
        kind: "fixed",
        items: [
          {
            text: {
              en: "Leaderboards page presentation fixed: your position, gap to the fastest and the record holder now show on every leaderboard, even with few drivers; the “Where you stand” gauge runs from 1st (green) to last (red); below 20 drivers your place reads plainly (“2nd”, “Last”) instead of a percentage; the summary figures count all your leaderboards; tracks with several layouts (Bahrain, Le Mans, Fuji…) get one sub-section per layout.",
              fr: "Présentation de la page Classements corrigée : votre position, l'écart au plus rapide et le pilote du record s'affichent sur tous les classements, même avec peu de pilotes ; la jauge « Où vous êtes » va du 1er (vert) au dernier (rouge) ; sous 20 pilotes, votre place s'écrit en clair (« 2ᵉ », « Dernier ») au lieu d'un pourcentage ; les chiffres du haut comptent tous vos classements ; les circuits à plusieurs tracés (Bahreïn, Le Mans, Fuji…) ont une sous-section par tracé.",
              es: "Presentación de la página Clasificaciones corregida: tu puesto, la diferencia con el más rápido y el piloto del récord se muestran en todas las clasificaciones, incluso con pocos pilotos; el indicador «Dónde estás» va del 1.º (verde) al último (rojo); por debajo de 20 pilotos tu puesto se muestra en claro («2.º», «Último») en lugar de un porcentaje; las cifras de arriba cuentan todas tus clasificaciones; los circuitos con varios trazados (Baréin, Le Mans, Fuji…) tienen una subsección por trazado.",
              de: "Darstellung der Seite Ranglisten korrigiert: Deine Platzierung, der Abstand zum Schnellsten und der Rekordhalter erscheinen in jeder Rangliste, auch mit wenigen Fahrern; die Anzeige „Wo du stehst“ reicht vom 1. (grün) bis zum Letzten (rot); unter 20 Fahrern steht dein Platz im Klartext („2.“, „Letzter“) statt eines Prozentwerts; die Kennzahlen oben zählen alle deine Ranglisten; Strecken mit mehreren Varianten (Bahrain, Le Mans, Fuji…) haben einen Unterabschnitt pro Variante.",
              it: "Presentazione della pagina Classifiche corretta: la tua posizione, il distacco dal più veloce e il detentore del record ora compaiono in tutte le classifiche, anche con pochi piloti; l'indicatore «Dove ti trovi» va dal 1° (verde) all'ultimo (rosso); sotto i 20 piloti la tua posizione è scritta in chiaro («2°», «Ultimo») invece che in percentuale; i numeri riassuntivi contano tutte le tue classifiche; i circuiti con più tracciati (Bahrain, Le Mans, Fuji…) hanno una sottosezione per tracciato.",
            },
          },
        ],
      },
    ],
  },
  {
    version: "1.0.7",
    date: "2026-09-27",
    dev: false,
    localized: true,
    sections: [
      {
        kind: "added",
        items: [
          {
            text: {
              en: "Sharing your laps now goes through “Sign in with Steam”: Steam confirms who you are on its own page (no password goes through the app) and the server only keeps a fingerprint of your Steam ID. One Steam account = one lap profile: no duplicates, your laps follow you to another PC just by signing in again, and “Delete my data” works from any PC. On the same PC, the sharing key is also kept in Windows Credential Manager, so reinstalling the app — even after deleting its data — takes back the same installation. Your tag (#xxxx) is shown, to quote for any request about your data.",
              fr: "Partager ses tours passe désormais par « Se connecter avec Steam » : c'est Steam qui confirme votre identité sur sa propre page (aucun mot de passe ne passe par l'application), et le serveur ne garde qu'une empreinte de votre identifiant Steam. Un compte Steam = un seul profil de tours : pas de doublon, vos tours vous suivent sur un autre PC en vous reconnectant, et « Supprimer mes données » fonctionne depuis n'importe quel PC. Sur le même PC, la clé de partage est aussi gardée dans le Gestionnaire d'identifications de Windows : réinstaller l'application — même après avoir effacé ses données — reprend la même installation. Votre repère (#xxxx) est affiché, à citer pour toute demande concernant vos données.",
              es: "Compartir tus vueltas pasa ahora por «Iniciar sesión con Steam»: Steam confirma tu identidad en su propia página (ninguna contraseña pasa por la aplicación) y el servidor solo guarda una huella de tu ID de Steam. Una cuenta de Steam = un único perfil de vueltas: sin duplicados, tus vueltas te siguen a otro PC con solo volver a iniciar sesión, y «Borrar mis datos» funciona desde cualquier PC. En el mismo PC, la clave de uso compartido se guarda también en el Administrador de credenciales de Windows: reinstalar la aplicación — incluso tras borrar sus datos — retoma la misma instalación. Se muestra tu identificador (#xxxx), para indicarlo en cualquier solicitud sobre tus datos.",
              de: "Das Teilen deiner Runden läuft jetzt über „Mit Steam anmelden“: Steam bestätigt deine Identität auf seiner eigenen Seite (kein Passwort läuft über die App), und der Server speichert nur einen Fingerabdruck deiner Steam-ID. Ein Steam-Konto = ein einziges Rundenprofil: keine Duplikate, deine Runden folgen dir auf einen anderen PC, indem du dich erneut anmeldest, und „Meine Daten löschen“ funktioniert von jedem PC aus. Auf demselben PC wird der Freigabeschlüssel zusätzlich in der Windows-Anmeldeinformationsverwaltung gespeichert: Eine Neuinstallation der App — selbst nach dem Löschen ihrer Daten — übernimmt dieselbe Installation. Deine Kennung (#xxxx) wird angezeigt, um sie bei Anfragen zu deinen Daten anzugeben.",
              it: "La condivisione dei tuoi giri ora passa da «Accedi con Steam»: è Steam a confermare chi sei sulla sua pagina (nessuna password passa dall'app) e il server conserva solo un'impronta del tuo ID Steam. Un account Steam = un solo profilo giri: niente duplicati, i tuoi giri ti seguono su un altro PC semplicemente accedendo di nuovo, e «Elimina i miei dati» funziona da qualsiasi PC. Sullo stesso PC, la chiave di condivisione viene anche conservata in Gestione credenziali di Windows, così reinstallare l'app — anche dopo averne cancellato i dati — riprende la stessa installazione. Viene mostrato il tuo codice (#xxxx), da citare per qualsiasi richiesta sui tuoi dati.",
            },
          },
          {
            text: {
              en: "New “Leaderboard” page: your position among LMU Stats Viewer drivers on every track × class you have driven, worked out automatically from your best dry laps — rank, top %, gap to the fastest, the lap-time distribution with your place marked, and the drivers just ahead and behind. It works even if you do not share your own laps; everything is also on lmu.cparfait.ovh. Community leaderboards (optional, off by default): Settings → Community lets you share your best lap from each session to compare yourself with other LMU Stats Viewer drivers. Before turning it on you see exactly what is sent (track, car, class, best lap and sectors, median pace, aids, your LMU driver name — never the other drivers' laps, your setups, telemetry or files), you can stay anonymous, choose whether past sessions are included, and delete everything from the server in one click. Turning sharing off anonymises the laps already shared: they stay in the statistics without your name. Sends are secured: HTTPS only, each send is fingerprinted and only counted once the server confirms full receipt; after a connection drop it is simply resent, without duplicates.",
              fr: "Nouvelle page « Classement » : votre position parmi les pilotes LMU Stats Viewer sur chaque circuit × classe que vous avez roulé, calculée toute seule à partir de vos meilleurs tours sur le sec — rang, top %, écart au plus rapide, répartition des temps avec votre place marquée, et les pilotes juste devant et derrière. Elle fonctionne même si vous ne partagez pas vos tours ; tout est aussi sur lmu.cparfait.ovh. Classements communautaires (facultatif, désactivé par défaut) : Configuration → Communauté permet de partager le meilleur tour de chaque session pour vous comparer aux autres pilotes LMU Stats Viewer. Avant d'activer, vous voyez exactement ce qui part (circuit, voiture, classe, meilleur tour et secteurs, rythme médian, aides, votre nom de pilote LMU — jamais les tours des autres pilotes, vos réglages, votre télémétrie ou vos fichiers), vous pouvez rester anonyme, choisir d'inclure ou non vos sessions passées, et tout effacer du serveur en un clic. Désactiver le partage anonymise les tours déjà partagés : ils restent dans les statistiques, sans votre nom. Les envois sont sécurisés : HTTPS uniquement, chaque envoi porte une empreinte et n'est compté qu'une fois sa réception complète confirmée par le serveur ; après une coupure, il est simplement renvoyé, sans doublon.",
              es: "Nueva página «Clasificación»: tu posición entre los pilotos de LMU Stats Viewer en cada circuito × clase que hayas rodado, calculada automáticamente a partir de tus mejores vueltas en seco: puesto, top %, diferencia con el más rápido, distribución de tiempos con tu lugar marcado y los pilotos justo delante y detrás. Funciona aunque no compartas tus vueltas; todo está también en lmu.cparfait.ovh. Clasificaciones de la comunidad (opcional, desactivado por defecto): Configuración → Comunidad permite compartir la mejor vuelta de cada sesión para compararte con otros pilotos de LMU Stats Viewer. Antes de activarlo ves exactamente qué se envía (circuito, coche, clase, mejor vuelta y sectores, ritmo mediano, ayudas, tu nombre de piloto de LMU; nunca las vueltas de los demás pilotos, tus reglajes, tu telemetría ni tus archivos), puedes permanecer anónimo, elegir si incluyes tus sesiones anteriores y borrarlo todo del servidor con un clic. Desactivar el uso compartido anonimiza las vueltas ya compartidas: siguen en las estadísticas, sin tu nombre. Los envíos son seguros: solo HTTPS, cada envío lleva una huella y solo cuenta cuando el servidor confirma su recepción completa; tras un corte, simplemente se reenvía, sin duplicados.",
              de: "Neue Seite „Rangliste“: deine Position unter den LMU-Stats-Viewer-Fahrern auf jeder gefahrenen Strecke × Klasse, automatisch aus deinen besten Trockenrunden berechnet — Platz, Top-%, Abstand zum Schnellsten, Zeitverteilung mit markierter Position und die Fahrer direkt vor und hinter dir. Funktioniert auch, wenn du deine Runden nicht teilst; alles auch auf lmu.cparfait.ovh. Community-Ranglisten (optional, standardmäßig aus): Einstellungen → Community ermöglicht es, die beste Runde jeder Session zu teilen, um dich mit anderen LMU-Stats-Viewer-Fahrern zu vergleichen. Vor dem Aktivieren siehst du genau, was gesendet wird (Strecke, Auto, Klasse, beste Runde und Sektoren, Median-Tempo, Fahrhilfen, dein LMU-Fahrername — nie die Runden anderer Fahrer, deine Setups, Telemetrie oder Dateien), du kannst anonym bleiben, wählen, ob frühere Sessions einbezogen werden, und alles mit einem Klick vom Server löschen. Das Deaktivieren anonymisiert bereits geteilte Runden: Sie bleiben ohne deinen Namen in den Statistiken. Die Übertragung ist gesichert: nur HTTPS, jeder Versand trägt einen Fingerabdruck und zählt erst, wenn der Server den vollständigen Empfang bestätigt; nach einem Verbindungsabbruch wird er einfach erneut gesendet, ohne Duplikate.",
              it: "Nuova pagina «Classifica»: la tua posizione tra i piloti di LMU Stats Viewer su ogni circuito × classe che hai guidato, calcolata automaticamente dai tuoi migliori giri sull'asciutto — posizione, top %, distacco dal più veloce, la distribuzione dei tempi sul giro con la tua posizione segnata, e i piloti subito davanti e dietro. Funziona anche se non condividi i tuoi giri; tutto è disponibile anche su lmu.cparfait.ovh. Classifiche della community (facoltative, disattivate per impostazione predefinita): Impostazioni → Community ti permette di condividere il miglior giro di ogni sessione per confrontarti con gli altri piloti di LMU Stats Viewer. Prima di attivarle vedi esattamente cosa viene inviato (circuito, vettura, classe, miglior giro e settori, passo mediano, aiuti, il tuo nome pilota LMU — mai i giri degli altri piloti, i tuoi setup, la telemetria o i tuoi file), puoi restare anonimo, scegliere se includere le sessioni passate e cancellare tutto dal server con un clic. Disattivare la condivisione rende anonimi i giri già condivisi: restano nelle statistiche senza il tuo nome. Gli invii sono protetti: solo HTTPS, ogni invio ha un'impronta e viene contato solo quando il server ne conferma la ricezione completa; dopo un'interruzione della connessione viene semplicemente rinviato, senza duplicati.",
            },
          },
          {
            text: {
              en: "Community leaderboards invitation: when the app starts, a window offers to share your best laps, with a preview of your place (“with 1:34.912 at Daytona (Hyper), you would be 12th of 65 drivers”). Your LMU driver name is shown as it will appear (tick “Stay anonymous” to hide it), and nothing is sent until you click “Enable sharing”. If you choose “Later”, it is offered only once more, after a new personal best.",
              fr: "Invitation aux classements de la communauté : au lancement, une fenêtre propose de partager vos meilleurs tours, avec un aperçu de votre place (« avec 1:34.912 à Daytona (Hyper), vous seriez 12ᵉ sur 65 pilotes »). Votre nom de pilote LMU y est affiché tel qu'il apparaîtra (cochez « Rester anonyme » pour le masquer), et rien ne part tant que vous n'avez pas cliqué « Activer le partage ». Si vous choisissez « Plus tard », elle n'est reproposée qu'une seule fois, après un nouveau record personnel.",
              es: "Invitación a las clasificaciones de la comunidad: al iniciar, una ventana propone compartir tus mejores vueltas, con un avance de tu puesto («con 1:34.912 en Daytona (Hyper), serías 12.º de 65 pilotos»). Tu nombre de piloto de LMU se muestra tal como aparecerá (marca «Permanecer anónimo» para ocultarlo), y no se envía nada hasta que pulses «Activar el uso compartido». Si eliges «Más tarde», solo se vuelve a proponer una vez, tras un nuevo récord personal.",
              de: "Einladung zu den Community-Ranglisten: Beim Start bietet ein Fenster an, deine besten Runden zu teilen, mit einer Vorschau deiner Platzierung („mit 1:34.912 in Daytona (Hyper) wärst du 12. von 65 Fahrern“). Dein LMU-Fahrername wird so angezeigt, wie er erscheinen wird (aktiviere „Anonym bleiben“, um ihn auszublenden), und nichts wird gesendet, bevor du auf „Teilen aktivieren“ klickst. Wählst du „Später“, wird sie nur noch einmal angeboten – nach einer neuen persönlichen Bestzeit.",
              it: "Invito alle classifiche della community: all'avvio dell'app, una finestra propone di condividere i tuoi migliori giri, con un'anteprima della tua posizione («con 1:34.912 a Daytona (Hyper), saresti 12° su 65 piloti»). Il tuo nome pilota LMU viene mostrato come apparirà (spunta «Resta anonimo» per nasconderlo), e non viene inviato nulla finché non clicchi «Attiva la condivisione». Se scegli «Più tardi», viene riproposta una sola altra volta, dopo un nuovo record personale.",
            },
          },
          {
            text: {
              en: "Leaderboards page: the tables now look like the dashboard ones (collapsible track headers, clearly visible column titles, brand logo, highlighted performance block), with the same filters as Sessions (Track / Layout / Class / Car / Session / Mode / Version, positions compared on the same basis; by default all game versions are counted, as the filter says) and click-to-filter cells like Sessions and Records. The position reads “Fastest time” when you are 1st and “Bottom X%” in the lower half, instead of a misleading “Top 83%”. Links from the app to the site now let it recognise you: your time and position are pinned at the top of every leaderboard, even when you come back to the site later on its own.",
              fr: "Page Classements : les tableaux reprennent la présentation du tableau de bord (en-têtes de circuit repliables, titres de colonnes bien lisibles, logo de la marque, bloc performance mis en valeur), avec les mêmes filtres que Sessions (Circuit / Tracé / Classe / Voiture / Session / Mode / Version, positions comparées sur la même base ; par défaut, toutes les versions du jeu sont prises en compte, comme l'indique le filtre) et cellules cliquables pour filtrer comme dans Sessions et Records. La position affiche « Meilleur temps » quand vous êtes 1ᵉʳ et « Derniers X % » dans la moitié basse, au lieu d'un « Top 83 % » trompeur. Les liens de l'app vers le site vous y font reconnaître : votre temps et votre position sont épinglés en haut de chaque classement, même quand vous revenez plus tard directement sur le site.",
              es: "Página Clasificaciones: las tablas adoptan la presentación del panel (cabeceras de circuito plegables, títulos de columna bien legibles, logo de la marca, bloque de rendimiento destacado), con los mismos filtros que Sesiones (Circuito / Trazado / Clase / Coche / Sesión / Modo / Versión, posiciones comparadas con la misma base; por defecto se tienen en cuenta todas las versiones del juego, como indica el filtro) y celdas clicables para filtrar como en Sesiones y Récords. La posición muestra «Mejor tiempo» cuando eres 1.º y «Últimos X %» en la mitad inferior, en lugar de un engañoso «Top 83 %». Los enlaces de la app al sitio hacen que te reconozca: tu tiempo y tu posición quedan fijados arriba de cada clasificación, incluso cuando vuelves más tarde directamente al sitio.",
              de: "Seite Ranglisten: Die Tabellen übernehmen die Darstellung des Dashboards (einklappbare Streckenköpfe, gut lesbare Spaltentitel, Markenlogo, hervorgehobener Performance-Block), mit denselben Filtern wie Sitzungen (Strecke / Layout / Klasse / Auto / Sitzung / Modus / Version, Positionen auf derselben Basis verglichen; standardmäßig zählen alle Spielversionen, wie der Filter anzeigt) und anklickbaren Zellen zum Filtern wie in Sitzungen und Rekorde. Die Position zeigt „Bestzeit“, wenn du 1. bist, und „Letzte X %“ in der unteren Hälfte statt eines irreführenden „Top 83 %“. Links aus der App zur Website sorgen dafür, dass sie dich erkennt: Deine Zeit und Position werden oben in jeder Rangliste angeheftet, auch wenn du später direkt zur Website zurückkehrst.",
              it: "Pagina Classifiche: le tabelle ora riprendono lo stile della dashboard (intestazioni dei circuiti comprimibili, titoli delle colonne ben leggibili, logo del marchio, blocco prestazioni in evidenza), con gli stessi filtri di Sessioni (Circuito / Tracciato / Classe / Vettura / Sessione / Modalità / Versione, posizioni confrontate sulla stessa base; per impostazione predefinita vengono considerate tutte le versioni del gioco, come indica il filtro) e celle cliccabili per filtrare come in Sessioni e Record. La posizione mostra «Miglior tempo» quando sei 1° e «Ultimi X%» nella metà inferiore, invece di un fuorviante «Top 83%». I link dall'app al sito ora gli permettono di riconoscerti: il tuo tempo e la tua posizione sono fissati in cima a ogni classifica, anche quando torni più tardi direttamente sul sito.",
            },
          },
          {
            featured: true,
            text: {
              en: "Your live voice announcements now sound like a race engineer. New calls: whether you are catching the car ahead or the car behind is catching you (with the gap per lap and roughly when you will meet), packs of slower traffic coming up in the next laps, a faster-class car arriving behind, your pit window (“you can pit until lap 26”, then “your window is closing”, then “box, box” when fuel or virtual energy becomes critical), direct rivals in your class stopping (and whether they should rejoin ahead or behind you), hybrid battery running low or never deployed, pit lane without the limiter, limiter left on after leaving the pits, a short briefing on the formation lap, a chronically weak sector over your last clean laps, and rain coming when the game's scripted weather file is available and matches the measured temperature.",
              fr: "Tes annonces vocales en direct parlent désormais comme un ingénieur de course. Nouvelles annonces : tu rattrapes la voiture devant ou celle de derrière revient sur toi (avec l'écart gagné par tour et quand vous vous rejoindrez à peu près), paquets de voitures plus lentes à rattraper dans les prochains tours, voiture d'une classe plus rapide qui arrive derrière, ta fenêtre d'arrêt (« tu peux rentrer jusqu'au tour 26 », puis « ta fenêtre se ferme », puis « box, box » quand le carburant ou l'énergie virtuelle devient critique), arrêt de tes rivaux directs dans ta classe (et s'ils devraient ressortir devant ou derrière toi), batterie hybride trop basse ou jamais déployée, voie des stands sans limiteur, limiteur oublié en sortant des stands, court briefing au tour de formation, secteur chroniquement faible sur tes derniers tours propres, et pluie à venir quand le fichier météo scénarisé du jeu est disponible et colle à la température mesurée.",
              es: "Tus anuncios de voz en directo hablan ahora como un ingeniero de carrera. Nuevos avisos: si alcanzas al coche de delante o el de detrás te alcanza (con la diferencia por vuelta y cuándo os juntaréis aproximadamente), grupos de coches más lentos en las próximas vueltas, un coche de una clase más rápida que llega por detrás, tu ventana de parada («puedes entrar hasta la vuelta 26», luego «tu ventana se cierra», luego «box, box» cuando el combustible o la energía virtual se vuelven críticos), paradas de tus rivales directos de clase (y si deberían salir delante o detrás de ti), batería híbrida demasiado baja o nunca desplegada, pit lane sin limitador, limitador olvidado al salir de boxes, un breve briefing en la vuelta de formación, un sector crónicamente débil en tus últimas vueltas limpias y lluvia en camino cuando el archivo de meteorología programada del juego está disponible y coincide con la temperatura medida.",
              de: "Deine Live-Sprachansagen klingen jetzt wie ein Renningenieur. Neue Ansagen: ob du auf den Vordermann aufholst oder der Hintermann auf dich (mit dem Abstand pro Runde und ungefähr wann ihr zusammenkommt), Gruppen langsamerer Autos in den nächsten Runden, ein Auto einer schnelleren Klasse, das von hinten kommt, dein Boxenfenster („du kannst bis Runde 26 reinkommen“, dann „dein Fenster schließt sich“, dann „box, box“, wenn Sprit oder virtuelle Energie kritisch werden), Stopps deiner direkten Klassenrivalen (und ob sie vor oder hinter dir rauskommen sollten), zu niedrige oder nie eingesetzte Hybridbatterie, Boxengasse ohne Begrenzer, nach der Boxenausfahrt vergessener Begrenzer, ein kurzes Briefing in der Einführungsrunde, ein chronisch schwacher Sektor über deine letzten sauberen Runden und kommender Regen, wenn die geskriptete Wetterdatei des Spiels vorhanden ist und zur gemessenen Temperatur passt.",
              it: "I tuoi annunci vocali live ora suonano come quelli di un ingegnere di pista. Nuovi avvisi: se stai riprendendo la vettura davanti o se quella dietro ti sta riprendendo (con il distacco per giro e quando vi incontrerete, all'incirca), gruppi di traffico più lento da raggiungere nei prossimi giri, una vettura di una classe più veloce che arriva da dietro, la tua finestra di pit stop («puoi rientrare fino al giro 26», poi «la tua finestra si sta chiudendo», poi «box, box» quando il carburante o l'energia virtuale diventa critica), le soste dei tuoi rivali diretti di classe (e se dovrebbero rientrare in pista davanti o dietro di te), batteria ibrida troppo scarica o mai utilizzata, corsia box senza limitatore, limitatore lasciato inserito dopo l'uscita dai box, un breve briefing nel giro di formazione, un settore cronicamente debole nei tuoi ultimi giri puliti, e pioggia in arrivo quando il file meteo programmato del gioco è disponibile e corrisponde alla temperatura misurata.",
            },
          },
          {
            text: {
              en: "You can ask the engineer a lot more by voice. With the spotter talk key: who is ahead or behind you in your class, the class leader, whether you are catching the car ahead, upcoming traffic, the weather forecast, tyre temperatures against their working window, brake bias, battery and virtual energy, the session's fastest lap, until which lap you can pit, how many stops are left — and “copy” / “staying out” to acknowledge or silence the pit reminders. With the AI coach talk key, phrased freely: all of the above plus “who is P6 in LMP2?”, “where is number 14?” and more.",
              fr: "Tu peux demander beaucoup plus de choses à l'ingénieur à la voix. Avec la touche « Parler » du spotter : qui est devant ou derrière toi dans ta classe, le leader de ta classe, si tu rattrapes la voiture devant, le trafic à venir, la prévision météo, la température des pneus par rapport à leur fenêtre, la répartition de freinage, la batterie et l'énergie virtuelle, le meilleur tour de la séance, jusqu'à quel tour tu peux rentrer, combien d'arrêts il reste — et « compris » / « je reste dehors » pour accuser réception ou couper les rappels d'arrêt. Avec la touche du Coach IA, en formulant librement : tout cela, plus « qui est P6 en LMP2 ? », « où est la 14 ? » et d'autres.",
              es: "Ahora puedes preguntar mucho más al ingeniero por voz. Con la tecla «Hablar» del spotter: quién va delante o detrás de ti en tu clase, el líder de tu clase, si alcanzas al coche de delante, el tráfico que viene, la previsión meteorológica, la temperatura de los neumáticos frente a su ventana, el reparto de frenada, la batería y la energía virtual, la vuelta rápida de la sesión, hasta qué vuelta puedes entrar, cuántas paradas quedan — y «entendido» / «me quedo fuera» para confirmar o silenciar los avisos de parada. Con la tecla del Coach IA, con tus propias palabras: todo lo anterior, más «¿quién va P6 en LMP2?», «¿dónde está el 14?» y más.",
              de: "Du kannst den Ingenieur jetzt per Stimme viel mehr fragen. Mit der „Sprechen“-Taste des Spotters: wer in deiner Klasse vor oder hinter dir ist, den Klassenführer, ob du auf den Vordermann aufholst, kommenden Verkehr, die Wettervorhersage, die Reifentemperaturen im Vergleich zu ihrem Arbeitsfenster, die Bremsbalance, Batterie und virtuelle Energie, die schnellste Runde der Session, bis zu welcher Runde du reinkommen kannst, wie viele Stopps noch nötig sind — und „verstanden“ / „ich bleibe draußen“, um Boxen-Erinnerungen zu bestätigen oder stummzuschalten. Mit der Taste des KI-Coachs, frei formuliert: all das, plus „wer ist P6 in der LMP2?“, „wo ist die Nummer 14?“ und mehr.",
              it: "Puoi chiedere molte più cose all'ingegnere a voce. Con il tasto «Parla» dello spotter: chi c'è davanti o dietro di te nella tua classe, il leader della classe, se stai riprendendo la vettura davanti, il traffico in arrivo, le previsioni meteo, le temperature delle gomme rispetto alla loro finestra di funzionamento, il bilanciamento di frenata, batteria ed energia virtuale, il giro più veloce della sessione, fino a quale giro puoi rientrare ai box, quante soste mancano — e «ricevuto» / «resto fuori» per confermare o zittire i promemoria di sosta. Con il tasto del Coach IA, formulando liberamente: tutto quanto sopra più «chi è P6 in LMP2?», «dov'è la numero 14?» e altro ancora.",
            },
          },
          {
            text: {
              en: "“Tell me when…” alerts with the AI coach talk key: “tell me when there are ten minutes left”, “…when the car ahead pits”, “…when I'm down to three laps of fuel”, “…when it rains”. The engineer confirms, then says it once when it happens. “Cancel the alerts” clears them.",
              fr: "Alertes « préviens-moi » avec la touche du Coach IA : « préviens-moi quand il reste dix minutes », « …quand la voiture devant s'arrête », « …quand il me reste trois tours d'essence », « …quand il pleut ». L'ingénieur confirme, puis le dit une fois au bon moment. « Annule les alertes » les efface.",
              es: "Alertas «avísame» con la tecla del Coach IA: «avísame cuando queden diez minutos», «…cuando pare el coche de delante», «…cuando me queden tres vueltas de combustible», «…cuando llueva». El ingeniero lo confirma y lo dice una vez en el momento justo. «Cancela las alertas» las borra.",
              de: "„Sag mir, wenn…“-Alarme mit der Taste des KI-Coachs: „sag mir, wenn noch zehn Minuten übrig sind“, „…wenn der Vordermann an die Box geht“, „…wenn ich nur noch drei Runden Sprit habe“, „…wenn es regnet“. Der Ingenieur bestätigt und sagt es einmal im richtigen Moment. „Alarme löschen“ entfernt sie.",
              it: "Avvisi «avvisami quando…» con il tasto del Coach IA: «avvisami quando mancano dieci minuti», «…quando la vettura davanti si ferma ai box», «…quando mi restano tre giri di carburante», «…quando piove». L'ingegnere conferma, poi lo dice una volta al momento giusto. «Annulla gli avvisi» li cancella.",
            },
          },
          {
            text: {
              en: "Instant answers without AI: with the AI coach talk key, factual questions (gaps, fuel, pit window, who is ahead…) are now answered immediately by the app, with exact numbers and at no cost; the AI only handles open questions and advice. When the AI is asked, the engineer first says a short “copy, checking” so you know you were heard. Can be switched off in Settings → AI Coach to send every question to the AI as before.",
              fr: "Réponses instantanées sans IA : avec la touche du Coach IA, les questions factuelles (écarts, carburant, fenêtre d'arrêt, qui est devant…) sont désormais répondues tout de suite par l'application, avec des chiffres exacts et sans coût ; l'IA ne garde que les questions ouvertes et les conseils. Quand l'IA est sollicitée, l'ingénieur dit d'abord un bref « reçu, je regarde » pour que tu saches qu'il t'a entendu. Désactivable dans Configuration → Coach IA pour tout envoyer à l'IA comme avant.",
              es: "Respuestas instantáneas sin IA: con la tecla del Coach IA, las preguntas factuales (diferencias, combustible, ventana de parada, quién va delante…) las responde ahora la aplicación al momento, con cifras exactas y sin coste; la IA solo se encarga de las preguntas abiertas y los consejos. Cuando se consulta a la IA, el ingeniero dice primero un breve «recibido, lo miro» para que sepas que te ha oído. Se puede desactivar en Configuración → Coach IA para enviarlo todo a la IA como antes.",
              de: "Sofortige Antworten ohne KI: Mit der Taste des KI-Coachs beantwortet die App Sachfragen (Abstände, Sprit, Boxenfenster, wer vor dir ist…) jetzt sofort selbst, mit exakten Zahlen und ohne Kosten; die KI übernimmt nur noch offene Fragen und Ratschläge. Wird die KI gefragt, sagt der Ingenieur zuerst ein kurzes „verstanden, ich schaue nach“, damit du weißt, dass er dich gehört hat. In Einstellungen → KI-Coach abschaltbar, um wie bisher alles an die KI zu schicken.",
              it: "Risposte istantanee senza IA: con il tasto del Coach IA, alle domande fattuali (distacchi, carburante, finestra di sosta, chi c'è davanti…) ora risponde subito l'app, con numeri esatti e senza costi; l'IA si occupa solo delle domande aperte e dei consigli. Quando viene interpellata l'IA, l'ingegnere dice prima un breve «ricevuto, controllo» così sai che ti ha sentito. Disattivabile in Impostazioni → Coach IA per inviare ogni domanda all'IA come prima.",
            },
          },
        ],
      },
      {
        kind: "improved",
        items: [
          {
            text: {
              en: "“References” and the new leaderboard are merged into a single “Leaderboards” menu with two tabs: “My position” (your community rank on each combo, now shown next to your OhneSpeed level) and “OhneSpeed references” (the former References page, unchanged). Links to the old page still work. With the OhneSpeed option off, only the community leaderboard is shown.",
              fr: "« Références » et le nouveau classement sont réunis dans un seul menu « Classements » à deux onglets : « Ma position » (votre rang communautaire sur chaque combo, désormais affiché à côté de votre niveau OhneSpeed) et « Références OhneSpeed » (l'ancienne page Références, inchangée). Les liens vers l'ancienne page fonctionnent toujours. Option OhneSpeed désactivée : seul le classement communautaire est affiché.",
              es: "«Referencias» y la nueva clasificación se reúnen en un único menú «Clasificaciones» con dos pestañas: «Mi posición» (tu puesto en la comunidad en cada combo, ahora junto a tu nivel OhneSpeed) y «Referencias OhneSpeed» (la antigua página Referencias, sin cambios). Los enlaces a la página antigua siguen funcionando. Con la opción OhneSpeed desactivada, solo se muestra la clasificación de la comunidad.",
              de: "„Referenzen“ und die neue Rangliste sind in einem Menü „Ranglisten“ mit zwei Tabs vereint: „Meine Position“ (dein Community-Rang auf jeder Kombo, jetzt neben deiner OhneSpeed-Stufe) und „OhneSpeed-Referenzen“ (die bisherige Referenzen-Seite, unverändert). Links zur alten Seite funktionieren weiterhin. Bei deaktivierter OhneSpeed-Option wird nur die Community-Rangliste angezeigt.",
              it: "«Riferimenti» e la nuova classifica sono riuniti in un unico menu «Classifiche» con due schede: «La mia posizione» (la tua posizione nella community su ogni combo, ora mostrata accanto al tuo livello OhneSpeed) e «Riferimenti OhneSpeed» (la vecchia pagina Riferimenti, invariata). I link alla vecchia pagina funzionano ancora. Con l'opzione OhneSpeed disattivata viene mostrata solo la classifica della community.",
            },
          },
          {
            featured: true,
            text: {
              en: "Live announcements no longer need the Live page to be open. The engineer (announcements, corner coach, “tell me when” alerts) now talks whatever page you are on, even with the app minimised or hidden in the tray — just drive. Settings → Voice → “Announcements on every page” switches back to the previous behaviour (announcements only while the Live page is shown).",
              fr: "Les annonces en direct n'exigent plus que la page Live soit ouverte. L'ingénieur (annonces, coach par virage, alertes « préviens-moi ») parle désormais quelle que soit la page affichée, même application réduite ou cachée dans la barre des tâches — il suffit de rouler. Configuration → Voix → « Annonces sur toutes les pages » permet de revenir au fonctionnement précédent (annonces seulement quand la page Live est affichée).",
              es: "Los anuncios en directo ya no necesitan que la página Live esté abierta. El ingeniero (anuncios, coach por curva, alertas «avísame») habla ahora en cualquier página, incluso con la aplicación minimizada u oculta en la bandeja: solo tienes que conducir. Configuración → Voz → «Anuncios en todas las páginas» permite volver al funcionamiento anterior (anuncios solo con la página Live visible).",
              de: "Live-Ansagen brauchen die Live-Seite nicht mehr. Der Ingenieur (Ansagen, Kurven-Coach, „Sag mir, wenn…“-Alarme) spricht jetzt auf jeder Seite, auch bei minimierter oder im Infobereich versteckter App — einfach fahren. Einstellungen → Stimme → „Ansagen auf allen Seiten“ stellt das bisherige Verhalten wieder her (Ansagen nur bei angezeigter Live-Seite).",
              it: "Gli annunci live non richiedono più che la pagina Live sia aperta. L'ingegnere (annunci, coach curva per curva, avvisi «avvisami quando») ora parla qualunque sia la pagina visualizzata, anche con l'app ridotta a icona o nascosta nell'area di notifica — basta guidare. Impostazioni → Voce → «Annunci su tutte le pagine» permette di tornare al comportamento precedente (annunci solo quando è visualizzata la pagina Live).",
            },
          },
          {
            text: {
              en: "New default radio effect, “Pit radio” (Settings → Voice): a 250–4800 Hz band, soft saturation, light hiss and squelch clicks, with the opening beep and roger beep kept. The original effect stays available as “Classic”, and a “Compare” button plays the same line with one then the other. Also new: optional push-to-talk beeps (high when the mic opens, low when your question is sent).",
              fr: "Nouvel effet radio par défaut, « Radio stand » (Configuration → Voix) : bande 250–4800 Hz, saturation douce, souffle discret et clics de squelch, avec le bip d'ouverture et le roger beep conservés. L'effet d'origine reste disponible sous le nom « Classique », et un bouton « Comparer » joue la même phrase avec l'un puis l'autre. Nouveau aussi : des bips de push-to-talk en option (aigu à l'ouverture du micro, grave à l'envoi de ta question).",
              es: "Nuevo efecto de radio por defecto, «Radio de boxes» (Configuración → Voz): banda 250–4800 Hz, saturación suave, soplido ligero y clics de squelch, manteniendo el pitido de apertura y el roger beep. El efecto original sigue disponible como «Clásico», y un botón «Comparar» reproduce la misma frase con uno y luego con el otro. También nuevo: pitidos de push-to-talk opcionales (agudo al abrirse el micro, grave al enviar tu pregunta).",
              de: "Neuer Standard-Funkeffekt „Boxenfunk“ (Einstellungen → Stimme): Band 250–4800 Hz, sanfte Sättigung, leises Rauschen und Squelch-Klicks, Öffnungston und Roger-Beep bleiben erhalten. Der ursprüngliche Effekt bleibt als „Klassisch“ verfügbar, und eine Schaltfläche „Vergleichen“ spielt denselben Satz erst mit dem einen, dann mit dem anderen. Ebenfalls neu: optionale Push-to-Talk-Töne (hoch beim Öffnen des Mikros, tief beim Senden deiner Frage).",
              it: "Nuovo effetto radio predefinito, «Radio box» (Impostazioni → Voce): banda 250–4800 Hz, saturazione morbida, leggero fruscio e clic di squelch, mantenendo il bip di apertura e il roger beep. L'effetto originale resta disponibile come «Classico», e un pulsante «Confronta» riproduce la stessa frase con l'uno e poi con l'altro. Novità anche: bip di push-to-talk opzionali (acuto quando si apre il microfono, grave quando la tua domanda viene inviata).",
            },
          },
          {
            text: {
              en: "New “Announcement rate” setting (Settings → Voice). “Engineer” (default): one call at a time — safety calls always get through —, the lap time, sectors and gaps said on the line are merged into a single sentence, and the same information is no longer repeated lap after lap (the lap time every third lap in a race, the gap to the leader every fifth lap, a personal best only when it is worth it); the corner coach also no longer tells you to push when fuel, a tyre or the car says to manage. “Full”: everything, every time, exactly as before. Both modes have exactly the same announcements.",
              fr: "Nouveau réglage « Débit des annonces » (Configuration → Voix). « Ingénieur » (par défaut) : une annonce à la fois — la sécurité passe toujours —, le chrono, les secteurs et les écarts dits sur la ligne sont fusionnés en une seule phrase, et la même information n'est plus répétée tour après tour (le chrono un tour sur trois en course, l'écart au leader un tour sur cinq, un meilleur tour seulement quand il vaut le coup) ; le coach par virage ne te dit plus d'attaquer quand le carburant, un pneu ou la voiture imposent de gérer. « Complet » : tout, à chaque fois, exactement comme avant. Les deux modes ont exactement les mêmes annonces.",
              es: "Nuevo ajuste «Ritmo de los anuncios» (Configuración → Voz). «Ingeniero» (por defecto): un aviso cada vez — los de seguridad siempre pasan —, el tiempo de vuelta, los sectores y las diferencias en la línea se fusionan en una sola frase, y la misma información ya no se repite vuelta tras vuelta (el tiempo una vuelta de cada tres en carrera, la diferencia con el líder una de cada cinco, una mejor vuelta solo cuando merece la pena); el coach por curva tampoco te pide atacar cuando el combustible, un neumático o el coche piden gestionar. «Completo»: todo, siempre, exactamente como antes. Los dos modos tienen exactamente los mismos anuncios.",
              de: "Neue Einstellung „Ansage-Rhythmus“ (Einstellungen → Stimme). „Ingenieur“ (Standard): eine Ansage auf einmal — Sicherheitsansagen kommen immer durch —, Rundenzeit, Sektoren und Abstände an der Linie werden zu einem einzigen Satz zusammengefasst, und dieselbe Information wird nicht mehr Runde für Runde wiederholt (die Rundenzeit im Rennen jede dritte Runde, der Abstand zum Führenden jede fünfte, eine Bestzeit nur, wenn sie sich lohnt); der Kurven-Coach sagt dir auch nicht mehr, Gas zu geben, wenn Sprit, ein Reifen oder das Auto Schonen verlangen. „Vollständig“: alles, jedes Mal, genau wie bisher. Beide Modi haben genau dieselben Ansagen.",
              it: "Nuova impostazione «Frequenza degli annunci» (Impostazioni → Voce). «Ingegnere» (predefinita): un annuncio alla volta — quelli di sicurezza passano sempre —, il tempo sul giro, i settori e i distacchi detti sul traguardo vengono uniti in un'unica frase, e la stessa informazione non viene più ripetuta giro dopo giro (il tempo sul giro un giro su tre in gara, il distacco dal leader un giro su cinque, un miglior giro personale solo quando ne vale la pena); inoltre il coach curva per curva non ti dice più di spingere quando il carburante, una gomma o la vettura impongono di gestire. «Completo»: tutto, ogni volta, esattamente come prima. Le due modalità hanno esattamente gli stessi annunci.",
            },
          },
          {
            text: {
              en: "Coaching on the four US Track Pass circuits. New commented video lap guides whose corner-by-corner advice now feeds the AI coach: Daytona in GT3, Hypercar and both LMP2 specs (ELMS cars get the ELMS guide), Laguna Seca in Hypercar and Long Beach in GT3 — plus video links for Long Beach in Hypercar, Road Atlanta in every class and Laguna Seca in LMP2. Long Beach also gets corner-by-corner braking notes, and Laguna Seca gets its elevation in the telemetry 3D view.",
              fr: "Coaching sur les quatre circuits du US Track Pass. Nouveaux guides vidéo commentés dont les conseils virage par virage nourrissent désormais le Coach IA : Daytona en GT3, Hypercar et dans les deux spécifications LMP2 (les voitures ELMS reçoivent le guide ELMS), Laguna Seca en Hypercar et Long Beach en GT3 — plus des liens vidéo pour Long Beach en Hypercar, Road Atlanta dans toutes les classes et Laguna Seca en LMP2. Long Beach reçoit aussi des repères de freinage virage par virage, et Laguna Seca son relief dans la vue 3D de la télémétrie.",
              es: "Coaching en los cuatro circuitos del US Track Pass. Nuevas guías de vídeo comentadas cuyos consejos curva a curva alimentan ahora al Coach IA: Daytona en GT3, Hypercar y en las dos especificaciones LMP2 (los coches ELMS reciben la guía ELMS), Laguna Seca en Hypercar y Long Beach en GT3, además de enlaces de vídeo para Long Beach en Hypercar, Road Atlanta en todas las clases y Laguna Seca en LMP2. Long Beach recibe también referencias de frenada curva a curva, y Laguna Seca su relieve en la vista 3D de la telemetría.",
              de: "Coaching auf den vier Strecken des US Track Pass. Neue kommentierte Video-Rundenguides, deren Tipps Kurve für Kurve jetzt in den KI-Coach einfließen: Daytona in GT3, Hypercar und beiden LMP2-Spezifikationen (ELMS-Autos bekommen den ELMS-Guide), Laguna Seca in Hypercar und Long Beach in GT3 — dazu Videolinks für Long Beach in Hypercar, Road Atlanta in allen Klassen und Laguna Seca in LMP2. Long Beach bekommt außerdem Bremspunkte Kurve für Kurve, Laguna Seca ihr Höhenprofil in der 3D-Ansicht der Telemetrie.",
              it: "Coaching sui quattro circuiti dello US Track Pass. Nuove guide video commentate del giro, i cui consigli curva per curva ora alimentano il Coach IA: Daytona in GT3, Hypercar e in entrambe le specifiche LMP2 (le vetture ELMS ricevono la guida ELMS), Laguna Seca in Hypercar e Long Beach in GT3 — più link video per Long Beach in Hypercar, Road Atlanta in tutte le classi e Laguna Seca in LMP2. Long Beach riceve anche note di frenata curva per curva, e Laguna Seca la sua altimetria nella vista 3D della telemetria.",
            },
          },
        ],
      },
      {
        kind: "fixed",
        items: [
          {
            text: {
              en: "The first-launch assistant could pick the wrong driver name — sometimes an AI driver's, apparently at random. It took the most frequent name in your latest results, yet in offline races the same AI drivers appear in every session, tied with you. It now uses the driver the game marks as the player in its results, then the name in your LMU profile. If it still cannot tell, it shows a list to pick from. The name can still be changed in Settings.",
              fr: "L'assistant de premier lancement pouvait retenir un mauvais nom de pilote — parfois celui d'une IA, apparemment au hasard. Il prenait le nom le plus fréquent de vos derniers résultats, or en course hors ligne les mêmes IA figurent dans chaque session, à égalité avec vous. Il se fie désormais au pilote que le jeu marque comme joueur dans ses résultats, puis au nom de votre profil LMU ; s'il ne peut toujours pas trancher, il affiche une liste où choisir. Le nom reste modifiable dans la Configuration.",
              es: "El asistente del primer inicio podía elegir un nombre de piloto equivocado — a veces el de una IA, aparentemente al azar. Tomaba el nombre más frecuente de tus últimos resultados, pero en carreras sin conexión las mismas IA aparecen en cada sesión, empatadas contigo. Ahora usa el piloto que el juego marca como jugador en sus resultados y, después, el nombre de tu perfil de LMU; si aun así no puede decidir, muestra una lista para elegir. El nombre sigue siendo modificable en la Configuración.",
              de: "Der Assistent beim ersten Start konnte einen falschen Fahrernamen übernehmen — manchmal den einer KI, scheinbar zufällig. Er nahm den häufigsten Namen deiner letzten Ergebnisse, doch in Offline-Rennen stehen dieselben KI-Fahrer in jeder Sitzung, gleichauf mit dir. Jetzt nutzt er den Fahrer, den das Spiel in seinen Ergebnissen als Spieler markiert, danach den Namen aus deinem LMU-Profil; kann er immer noch nicht entscheiden, zeigt er eine Liste zur Auswahl. Der Name bleibt in den Einstellungen änderbar.",
              it: "L'assistente del primo avvio poteva scegliere il nome pilota sbagliato — a volte quello di un pilota IA, apparentemente a caso. Prendeva il nome più frequente nei tuoi ultimi risultati, ma nelle gare offline gli stessi piloti IA compaiono in ogni sessione, a pari merito con te. Ora usa il pilota che il gioco indica come giocatore nei suoi risultati, poi il nome del tuo profilo LMU. Se ancora non riesce a capirlo, mostra un elenco da cui scegliere. Il nome si può sempre cambiare nelle Impostazioni.",
            },
          },
          {
            text: {
              en: "The 2024/25 Peugeot 9X8 had no car picture anywhere in the app: the game writes its name as “Peugeot 9x8 (2024/25)”, which was not recognised. It now shows the 9X8 Evo picture.",
              fr: "La Peugeot 9X8 2024/25 n'avait aucune image dans l'app : le jeu écrit son nom « Peugeot 9x8 (2024/25) », qui n'était pas reconnu. Elle affiche désormais l'image de la 9X8 Evo.",
              es: "El Peugeot 9X8 2024/25 no tenía imagen en ninguna parte de la app: el juego escribe su nombre como «Peugeot 9x8 (2024/25)», que no se reconocía. Ahora muestra la imagen del 9X8 Evo.",
              de: "Der Peugeot 9X8 2024/25 hatte nirgends in der App ein Bild: Das Spiel schreibt seinen Namen als „Peugeot 9x8 (2024/25)“, was nicht erkannt wurde. Jetzt wird das Bild des 9X8 Evo angezeigt.",
              it: "La Peugeot 9X8 2024/25 non aveva nessuna immagine nell'app: il gioco scrive il suo nome come «Peugeot 9x8 (2024/25)», che non veniva riconosciuto. Ora mostra l'immagine della 9X8 Evo.",
            },
          },
          {
            text: {
              en: "In multi-class races, the “rival” voice command often described the nearest car as being in “another class” instead of saying whether it was a faster or slower class: the class names reported live by the game were not recognised. They are now.",
              fr: "En course multiclasse, la commande vocale « rival » décrivait souvent la voiture la plus proche comme étant d'une « autre classe » au lieu de dire si elle était d'une classe plus rapide ou plus lente : les noms de classe envoyés en direct par le jeu n'étaient pas reconnus. Ils le sont désormais.",
              es: "En carreras multiclase, el comando de voz «rival» describía a menudo el coche más cercano como de «otra clase» en lugar de decir si era una clase más rápida o más lenta: los nombres de clase enviados en directo por el juego no se reconocían. Ahora sí.",
              de: "In Mehrklassenrennen beschrieb der Sprachbefehl „Rivale“ das nächste Auto oft als „andere Klasse“, statt zu sagen, ob es eine schnellere oder langsamere Klasse ist: Die live vom Spiel gemeldeten Klassennamen wurden nicht erkannt. Jetzt schon.",
              it: "Nelle gare multiclasse, il comando vocale «rivale» descriveva spesso la vettura più vicina come di «un'altra classe» invece di dire se fosse di una classe più veloce o più lenta: i nomi di classe inviati in tempo reale dal gioco non venivano riconosciuti. Ora sì.",
            },
          },
          {
            text: {
              en: "An announcement cut off at the very moment it was being prepared (muting, a new session) could still be read out by the system voice. It is now dropped.",
              fr: "Une annonce coupée pile pendant sa préparation (coupure du son, nouvelle session) pouvait quand même être lue par la voix système. Elle est désormais abandonnée.",
              es: "Un anuncio cortado justo mientras se preparaba (silencio, nueva sesión) podía leerse igualmente con la voz del sistema. Ahora se descarta.",
              de: "Eine Ansage, die genau während ihrer Vorbereitung abgebrochen wurde (Stummschalten, neue Sitzung), konnte trotzdem von der Systemstimme vorgelesen werden. Sie wird jetzt verworfen.",
              it: "Un annuncio interrotto proprio mentre veniva preparato (audio disattivato, nuova sessione) poteva comunque essere letto dalla voce di sistema. Ora viene scartato.",
            },
          },
          {
            text: {
              en: "Road Atlanta: the braking references given to the coach, written before the circuit came out in the game, did not match the track — a “chicane” in the Esses (which are flat out) and Turn 10A, the heaviest braking zone of the lap, described as flat out. They have been rewritten corner by corner from the in-game layout.",
              fr: "Road Atlanta : les repères de freinage fournis au coach, rédigés avant la sortie du circuit en jeu, ne correspondaient pas au tracé — une « chicane » dans les S (qui passent à fond) et le virage 10A, plus gros freinage du tour, décrit comme à fond. Ils ont été réécrits virage par virage d'après le tracé du jeu.",
              es: "Road Atlanta: las referencias de frenada que recibía el coach, redactadas antes de que el circuito saliera en el juego, no correspondían al trazado: una «chicane» en las eses (que se pasan a fondo) y la curva 10A, la mayor frenada de la vuelta, descrita como a fondo. Se han reescrito curva a curva según el trazado del juego.",
              de: "Road Atlanta: Die Bremspunkte für den Coach, geschrieben bevor die Strecke im Spiel erschien, passten nicht zur Strecke — eine „Schikane“ in den Esses (die voll gefahren werden) und Kurve 10A, die härteste Bremszone der Runde, als Vollgas beschrieben. Sie wurden Kurve für Kurve nach dem Streckenverlauf im Spiel neu geschrieben.",
              it: "Road Atlanta: i riferimenti di frenata forniti al coach, scritti prima che il circuito uscisse nel gioco, non corrispondevano al tracciato — una «chicane» nelle Esses (che si percorrono in pieno) e la curva 10A, la frenata più forte del giro, descritta come da fare in pieno. Sono stati riscritti curva per curva in base al tracciato del gioco.",
            },
          },
          {
            text: {
              en: "Daytona and Laguna Seca had no community lap-time benchmark (Alien / Competitive… tiers) although the reference sheet covers them. They now do. At Daytona, the corner coach also ignored the Le Mans Chicane, the heaviest braking zone of the lap; it is now included.",
              fr: "Daytona et Laguna Seca n'avaient pas de temps de référence communautaires (niveaux Alien / Compétitif…) alors que la feuille de référence les couvre. C'est corrigé. À Daytona, le coach par virage ignorait aussi la chicane Le Mans, plus gros freinage du tour ; elle est désormais prise en compte.",
              es: "Daytona y Laguna Seca no tenían tiempos de referencia de la comunidad (niveles Alien / Competitivo…) aunque la hoja de referencia los cubre. Ya los tienen. En Daytona, el coach por curva también ignoraba la chicane Le Mans, la mayor frenada de la vuelta; ahora se tiene en cuenta.",
              de: "Daytona und Laguna Seca hatten keine Community-Referenzzeiten (Stufen Alien / Wettbewerb…), obwohl das Referenzblatt sie abdeckt. Jetzt schon. In Daytona ignorierte der Kurven-Coach außerdem die Le-Mans-Schikane, die härteste Bremszone der Runde; sie wird jetzt berücksichtigt.",
              it: "Daytona e Laguna Seca non avevano tempi di riferimento della community (livelli Alien / Competitivo…) sebbene la tabella di riferimento li copra. Ora sì. A Daytona, il coach curva per curva ignorava anche la Le Mans Chicane, la frenata più forte del giro; ora è inclusa.",
            },
          },
          {
            text: {
              en: "Wrong braking references removed. Checked against the official track layouts, the community braking guide described corners that do not exist at those places on seven circuits — Sebring, COTA, Interlagos, Paul Ricard, Fuji, Portimão and Bahrain (a “hairpin” at Sebring's fast Sunset Bend, corner names borrowed from other circuits, flat corners given as braking zones, missing hairpins). The coach no longer uses them: better no reference than a wrong one. Their video guides are still used. Le Mans, Monza, Spa and Imola, whose references match the track, are kept.",
              fr: "Repères de freinage erronés retirés. Vérifié contre les tracés officiels, le guide de freinage communautaire décrivait sur sept circuits des virages qui n'existent pas à ces endroits — Sebring, COTA, Interlagos, Paul Ricard, Fuji, Portimão et Bahreïn (une « épingle » dans la rapide courbe Sunset Bend de Sebring, des noms de virages empruntés à d'autres circuits, des virages à fond présentés comme des freinages, des épingles absentes). Le coach ne les utilise plus : mieux vaut pas de repère qu'un repère faux. Les guides vidéo de ces circuits restent utilisés. Le Mans, Monza, Spa et Imola, dont les repères correspondent au tracé, sont conservés.",
              es: "Referencias de frenada erróneas eliminadas. Comprobada con los trazados oficiales, la guía de frenada de la comunidad describía en siete circuitos curvas que no existen en esos puntos: Sebring, COTA, Interlagos, Paul Ricard, Fuji, Portimão y Baréin (una «horquilla» en la rápida Sunset Bend de Sebring, nombres de curvas tomados de otros circuitos, curvas a fondo presentadas como frenadas, horquillas ausentes). El coach ya no las usa: mejor ninguna referencia que una falsa. Las guías de vídeo de esos circuitos se siguen usando. Le Mans, Monza, Spa e Imola, cuyas referencias coinciden con el trazado, se mantienen.",
              de: "Falsche Bremspunkte entfernt. Abgeglichen mit den offiziellen Streckenverläufen beschrieb der Community-Bremsguide auf sieben Strecken Kurven, die es an diesen Stellen nicht gibt — Sebring, COTA, Interlagos, Paul Ricard, Fuji, Portimão und Bahrain (eine „Haarnadel“ in Sebrings schneller Sunset Bend, Kurvennamen anderer Strecken, Vollgaskurven als Bremszonen, fehlende Haarnadeln). Der Coach verwendet sie nicht mehr: lieber kein Bremspunkt als ein falscher. Die Videoguides dieser Strecken werden weiter genutzt. Le Mans, Monza, Spa und Imola, deren Angaben zur Strecke passen, bleiben erhalten.",
              it: "Rimossi i riferimenti di frenata errati. Verificata sui tracciati ufficiali, la guida di frenata della community descriveva su sette circuiti curve che in quei punti non esistono — Sebring, COTA, Interlagos, Paul Ricard, Fuji, Portimão e Bahrain (un «tornante» nella veloce Sunset Bend di Sebring, nomi di curve presi da altri circuiti, curve in pieno indicate come zone di frenata, tornanti mancanti). Il coach non li usa più: meglio nessun riferimento che uno sbagliato. Le guide video di questi circuiti restano in uso. Le Mans, Monza, Spa e Imola, i cui riferimenti corrispondono al tracciato, sono mantenuti.",
            },
          },
          {
            text: {
              en: "At Imola and Interlagos, the coach never received its video lap guide (nor, at Imola, its braking references): the game names these circuits “Autodromo Enzo e Dino Ferrari” and “Autodromo Jose Carlos Pace”, which were not recognised. They now are.",
              fr: "À Imola et Interlagos, le coach ne recevait jamais son guide vidéo (ni, à Imola, ses repères de freinage) : le jeu nomme ces circuits « Autodromo Enzo e Dino Ferrari » et « Autodromo Jose Carlos Pace », noms qui n'étaient pas reconnus. Ils le sont désormais.",
              es: "En Imola e Interlagos, el coach nunca recibía su guía de vídeo (ni, en Imola, sus referencias de frenada): el juego llama a estos circuitos «Autodromo Enzo e Dino Ferrari» y «Autodromo Jose Carlos Pace», nombres que no se reconocían. Ahora sí.",
              de: "In Imola und Interlagos bekam der Coach nie seinen Video-Rundenguide (und in Imola auch keine Bremspunkte): Das Spiel nennt diese Strecken „Autodromo Enzo e Dino Ferrari“ und „Autodromo Jose Carlos Pace“, was nicht erkannt wurde. Jetzt schon.",
              it: "A Imola e Interlagos il coach non riceveva mai la sua guida video del giro (né, a Imola, i riferimenti di frenata): il gioco chiama questi circuiti «Autodromo Enzo e Dino Ferrari» e «Autodromo Jose Carlos Pace», nomi che non venivano riconosciuti. Ora sì.",
            },
          },
        ],
      },
    ],
  },
  {
    version: "1.0.6",
    date: "2026-09-22",
    dev: false,
    localized: true,
    sections: [
      {
        kind: "added",
        items: [
          {
            text: {
              en: "The two US Track Pack 2 circuits are supported: Grand Prix of Long Beach and Michelin Raceway Road Atlanta. Flags, setup folders and track maps are all in place — and the map is bundled with the app, so you see the circuit outline from your very first session instead of having to drive a full lap for it to appear.",
              fr: "Les deux circuits du US Track Pack 2 sont pris en charge : Grand Prix of Long Beach et Michelin Raceway Road Atlanta. Drapeaux, dossiers de setups et carte du circuit sont en place — et le tracé est livré avec l'application, donc tu vois la carte dès ta première session au lieu de devoir boucler un tour complet pour qu'elle apparaîsse.",
              es: "Los dos circuitos del US Track Pack 2 son compatibles: Grand Prix of Long Beach y Michelin Raceway Road Atlanta. Banderas, carpetas de setups y mapa del circuito ya están listos, y el trazado viene incluido en la aplicación: verás el mapa desde tu primera sesión en lugar de tener que completar una vuelta para que aparezca.",
              de: "Die beiden Strecken des US Track Pack 2 werden unterstützt: Grand Prix of Long Beach und Michelin Raceway Road Atlanta. Flaggen, Setup-Ordner und Streckenkarte sind vorhanden — und der Streckenverlauf ist in der App mitgeliefert, du siehst die Karte also schon in deiner ersten Sitzung, statt erst eine ganze Runde fahren zu müssen.",
              it: "I due circuiti dello US Track Pack 2 sono supportati: Grand Prix of Long Beach e Michelin Raceway Road Atlanta. Bandiere, cartelle dei setup e mappe del circuito sono tutte pronte — e la mappa è inclusa nell'app, quindi vedi il profilo del circuito fin dalla tua primissima sessione invece di dover completare un giro intero perché compaia.",
            },
          },
          {
            featured: true,
            text: {
              en: "Overlays can now be placed on any of your screens. Until now they were locked to the main one: the overlay layer covered that screen and nothing else, so a widget simply could not be dragged onto a second monitor. The layer now spans your whole desktop — switch on Edit Mode and drag a widget wherever you want it, including a side screen. Existing layouts are untouched, and the Edit Mode panel stays centred on your main screen. Each active overlay also shows which screen it sits on — the number Windows gives it, the one “Identify” displays in your display settings. Change your screen setup and nothing is lost: the overlay layer follows the new arrangement, and any widget left outside every active screen comes back to your main one. Escape always leaves Edit Mode.",
              fr: "Les overlays peuvent désormais être placés sur n'importe lequel de tes écrans. Jusqu'ici ils étaient prisonniers de l'écran principal : le calque des overlays ne couvrait que celui-ci, un widget ne pouvait donc pas être glissé sur un second moniteur. Le calque couvre maintenant tout ton bureau — active le Mode Édition et glisse un widget où tu veux, y compris sur un écran latéral. Les dispositions existantes ne bougent pas, et l'encart du Mode Édition reste centré sur ton écran principal. Chaque overlay actif indique aussi sur quel écran il se trouve — le numéro donné par Windows, celui qu'affiche « Identifier » dans tes paramètres d'affichage. Si tu changes de configuration d'écrans, rien n'est perdu : le calque suit la nouvelle disposition, et un widget resté en dehors de tout écran actif revient sur l'écran principal. Échap quitte toujours le Mode Édition.",
              es: "Ahora los overlays pueden colocarse en cualquiera de tus pantallas. Hasta ahora quedaban encerrados en la principal: la capa de overlays solo cubría esa pantalla, así que un widget no podía arrastrarse a un segundo monitor. La capa abarca ahora todo el escritorio: activa el Modo Edición y arrastra un widget donde quieras, incluida una pantalla lateral. Las disposiciones existentes no cambian, y el panel del Modo Edición sigue centrado en la pantalla principal. Cada overlay activo indica además en qué pantalla está — el número que le da Windows, el que muestra «Identificar» en la configuración de pantalla. Si cambias de configuración no se pierde nada: la capa sigue la nueva disposición y cualquier widget que quede fuera de toda pantalla activa vuelve a la principal. Escape siempre sale del Modo Edición.",
              de: "Overlays lassen sich jetzt auf jedem deiner Bildschirme platzieren. Bisher waren sie auf den Hauptbildschirm beschränkt: Die Overlay-Ebene deckte nur diesen ab, ein Widget ließ sich also nicht auf einen zweiten Monitor ziehen. Die Ebene erstreckt sich nun über den gesamten Desktop — aktiviere den Bearbeitungsmodus und zieh ein Widget dorthin, wo du es haben willst, auch auf einen seitlichen Bildschirm. Bestehende Anordnungen bleiben unverändert, und der Hinweis des Bearbeitungsmodus bleibt auf dem Hauptbildschirm zentriert. Jedes aktive Overlay zeigt zudem, auf welchem Bildschirm es liegt — die Nummer von Windows, also die, die „Identifizieren“ in den Anzeigeeinstellungen einblendet. Änderst du deine Bildschirme, geht nichts verloren: Die Ebene folgt der neuen Anordnung, und ein Widget außerhalb aller aktiven Bildschirme kehrt auf den Hauptbildschirm zurück. Escape verlässt den Bearbeitungsmodus immer.",
              it: "Ora gli overlay possono essere posizionati su qualsiasi tuo schermo. Finora erano bloccati su quello principale: il livello degli overlay copriva solo quello schermo, quindi un widget semplicemente non poteva essere trascinato su un secondo monitor. Ora il livello copre tutto il desktop — attiva la Modalità modifica e trascina un widget dove vuoi, anche su uno schermo laterale. Le disposizioni esistenti restano invariate, e il pannello della Modalità modifica resta centrato sul tuo schermo principale. Ogni overlay attivo indica anche su quale schermo si trova — il numero che gli assegna Windows, quello mostrato da «Identifica» nelle impostazioni dello schermo. Se cambi la configurazione degli schermi non si perde nulla: il livello degli overlay segue la nuova disposizione, e un widget rimasto fuori da tutti gli schermi attivi torna su quello principale. Esc esce sempre dalla Modalità modifica.",
            },
          },
        ],
      },
      {
        kind: "fixed",
        items: [
          {
            text: {
              en: "The Sessions and Records pages refresh on their own again. A session driven while the app was open was correctly imported when you came back to it — the dashboard updated — but those two pages kept showing the previous list until you changed a filter or left and came back, which looked like the session had been missed.",
              fr: "Les pages Sessions et Records se rafraîchissent à nouveau d'elles-mêmes. Une session couru pendant que l'application était ouverte était bien importée au retour sur l'app — le tableau de bord se mettait à jour — mais ces deux pages continuaient d'afficher la liste précédente jusqu'à ce qu'on change un filtre ou qu'on quitte la page, ce qui donnait l'impression que la session avait été oubliée.",
              es: "Las páginas Sesiones y Récords vuelven a actualizarse solas. Una sesión corrida con la aplicación abierta sí se importaba al volver a ella — el panel se actualizaba — pero esas dos páginas seguían mostrando la lista anterior hasta que cambiabas un filtro o salías de la página, lo que parecía que la sesión se había perdido.",
              de: "Die Seiten Sitzungen und Rekorde aktualisieren sich wieder von selbst. Eine Sitzung, die bei geöffneter App gefahren wurde, wurde bei der Rückkehr korrekt importiert — die Übersicht aktualisierte sich — aber diese beiden Seiten zeigten weiter die vorherige Liste, bis man einen Filter änderte oder die Seite verließ, was so aussah, als wäre die Sitzung übersehen worden.",
              it: "Le pagine Sessioni e Record si aggiornano di nuovo da sole. Una sessione guidata mentre l'app era aperta veniva importata correttamente quando ci tornavi — la dashboard si aggiornava — ma quelle due pagine continuavano a mostrare l'elenco precedente finché non cambiavi un filtro o uscivi e rientravi, dando l'impressione che la sessione fosse stata persa.",
            },
          },
        ],
      },
    ],
  },
  {
    version: "1.0.5",
    date: "2026-09-20",
    localized: true,
    sections: [
      {
        kind: "added",
        items: [
          {
            text: {
              en: "The welcome screen can now be skipped. If Le Mans Ultimate is not installed on this computer — or you simply want to look around first — “Continue without the game” opens the app straight away. A banner reminds you that nothing is indexed and reopens the setup wizard in one click, and the wizard comes back on the next launch as long as no folder has been set.",
              fr: "L'écran d'accueil peut maintenant être passé. Si Le Mans Ultimate n'est pas installé sur cet ordinateur — ou si vous voulez simplement jeter un œil à l'outil — « Continuer sans le jeu » ouvre l'application directement. Une bannière rappelle qu'aucune donnée n'est indexée et rouvre l'assistant en un clic, et l'assistant revient au prochain lancement tant qu'aucun dossier n'a été renseigné.",
              es: "Ahora se puede omitir la pantalla de bienvenida. Si Le Mans Ultimate no está instalado en este ordenador — o simplemente quieres echar un vistazo — «Continuar sin el juego» abre la aplicación directamente. Un aviso recuerda que no hay datos indexados y reabre el asistente con un clic, y el asistente vuelve en el próximo inicio mientras no se haya indicado ninguna carpeta.",
              de: "Der Willkommensbildschirm lässt sich jetzt überspringen. Ist Le Mans Ultimate auf diesem Rechner nicht installiert — oder willst du dich einfach erst umsehen — öffnet „Ohne das Spiel fortfahren“ die App direkt. Ein Hinweisbanner erinnert daran, dass nichts indiziert ist, und öffnet den Assistenten mit einem Klick erneut; der Assistent erscheint beim nächsten Start wieder, solange kein Ordner angegeben wurde.",
              it: "Ora la schermata di benvenuto si può saltare. Se Le Mans Ultimate non è installato su questo computer — o vuoi semplicemente dare prima un'occhiata — «Continua senza il gioco» apre subito l'app. Un banner ti ricorda che non è indicizzato nulla e riapre la procedura guidata con un clic, e la procedura guidata ricompare all'avvio successivo finché non è stata impostata nessuna cartella.",
            },
          },
        ],
      },
      {
        kind: "fixed",
        items: [
          {
            featured: true,
            text: {
              en: "Drop-down menus open again everywhere in the app. Every menu — the filters on References, Sessions, Dashboard, Records and Telemetry, the car and circuit pickers in Setups, the settings in Config — relied on Windows to draw its list. On some setups, typically several screens with different scalings, that list appeared off-screen or empty: a coloured frame lit up around the field and nothing could be selected. The application now draws all these menus itself, right under the field, with the app's own colours, a check mark on the current choice and keyboard navigation. The two remaining controls that depended on a system window went the same way: the model-name suggestions in the AI settings, and the overlay accent colour, which now opens an in-app picker with a hue bar, a hex field and preset swatches.",
              fr: "Les menus déroulants s'ouvrent à nouveau partout dans l'application. Chacun d'eux — les filtres de Références, Sessions, Tableau de bord, Records et Télémétrie, les sélecteurs de voiture et de circuit des Setups, les réglages de la Config — laissait Windows afficher sa liste. Sur certaines configurations, typiquement plusieurs écrans avec des mises à l'échelle différentes, cette liste s'ouvrait hors de l'écran ou vide : un cadre coloré apparaissait autour du champ sans qu'on puisse rien sélectionner. L'application dessine désormais tous ces menus elle-même, juste sous le champ, à ses couleurs, avec une coche sur le choix courant et la navigation au clavier. Les deux derniers contrôles qui dépendaient d'une fenêtre système y passent aussi : les suggestions de nom de modèle dans les réglages IA, et la couleur d'accent des overlays, qui ouvre maintenant un sélecteur intégré avec barre de teinte, saisie hexadécimale et préréglages.",
              es: "Los menús desplegables vuelven a abrirse en toda la aplicación. Todos ellos — los filtros de Referencias, Sesiones, Panel, Récords y Telemetría, los selectores de coche y circuito de los Setups, los ajustes de la Configuración — dejaban que Windows mostrara su lista. En algunas configuraciones, normalmente varias pantallas con escalados distintos, esa lista aparecía fuera de pantalla o vacía: solo se veía un marco de color alrededor del campo y no se podía seleccionar nada. Ahora la aplicación dibuja todos estos menús por sí misma, justo debajo del campo, con sus colores, una marca en la opción actual y navegación con el teclado. Los dos últimos controles que dependían de una ventana del sistema siguen el mismo camino: las sugerencias de nombre de modelo en los ajustes de IA y el color de acento de los overlays, que ahora abre un selector integrado con barra de tono, campo hexadecimal y colores predefinidos.",
              de: "Aufklappmenüs lassen sich in der ganzen Anwendung wieder öffnen. Jedes von ihnen — die Filter in Referenzen, Sitzungen, Übersicht, Rekorde und Telemetrie, die Fahrzeug- und Streckenauswahl in den Setups, die Einstellungen in der Konfiguration — überließ die Liste Windows. Auf manchen Systemen, typischerweise mehrere Bildschirme mit unterschiedlicher Skalierung, erschien diese Liste außerhalb des Bildschirms oder leer: Um das Feld leuchtete nur ein farbiger Rahmen, auswählen ließ sich nichts. Die Anwendung zeichnet jetzt all diese Menüs selbst, direkt unter dem Feld, in ihren Farben, mit einem Haken bei der aktuellen Auswahl und Tastaturbedienung. Die beiden letzten Bedienelemente, die auf ein Systemfenster angewiesen waren, folgen ebenfalls: die Modellnamen-Vorschläge in den KI-Einstellungen und die Akzentfarbe der Overlays, die jetzt einen integrierten Farbwähler mit Farbtonleiste, Hex-Feld und Vorgaben öffnet.",
              it: "I menu a tendina si aprono di nuovo ovunque nell'app. Ogni menu — i filtri di Riferimenti, Sessioni, Dashboard, Record e Telemetria, i selettori di vettura e circuito in Setup, le opzioni della pagina Impostazioni — lasciava a Windows il compito di disegnare l'elenco. Su alcune configurazioni, tipicamente più schermi con ridimensionamenti diversi, quell'elenco compariva fuori dallo schermo o vuoto: una cornice colorata si accendeva attorno al campo e non si poteva selezionare nulla. Ora l'applicazione disegna da sé tutti questi menu, proprio sotto il campo, con i colori dell'app, un segno di spunta sulla scelta corrente e la navigazione da tastiera. Anche gli ultimi due controlli che dipendevano da una finestra di sistema hanno fatto la stessa fine: i suggerimenti del nome del modello nelle impostazioni IA, e il colore d'accento degli overlay, che ora apre un selettore integrato con barra della tonalità, campo esadecimale e campioni predefiniti.",
            },
          },
          {
            featured: true,
            text: {
              en: "Purging empty sessions can no longer wipe your whole history. If the player name in Config did not exactly match the name in the result files (renamed in-game, a stray space, settings reset), the “player” purge treated every file as empty and deleted them all from disk. The purge is now refused, with an explanation, whenever no session is recognised as yours, and files are only deleted once the database change has been safely committed.",
              fr: "La purge des sessions vides ne peut plus effacer tout votre historique. Si le nom de joueur de la Config ne correspondait pas exactement au nom présent dans les fichiers de résultats (pseudo changé en jeu, espace en trop, configuration réinitialisée), la purge « joueur » considérait tous les fichiers comme vides et les supprimait du disque. La purge est désormais refusée, avec une explication, dès qu'aucune session n'est reconnue comme la vôtre, et les fichiers ne sont supprimés qu'une fois la base mise à jour sans erreur.",
              es: "La purga de sesiones vacías ya no puede borrar todo tu historial. Si el nombre de jugador de la Configuración no coincidía exactamente con el de los archivos de resultados (alias cambiado en el juego, un espacio de más, configuración reiniciada), la purga «jugador» consideraba vacíos todos los archivos y los borraba del disco. Ahora la purga se rechaza, con una explicación, en cuanto ninguna sesión se reconoce como tuya, y los archivos solo se borran tras guardar los cambios en la base de datos.",
              de: "Das Bereinigen leerer Sitzungen kann nicht mehr den gesamten Verlauf löschen. Stimmte der Spielername in der Konfiguration nicht exakt mit dem Namen in den Ergebnisdateien überein (im Spiel geändert, ein zusätzliches Leerzeichen, zurückgesetzte Einstellungen), hielt die „Spieler“-Bereinigung alle Dateien für leer und löschte sie von der Festplatte. Die Bereinigung wird jetzt mit einer Erklärung abgelehnt, sobald keine Sitzung als deine erkannt wird, und Dateien werden erst nach erfolgreichem Speichern in der Datenbank entfernt.",
              it: "L'eliminazione delle sessioni vuote non può più cancellare tutto il tuo storico. Se il nome del giocatore nelle Impostazioni non corrispondeva esattamente al nome nei file dei risultati (rinominato nel gioco, uno spazio di troppo, impostazioni ripristinate), l'eliminazione «giocatore» considerava vuoti tutti i file e li cancellava tutti dal disco. Ora l'eliminazione viene rifiutata, con una spiegazione, ogni volta che nessuna sessione viene riconosciuta come tua, e i file vengono cancellati solo dopo che la modifica al database è stata salvata in modo sicuro.",
            },
          },
          {
            featured: true,
            text: {
              en: "Your car setups are protected against corruption. Saving a setup or a note now writes to a temporary file first and keeps a .bak copy, so a crash or an antivirus can no longer leave a truncated .svm the game refuses to load. Edits also start from the file on disk instead of the last scan, so changes you made in-game are no longer silently overwritten. Creating or duplicating a setup never overwrites an existing one, and setup names can no longer write outside the game folder.",
              fr: "Vos setups sont protégés contre la corruption. L'enregistrement d'un setup ou d'une note passe maintenant par un fichier temporaire et conserve une copie .bak : un plantage ou un antivirus ne peut plus laisser un .svm tronqué que le jeu refuse de charger. Les modifications repartent du fichier réel et non du dernier scan, si bien que les réglages faits dans le jeu ne sont plus écrasés en silence. Créer ou dupliquer un setup n'écrase jamais un fichier existant, et un nom de setup ne peut plus écrire hors du dossier du jeu.",
              es: "Tus setups están protegidos contra la corrupción. Guardar un setup o una nota pasa ahora por un archivo temporal y conserva una copia .bak: un cierre inesperado o un antivirus ya no puede dejar un .svm truncado que el juego rechace. Las ediciones parten del archivo real y no del último escaneo, así que los ajustes hechos en el juego ya no se sobrescriben en silencio. Crear o duplicar un setup nunca sobrescribe uno existente, y un nombre de setup ya no puede escribir fuera de la carpeta del juego.",
              de: "Deine Setups sind vor Beschädigung geschützt. Ein Setup oder eine Notiz zu speichern läuft jetzt über eine temporäre Datei und behält eine .bak-Kopie: Ein Absturz oder ein Virenscanner kann keine abgeschnittene .svm mehr hinterlassen, die das Spiel nicht lädt. Änderungen gehen von der echten Datei aus statt vom letzten Scan, sodass im Spiel gemachte Einstellungen nicht mehr stillschweigend überschrieben werden. Anlegen oder Duplizieren überschreibt nie ein vorhandenes Setup, und ein Setup-Name kann nicht mehr außerhalb des Spielordners schreiben.",
              it: "I tuoi setup sono protetti dalla corruzione. Il salvataggio di un setup o di una nota ora scrive prima in un file temporaneo e conserva una copia .bak, così un crash o un antivirus non possono più lasciare un .svm troncato che il gioco si rifiuta di caricare. Le modifiche ora partono dal file su disco invece che dall'ultima scansione, quindi le modifiche fatte nel gioco non vengono più sovrascritte in silenzio. Creare o duplicare un setup non sovrascrive mai uno esistente, e i nomi dei setup non possono più scrivere fuori dalla cartella del gioco.",
            },
          },
          {
            en: "Exporting a setup now asks where to save it. The file used to be written to the application's working folder under the setup name, where it was impossible to find — or failed outright for lack of permissions.",
            fr: "L'export d'un setup demande maintenant où l'enregistrer. Le fichier était auparavant écrit dans le dossier de travail de l'application sous le nom du setup, où il était introuvable — quand il n'échouait pas faute de droits.",
            es: "Exportar un setup ahora pregunta dónde guardarlo. Antes el archivo se escribía en la carpeta de trabajo de la aplicación con el nombre del setup, donde era imposible de encontrar, o fallaba por falta de permisos.",
            de: "Der Setup-Export fragt jetzt nach dem Speicherort. Zuvor wurde die Datei unter dem Setup-Namen in den Arbeitsordner der Anwendung geschrieben, wo sie nicht auffindbar war — oder mangels Rechten scheiterte.",
            it: "L'esportazione di un setup ora chiede dove salvarlo. Prima il file veniva scritto nella cartella di lavoro dell'applicazione con il nome del setup, dove era impossibile trovarlo — o falliva del tutto per mancanza di permessi.",
          },
          {
            featured: true,
            text: {
              en: "A long AI analysis is no longer cut off after one minute. The request had a sixty second budget covering the whole answer, so a detailed analysis on a reasoning model was interrupted mid-sentence and everything already received was thrown away, leaving only a network error. The time limit now applies to silence between packets, not to the total length, and any text already received is kept and flagged as incomplete.",
              fr: "Une longue analyse IA n'est plus coupée au bout d'une minute. La requête disposait de soixante secondes pour l'ensemble de la réponse : une analyse détaillée sur un modèle de raisonnement était donc interrompue en pleine phrase, et tout ce qui était déjà reçu était jeté, ne laissant qu'une erreur réseau. Le délai porte désormais sur le silence entre deux paquets, pas sur la durée totale, et le texte déjà reçu est conservé et signalé comme incomplet.",
              es: "Un análisis largo de la IA ya no se corta al cabo de un minuto. La petición disponía de sesenta segundos para toda la respuesta: un análisis detallado en un modelo de razonamiento se interrumpía a media frase y todo lo ya recibido se descartaba, dejando solo un error de red. Ahora el límite se aplica al silencio entre paquetes, no a la duración total, y el texto ya recibido se conserva y se marca como incompleto.",
              de: "Eine lange KI-Analyse wird nicht mehr nach einer Minute abgeschnitten. Die Anfrage hatte sechzig Sekunden für die gesamte Antwort: Eine ausführliche Analyse auf einem Reasoning-Modell wurde mitten im Satz unterbrochen und alles bereits Empfangene verworfen, übrig blieb nur ein Netzwerkfehler. Die Frist gilt jetzt für die Stille zwischen zwei Paketen, nicht für die Gesamtdauer, und bereits empfangener Text bleibt erhalten und wird als unvollständig gekennzeichnet.",
              it: "Una lunga analisi IA non viene più interrotta dopo un minuto. La richiesta aveva un limite di sessanta secondi per l'intera risposta, quindi un'analisi dettagliata con un modello di ragionamento veniva interrotta a metà frase e tutto ciò che era già stato ricevuto veniva scartato, lasciando solo un errore di rete. Ora il limite di tempo si applica al silenzio tra un pacchetto e l'altro, non alla durata totale, e il testo già ricevuto viene conservato e segnalato come incompleto.",
            },
          },
          {
            en: "Accented characters no longer turn into garbage in AI answers. Network packets regularly split a character in two, and each packet was decoded on its own, so letters like é or à became a replacement symbol in the middle of a sentence. Text is now decoded one complete line at a time.",
            fr: "Les caractères accentués ne se transforment plus en symboles parasites dans les réponses de l'IA. Les paquets réseau coupent régulièrement un caractère en deux, et chaque paquet était décodé isolément : un é ou un à devenait donc un symbole de remplacement au milieu d'une phrase. Le texte est maintenant décodé ligne complète par ligne complète.",
            es: "Los caracteres acentuados ya no se convierten en símbolos extraños en las respuestas de la IA. Los paquetes de red cortan a menudo un carácter en dos, y cada paquete se decodificaba por separado: una é o una à se convertía en un símbolo de reemplazo en mitad de una frase. Ahora el texto se decodifica línea completa a línea completa.",
            de: "Akzentzeichen werden in KI-Antworten nicht mehr zu Störzeichen. Netzwerkpakete zerteilen regelmäßig ein Zeichen, und jedes Paket wurde einzeln dekodiert: Ein é oder à wurde so mitten im Satz zu einem Ersatzzeichen. Text wird jetzt vollständige Zeile für vollständige Zeile dekodiert.",
            it: "I caratteri accentati non si trasformano più in simboli strani nelle risposte dell'IA. I pacchetti di rete spezzano regolarmente un carattere in due, e ogni pacchetto veniva decodificato da solo, così lettere come é o à diventavano un simbolo di sostituzione a metà frase. Ora il testo viene decodificato una riga completa alla volta.",
          },
          {
            en: "Errors reported by the AI provider mid-answer are now shown. An overload, a quota limit or a safety filter could arrive inside the stream while the request itself reported success. The answer simply came back empty or truncated with no explanation at all.",
            fr: "Les erreurs signalées par le fournisseur d'IA en cours de réponse sont maintenant affichées. Une surcharge, une limite de quota ou un filtre de sécurité pouvaient arriver à l'intérieur du flux alors que la requête elle-même annonçait un succès. La réponse revenait alors vide ou tronquée, sans la moindre explication.",
            es: "Los errores que el proveedor de IA notifica durante la respuesta ahora se muestran. Una sobrecarga, un límite de cuota o un filtro de seguridad podían llegar dentro del flujo mientras la petición se declaraba correcta. La respuesta volvía vacía o truncada, sin explicación alguna.",
            de: "Fehler, die der KI-Anbieter mitten in der Antwort meldet, werden jetzt angezeigt. Überlastung, Kontingentgrenze oder ein Sicherheitsfilter konnten im Datenstrom auftreten, während die Anfrage selbst Erfolg meldete. Die Antwort kam dann leer oder abgeschnitten zurück, ganz ohne Erklärung.",
            it: "Gli errori segnalati dal fornitore di IA durante la risposta ora vengono mostrati. Un sovraccarico, un limite di quota o un filtro di sicurezza potevano arrivare all'interno del flusso mentre la richiesta stessa risultava riuscita. La risposta tornava semplicemente vuota o troncata, senza alcuna spiegazione.",
          },
          {
            en: "Claude answers no longer come back empty on short questions. The reasoning tokens count against the output budget, and the voice coach budget was small enough for the model to spend all of it thinking. Worse, the resulting empty answer stayed in the conversation and made every following question fail.",
            fr: "Les réponses de Claude ne reviennent plus vides sur les questions courtes. Les tokens de raisonnement sont décomptés du budget de sortie, et celui du coach vocal était assez petit pour que le modèle le dépense entièrement à réfléchir. Pire, la réponse vide obtenue restait dans la conversation et faisait échouer toutes les questions suivantes.",
            es: "Las respuestas de Claude ya no vuelven vacías en preguntas cortas. Los tokens de razonamiento se descuentan del presupuesto de salida, y el del coach de voz era lo bastante pequeño como para que el modelo lo gastara entero pensando. Peor aún, la respuesta vacía se quedaba en la conversación y hacía fallar todas las preguntas siguientes.",
            de: "Claude-Antworten kommen bei kurzen Fragen nicht mehr leer zurück. Die Reasoning-Tokens werden vom Ausgabebudget abgezogen, und das des Sprach-Coaches war klein genug, dass das Modell es komplett fürs Denken verbrauchte. Schlimmer noch: Die leere Antwort blieb im Gespräch und ließ jede weitere Frage scheitern.",
            it: "Le risposte di Claude non tornano più vuote sulle domande brevi. I token di ragionamento vengono conteggiati nel budget di output, e quello del coach vocale era abbastanza piccolo da permettere al modello di spenderlo tutto a ragionare. Peggio ancora, la risposta vuota restava nella conversazione e faceva fallire tutte le domande successive.",
          },
          {
            en: "Your Google API key can no longer leak into an error message. It travelled as part of the web address, and network errors include that address, so it appeared on screen and in any screenshot sent to report a bug. It is now sent as a private header, and addresses are stripped from error messages.",
            fr: "Votre clé d'API Google ne peut plus fuiter dans un message d'erreur. Elle voyageait dans l'adresse web, et les erreurs réseau reprennent cette adresse : elle s'affichait donc à l'écran, et dans toute capture envoyée pour signaler un bug. Elle est désormais transmise dans un en-tête privé, et les adresses sont retirées des messages d'erreur.",
            es: "Tu clave de API de Google ya no puede filtrarse en un mensaje de error. Viajaba dentro de la dirección web, y los errores de red incluyen esa dirección: aparecía en pantalla y en cualquier captura enviada para reportar un fallo. Ahora se envía en una cabecera privada y las direcciones se eliminan de los mensajes de error.",
            de: "Dein Google-API-Schlüssel kann nicht mehr in eine Fehlermeldung gelangen. Er reiste in der Webadresse mit, und Netzwerkfehler enthalten diese Adresse: Er erschien auf dem Bildschirm und in jedem Screenshot, der zur Fehlermeldung verschickt wurde. Er wird jetzt in einem privaten Header übertragen, und Adressen werden aus Fehlermeldungen entfernt.",
            it: "La tua chiave API di Google non può più trapelare in un messaggio di errore. Viaggiava all'interno dell'indirizzo web, e gli errori di rete includono quell'indirizzo, quindi compariva sullo schermo e in qualsiasi screenshot inviato per segnalare un bug. Ora viene inviata in un header privato, e gli indirizzi vengono rimossi dai messaggi di errore.",
          },
          {
            featured: true,
            text: {
              en: "Wheelspin and lockup are now measured, not guessed. Both verdicts used to be inferred from longitudinal acceleration: “full throttle with little acceleration” means wheelspin, which is also the normal state of a Hypercar through a fast corner and on every upshift. The coach now reads the actual slip of each wheel, so it calls wheelspin when a driven wheel really spins, and a lockup when a wheel really stops turning.",
              fr: "Le patinage et le blocage sont maintenant mesurés, plus devinés. Les deux verdicts étaient déduits de l'accélération longitudinale : « plein gaz avec peu d'accélération » signifiait patinage, ce qui est aussi l'état normal d'une Hypercar en virage rapide et à chaque passage de rapport. Le coach lit désormais le glissement réel de chaque roue. Il annonce donc un patinage quand une roue motrice patine vraiment, et un blocage quand une roue cesse vraiment de tourner.",
              es: "El patinaje y el bloqueo ahora se miden, no se deducen. Ambos veredictos se inferían de la aceleración longitudinal: «a fondo con poca aceleración» significaba patinaje, que es también el estado normal de un Hypercar en curva rápida y en cada cambio de marcha. El coach lee ahora el deslizamiento real de cada rueda. Así avisa de patinaje cuando una rueda motriz patina de verdad, y de bloqueo cuando una rueda deja realmente de girar.",
              de: "Durchdrehen und Blockieren werden jetzt gemessen statt geschätzt. Beide Urteile wurden aus der Längsbeschleunigung abgeleitet: „Vollgas bei wenig Beschleunigung“ hieß Durchdrehen, was auch der Normalzustand eines Hypercars in schnellen Kurven und bei jedem Hochschalten ist. Der Coach liest nun den tatsächlichen Schlupf jedes Rades. Er meldet Durchdrehen, wenn ein Antriebsrad wirklich durchdreht, und Blockieren, wenn ein Rad wirklich stehen bleibt.",
              it: "Pattinamento e bloccaggi ora vengono misurati, non indovinati. Entrambi i verdetti erano dedotti dall'accelerazione longitudinale: «gas a fondo con poca accelerazione» significava pattinamento, che però è anche lo stato normale di una Hypercar in una curva veloce e a ogni cambiata in salita. Ora il coach legge lo slittamento reale di ogni ruota, quindi segnala un pattinamento quando una ruota motrice slitta davvero, e un bloccaggio quando una ruota smette davvero di girare.",
            },
          },
          {
            featured: true,
            text: {
              en: "“Lift and coast” no longer fires all race long. The advice compared your fuel against what is needed to reach the end of the session. In any race with a mandatory pit stop that is impossible from lap one, so the coach kept telling you to save fuel for hours while the plan was simply to refuel. It now only speaks when the shortfall is small enough to actually be recovered by lifting.",
              fr: "Le conseil « lève et laisse rouler » ne tombe plus toute la course. Il comparait votre carburant à ce qu'il faut pour rejoindre la fin de la session. Dans toute course à ravitaillement obligatoire, c'est impossible dès le premier tour : le coach vous demandait donc d'économiser pendant des heures alors que le plan était simplement de refaire le plein. Il ne parle désormais que si le manque est assez faible pour être réellement comblé en levant le pied.",
              es: "El consejo de «levantar y rodar» ya no salta durante toda la carrera. Comparaba tu combustible con el necesario para llegar al final de la sesión. En cualquier carrera con parada obligatoria eso es imposible desde la primera vuelta, así que el coach te pedía ahorrar durante horas cuando el plan era simplemente repostar. Ahora solo habla si la falta es lo bastante pequeña como para compensarse levantando el pie.",
              de: "Der Hinweis „Lift and Coast“ kommt nicht mehr das ganze Rennen über. Er verglich deinen Kraftstoff mit dem Bedarf bis zum Sitzungsende. In jedem Rennen mit Pflichtstopp ist das ab der ersten Runde unmöglich, also forderte der Coach stundenlang zum Sparen auf, obwohl schlicht ein Tankstopp geplant war. Er meldet sich jetzt nur, wenn der Fehlbetrag klein genug ist, um durch Lupfen wirklich aufgeholt zu werden.",
              it: "Il consiglio «lift and coast» non scatta più per tutta la gara. Confrontava il tuo carburante con quello necessario per arrivare alla fine della sessione. In qualsiasi gara con pit stop obbligatorio questo è impossibile dal primo giro, quindi il coach continuava a dirti di risparmiare carburante per ore mentre il piano era semplicemente fare rifornimento. Ora parla solo quando la carenza è abbastanza piccola da poter essere davvero recuperata alzando il piede.",
            },
          },
          {
            en: "Tyre fade detection is far less trigger-happy. It judged fade from two passes only, with a threshold at the level of normal lap-to-lap noise, and it counted laps spent behind a slower car. It also used your two out-laps on cold tyres as the reference, which hid real degradation. It now ignores the warm-up laps, skips passes made in traffic, and needs a longer run of clean laps.",
            fr: "La détection d'usure des pneus se déclenche beaucoup moins à tort. Elle jugeait sur deux passages seulement, avec un seuil au niveau du bruit normal d'un tour à l'autre, et comptait les tours passés derrière une voiture plus lente. Elle prenait aussi vos deux tours de sortie sur pneus froids comme référence, ce qui masquait les vraies dégradations. Elle ignore désormais les tours de chauffe, écarte les passages dans le trafic et exige une série de tours propres plus longue.",
            es: "La detección de degradación de neumáticos salta mucho menos por error. Juzgaba con solo dos pasadas, con un umbral al nivel del ruido normal entre vueltas, y contaba las vueltas detrás de un coche más lento. También tomaba tus dos vueltas de salida con neumáticos fríos como referencia, lo que ocultaba las degradaciones reales. Ahora ignora las vueltas de calentamiento, descarta las pasadas en tráfico y exige una serie más larga de vueltas limpias.",
            de: "Die Reifenabbau-Erkennung schlägt deutlich seltener fälschlich an. Sie urteilte über nur zwei Durchfahrten, mit einer Schwelle auf dem Niveau des normalen Rundenrauschens, und zählte Runden hinter einem langsameren Auto mit. Sie nahm zudem deine beiden Auslaufrunden auf kalten Reifen als Referenz, was echten Abbau verdeckte. Jetzt ignoriert sie die Aufwärmrunden, verwirft Durchfahrten im Verkehr und verlangt eine längere Serie sauberer Runden.",
            it: "Il rilevamento del calo delle gomme scatta molto meno a sproposito. Giudicava il calo su due soli passaggi, con una soglia al livello del normale rumore da un giro all'altro, e contava i giri passati dietro una vettura più lenta. Usava anche i tuoi due giri di uscita su gomme fredde come riferimento, il che nascondeva il degrado reale. Ora ignora i giri di riscaldamento, scarta i passaggi fatti nel traffico e richiede una serie più lunga di giri puliti.",
          },
          {
            en: "Track-limit warnings now name the right corner. A cut happens on the exit kerb, before the corner is considered finished, so the count was charged to the previous corner. You could be told off for a corner you had taken cleanly.",
            fr: "Les avertissements de limites de piste désignent maintenant le bon virage. Une coupure a lieu sur le vibreur de sortie, avant que le virage ne soit considéré comme terminé, si bien que le compte était porté au virage précédent. Vous pouviez vous faire reprocher un virage que vous aviez parfaitement négocié.",
            es: "Los avisos de límites de pista ahora nombran la curva correcta. Un pisado ocurre en el piano de salida, antes de que la curva se considere terminada, así que se cargaba a la curva anterior. Podían reprocharte una curva que habías tomado limpiamente.",
            de: "Warnungen zu Streckenbegrenzungen nennen jetzt die richtige Kurve. Ein Verstoß passiert am Ausgangskerb, bevor die Kurve als beendet gilt, sodass er der vorherigen Kurve angelastet wurde. Man konnte für eine Kurve gerügt werden, die man sauber gefahren hatte.",
            it: "Gli avvisi sui limiti della pista ora indicano la curva giusta. Un taglio avviene sul cordolo in uscita, prima che la curva sia considerata conclusa, quindi il conteggio veniva attribuito alla curva precedente. Potevi essere ripreso per una curva che avevi affrontato in modo pulito.",
          },
          {
            en: "A new reference lap can be recorded again after a game update. Once the game changed the car's performance, no lap could beat the old reference any more, and the coach stayed stuck giving relative advice for good. It now replaces a reference that no longer matches the current conditions.",
            fr: "Un nouveau tour de référence peut de nouveau être enregistré après une mise à jour du jeu. Dès que le jeu changeait les performances de la voiture, plus aucun tour ne battait l'ancienne référence et le coach restait bloqué sur des conseils relatifs pour de bon. Il remplace désormais une référence qui ne correspond plus aux conditions du moment.",
            es: "Se puede volver a registrar una vuelta de referencia tras una actualización del juego. En cuanto el juego cambiaba el rendimiento del coche, ninguna vuelta batía la referencia antigua y el coach se quedaba dando consejos relativos para siempre. Ahora sustituye una referencia que ya no corresponde a las condiciones actuales.",
            de: "Nach einem Spiel-Update kann wieder eine neue Referenzrunde aufgezeichnet werden. Sobald das Spiel die Fahrzeugleistung änderte, schlug keine Runde mehr die alte Referenz, und der Coach blieb dauerhaft bei relativen Hinweisen. Er ersetzt jetzt eine Referenz, die nicht mehr zu den aktuellen Bedingungen passt.",
            it: "Dopo un aggiornamento del gioco si può di nuovo registrare un nuovo giro di riferimento. Quando il gioco cambiava le prestazioni della vettura, nessun giro poteva più battere il vecchio riferimento, e il coach restava bloccato per sempre su consigli relativi. Ora sostituisce un riferimento che non corrisponde più alle condizioni attuali.",
          },
          {
            en: "Your corner-by-corner progress is no longer thrown away. Progress needs three passes through a corner to be summarised, but everything was discarded on each pit entry. With short runs interrupted by trips back to the garage, no corner ever reached three passes, so the history stayed permanently empty and Drill mode had no targets. Passes now accumulate across short runs.",
            fr: "Votre progression virage par virage n'est plus jetée. Le résumé exige trois passages dans un virage, mais tout était effacé à chaque entrée aux stands. Avec des sorties courtes entrecoupées de retours au garage, aucun virage n'atteignait jamais trois passages : l'historique restait vide en permanence et le mode Drill n'avait aucune cible. Les passages s'accumulent désormais d'une sortie à l'autre.",
            es: "Tu progresión curva a curva ya no se descarta. El resumen exige tres pasadas por una curva, pero todo se borraba en cada entrada a boxes. Con salidas cortas interrumpidas por vueltas al garaje, ninguna curva llegaba nunca a tres pasadas: el historial quedaba vacío permanentemente y el modo Drill no tenía objetivos. Ahora las pasadas se acumulan entre salidas.",
            de: "Dein Fortschritt Kurve für Kurve wird nicht mehr verworfen. Die Auswertung braucht drei Durchfahrten pro Kurve, doch alles wurde bei jeder Boxeneinfahrt gelöscht. Bei kurzen Ausfahrten mit Rückkehr in die Garage erreichte keine Kurve je drei Durchfahrten: Der Verlauf blieb dauerhaft leer und der Drill-Modus hatte keine Ziele. Durchfahrten summieren sich jetzt über kurze Ausfahrten hinweg.",
            it: "I tuoi progressi curva per curva non vengono più buttati via. Per essere riassunti, i progressi richiedono tre passaggi in una curva, ma tutto veniva scartato a ogni ingresso ai box. Con uscite brevi interrotte da rientri al garage, nessuna curva raggiungeva mai tre passaggi, quindi lo storico restava sempre vuoto e la modalità Drill non aveva obiettivi. Ora i passaggi si accumulano da un'uscita all'altra.",
          },
          {
            featured: true,
            text: {
              en: "The voice coach no longer talks over your braking. A tip could start just before the finish line and end in the braking zone of turn 1, because the quiet window ignored the next lap. Stint, track-limits, drill and session-recall messages bypassed that window entirely and spoke the instant they were computed, often mid corner exit. All of them now wait for the same quiet window as the rest of the coaching.",
              fr: "Le coach vocal ne parle plus par-dessus vos freinages. Un conseil pouvait démarrer juste avant la ligne d'arrivée et se terminer dans la zone de freinage du virage 1, parce que la fenêtre de silence ignorait le tour suivant. Les messages de relais, de limites de piste, de drill et de rappel de session contournaient carrément cette fenêtre et parlaient dès leur calcul, souvent en pleine sortie de virage. Ils attendent désormais tous la même fenêtre calme que le reste du coaching.",
              es: "El coach de voz ya no habla encima de tus frenadas. Un consejo podía empezar justo antes de la línea de meta y acabar en la zona de frenada de la curva 1, porque la ventana de silencio ignoraba la vuelta siguiente. Los mensajes de stint, límites de pista, drill y recordatorio de sesión se saltaban esa ventana y hablaban nada más calcularse, a menudo en plena salida de curva. Ahora todos esperan la misma ventana tranquila que el resto del coaching.",
              de: "Der Sprach-Coach redet nicht mehr in deine Bremsphasen hinein. Ein Hinweis konnte kurz vor der Ziellinie beginnen und in der Bremszone von Kurve 1 enden, weil das Ruhefenster die nächste Runde ignorierte. Meldungen zu Stint, Streckenbegrenzung, Drill und Sitzungserinnerung umgingen dieses Fenster ganz und sprachen sofort nach der Berechnung, oft mitten im Kurvenausgang. Sie warten jetzt alle auf dasselbe ruhige Fenster wie der Rest des Coachings.",
              it: "Il coach vocale non parla più sopra le tue staccate. Un consiglio poteva iniziare poco prima del traguardo e finire nella zona di frenata della curva 1, perché la finestra di silenzio ignorava il giro successivo. I messaggi di stint, limiti della pista, drill e richiamo della sessione aggiravano del tutto quella finestra e parlavano nell'istante in cui venivano calcolati, spesso in piena uscita di curva. Ora aspettano tutti la stessa finestra tranquilla del resto del coaching.",
            },
          },
          {
            en: "The voice coach no longer goes silent when you are alone on track. With no car ahead, the gap was read as “zero seconds” instead of “clear track”, so no lap ever qualified as a reference and the coach stayed quiet for the whole session.",
            fr: "Le coach vocal ne reste plus muet quand vous êtes seul en piste. Sans voiture devant, l'écart était lu comme « zéro seconde » au lieu de « piste libre » : aucun tour n'était retenu comme référence et le coach se taisait toute la session.",
            es: "El coach de voz ya no se queda mudo cuando estás solo en pista. Sin coche delante, la diferencia se leía como «cero segundos» en lugar de «pista libre»: ninguna vuelta se tomaba como referencia y el coach callaba toda la sesión.",
            de: "Der Sprach-Coach verstummt nicht mehr, wenn du allein auf der Strecke bist. Ohne Fahrzeug vor dir wurde der Abstand als „null Sekunden“ statt „freie Strecke“ gelesen: Keine Runde wurde als Referenz akzeptiert und der Coach schwieg die ganze Sitzung.",
            it: "Il coach vocale non resta più in silenzio quando sei da solo in pista. Senza nessuna vettura davanti, il distacco veniva letto come «zero secondi» invece di «pista libera», quindi nessun giro risultava valido come riferimento e il coach restava zitto per tutta la sessione.",
          },
          {
            en: "The voice coach keeps working after a session change. Going from practice to qualifying or to the race — or restarting a session — reset the game's lap counter, and the coach stopped registering laps for good: no reference lap, no calibration, no advice for the rest of the event.",
            fr: "Le coach vocal continue de fonctionner après un changement de session. Passer des essais à la qualif ou à la course — ou redémarrer une session — remettait à zéro le compteur de tours du jeu, et le coach cessait définitivement d'enregistrer les tours : plus de tour de référence, plus de calibration, plus aucun conseil pour le reste de l'événement.",
            es: "El coach de voz sigue funcionando tras un cambio de sesión. Pasar de entrenamientos a clasificación o a carrera — o reiniciar una sesión — ponía a cero el contador de vueltas del juego, y el coach dejaba de registrar vueltas para siempre: sin vuelta de referencia, sin calibración y sin consejos durante el resto del evento.",
            de: "Der Sprach-Coach arbeitet nach einem Sitzungswechsel weiter. Der Wechsel vom Training zum Qualifying oder Rennen — oder ein Neustart der Sitzung — setzte den Rundenzähler des Spiels zurück, und der Coach erfasste endgültig keine Runden mehr: keine Referenzrunde, keine Kalibrierung, kein Hinweis für den Rest der Veranstaltung.",
            it: "Il coach vocale continua a funzionare dopo un cambio di sessione. Passare dalle prove alla qualifica o alla gara — o riavviare una sessione — azzerava il contatore dei giri del gioco, e il coach smetteva definitivamente di registrare i giri: nessun giro di riferimento, nessuna calibrazione, nessun consiglio per il resto dell'evento.",
          },
          {
            en: "Stutters in-game after closing an overlay are gone. The live data thread kept running at full rate and broadcasting to every window for the rest of the session, because closing the overlay window never released it. Each reopen made it worse.",
            fr: "Les saccades en jeu après la fermeture d'un overlay ont disparu. Le flux de données live continuait de tourner à pleine cadence et d'émettre vers toutes les fenêtres pour le reste de la session, car la fermeture de la fenêtre overlay ne le libérait jamais. Chaque réouverture aggravait le problème.",
            es: "Los tirones en el juego tras cerrar un overlay han desaparecido. El flujo de datos en vivo seguía a pleno ritmo y emitiendo a todas las ventanas durante el resto de la sesión, porque cerrar la ventana del overlay nunca lo liberaba. Cada reapertura lo empeoraba.",
            de: "Ruckler im Spiel nach dem Schließen eines Overlays sind behoben. Der Live-Datenstrom lief mit voller Rate weiter und sendete an alle Fenster für den Rest der Sitzung, weil das Schließen des Overlay-Fensters ihn nie freigab. Jedes erneute Öffnen verschlimmerte es.",
            it: "Spariti gli scatti nel gioco dopo aver chiuso un overlay. Il thread dei dati live continuava a girare a piena frequenza e a trasmettere a tutte le finestre per il resto della sessione, perché la chiusura della finestra overlay non lo rilasciava mai. Ogni riapertura peggiorava la situazione.",
          },
          {
            en: "The app no longer closes without warning when opening telemetry. A recorded file with an empty distance channel — a session stopped before the first sample, or a file still being written by the game — shut the application down instantly.",
            fr: "L'application ne se ferme plus sans prévenir à l'ouverture de la télémétrie. Un fichier enregistré avec un canal de distance vide — session interrompue avant le premier échantillon, ou fichier encore en cours d'écriture par le jeu — provoquait une fermeture immédiate.",
            es: "La aplicación ya no se cierra sin avisar al abrir la telemetría. Un archivo grabado con el canal de distancia vacío — sesión detenida antes de la primera muestra, o archivo aún en escritura por el juego — la cerraba al instante.",
            de: "Die Anwendung schließt sich beim Öffnen der Telemetrie nicht mehr ohne Vorwarnung. Eine Aufzeichnung mit leerem Distanzkanal — vor der ersten Messung abgebrochene Sitzung oder eine vom Spiel noch geschriebene Datei — beendete sie sofort.",
            it: "L'app non si chiude più senza preavviso all'apertura della telemetria. Un file registrato con un canale della distanza vuoto — una sessione interrotta prima del primo campione, o un file ancora in scrittura da parte del gioco — chiudeva immediatamente l'applicazione.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.4",
    date: "2026-09-01",
    dev: false,
    localized: true,
    sections: [
      {
        kind: "fixed",
        items: [
          {
            en: "The Records page opens again. Clicking the Records icon in a session row (next to Details) crashed the app with a blank screen and a “Minified React error #185” message. The page was stuck in an endless refresh loop caused by the way it read the global game-version filter. Thanks to the user who reported it.",
            fr: "La page Records s'ouvre de nouveau. Cliquer sur l'icône Records d'une ligne de session (à côté de Détails) plantait l'application sur un écran blanc avec un message « Minified React error #185 ». La page bouclait indéfiniment à cause de la façon dont elle lisait le filtre global de version du jeu. Merci à l'utilisateur qui l'a signalé.",
            es: "La página Records vuelve a abrirse. Al pulsar el icono Records en una fila de sesión (junto a Detalles), la aplicación se bloqueaba con una pantalla en blanco y el mensaje «Minified React error #185». La página entraba en un bucle de refresco infinito por la forma en que leía el filtro global de versión del juego. Gracias al usuario que lo reportó.",
            de: "Die Records-Seite öffnet wieder. Ein Klick auf das Records-Symbol in einer Sitzungszeile (neben Details) ließ die App mit weißem Bildschirm und der Meldung „Minified React error #185“ abstürzen. Die Seite steckte in einer Endlos-Render-Schleife, verursacht durch die Art, wie sie den globalen Spielversions-Filter auslas. Danke an den Nutzer für die Meldung.",
            it: "La pagina Record si apre di nuovo. Cliccare sull'icona Record in una riga di sessione (accanto a Dettagli) mandava in crash l'app con una schermata bianca e il messaggio «Minified React error #185». La pagina era bloccata in un ciclo di aggiornamento infinito causato dal modo in cui leggeva il filtro globale della versione del gioco. Grazie all'utente che l'ha segnalato.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.3",
    date: "2026-08-24",
    dev: false,
    localized: true,
    sections: [
      {
        kind: "added",
        items: [
          {
            text: {
              en: "The AI provider setup has been redesigned around cards. Each provider you add — built-in (OpenAI, Anthropic, Google, OpenRouter, DeepSeek, Mistral, Ollama) or custom (any OpenAI-compatible service: Groq, xAI, Together, LM Studio, vLLM, a corporate gateway…) — gets its own card with its own encrypted API key and a status light showing whether it responds. Keys are no longer shared between providers: switching providers no longer means re-entering keys. Your current key is migrated automatically. The analysis and voice-coach menus offer exactly the providers you configured.",
              fr: "La configuration des fournisseurs IA est repensée en cartes. Chaque fournisseur ajouté — intégré (OpenAI, Anthropic, Google, OpenRouter, DeepSeek, Mistral, Ollama) ou personnalisé (tout service compatible OpenAI : Groq, xAI, Together, LM Studio, vLLM, une passerelle d'entreprise…) — a sa carte avec sa propre clé API chiffrée et un voyant d'état indiquant s'il répond. Les clés ne sont plus partagées entre fournisseurs : changer de fournisseur ne veut plus dire re-saisir sa clé. Votre clé actuelle est migrée automatiquement. Les menus de l'analyse et du coach vocal proposent exactement les fournisseurs que vous avez configurés.",
              es: "La configuración de proveedores de IA se ha rediseñado en tarjetas. Cada proveedor añadido — integrado (OpenAI, Anthropic, Google, OpenRouter, DeepSeek, Mistral, Ollama) o personalizado (cualquier servicio compatible con OpenAI: Groq, xAI, Together, LM Studio, vLLM, una pasarela corporativa…) — tiene su tarjeta con su propia clave API cifrada y un indicador de estado que muestra si responde. Las claves ya no se comparten entre proveedores: cambiar de proveedor ya no significa volver a escribir la clave. Tu clave actual se migra automáticamente. Los menús del análisis y del coach de voz ofrecen exactamente los proveedores que configuraste.",
              de: "Die Einrichtung der KI-Anbieter wurde auf Karten umgestellt. Jeder hinzugefügte Anbieter — integriert (OpenAI, Anthropic, Google, OpenRouter, DeepSeek, Mistral, Ollama) oder eigen (jeder OpenAI-kompatible Dienst: Groq, xAI, Together, LM Studio, vLLM, ein Firmen-Gateway…) — bekommt eine Karte mit eigenem verschlüsseltem API-Schlüssel und einer Statusleuchte, die zeigt, ob er antwortet. Schlüssel werden nicht mehr zwischen Anbietern geteilt: Der Anbieterwechsel bedeutet kein erneutes Eintippen mehr. Dein aktueller Schlüssel wird automatisch migriert. Die Menüs für Analyse und Sprach-Coach bieten genau die Anbieter an, die du konfiguriert hast.",
              it: "La configurazione dei fornitori IA è stata ridisegnata a schede. Ogni fornitore che aggiungi — integrato (OpenAI, Anthropic, Google, OpenRouter, DeepSeek, Mistral, Ollama) o personalizzato (qualsiasi servizio compatibile con OpenAI: Groq, xAI, Together, LM Studio, vLLM, un gateway aziendale…) — ha la sua scheda con la propria chiave API cifrata e una spia di stato che indica se risponde. Le chiavi non sono più condivise tra fornitori: cambiare fornitore non significa più reinserire le chiavi. La tua chiave attuale viene migrata automaticamente. I menu dell'analisi e del coach vocale propongono esattamente i fornitori che hai configurato.",
            },
            featured: true,
          },
          {
            en: "The AI Coach covers the new American tracks from the US Track Pass. Daytona (road course) and Laguna Seca get video lap guides per class (Hypercar and LMGT3 — HYMO Academy and GO Setups on YouTube, credited in the app) plus a corner-by-corner braking reference (Turn 1, International Horseshoe, Le Mans Chicane, Andretti Hairpin, the Corkscrew…). These braking figures are approximate, compiled from public track notes and flagged as such to the coach — they will be replaced by ApexPoints data once that guide covers the tracks. Watkins Glen and Indianapolis are pre-wired for the next packs.",
            fr: "Le Coach IA couvre les nouveaux circuits américains du US Track Pass. Daytona (tracé routier) et Laguna Seca reçoivent leurs guides vidéo par catégorie (Hypercar et LMGT3 — HYMO Academy et GO Setups sur YouTube, crédités dans l'app) ainsi qu'une référence de freinage virage par virage (Turn 1, International Horseshoe, chicane Le Mans, épingle Andretti, Corkscrew…). Ces chiffres de freinage sont approximatifs, compilés depuis les notes de circuit publiques et signalés comme tels au coach — ils seront remplacés par les données ApexPoints dès que ce guide couvrira ces circuits. Watkins Glen et Indianapolis sont pré-câblés pour les prochains packs.",
            es: "El Coach IA cubre los nuevos circuitos americanos del US Track Pass. Daytona (trazado rutero) y Laguna Seca reciben sus guías de vuelta en vídeo por categoría (Hypercar y LMGT3 — HYMO Academy y GO Setups en YouTube, acreditados en la app) además de una referencia de frenada curva a curva (Turn 1, International Horseshoe, chicane Le Mans, horquilla Andretti, el Corkscrew…). Esas cifras de frenada son aproximadas, compiladas de notas públicas de circuito y señaladas como tales al coach — se sustituirán por los datos de ApexPoints cuando esa guía cubra estos circuitos. Watkins Glen e Indianápolis quedan preparados para los próximos packs.",
            de: "Der KI-Coach deckt die neuen US-Strecken des US Track Pass ab. Daytona (Rundkurs) und Laguna Seca bekommen Video-Lap-Guides pro Klasse (Hypercar und LMGT3 — HYMO Academy und GO Setups auf YouTube, in der App genannt) sowie eine Kurve-für-Kurve-Bremsreferenz (Turn 1, International Horseshoe, Le-Mans-Schikane, Andretti-Haarnadel, Corkscrew…). Diese Bremswerte sind Näherungen aus öffentlichen Streckennotizen und dem Coach als solche gekennzeichnet — sie werden durch ApexPoints-Daten ersetzt, sobald dieser Guide die Strecken abdeckt. Watkins Glen und Indianapolis sind für die nächsten Packs vorverdrahtet.",
            it: "Il Coach IA copre i nuovi circuiti americani dello US Track Pass. Daytona (tracciato stradale) e Laguna Seca ricevono guide video del giro per classe (Hypercar e LMGT3 — HYMO Academy e GO Setups su YouTube, citati nell'app) più un riferimento di frenata curva per curva (Turn 1, International Horseshoe, Le Mans Chicane, Andretti Hairpin, il Corkscrew…). Questi dati di frenata sono approssimativi, raccolti da note pubbliche sui circuiti e segnalati come tali al coach — verranno sostituiti dai dati ApexPoints non appena quella guida coprirà questi circuiti. Watkins Glen e Indianapolis sono già predisposti per i prossimi pack.",
          },
          {
            en: "A “Test the AI” button next to the connection test. Instead of a bare ping, the model receives your real stats — last race, most used car, favourite track — and answers with a short radio message from your race engineer, displayed AND spoken by the coach's voice. One click proves the whole chain works: key, model, data, language and speech.",
            fr: "Un bouton « Tester l'IA » à côté du test de connexion. Au lieu d'un simple ping, le modèle reçoit vos vraies statistiques — dernière course, voiture la plus utilisée, circuit favori — et répond par un court message radio de votre ingénieur de course, affiché ET lu par la voix du coach. Un clic prouve toute la chaîne : clé, modèle, données, langue et synthèse vocale.",
            es: "Un botón «Probar la IA» junto a la prueba de conexión. En vez de un simple ping, el modelo recibe tus estadísticas reales — última carrera, coche más usado, circuito favorito — y responde con un breve mensaje de radio de tu ingeniero de carrera, mostrado Y leído por la voz del coach. Un clic demuestra toda la cadena: clave, modelo, datos, idioma y voz.",
            de: "Ein Button „KI testen“ neben dem Verbindungstest. Statt eines bloßen Pings erhält das Modell deine echten Statistiken — letztes Rennen, meistgenutztes Auto, Lieblingsstrecke — und antwortet mit einer kurzen Funknachricht deines Renningenieurs, angezeigt UND von der Coach-Stimme vorgelesen. Ein Klick beweist die ganze Kette: Schlüssel, Modell, Daten, Sprache und Sprachausgabe.",
            it: "Un pulsante «Prova l'IA» accanto al test di connessione. Invece di un semplice ping, il modello riceve le tue vere statistiche — ultima gara, vettura più usata, circuito preferito — e risponde con un breve messaggio radio del tuo ingegnere di pista, mostrato E pronunciato dalla voce del coach. Un clic dimostra che tutta la catena funziona: chiave, modello, dati, lingua e sintesi vocale.",
          },
        ],
      },
      {
        kind: "fixed",
        items: [
          {
            en: "The AI Coach works again with Google Gemini. Google has started refusing the Gemini 2.5 models for recently created API keys, and the coach only showed the provider's raw error. The suggested models are now the current Gemini 3 ones (3.7 / 3.6 Flash), and an unknown or retired model gets a clear message telling you to enter an up-to-date model ID. Reminder: the model field is free text — you can type any ID from your provider (the “View the model list” link opens their official list).",
            fr: "Le coach IA refonctionne avec Google Gemini. Google a commencé à refuser les modèles Gemini 2.5 pour les clés API créées récemment, et le coach n'affichait que l'erreur brute du fournisseur. Les modèles proposés sont désormais les Gemini 3 actuels (3.7 / 3.6 Flash), et un modèle inconnu ou retiré donne un message clair invitant à saisir un identifiant à jour. Rappel : le champ Modèle est libre — vous pouvez y taper n'importe quel identifiant de votre fournisseur (le lien « Voir la liste des modèles » ouvre sa liste officielle).",
            es: "El Coach IA vuelve a funcionar con Google Gemini. Google ha empezado a rechazar los modelos Gemini 2.5 en las claves API creadas recientemente, y el coach solo mostraba el error bruto del proveedor. Los modelos propuestos son ahora los Gemini 3 actuales (3.7 / 3.6 Flash), y un modelo desconocido o retirado muestra un mensaje claro que invita a escribir un identificador actualizado. Recuerda: el campo Modelo es libre — puedes escribir cualquier identificador de tu proveedor (el enlace «Ver la lista de modelos» abre su lista oficial).",
            de: "Der KI-Coach funktioniert wieder mit Google Gemini. Google weist die Gemini-2.5-Modelle bei kürzlich erstellten API-Schlüsseln zurück, und der Coach zeigte nur die rohe Fehlermeldung des Anbieters. Vorgeschlagen werden jetzt die aktuellen Gemini-3-Modelle (3.7 / 3.6 Flash), und ein unbekanntes oder eingestelltes Modell liefert eine klare Meldung mit dem Hinweis, eine aktuelle Modell-ID einzugeben. Hinweis: Das Feld Modell ist ein freies Textfeld — du kannst jede ID deines Anbieters eintragen (der Link „Modellliste ansehen“ öffnet dessen offizielle Liste).",
            it: "Il Coach IA funziona di nuovo con Google Gemini. Google ha iniziato a rifiutare i modelli Gemini 2.5 per le chiavi API create di recente, e il coach mostrava solo l'errore grezzo del fornitore. I modelli suggeriti ora sono gli attuali Gemini 3 (3.7 / 3.6 Flash), e un modello sconosciuto o ritirato dà un messaggio chiaro che ti invita a inserire un ID modello aggiornato. Promemoria: il campo Modello è a testo libero — puoi digitare qualsiasi ID del tuo fornitore (il link «Vedi l'elenco dei modelli» apre il suo elenco ufficiale).",
          },
          {
            en: "The coach works with OpenAI's recent models (GPT-5.x, o-series). These models reject the output-limit parameter the app was sending (max_tokens, deprecated in favour of max_completion_tokens) and returned an error. The suggested OpenAI models were also refreshed (gpt-5-mini, gpt-5.2, gpt-5.5).",
            fr: "Le coach fonctionne avec les modèles OpenAI récents (GPT-5.x, séries o). Ces modèles rejettent le paramètre de limite de sortie que l'app envoyait (max_tokens, déprécié au profit de max_completion_tokens) et renvoyaient une erreur. Les modèles OpenAI suggérés ont aussi été rafraîchis (gpt-5-mini, gpt-5.2, gpt-5.5).",
            es: "El coach funciona con los modelos recientes de OpenAI (GPT-5.x, series o). Estos modelos rechazan el parámetro de límite de salida que enviaba la app (max_tokens, obsoleto en favor de max_completion_tokens) y devolvían un error. Los modelos de OpenAI sugeridos también se han actualizado (gpt-5-mini, gpt-5.2, gpt-5.5).",
            de: "Der Coach funktioniert mit den neueren OpenAI-Modellen (GPT-5.x, o-Serien). Diese Modelle lehnen den Ausgabelimit-Parameter ab, den die App sendete (max_tokens, zugunsten von max_completion_tokens veraltet), und lieferten einen Fehler. Die vorgeschlagenen OpenAI-Modelle wurden ebenfalls aufgefrischt (gpt-5-mini, gpt-5.2, gpt-5.5).",
            it: "Il coach funziona con i modelli recenti di OpenAI (GPT-5.x, serie o). Questi modelli rifiutano il parametro di limite di output che l'app inviava (max_tokens, deprecato a favore di max_completion_tokens) e restituivano un errore. Sono stati aggiornati anche i modelli OpenAI suggeriti (gpt-5-mini, gpt-5.2, gpt-5.5).",
          },
          {
            en: "The coach's voice now pronounces racing jargon correctly. “P13” was read as one garbled word instead of “P thirteen”; lap times like “1:42.123” came out as “colon… point…”; “km/h”, “°C”, signed gaps (“+0.5s”) and class names (GT3, LMP2, LMGT3…) were mangled too. Everything is now spoken in full words, in all four languages — on-screen text is unchanged. Lap times follow radio convention (“1:42.881” is spoken “one, forty-two, eight-eighty-one”), and when the coach reads a full analysis aloud it now pauses briefly after each section title.",
            fr: "La voix du coach prononce désormais correctement le jargon course. « P13 » était lu comme un mot déformé au lieu de « P treize » ; les temps au tour comme « 1:42.123 » sortaient en « deux-points… point… » ; « km/h », « °C », les écarts signés (« +0.5s ») et les catégories (GT3, LMP2, LMGT3…) étaient également écorchés. Tout est maintenant énoncé en toutes lettres, dans les quatre langues — le texte affiché ne change pas. Les temps au tour suivent la convention radio (« 1:42.881 » se dit « une, 42, 881 »), et la lecture d'une analyse marque désormais une courte pause après chaque titre de section.",
            es: "La voz del coach pronuncia ahora correctamente la jerga de carreras. «P13» se leía como una palabra deformada en vez de «P trece»; los tiempos de vuelta como «1:42.123» salían con «dos puntos… punto…»; «km/h», «°C», las diferencias con signo («+0.5s») y las categorías (GT3, LMP2, LMGT3…) también se estropeaban. Ahora todo se enuncia con palabras completas, en los cuatro idiomas — el texto en pantalla no cambia. Los tiempos de vuelta siguen la convención de radio («1:42.881» se dice «uno, 42, 881»), y la lectura de un análisis hace ahora una breve pausa tras cada título de sección.",
            de: "Die Coach-Stimme spricht Rennjargon jetzt korrekt aus. „P13“ wurde als verzerrtes Wort gelesen statt „P dreizehn“; Rundenzeiten wie „1:42.123“ kamen als „Doppelpunkt… Punkt…“ heraus; auch „km/h“, „°C“, Abstände mit Vorzeichen („+0.5s“) und Klassen (GT3, LMP2, LMGT3…) wurden verstümmelt. Alles wird jetzt in ganzen Wörtern gesprochen, in allen vier Sprachen — der angezeigte Text bleibt unverändert. Rundenzeiten folgen der Funk-Konvention („1:42.881“ wird „eins, 42, 881“ gesprochen), und beim Vorlesen einer Analyse macht der Coach nach jedem Abschnittstitel eine kurze Pause.",
            it: "La voce del coach ora pronuncia correttamente il gergo delle corse. «P13» veniva letto come un'unica parola storpiata invece di «P tredici»; tempi sul giro come «1:42.123» uscivano come «due punti… punto…»; anche «km/h», «°C», i distacchi con segno («+0.5s») e i nomi delle classi (GT3, LMP2, LMGT3…) venivano storpiati. Ora tutto viene pronunciato per esteso, in tutte e quattro le lingue — il testo a schermo non cambia. I tempi sul giro seguono la convenzione radio («1:42.881» si pronuncia «uno, quarantadue, ottocentottantuno»), e quando il coach legge ad alta voce un'analisi completa ora fa una breve pausa dopo il titolo di ogni sezione.",
          },
          {
            en: "Answers no longer come back empty with reasoning models — whatever the provider (Gemini 3, OpenAI o-series, DeepSeek R1, local “thinking” models via Ollama…). These models spend part of their output budget thinking before they answer, which could swallow the whole allowance of a short reply (voice coach, quick analysis) and return nothing. Every provider's budget now includes room for that reasoning.",
            fr: "Les réponses ne reviennent plus vides avec les modèles de raisonnement — quel que soit le fournisseur (Gemini 3, séries o d'OpenAI, DeepSeek R1, modèles « thinking » locaux via Ollama…). Ces modèles dépensent une partie de leur budget de sortie à réfléchir avant de répondre, ce qui pouvait absorber tout le quota d'une réponse courte (coach vocal, analyse rapide) et ne rien renvoyer. Le budget de chaque fournisseur prévoit désormais cette place.",
            es: "Las respuestas ya no llegan vacías con los modelos de razonamiento — sea cual sea el proveedor (Gemini 3, series o de OpenAI, DeepSeek R1, modelos «thinking» locales vía Ollama…). Estos modelos gastan parte de su presupuesto de salida en pensar antes de responder, lo que podía consumir toda la cuota de una respuesta corta (coach de voz, análisis rápido) y no devolver nada. El presupuesto de cada proveedor ya reserva ese espacio.",
            de: "Antworten kommen mit Reasoning-Modellen nicht mehr leer zurück — egal bei welchem Anbieter (Gemini 3, OpenAI o-Serien, DeepSeek R1, lokale „Thinking“-Modelle über Ollama…). Diese Modelle verwenden einen Teil ihres Ausgabebudgets aufs Nachdenken, was bei kurzen Antworten (Sprach-Coach, Schnellanalyse) das gesamte Kontingent aufbrauchen und nichts zurückgeben konnte. Das Budget jedes Anbieters berücksichtigt diesen Bedarf jetzt.",
            it: "Le risposte non tornano più vuote con i modelli di ragionamento — qualunque sia il fornitore (Gemini 3, serie o di OpenAI, DeepSeek R1, modelli «thinking» locali tramite Ollama…). Questi modelli spendono parte del loro budget di output a ragionare prima di rispondere, il che poteva consumare l'intera quota di una risposta breve (coach vocale, analisi rapida) e non restituire nulla. Ora il budget di ogni fornitore prevede spazio per quel ragionamento.",
          },
        ],
      },
      {
        kind: "improved",
        items: [
          {
            en: "Choosing a model is much clearer. The Model field now shows the live list of models actually offered by the selected provider (fetched from its API — nothing hard-coded to go stale), with “Enter manually…” for a model too new to be listed. Switching providers resets the field and seeds it with one of the new provider's models, instead of silently keeping an ID from the previous provider that could only fail. And when the saved model has been retired by the provider, a warning says so with a one-click replacement.",
            fr: "Choisir un modèle devient bien plus clair. Le champ Modèle affiche désormais la liste vivante des modèles réellement proposés par le fournisseur sélectionné (récupérée depuis son API — rien de figé qui se périme), avec « Saisir manuellement… » pour un modèle trop récent pour y figurer. Changer de fournisseur réinitialise le champ et l'amorce avec un modèle du nouveau fournisseur, au lieu de garder en silence un identifiant de l'ancien qui ne pouvait qu'échouer. Et quand le modèle enregistré a été retiré par le fournisseur, un avertissement le signale avec un remplacement en un clic.",
            es: "Elegir un modelo es mucho más claro. El campo Modelo muestra ahora la lista viva de modelos que ofrece realmente el proveedor seleccionado (obtenida de su API — nada fijo que caduque), con «Escribir manualmente…» para un modelo demasiado reciente para figurar. Cambiar de proveedor reinicia el campo y lo rellena con un modelo del nuevo proveedor, en vez de conservar en silencio un identificador del anterior que solo podía fallar. Y cuando el proveedor ha retirado el modelo guardado, un aviso lo indica con un reemplazo en un clic.",
            de: "Die Modellauswahl ist deutlich klarer. Das Feld Modell zeigt jetzt die live abgefragte Liste der Modelle, die der gewählte Anbieter tatsächlich anbietet (aus seiner API — nichts Festes, das veralten kann), mit „Manuell eingeben…“ für ein Modell, das zu neu ist, um gelistet zu sein. Beim Anbieterwechsel wird das Feld zurückgesetzt und mit einem Modell des neuen Anbieters vorbelegt, statt stillschweigend eine ID des vorherigen zu behalten, die nur fehlschlagen konnte. Und wenn das gespeicherte Modell vom Anbieter eingestellt wurde, weist eine Warnung darauf hin — mit Ersetzung per Klick.",
            it: "Scegliere un modello è molto più chiaro. Il campo Modello ora mostra l'elenco aggiornato dei modelli effettivamente offerti dal fornitore selezionato (recuperato dalla sua API — niente di fisso che diventi obsoleto), con «Inserisci manualmente…» per un modello troppo recente per essere elencato. Cambiare fornitore azzera il campo e lo precompila con uno dei modelli del nuovo fornitore, invece di mantenere in silenzio un ID del fornitore precedente che poteva solo fallire. E quando il modello salvato è stato ritirato dal fornitore, un avviso lo segnala con una sostituzione in un clic.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.2",
    date: "2026-08-12",
    dev: false,
    localized: true,
    sections: [
      {
        kind: "fixed",
        items: [
          {
            en: "The AI Coach no longer flashes a black window over the game every time it speaks. The speech engine is a console program, and Windows was opening a window for it on each phrase: it stole the focus and made the game stutter in fullscreen. Speech synthesis also runs at a lower CPU priority now, so it stays out of the sim's way.",
            fr: "Le coach IA ne fait plus apparaître de fenêtre noire par-dessus le jeu à chaque phrase. Le moteur vocal est un programme console et Windows lui ouvrait une fenêtre à chaque annonce : elle volait le focus et faisait saccader le jeu en plein écran. La synthèse tourne aussi à une priorité CPU plus basse, pour ne plus gêner le simulateur.",
            es: "El Coach IA ya no muestra una ventana negra sobre el juego cada vez que habla. El motor de voz es un programa de consola y Windows le abría una ventana en cada frase: robaba el foco y provocaba tirones en pantalla completa. La síntesis se ejecuta además con menor prioridad de CPU, para no molestar al simulador.",
            de: "Der KI-Coach lässt bei jeder Ansage kein schwarzes Fenster mehr über dem Spiel aufblitzen. Die Sprachausgabe ist ein Konsolenprogramm, für das Windows bei jedem Satz ein Fenster öffnete: Es zog den Fokus ab und ließ das Spiel im Vollbild stocken. Die Sprachsynthese läuft zudem mit niedrigerer CPU-Priorität und kommt dem Simulator nicht mehr in die Quere.",
            it: "Il Coach IA non fa più lampeggiare una finestra nera sopra il gioco ogni volta che parla. Il motore vocale è un programma da console, e Windows gli apriva una finestra a ogni frase: rubava il focus e faceva scattare il gioco a schermo intero. Inoltre la sintesi vocale ora gira con una priorità CPU più bassa, così non intralcia il simulatore.",
          },
        ],
      },
      {
        kind: "improved",
        items: [
          {
            en: "Announcements can now be turned up to 200% and start at 100%. The volume was capped at 100% with a 30% default, which was far too quiet next to the game. An output limiter keeps the voice clean when boosted above 100% (built-in neural voice only — system voices cannot be amplified). If you had already set the volume yourself, your setting is kept.",
            fr: "Les annonces peuvent désormais monter à 200 % et démarrent à 100 %. Le volume était plafonné à 100 % avec un défaut à 30 %, bien trop faible face au jeu. Un limiteur de sortie garde la voix propre au-delà de 100 % (voix neuronale intégrée uniquement — les voix système ne peuvent pas être amplifiées). Si vous aviez déjà réglé le volume vous-même, votre réglage est conservé.",
            es: "Los anuncios pueden subir ahora hasta el 200 % y empiezan al 100 %. El volumen estaba limitado al 100 % con un valor por defecto del 30 %, demasiado bajo frente al juego. Un limitador de salida mantiene la voz limpia por encima del 100 % (solo la voz neuronal integrada: las voces del sistema no pueden amplificarse). Si ya habías ajustado el volumen, se conserva tu ajuste.",
            de: "Ansagen lassen sich jetzt bis 200 % aufdrehen und starten bei 100 %. Die Lautstärke war auf 100 % begrenzt, mit 30 % als Standard — neben dem Spiel viel zu leise. Ein Ausgangslimiter hält die Stimme oberhalb von 100 % sauber (nur die integrierte neuronale Stimme — Systemstimmen lassen sich nicht verstärken). Wenn du die Lautstärke bereits selbst eingestellt hattest, bleibt deine Einstellung erhalten.",
            it: "Ora gli annunci si possono alzare fino al 200% e partono dal 100%. Il volume era limitato al 100% con un valore predefinito del 30%, decisamente troppo basso rispetto al gioco. Un limitatore in uscita mantiene la voce pulita quando viene amplificata oltre il 100% (solo voce neurale integrata — le voci di sistema non possono essere amplificate). Se avevi già regolato il volume tu stesso, la tua impostazione viene mantenuta.",
          },
        ],
      },
    ],
  },
  {
    version: "1.0.1",
    date: "2026-08-09",
    dev: false,
    localized: true,
    sections: [
      {
        kind: "improved",
        items: [
          {
            en: "The installer now offers to remove an older 0.9.x version if it finds one. The 0.9.x series used a different installer, so it was left behind and both versions showed up side by side in the programs list.",
            fr: "L'installeur propose désormais de supprimer une ancienne version 0.9.x s'il en trouve une. La série 0.9.x utilisait un installeur différent : elle restait en place et les deux versions apparaissaient côte à côte dans la liste des programmes.",
            es: "El instalador ahora ofrece eliminar una versión 0.9.x anterior si encuentra una. La serie 0.9.x usaba un instalador diferente: quedaba instalada y ambas versiones aparecían juntas en la lista de programas.",
            de: "Das Installationsprogramm bietet jetzt an, eine ältere 0.9.x-Version zu entfernen, wenn es eine findet. Die 0.9.x-Reihe nutzte ein anderes Installationsprogramm: Sie blieb bestehen, und beide Versionen erschienen nebeneinander in der Programmliste.",
            it: "Ora l'installer propone di rimuovere una vecchia versione 0.9.x se ne trova una. La serie 0.9.x usava un installer diverso, quindi restava installata ed entrambe le versioni comparivano una accanto all'altra nell'elenco dei programmi.",
          },
        ],
      },
    ],
  },
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
            it: "Prima versione stabile — l'app è stata interamente ricostruita come applicazione Windows nativa e veloce.",
          },
          {
            text: {
              en: "In-game overlays (HUD): a full set of 20+ overlays you can show on top of the game — live delta, corner-by-corner delta, sectors, speed, standings, relative, rival, proximity radar, track map, flags, telemetry, G-force, driving aids, lift & coast, tyres, damage, fuel, session info, endurance, weather and dashboard. They're fully customisable: drag each one where you want it, pick its accent colour, and save complete layouts as profiles you can switch between.",
              fr: "Overlays en jeu (HUD) : une collection de 20+ overlays à afficher par-dessus le jeu — delta en direct, delta virage par virage, secteurs, vitesse, classement, relatif, rival, radar de proximité, carte du circuit, drapeaux, télémétrie, G-force, aides au pilotage, lift & coast, pneus, dégâts, carburant, infos session, endurance, météo et tableau de bord. Ils sont entièrement personnalisables : place chacun où tu veux, choisis sa couleur d'accent, et enregistre des dispositions complètes en profils interchangeables.",
              es: "Overlays en el juego (HUD): un conjunto de más de 20 overlays para mostrar sobre el juego — delta en vivo, delta curva por curva, sectores, velocidad, clasificación, relativo, rival, radar de proximidad, mapa del circuito, banderas, telemetría, fuerza G, ayudas a la conducción, lift & coast, neumáticos, daños, combustible, info de sesión, resistencia, clima y panel. Son totalmente personalizables: coloca cada uno donde quieras, elige su color de acento y guarda disposiciones completas como perfiles intercambiables.",
              de: "In-Game-Overlays (HUD): über 20 Overlays, die du über dem Spiel anzeigen kannst — Live-Delta, Delta Kurve für Kurve, Sektoren, Geschwindigkeit, Rangliste, Relativ, Rivale, Annäherungsradar, Streckenkarte, Flaggen, Telemetrie, G-Kraft, Fahrhilfen, Lift & Coast, Reifen, Schäden, Sprit, Session-Infos, Ausdauer, Wetter und Dashboard. Sie sind voll anpassbar: Ziehe jedes an die gewünschte Stelle, wähle seine Akzentfarbe und speichere ganze Layouts als umschaltbare Profile.",
              it: "Overlay in gioco (HUD): un set completo di oltre 20 overlay da mostrare sopra il gioco — delta live, delta curva per curva, settori, velocità, classifica, relativo, rivale, radar di prossimità, mappa del circuito, bandiere, telemetria, forza G, aiuti alla guida, lift & coast, gomme, danni, carburante, info sessione, endurance, meteo e dashboard. Sono completamente personalizzabili: trascina ciascuno dove vuoi, scegli il suo colore d'accento e salva disposizioni complete come profili tra cui passare.",
            },
            featured: true,
          },
          {
            text: {
              en: "AI Coach: get a clear analysis of your race once it's over, and ask questions about your telemetry. The coach knows the ideal braking points for each corner and class, and points you to the right video lap guide for your track and car.",
              fr: "Coach IA : obtiens une analyse claire de ta course une fois terminée, et pose des questions sur ta télémétrie. Le coach connaît les points de freinage idéaux pour chaque virage et chaque catégorie, et te renvoie vers le bon guide vidéo pour ton circuit et ta voiture.",
              es: "Coach IA: obtén un análisis claro de tu carrera al terminar y haz preguntas sobre tu telemetría. El coach conoce los puntos de frenado ideales para cada curva y categoría, y te indica la guía en vídeo adecuada para tu circuito y coche.",
              de: "KI-Coach: Erhalte nach dem Rennen eine klare Analyse und stelle Fragen zu deiner Telemetrie. Der Coach kennt die idealen Bremspunkte für jede Kurve und Klasse und verweist dich auf das passende Video-Lap-Guide für Strecke und Auto.",
              it: "Coach IA: ottieni un'analisi chiara della tua gara una volta finita, e fai domande sulla tua telemetria. Il coach conosce i punti di staccata ideali per ogni curva e classe, e ti indica la guida video del giro giusta per il tuo circuito e la tua vettura.",
            },
            featured: true,
          },
          {
            text: {
              en: "Live voice coaching: short spoken call-outs while you drive, plus push-to-talk so you can ask the coach a question with your voice.",
              fr: "Coaching vocal en direct : de courtes annonces parlées pendant que tu roules, plus un push-to-talk pour poser une question au coach à la voix.",
              es: "Coaching de voz en directo: breves indicaciones habladas mientras conduces, además de push-to-talk para preguntar al coach con tu voz.",
              de: "Live-Sprachcoaching: kurze gesprochene Ansagen während der Fahrt, plus Push-to-Talk, um dem Coach per Stimme eine Frage zu stellen.",
              it: "Coaching vocale live: brevi indicazioni parlate mentre guidi, più il push-to-talk per fare una domanda al coach con la voce.",
            },
            featured: true,
          },
          {
            text: {
              en: "Voice race engineer (spotter): automatic spoken announcements while you drive — flags, fuel warnings, tyre wear, damage, positions, blue flag, personal best, purple sector, last lap and more. Ask it questions with your voice (gap, fuel, tyres, position, weather…): speech recognition runs 100% offline in 4 languages, and the text of every announcement can be customised.",
              fr: "Ingénieur de course vocal (spotter) : annonces parlées automatiques pendant que tu roules — drapeaux, alertes carburant, usure des pneus, dégâts, positions, drapeau bleu, record perso, secteur violet, dernier tour et plus. Pose-lui des questions à la voix (écart, carburant, pneus, position, météo…) : la reconnaissance vocale fonctionne 100 % hors-ligne en 4 langues, et le texte de chaque annonce est personnalisable.",
              es: "Ingeniero de carrera por voz (spotter): anuncios hablados automáticos mientras conduces — banderas, avisos de combustible, desgaste de neumáticos, daños, posiciones, bandera azul, récord personal, sector violeta, última vuelta y más. Hazle preguntas con tu voz (diferencia, combustible, neumáticos, posición, clima…): el reconocimiento de voz funciona 100 % sin conexión en 4 idiomas, y el texto de cada anuncio es personalizable.",
              de: "Sprach-Renningenieur (Spotter): automatische gesprochene Ansagen während der Fahrt — Flaggen, Sprit-Warnungen, Reifenverschleiß, Schäden, Positionen, blaue Flagge, persönliche Bestzeit, violetter Sektor, letzte Runde und mehr. Stelle ihm Fragen per Stimme (Abstand, Sprit, Reifen, Position, Wetter…): die Spracherkennung läuft zu 100 % offline in 4 Sprachen, und der Text jeder Ansage ist anpassbar.",
              it: "Ingegnere di pista vocale (spotter): annunci parlati automatici mentre guidi — bandiere, avvisi carburante, usura gomme, danni, posizioni, bandiera blu, record personale, settore viola, ultimo giro e altro. Fagli domande a voce (distacco, carburante, gomme, posizione, meteo…): il riconoscimento vocale funziona al 100% offline in 4 lingue, e il testo di ogni annuncio è personalizzabile.",
            },
            featured: true,
          },
          {
            text: {
              en: "Telemetry view: compare two laps channel by channel, import a reference lap to measure yourself against, see your theoretical best lap and a corner-by-corner breakdown of where you gain or lose time.",
              fr: "Vue Télémétrie : compare deux tours canal par canal, importe un tour de référence pour te situer, visualise ton meilleur tour théorique et un détail virage par virage de là où tu gagnes ou perds du temps.",
              es: "Vista de telemetría: compara dos vueltas canal por canal, importa una vuelta de referencia para medirte, mira tu mejor vuelta teórica y un desglose curva por curva de dónde ganas o pierdes tiempo.",
              de: "Telemetrie-Ansicht: Vergleiche zwei Runden Kanal für Kanal, importiere eine Referenzrunde als Maßstab, sieh deine theoretisch beste Runde und eine Aufschlüsselung Kurve für Kurve, wo du Zeit gewinnst oder verlierst.",
              it: "Vista Telemetria: confronta due giri canale per canale, importa un giro di riferimento con cui misurarti, guarda il tuo miglior giro teorico e un'analisi curva per curva di dove guadagni o perdi tempo.",
            },
            featured: true,
          },
          {
            text: {
              en: "References page: reference lap times (OhneSpeed) for every track and class, with your own level shown for each combo and a shortcut to the matching sessions.",
              fr: "Page Références : les temps de référence (OhneSpeed) pour chaque circuit et catégorie, avec ton propre niveau pour chaque combo et un raccourci vers les sessions correspondantes.",
              es: "Página de Referencias: tiempos de referencia (OhneSpeed) para cada circuito y categoría, con tu propio nivel en cada combinación y un acceso directo a las sesiones correspondientes.",
              de: "Referenzen-Seite: Referenzrundenzeiten (OhneSpeed) für jede Strecke und Klasse, mit deinem eigenen Niveau pro Kombination und einer Verknüpfung zu den passenden Sessions.",
              it: "Pagina Riferimenti: tempi di riferimento sul giro (OhneSpeed) per ogni circuito e classe, con il tuo livello indicato per ogni combo e una scorciatoia verso le sessioni corrispondenti.",
            },
            featured: true,
          },
          {
            en: "Dashboard: global statistics and best lap times grouped by track.",
            fr: "Tableau de bord : statistiques globales et meilleurs temps au tour groupés par circuit.",
            es: "Panel: estadísticas globales y mejores tiempos por vuelta agrupados por circuito.",
            de: "Dashboard: globale Statistiken und beste Rundenzeiten, gruppiert nach Strecke.",
            it: "Dashboard: statistiche globali e migliori tempi sul giro raggruppati per circuito.",
          },
          {
            en: "Sessions: a paginated, filterable and sortable list of all your sessions.",
            fr: "Sessions : une liste paginée, filtrable et triable de toutes tes sessions.",
            es: "Sesiones: una lista paginada, filtrable y ordenable de todas tus sesiones.",
            de: "Sessions: eine paginierte, filter- und sortierbare Liste all deiner Sessions.",
            it: "Sessioni: un elenco paginato, filtrabile e ordinabile di tutte le tue sessioni.",
          },
          {
            en: "Race details: results, laps, best laps, strategy, incidents, penalties, chat and head-to-head driver comparison with charts.",
            fr: "Détails de course : résultats, tours, meilleurs tours, stratégie, incidents, pénalités, chat et comparaison de pilotes en tête-à-tête avec graphiques.",
            es: "Detalles de carrera: resultados, vueltas, mejores vueltas, estrategia, incidentes, penalizaciones, chat y comparación directa de pilotos con gráficos.",
            de: "Rennen-Details: Ergebnisse, Runden, beste Runden, Strategie, Vorfälle, Strafen, Chat und direkter Fahrervergleich mit Diagrammen.",
            it: "Dettagli gara: risultati, giri, migliori giri, strategia, incidenti, penalità, chat e confronto testa a testa tra piloti con grafici.",
          },
          {
            en: "Records: an overview of all your records plus a detailed progression view per track and car.",
            fr: "Records : une vue d'ensemble de tous tes records plus une vue détaillée de la progression par circuit et voiture.",
            es: "Récords: una visión general de todos tus récords más una vista detallada de la progresión por circuito y coche.",
            de: "Rekorde: eine Übersicht all deiner Rekorde sowie eine detaillierte Verlaufsansicht pro Strecke und Auto.",
            it: "Record: una panoramica di tutti i tuoi record più una vista dettagliata della progressione per circuito e vettura.",
          },
          {
            en: "Garage: a complete setup editor (engine, tyres, suspension, dampers, chassis), with duplication, export and A/B comparison — and a picture of your car.",
            fr: "Garage : un éditeur de réglages complet (moteur, pneus, suspension, amortisseurs, châssis), avec duplication, export et comparaison A/B — et une image de ta voiture.",
            es: "Garaje: un editor de reglajes completo (motor, neumáticos, suspensión, amortiguadores, chasis), con duplicación, exportación y comparación A/B — y una imagen de tu coche.",
            de: "Garage: ein vollständiger Setup-Editor (Motor, Reifen, Fahrwerk, Dämpfer, Chassis) mit Duplizieren, Export und A/B-Vergleich — und einem Bild deines Autos.",
            it: "Garage: un editor di setup completo (motore, gomme, sospensioni, ammortizzatori, telaio), con duplicazione, esportazione e confronto A/B — e un'immagine della tua vettura.",
          },
          {
            en: "Live timing: real-time telemetry, full standings and a 2D track map that's remembered between sessions.",
            fr: "Live timing : télémétrie en temps réel, classement complet et carte 2D du circuit mémorisée entre les sessions.",
            es: "Live timing: telemetría en tiempo real, clasificación completa y un mapa 2D del circuito que se recuerda entre sesiones.",
            de: "Live-Timing: Echtzeit-Telemetrie, vollständige Rangliste und eine 2D-Streckenkarte, die zwischen Sessions gespeichert bleibt.",
            it: "Live timing: telemetria in tempo reale, classifica completa e una mappa 2D del circuito memorizzata tra una sessione e l'altra.",
          },
          {
            en: "Profile page: an activity heatmap of your online and offline races, plus consistency indicators.",
            fr: "Page Profil : une heatmap d'activité de tes courses en ligne et hors ligne, plus des indicateurs de régularité.",
            es: "Página de perfil: un mapa de calor de actividad de tus carreras en línea y fuera de línea, más indicadores de regularidad.",
            de: "Profilseite: eine Aktivitäts-Heatmap deiner Online- und Offline-Rennen sowie Konstanz-Indikatoren.",
            it: "Pagina Profilo: una heatmap dell'attività delle tue gare online e offline, più indicatori di costanza.",
          },
          {
            en: "Menu modules: turn the pages you don't use on or off to keep the app focused.",
            fr: "Modules de menu : active ou désactive les pages que tu n'utilises pas pour garder l'app épurée.",
            es: "Módulos de menú: activa o desactiva las páginas que no usas para mantener la app enfocada.",
            de: "Menü-Module: Schalte Seiten, die du nicht nutzt, ein oder aus, um die App schlank zu halten.",
            it: "Moduli del menu: attiva o disattiva le pagine che non usi per mantenere l'app essenziale.",
          },
          {
            text: {
              en: "Corner-by-corner coaching: the coach measures every corner against your reference lap and calls out what to change — braking too late or too early, apex speed, getting back on power, trail braking, lockups and wheelspin. A drill mode lets you work one corner until it sticks, and it tells you how your stint and tyre risk are developing.",
              fr: "Coaching virage par virage : le coach mesure chaque virage face à ton tour de référence et t'annonce quoi corriger — freinage trop tard ou trop tôt, vitesse au point de corde, remise des gaz, trail braking, blocages et patinage. Un mode exercice te fait travailler un virage jusqu'à ce qu'il rentre, et il te dit comment évoluent ton relais et le risque pneus.",
              es: "Coaching curva por curva: el coach mide cada curva frente a tu vuelta de referencia y te indica qué corregir — frenada demasiado tarde o temprano, velocidad en el ápice, vuelta al acelerador, trail braking, bloqueos y patinado. Un modo ejercicio te hace trabajar una curva hasta dominarla, y te informa de cómo evolucionan tu relevo y el riesgo de neumáticos.",
              de: "Coaching Kurve für Kurve: Der Coach misst jede Kurve gegen deine Referenzrunde und sagt dir, was zu ändern ist — zu spät oder zu früh gebremst, Scheitelpunkt-Geschwindigkeit, Gasannahme, Trail Braking, blockierende Räder und Durchdrehen. Ein Übungsmodus lässt dich eine Kurve trainieren, bis sie sitzt, und er meldet, wie sich dein Stint und das Reifenrisiko entwickeln.",
              it: "Coaching curva per curva: il coach misura ogni curva rispetto al tuo giro di riferimento e ti dice cosa cambiare — staccata troppo tardi o troppo presto, velocità all'apice, ritorno sul gas, trail braking, bloccaggi e pattinamento. Una modalità esercizio ti fa lavorare su una curva finché non la padroneggi, e ti dice come stanno evolvendo il tuo stint e il rischio gomme.",
            },
            featured: true,
          },
          {
            en: "Guided tour and built-in help on first launch, so you know where to start.",
            fr: "Visite guidée et aide intégrée au premier lancement, pour savoir par où commencer.",
            es: "Visita guiada y ayuda integrada en el primer arranque, para saber por dónde empezar.",
            de: "Geführte Tour und integrierte Hilfe beim ersten Start, damit du weißt, wo du anfängst.",
            it: "Tour guidato e guida integrata al primo avvio, per sapere da dove iniziare.",
          },
          {
            en: "Voices and speech recognition are downloaded on demand: you only get the languages you actually use, so the install stays light.",
            fr: "Voix et reconnaissance vocale téléchargées à la demande : tu ne récupères que les langues dont tu te sers, l'installation reste légère.",
            es: "Voces y reconocimiento de voz descargados a demanda: solo obtienes los idiomas que usas, así la instalación se mantiene ligera.",
            de: "Stimmen und Spracherkennung werden bei Bedarf heruntergeladen: Du bekommst nur die Sprachen, die du wirklich nutzt — die Installation bleibt schlank.",
            it: "Le voci e il riconoscimento vocale vengono scaricati su richiesta: ottieni solo le lingue che usi davvero, così l'installazione resta leggera.",
          },
          {
            en: "Car numbers shown in every driver table.",
            fr: "Numéro de voiture affiché dans tous les tableaux pilotes.",
            es: "Número de coche mostrado en todas las tablas de pilotos.",
            de: "Startnummern in allen Fahrertabellen sichtbar.",
            it: "Numeri delle vetture mostrati in tutte le tabelle dei piloti.",
          },
          {
            en: "Available in 4 languages: French, English, Spanish and German.",
            fr: "Disponible en 4 langues : français, anglais, espagnol et allemand.",
            es: "Disponible en 4 idiomas: francés, inglés, español y alemán.",
            de: "Verfügbar in 4 Sprachen: Französisch, Englisch, Spanisch und Deutsch.",
            it: "Disponibile in 4 lingue: francese, inglese, spagnolo e tedesco.",
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
            it: "Avvio molto più rapido: a ogni avvio vengono letti solo i file dei risultati nuovi o modificati.",
          },
          {
            en: "Your live delta now compares you against your own best lap for that track and class, and keeps getting better as you improve.",
            fr: "Ton delta en direct te compare désormais à ton propre meilleur tour sur ce circuit et dans cette catégorie, et s'améliore au fur et à mesure que tu progresses.",
            es: "Tu delta en vivo ahora te compara con tu propia mejor vuelta en ese circuito y categoría, y mejora a medida que progresas.",
            de: "Dein Live-Delta vergleicht dich jetzt mit deiner eigenen besten Runde auf dieser Strecke und in dieser Klasse — und wird besser, je mehr du dich steigerst.",
            it: "Il tuo delta live ora ti confronta con il tuo miglior giro su quel circuito e in quella classe, e continua a migliorare man mano che progredisci.",
          },
          {
            en: "Clearer distinction between the LMP2 WEC and LMP2 ELMS classes.",
            fr: "Distinction plus claire entre les catégories LMP2 WEC et LMP2 ELMS.",
            es: "Distinción más clara entre las categorías LMP2 WEC y LMP2 ELMS.",
            de: "Klarere Unterscheidung zwischen den Klassen LMP2 WEC und LMP2 ELMS.",
            it: "Distinzione più chiara tra le classi LMP2 WEC e LMP2 ELMS.",
          },
          {
            en: "Light and dark themes in the Le Mans colours.",
            fr: "Thèmes clair et sombre aux couleurs du Mans.",
            es: "Temas claro y oscuro con los colores de Le Mans.",
            de: "Helles und dunkles Theme in den Farben von Le Mans.",
            it: "Temi chiaro e scuro con i colori di Le Mans.",
          },
          {
            en: "You can now type any AI model name yourself, with suggestions — useful for a model that has just come out.",
            fr: "Tu peux désormais saisir toi-même n'importe quel nom de modèle d'IA, avec suggestions — pratique pour un modèle tout juste sorti.",
            es: "Ahora puedes escribir tú mismo cualquier nombre de modelo de IA, con sugerencias — útil para un modelo recién salido.",
            de: "Du kannst jetzt jeden KI-Modellnamen selbst eingeben, mit Vorschlägen — praktisch für ein gerade erschienenes Modell.",
            it: "Ora puoi digitare tu stesso il nome di qualsiasi modello di IA, con suggerimenti — utile per un modello appena uscito.",
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
            it: "Il nome del modello di IA che digiti tu stesso non viene più sostituito da solo all'apertura della pagina delle impostazioni.",
          },
          {
            en: "The voice coach no longer answers with an error when its setup is incomplete: it tells you what's missing.",
            fr: "Le coach vocal ne répond plus par une erreur quand sa configuration est incomplète : il te dit ce qui manque.",
            es: "El coach de voz ya no responde con un error cuando su configuración está incompleta: te dice qué falta.",
            de: "Der Sprach-Coach antwortet nicht mehr mit einem Fehler, wenn seine Einrichtung unvollständig ist: Er sagt dir, was fehlt.",
            it: "Il coach vocale non risponde più con un errore quando la sua configurazione è incompleta: ti dice cosa manca.",
          },
          {
            en: "Dates now respect the timezone you selected.",
            fr: "Les dates respectent le fuseau horaire que tu as choisi.",
            es: "Las fechas respetan la zona horaria que has elegido.",
            de: "Datumsangaben berücksichtigen jetzt die von dir gewählte Zeitzone.",
            it: "Le date ora rispettano il fuso orario che hai selezionato.",
          },
          {
            en: "Two tracks recorded at the same time no longer mix their sessions.",
            fr: "Deux circuits enregistrés à la même heure ne mélangent plus leurs sessions.",
            es: "Dos circuitos registrados a la misma hora ya no mezclan sus sesiones.",
            de: "Zwei zur gleichen Zeit aufgezeichnete Strecken vermischen ihre Sessions nicht mehr.",
            it: "Due circuiti registrati alla stessa ora non mescolano più le loro sessioni.",
          },
          {
            en: "The Lamborghini Huracán steering wheel image never showed up.",
            fr: "L'image du volant de la Lamborghini Huracán ne s'affichait jamais.",
            es: "La imagen del volante del Lamborghini Huracán nunca se mostraba.",
            de: "Das Lenkrad-Bild des Lamborghini Huracán wurde nie angezeigt.",
            it: "L'immagine del volante della Lamborghini Huracán non veniva mai mostrata.",
          },
          {
            en: "Some labels displayed the wrong text.",
            fr: "Certains libellés affichaient le mauvais texte.",
            es: "Algunas etiquetas mostraban el texto incorrecto.",
            de: "Einige Beschriftungen zeigten den falschen Text an.",
            it: "Alcune etichette mostravano il testo sbagliato.",
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
