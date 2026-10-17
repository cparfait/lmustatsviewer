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
    version: "1.0.10",
    date: "2026-10-06",
    dev: true,
    localized: true,
    sections: [
      {
        kind: "added",
        items: [
          {
            text: {
              en: "AI coach video guides: new circuits Barcelona, Paul Ricard (1A-V2 and 1A-V2 Short) and Silverstone (WEC and ELMS) in Hypercar and LMGT3, missing Hypercar guides for Lusail, Imola, Interlagos and COTA, the LMP3 class at 8 circuits, and the new commented guides for Long Beach and Road Atlanta. The guide now follows the layout you drive (Sebring School, Monza Curva Grande, Fuji Classic…) and never points to a video from another layout.",
              fr: "Guides vidéo du Coach IA : nouveaux circuits Barcelone, Paul Ricard (1A-V2 et 1A-V2 Short) et Silverstone (WEC et ELMS) en Hypercar et LMGT3, guides Hypercar manquants à Lusail, Imola, Interlagos et COTA, classe LMP3 sur 8 circuits, et nouveaux guides commentés de Long Beach et Road Atlanta. Le guide suit désormais le tracé roulé (Sebring School, Monza Curva Grande, Fuji Classic…) et ne renvoie jamais vers la vidéo d'un autre tracé.",
              es: "Guías en vídeo del Coach IA: nuevos circuitos Barcelona, Paul Ricard (1A-V2 y 1A-V2 Short) y Silverstone (WEC y ELMS) en Hypercar y LMGT3, guías Hypercar que faltaban en Lusail, Imola, Interlagos y COTA, la clase LMP3 en 8 circuitos y nuevas guías comentadas de Long Beach y Road Atlanta. La guía sigue ahora el trazado que conduces (Sebring School, Monza Curva Grande, Fuji Classic…) y nunca remite al vídeo de otro trazado.",
              de: "Videoguides des KI-Coachs: neue Strecken Barcelona, Paul Ricard (1A-V2 und 1A-V2 Short) und Silverstone (WEC und ELMS) in Hypercar und LMGT3, fehlende Hypercar-Guides für Lusail, Imola, Interlagos und COTA, die Klasse LMP3 auf 8 Strecken sowie neue kommentierte Guides für Long Beach und Road Atlanta. Der Guide folgt jetzt der gefahrenen Streckenvariante (Sebring School, Monza Curva Grande, Fuji Classic…) und verweist nie auf das Video einer anderen Variante.",
              it: "Guide video del Coach IA: nuovi circuiti Barcellona, Paul Ricard (1A-V2 e 1A-V2 Short) e Silverstone (WEC ed ELMS) in Hypercar e LMGT3, guide Hypercar mancanti a Lusail, Imola, Interlagos e COTA, la classe LMP3 su 8 circuiti e nuove guide commentate di Long Beach e Road Atlanta. La guida segue ora il tracciato che guidi (Sebring School, Monza Curva Grande, Fuji Classic…) e non rimanda mai al video di un altro tracciato.",
            },
          },
          {
            text: {
              en: "Radio effect: profiles in a drop-down list, with three new, dirtier ones — “Track walkie-talkie”, “Overdriven radio” (degraded digital sound) and “Weak signal” (crackles and dropouts) — and a “Test” button that plays a phrase with the chosen profile. “Pit radio” stays the default, “Classic” is still there.",
              fr: "Effet radio : profils dans une liste déroulante, avec trois nouveaux plus sales — « Talkie de piste », « Radio saturée » (son numérique dégradé) et « Signal faible » (crachotements et décrochages) — et un bouton « Tester » qui joue une phrase avec le profil choisi. « Radio stand » reste le défaut, « Classique » est toujours là.",
              es: "Efecto de radio: perfiles en una lista desplegable, con tres nuevos más sucios — «Walkie de pista», «Radio saturada» (sonido digital degradado) y «Señal débil» (chisporroteos y cortes) — y un botón «Probar» que reproduce una frase con el perfil elegido. «Radio de box» sigue por defecto y «Clásico» sigue disponible.",
              de: "Funkeffekt: Profile in einer Auswahlliste, mit drei neuen, schmutzigeren — „Streckenfunkgerät“, „Übersteuerter Funk“ (verschlechterter Digitalklang) und „Schwaches Signal“ (Knistern und Aussetzer) — und einer Schaltfläche „Testen“, die einen Satz mit dem gewählten Profil abspielt. „Boxenfunk“ bleibt Standard, „Klassisch“ gibt es weiterhin.",
              it: "Effetto radio: profili in un elenco a discesa, con tre nuovi più sporchi — «Walkie di pista», «Radio saturata» (suono digitale degradato) e «Segnale debole» (gracchii e cadute) — e un pulsante «Prova» che riproduce una frase con il profilo scelto. «Radio box» resta il predefinito, «Classico» è sempre disponibile.",
            },
          },
          {
            text: {
              en: "Steering-wheel button in the top bar: launches Le Mans Ultimate through Steam (as from your library), or from the detected game folder if Steam does not respond. A green dot shows when the game is already running.",
              fr: "Bouton volant dans la barre du haut : lance Le Mans Ultimate par Steam (comme depuis ta bibliothèque), ou depuis le dossier du jeu détecté si Steam ne répond pas. Une pastille verte indique que le jeu tourne déjà.",
              es: "Botón del volante en la barra superior: inicia Le Mans Ultimate a través de Steam (como desde tu biblioteca) o desde la carpeta del juego detectada si Steam no responde. Un punto verde indica que el juego ya está en marcha.",
              de: "Lenkrad-Schaltfläche in der oberen Leiste: startet Le Mans Ultimate über Steam (wie aus deiner Bibliothek) oder aus dem erkannten Spielordner, falls Steam nicht reagiert. Ein grüner Punkt zeigt, dass das Spiel bereits läuft.",
              it: "Pulsante volante nella barra in alto: avvia Le Mans Ultimate tramite Steam (come dalla tua libreria) o dalla cartella del gioco rilevata se Steam non risponde. Un punto verde indica che il gioco è già in esecuzione.",
            },
          },
          {
            text: {
              en: "Overlays page: a “VR” button at the top switches the page to VR mode — local addresses start by themselves, a short guide explains the OpenKneeboard steps, and each widget card offers “Copy VR address” (transparent widget that floats above the game). Click VR again to get the normal page back.",
              fr: "Page Overlays : un bouton « VR » en haut passe la page en mode VR — les adresses locales démarrent toutes seules, un court guide donne les gestes dans OpenKneeboard, et chaque carte de widget propose « Copier l'adresse VR » (widget transparent qui flotte au-dessus du jeu). Un nouveau clic sur VR rend la page normale.",
              es: "Página Overlays: un botón «VR» arriba pasa la página a modo VR — las direcciones locales se inician solas, una breve guía explica los pasos en OpenKneeboard y cada tarjeta de widget ofrece «Copiar dirección VR» (widget transparente que flota sobre el juego). Otro clic en VR devuelve la página normal.",
              de: "Seite Overlays: Eine Schaltfläche „VR“ oben schaltet die Seite in den VR-Modus — lokale Adressen starten von selbst, eine kurze Anleitung zeigt die Schritte in OpenKneeboard, und jede Widget-Karte bietet „VR-Adresse kopieren“ (transparentes Widget, das über dem Spiel schwebt). Ein weiterer Klick auf VR stellt die normale Seite wieder her.",
              it: "Pagina Overlay: un pulsante «VR» in alto passa la pagina in modalità VR — gli indirizzi locali si avviano da soli, una breve guida spiega i passi in OpenKneeboard e ogni scheda widget offre «Copia indirizzo VR» (widget trasparente che fluttua sopra il gioco). Un altro clic su VR riporta la pagina normale.",
            },
          },
          {
            text: {
              en: "Pit limiter reminders from the engineer: entering the pit lane without the limiter (“Pit entry, limiter on”), and back on track with the limiter still on (“Limiter off!”). Once per pass, nothing when leaving the garage.",
              fr: "Rappels du limiteur par l'ingénieur : entrée dans la voie des stands sans limiteur (« Entrée des stands, mets le limiteur ») et retour en piste avec le limiteur encore actif (« Enlève le limiteur ! »). Une fois par passage, rien au départ du garage.",
              es: "Recordatorios del limitador por el ingeniero: entrada en el pit lane sin limitador («Entrada a boxes, pon el limitador») y vuelta a pista con el limitador aún puesto («¡Quita el limitador!»). Una vez por paso, nada al salir del garaje.",
              de: "Begrenzer-Erinnerungen vom Ingenieur: Einfahrt in die Boxengasse ohne Begrenzer („Boxeneinfahrt, Begrenzer rein“) und zurück auf der Strecke mit noch aktivem Begrenzer („Begrenzer raus!“). Einmal pro Durchfahrt, nichts beim Verlassen der Garage.",
              it: "Promemoria del limitatore dall'ingegnere: ingresso in pit lane senza limitatore («Ingresso box, inserisci il limitatore») e ritorno in pista con il limitatore ancora inserito («Togli il limitatore!»). Una volta per passaggio, niente all'uscita dal garage.",
            },
          },
          {
            text: {
              en: "Live page: a “Tablet race control” button in the top bar opens its settings directly.",
              fr: "Page Live : un bouton « Régie tablette » dans la barre du haut ouvre directement ses réglages.",
              es: "Página Live: un botón «Dirección en tableta» en la barra superior abre directamente sus ajustes.",
              de: "Live-Seite: Eine Schaltfläche „Rennleitung auf Tablet“ in der oberen Leiste öffnet direkt ihre Einstellungen.",
              it: "Pagina Live: un pulsante «Direzione gara su tablet» nella barra in alto apre direttamente le sue impostazioni.",
            },
          },
          {
            text: {
              en: "Overlay appearance (“Appearance” button at the top of the Overlays page, with a live preview on sample data; everything off by default; the Classic style stays the default): a new Instrument style with sharp corners, relief lines, colours that always mean the same thing (green = gain, purple = session best, red = loss), standings rows tinted by class with three densities, and throttle/brake graphs drawn in high definition. Options for all styles: display font with fixed-width digits, fibre texture, and a short animation when you set a personal or class best.",
              fr: "Apparence des overlays (bouton « Apparence » en haut de la page Overlays, avec un aperçu en direct sur des données d'exemple ; tout désactivé par défaut ; le style Classique reste celui d'origine) : nouveau style Instrument aux angles vifs, filets de relief, couleurs qui ont toujours le même sens (vert = gain, violet = meilleur de la session, rouge = perte), lignes du classement teintées par classe avec trois densités, graphes accélérateur/frein dessinés en haute définition. Options pour tous les styles : police d'affichage à chiffres fixes, texture fibrée, courte animation quand tombe un record perso ou de la classe.",
              es: "Apariencia de los overlays (botón «Apariencia» arriba en la página Overlays, con vista previa en directo sobre datos de ejemplo; todo desactivado por defecto; el estilo Clásico sigue siendo el de origen): nuevo estilo Instrumento con esquinas vivas, filetes en relieve, colores que siempre significan lo mismo (verde = ganancia, violeta = mejor de la sesión, rojo = pérdida), filas de la clasificación teñidas por clase con tres densidades y gráficos de acelerador/freno en alta definición. Opciones para todos los estilos: fuente con cifras de ancho fijo, textura de fibra y una breve animación al lograr un récord personal o de la clase.",
              de: "Overlay-Darstellung (Schaltfläche „Darstellung“ oben auf der Seite Overlays, mit Live-Vorschau auf Beispieldaten; alles standardmäßig aus; der Stil Klassisch bleibt der ursprüngliche): neuer Stil Instrument mit scharfen Ecken, Relieflinien, Farben mit immer gleicher Bedeutung (Grün = Gewinn, Violett = Session-Bestzeit, Rot = Verlust), nach Klasse eingefärbten Ranglistenzeilen in drei Dichten und hochauflösenden Gas-/Bremsgrafiken. Optionen für alle Stile: Anzeigeschrift mit festen Ziffernbreiten, Fasertextur und eine kurze Animation bei persönlicher oder Klassenbestzeit.",
              it: "Aspetto degli overlay (pulsante «Aspetto» in alto nella pagina Overlay, con anteprima dal vivo su dati di esempio; tutto disattivato di default; lo stile Classico resta quello originale): nuovo stile Strumento con angoli vivi, filetti in rilievo, colori che hanno sempre lo stesso significato (verde = guadagno, viola = migliore della sessione, rosso = perdita), righe della classifica colorate per classe con tre densità e grafici acceleratore/freno in alta definizione. Opzioni per tutti gli stili: font con cifre a larghezza fissa, texture in fibra e una breve animazione quando stabilisci un record personale o della classe.",
            },
          },
          {
            featured: true,
            text: {
              en: "Overlay widgets by address, for VR, OBS and a second screen (Overlays page › Widgets by address, off by default): each widget opens on its own at a local address on this PC, with a transparent background and the content and colours set on the Overlays page. In VR, add a “Web Dashboard” tab in OpenKneeboard and paste the address: the panel takes the widget's size. In OBS, add a “Browser” source. Options: opaque background, scale. Read-only, this PC only; nothing is injected into the game.",
              fr: "Widgets d'overlay par adresse, pour la VR, OBS et un 2ᵉ écran (page Overlays › Widgets par adresse, désactivé par défaut) : chaque widget s'ouvre seul à une adresse locale de ce PC, sur fond transparent, avec le contenu et les couleurs réglés dans la page Overlays. En VR, ajoute un onglet « Web Dashboard » dans OpenKneeboard et colle l'adresse : le panneau prend la taille du widget. Dans OBS, ajoute une source « Navigateur ». Options : fond opaque, échelle. Lecture seule, réservé à ce PC ; rien n'est injecté dans le jeu.",
              es: "Widgets de overlay por dirección, para VR, OBS y una 2.ª pantalla (página Overlays › Widgets por dirección, desactivado por defecto): cada widget se abre solo en una dirección local de este PC, con fondo transparente y el contenido y los colores ajustados en la página Overlays. En VR, añade una pestaña «Web Dashboard» en OpenKneeboard y pega la dirección: el panel toma el tamaño del widget. En OBS, añade una fuente «Navegador». Opciones: fondo opaco, escala. Solo lectura, solo en este PC; no se inyecta nada en el juego.",
              de: "Overlay-Widgets per Adresse, für VR, OBS und einen zweiten Bildschirm (Seite Overlays › Widgets per Adresse, standardmäßig aus): Jedes Widget öffnet sich einzeln unter einer lokalen Adresse dieses PCs, mit transparentem Hintergrund und den auf der Seite Overlays eingestellten Inhalten und Farben. In VR fügst du in OpenKneeboard einen Tab „Web Dashboard“ hinzu und fügst die Adresse ein: Das Panel übernimmt die Größe des Widgets. In OBS fügst du eine Quelle „Browser“ hinzu. Optionen: deckender Hintergrund, Skalierung. Nur lesend, nur auf diesem PC; nichts wird ins Spiel eingeschleust.",
              it: "Widget degli overlay per indirizzo, per VR, OBS e un secondo schermo (pagina Overlays › Widget per indirizzo, disattivato di default): ogni widget si apre da solo a un indirizzo locale di questo PC, con sfondo trasparente e il contenuto e i colori impostati nella pagina Overlays. In VR, aggiungi una scheda «Web Dashboard» in OpenKneeboard e incolla l'indirizzo: il pannello prende la dimensione del widget. In OBS, aggiungi una sorgente «Browser». Opzioni: sfondo opaco, scala. Sola lettura, solo su questo PC; nel gioco non viene iniettato nulla.",
            },
          },
          {
            featured: true,
            text: {
              en: "Leaderboard page, new optional tabs (Settings › Sessions › module options, off by default): Car index (each car of a class, layout by layout, as a % of the fastest), Patch effect (median gap of drivers who drove the same combo before and after a game update) and Rival of the week (a duel each week with a driver of similar pace, on the tracks you both drive; opt-in, needs community sharing). Tiers can also come from the community database (average of the 5 fastest drivers on the latest game version) instead of the ohne_speed sheet, which stays the default.",
              fr: "Page Classement, nouveaux onglets en option (Configuration › Sessions › options du module, désactivés par défaut) : Index voitures (chaque voiture d'une classe, tracé par tracé, en % de la plus rapide), Effet du patch (écart médian des pilotes qui ont roulé le même combo avant et après une mise à jour du jeu) et Rival de la semaine (un duel chaque semaine avec un pilote de rythme proche, sur les circuits que vous roulez tous les deux ; inscription volontaire, partage communautaire requis). Les paliers peuvent aussi venir de la base communautaire (moyenne des 5 meilleurs pilotes sur la version la plus récente du jeu) au lieu de la feuille ohne_speed, qui reste la valeur par défaut.",
              es: "Página Clasificación, nuevas pestañas opcionales (Configuración › Sesiones › opciones del módulo, desactivadas por defecto): Índice de coches (cada coche de una clase, trazado a trazado, en % del más rápido), Efecto del parche (diferencia mediana de los pilotos que rodaron el mismo combo antes y después de una actualización del juego) y Rival de la semana (un duelo cada semana con un piloto de ritmo parecido, en los circuitos que ambos rodáis; inscripción voluntaria, requiere compartir con la comunidad). Los niveles también pueden venir de la base de la comunidad (media de los 5 pilotos más rápidos en la versión más reciente del juego) en lugar de la hoja ohne_speed, que sigue siendo el valor por defecto.",
              de: "Ranglisten-Seite, neue optionale Tabs (Einstellungen › Sessions › Moduloptionen, standardmäßig aus): Fahrzeugindex (jedes Auto einer Klasse, Layout für Layout, in % des schnellsten), Patch-Effekt (medianer Abstand der Fahrer, die dieselbe Kombination vor und nach einem Spiel-Update gefahren sind) und Rivale der Woche (jede Woche ein Duell mit einem Fahrer ähnlichen Tempos auf den Strecken, die ihr beide fahrt; freiwillige Anmeldung, Community-Teilen erforderlich). Die Stufen können auch aus der Community-Datenbank kommen (Durchschnitt der 5 schnellsten Fahrer auf der neuesten Spielversion) statt aus der ohne_speed-Tabelle, die der Standard bleibt.",
              it: "Pagina Classifica, nuove schede opzionali (Impostazioni › Sessioni › opzioni del modulo, disattivate di default): Indice vetture (ogni vettura di una classe, tracciato per tracciato, in % della più veloce), Effetto della patch (distacco mediano dei piloti che hanno girato sulla stessa combinazione prima e dopo un aggiornamento del gioco) e Rivale della settimana (un duello ogni settimana con un pilota dal ritmo simile, sui circuiti che guidate entrambi; iscrizione volontaria, richiede la condivisione con la community). I livelli possono anche venire dal database della community (media dei 5 piloti più veloci sull'ultima versione del gioco) invece che dal foglio ohne_speed, che resta il valore predefinito.",
            },
          },
          {
            text: {
              en: "Community opponent briefing (Settings › Community, off by default): in Live › Standings, the best lap, rank and level of the session's drivers who share their laps under their name. Anonymous drivers never appear.",
              fr: "Briefing adversaires de la communauté (Configuration › Communauté, désactivé par défaut) : dans Live › Classement, meilleur tour, rang et niveau des pilotes de la session qui partagent leurs tours sous leur nom. Les pilotes anonymes n'apparaissent jamais.",
              es: "Briefing de rivales de la comunidad (Configuración › Comunidad, desactivado por defecto): en Live › Clasificación, mejor vuelta, posición y nivel de los pilotos de la sesión que comparten sus vueltas con su nombre. Los pilotos anónimos nunca aparecen.",
              de: "Community-Gegner-Briefing (Einstellungen › Community, standardmäßig aus): In Live › Wertung beste Runde, Rang und Stufe der Session-Fahrer, die ihre Runden unter ihrem Namen teilen. Anonyme Fahrer erscheinen nie.",
              it: "Briefing avversari della community (Impostazioni › Community, disattivato di default): in Live › Classifica, giro migliore, posizione e livello dei piloti della sessione che condividono i giri con il loro nome. I piloti anonimi non compaiono mai.",
            },
          },
          {
            text: {
              en: "Choice of the engineer's microphone (Settings → Audio / Voice → “Microphone”): push-to-talk, wake word and dictation listen to the chosen mic instead of the Windows default, with a Refresh button and a level meter to test it. If the chosen mic is unplugged, the app switches to the Windows default and tells you, then picks yours up again once it's back. The Windows default microphone stays the default choice.",
              fr: "Choix du micro de l'ingénieur (Configuration → Audio / Voix → « Micro ») : push-to-talk, mot déclencheur et dictée écoutent le micro choisi au lieu du micro par défaut de Windows, avec un bouton Actualiser et un vumètre pour le tester. Si le micro choisi est débranché, l'app passe au micro par défaut de Windows et te prévient, puis reprend le tien dès qu'il revient. Le micro par défaut de Windows reste le choix par défaut.",
              es: "Elección del micrófono del ingeniero (Configuración → Audio / Voz → «Micrófono»): push-to-talk, palabra de activación y dictado escuchan el micrófono elegido en lugar del predeterminado de Windows, con un botón Actualizar y un vúmetro para probarlo. Si el micrófono elegido se desconecta, la app pasa al predeterminado de Windows y te avisa, y vuelve al tuyo en cuanto regresa. El micrófono predeterminado de Windows sigue siendo la opción por defecto.",
              de: "Wahl des Mikrofons für den Renningenieur (Einstellungen → Audio / Stimme → „Mikrofon“): Push-to-Talk, Aktivierungswort und Diktat hören auf das gewählte Mikrofon statt auf das Windows-Standardmikrofon, mit einer Schaltfläche Aktualisieren und einer Pegelanzeige zum Testen. Ist das gewählte Mikrofon ausgesteckt, wechselt die App zum Windows-Standard und sagt es dir, und nimmt deines wieder, sobald es zurück ist. Das Windows-Standardmikrofon bleibt die Voreinstellung.",
              it: "Scelta del microfono dell'ingegnere (Impostazioni → Audio / Voce → «Microfono»): push-to-talk, parola di attivazione e dettatura ascoltano il microfono scelto invece di quello predefinito di Windows, con un pulsante Aggiorna e un vu-meter per provarlo. Se il microfono scelto viene scollegato, l'app passa a quello predefinito di Windows e te lo segnala, poi riprende il tuo appena torna. Il microfono predefinito di Windows resta la scelta predefinita.",
            },
          },
          {
            text: {
              en: "Telemetry: “Weak spots of the lap” under the delta chart — the 1 to 5 corners where you lose the most time against the reference, with the dominant phase (braking, mid-corner, exit) and the share of your total gap; one click compares the lap with your best lap of the file.",
              fr: "Télémétrie : « Points faibles du tour » sous le graphe d'écart — les 1 à 5 virages où tu perds le plus de temps face à la référence, avec la phase en cause (freinage, milieu, sortie) et leur part dans ton écart total ; un clic compare le tour à ton meilleur tour du fichier.",
              es: "Telemetría: «Puntos débiles de la vuelta» bajo el gráfico de diferencia — las 1 a 5 curvas donde más tiempo pierdes frente a la referencia, con la fase en causa (frenada, mitad, salida) y su parte en tu diferencia total; un clic compara la vuelta con tu mejor vuelta del archivo.",
              de: "Telemetrie: „Schwachstellen der Runde“ unter dem Delta-Diagramm — die 1 bis 5 Kurven, in denen du gegenüber der Referenz am meisten Zeit verlierst, mit der betroffenen Phase (Bremsen, Mitte, Ausgang) und ihrem Anteil am Gesamtabstand; ein Klick vergleicht die Runde mit deiner besten Runde der Datei.",
              it: "Telemetria: «Punti deboli del giro» sotto il grafico del distacco — le 1-5 curve in cui perdi più tempo rispetto al riferimento, con la fase in causa (frenata, centro, uscita) e la loro quota nel distacco totale; un clic confronta il giro con il tuo giro migliore del file.",
            },
          },
          {
            text: {
              en: "Analysis options (Settings › Preferences, each off by default): a “Consistency” tab in session details (spread of your laps, share within 0.3 / 0.5 / 1 s of your best, least consistent sector); a “Comparable laps” badge (online, dedicated server, no braking or steering help — server read from the results files, reindex for older sessions); record callouts while driving (personal record, class best of the session, community record — said by the engineer when his voice callouts are on, also prepared for the AI voice, otherwise 1, 2 or 3 beeps); review marks placed with a wheel button or a shortcut (confirmed by voice or a short beep), listed afterwards in the session's Incidents tab.",
              fr: "Options d'analyse (Configuration › Préférences, chacune désactivée par défaut) : onglet « Régularité » dans le détail des sessions (dispersion de tes tours, part à moins de 0,3 / 0,5 / 1 s de ton meilleur, secteur le moins régulier) ; badge « Tours comparables » (en ligne, serveur dédié, sans aide au freinage ni à la direction — serveur lu dans les fichiers de résultats, réindexer pour les anciennes sessions) ; annonces de record au volant (record perso, meilleur de la classe en session, record communautaire — dites par l'ingénieur quand ses annonces vocales sont actives, préparées aussi pour la voix IA, sinon 1, 2 ou 3 bips) ; repères de revue posés avec un bouton du volant ou un raccourci (confirmés à la voix ou par un bip court), listés ensuite dans l'onglet Incidents de la session.",
              es: "Opciones de análisis (Configuración › Preferencias, cada una desactivada por defecto): pestaña «Regularidad» en el detalle de las sesiones (dispersión de tus vueltas, porcentaje a menos de 0,3 / 0,5 / 1 s de tu mejor, sector menos regular); insignia «Vueltas comparables» (online, servidor dedicado, sin ayuda de frenada ni de dirección — servidor leído en los archivos de resultados, reindexa para las sesiones antiguas); avisos de récord al volante (récord personal, mejor de la clase en la sesión, récord de la comunidad — dichos por el ingeniero cuando sus avisos de voz están activos, preparados también para la voz IA, si no 1, 2 o 3 pitidos); marcas de revisión puestas con un botón del volante o un atajo (confirmadas de viva voz o con un pitido corto), listadas luego en la pestaña Incidentes de la sesión.",
              de: "Analyse-Optionen (Einstellungen › Präferenzen, jeweils standardmäßig aus): Tab „Konstanz“ in den Session-Details (Streuung deiner Runden, Anteil unter 0,3 / 0,5 / 1 s deiner besten, unbeständigster Sektor); Abzeichen „Vergleichbare Runden“ (online, dedizierter Server, ohne Brems- und Lenkhilfe — Server aus den Ergebnisdateien gelesen, ältere Sessions neu indexieren); Rekord-Ansagen beim Fahren (persönlicher Rekord, Klassenbeste der Session, Community-Rekord — vom Ingenieur gesagt, wenn seine Sprachansagen aktiv sind, auch für die KI-Stimme vorbereitet, sonst 1, 2 oder 3 Pieptöne); Review-Markierungen per Lenkradtaste oder Tastenkürzel (per Stimme oder kurzem Piepton bestätigt), danach im Tab Vorfälle der Session aufgelistet.",
              it: "Opzioni di analisi (Impostazioni › Preferenze, ciascuna disattivata di default): scheda «Costanza» nel dettaglio delle sessioni (dispersione dei tuoi giri, quota entro 0,3 / 0,5 / 1 s dal tuo migliore, settore meno costante); badge «Giri confrontabili» (online, server dedicato, senza aiuto in frenata né allo sterzo — server letto dai file dei risultati, reindicizza le sessioni più vecchie); annunci di record alla guida (record personale, migliore della classe in sessione, record della community — detti dall'ingegnere quando i suoi annunci vocali sono attivi, preparati anche per la voce IA, altrimenti 1, 2 o 3 bip); segnalini di revisione posati con un pulsante del volante o una scorciatoia (confermati a voce o con un breve bip), elencati poi nella scheda Incidenti della sessione.",
            },
          },
          {
            text: {
              en: "New Settings category “Tools & diagnostics”: launch your tools (OpenKneeboard, SimHub, Crew Chief…) automatically when LMU starts, and optionally close them when it stops (off by default); read-only PC diagnostics (game folder, shared memory plugin installed and enabled, display mode and VSync, game API, OpenKneeboard).",
              fr: "Nouvelle catégorie de Configuration « Outils & diagnostic » : lance tes outils (OpenKneeboard, SimHub, Crew Chief…) automatiquement au démarrage de LMU, et ferme-les à son arrêt si tu veux (désactivé par défaut) ; diagnostic du PC en lecture seule (dossier du jeu, plugin de mémoire partagée installé et activé, mode d'affichage et VSync, API du jeu, OpenKneeboard).",
              es: "Nueva categoría de Configuración «Herramientas y diagnóstico»: abre tus herramientas (OpenKneeboard, SimHub, Crew Chief…) automáticamente al iniciar LMU y, si quieres, ciérralas al salir (desactivado por defecto); diagnóstico del PC en solo lectura (carpeta del juego, plugin de memoria compartida instalado y activado, modo de pantalla y VSync, API del juego, OpenKneeboard).",
              de: "Neue Einstellungskategorie „Tools & Diagnose“: Starte deine Tools (OpenKneeboard, SimHub, Crew Chief…) automatisch mit LMU und schließe sie auf Wunsch beim Beenden (standardmäßig aus); PC-Diagnose nur lesend (Spielordner, Shared-Memory-Plugin installiert und aktiviert, Anzeigemodus und VSync, Spiel-API, OpenKneeboard).",
              it: "Nuova categoria di Impostazioni «Strumenti e diagnostica»: avvia i tuoi strumenti (OpenKneeboard, SimHub, Crew Chief…) automaticamente all'avvio di LMU e, se vuoi, chiudili alla sua chiusura (disattivato di default); diagnostica del PC in sola lettura (cartella del gioco, plugin della memoria condivisa installato e attivato, modalità di visualizzazione e VSync, API del gioco, OpenKneeboard).",
            },
          },
          {
            featured: true,
            text: {
              en: "Race control on a tablet or second screen (Settings › Tablet race control, off by default): the app shows an address and a QR code; open it in the browser of a tablet, phone or another PC on your local network and enter the 6-digit code. Five layouts to choose from on the tablet: Timing (all classes), Engineer (position, gaps, fuel, virtual energy, brake pads, tyres, weather), Map, Duel (the cars ahead and behind in your class) and TV (time left, class leaders, map). Read-only: nothing can be changed from the tablet.",
              fr: "Régie sur tablette ou 2ᵉ écran (Configuration › Régie tablette, désactivée par défaut) : l'app affiche une adresse et un QR code ; ouvre-la dans le navigateur d'une tablette, d'un téléphone ou d'un autre PC de ton réseau local et saisis le code à 6 chiffres. Cinq gabarits au choix sur la tablette : Classement (toutes classes), Ingénieur (position, écarts, carburant, énergie virtuelle, plaquettes, pneus, météo), Carte, Duel (les voitures devant et derrière dans ta classe) et TV (temps restant, leaders de classe, carte). Lecture seule : rien ne peut être modifié depuis la tablette.",
              es: "Dirección de carrera en tableta o 2.ª pantalla (Configuración › Dirección en tableta, desactivada por defecto): la app muestra una dirección y un código QR; ábrela en el navegador de una tableta, un móvil u otro PC de tu red local e introduce el código de 6 cifras. Cinco plantillas a elegir en la tableta: Clasificación (todas las clases), Ingeniero (posición, diferencias, combustible, energía virtual, pastillas, neumáticos, meteo), Mapa, Duelo (los coches de delante y de detrás en tu clase) y TV (tiempo restante, líderes de clase, mapa). Solo lectura: no se puede cambiar nada desde la tableta.",
              de: "Rennleitung auf Tablet oder zweitem Bildschirm (Einstellungen › Rennleitung auf Tablet, standardmäßig aus): Die App zeigt eine Adresse und einen QR-Code; öffne sie im Browser eines Tablets, Handys oder anderen PCs in deinem lokalen Netz und gib den 6-stelligen Code ein. Fünf Layouts zur Auswahl auf dem Tablet: Zeitenliste (alle Klassen), Ingenieur (Position, Abstände, Kraftstoff, virtuelle Energie, Bremsbeläge, Reifen, Wetter), Karte, Duell (die Autos vor und hinter dir in deiner Klasse) und TV (Restzeit, Klassenführende, Karte). Nur lesend: Vom Tablet aus lässt sich nichts ändern.",
              it: "Direzione gara su tablet o secondo schermo (Impostazioni › Direzione gara su tablet, disattivata di default): l'app mostra un indirizzo e un codice QR; aprilo nel browser di un tablet, di un telefono o di un altro PC della tua rete locale e inserisci il codice a 6 cifre. Cinque layout a scelta sul tablet: Classifica (tutte le classi), Ingegnere (posizione, distacchi, carburante, energia virtuale, pastiglie, gomme, meteo), Mappa, Duello (le auto davanti e dietro nella tua classe) e TV (tempo rimanente, leader di classe, mappa). Sola lettura: dal tablet non si può modificare nulla.",
            },
          },
          {
            text: {
              en: "Rate the engineer's calls: say \"useful\", \"useless\", \"too late\" or \"wrong\" on the radio right after a call, or rate the session's calls afterwards (\"Radio\" button on the Live page). Types of calls mostly rated useless or wrong come less often; safety calls (flags, damage, box…) are always said. Ratings stay on your PC.",
              fr: "Note les annonces de l'ingénieur : dis « utile », « inutile », « trop tard » ou « faux » à la radio juste après une annonce, ou note celles de la session après coup (bouton « Radio » de la page Live). Les types d'annonces surtout jugés inutiles ou faux se font plus rares ; les annonces de sécurité (drapeaux, dégâts, box…) restent toujours dites. Les notes restent sur ton PC.",
              es: "Valora los avisos del ingeniero: di «útil», «inútil», «demasiado tarde» o «falso» por radio justo después de un aviso, o valora los de la sesión después (botón «Radio» de la página Live). Los tipos de avisos considerados sobre todo inútiles o falsos serán menos frecuentes; los avisos de seguridad (banderas, daños, box…) se dicen siempre. Las valoraciones se quedan en tu PC.",
              de: "Bewerte die Ansagen des Ingenieurs: Sag direkt nach einer Ansage „nützlich“, „nutzlos“, „zu spät“ oder „falsch“ über Funk, oder bewerte die Ansagen der Session danach (Schaltfläche „Funk“ auf der Live-Seite). Überwiegend als nutzlos oder falsch bewertete Arten kommen seltener; Sicherheitsansagen (Flaggen, Schäden, Box…) kommen immer. Die Bewertungen bleiben auf deinem PC.",
              it: "Valuta gli annunci dell'ingegnere: di' «utile», «inutile», «troppo tardi» o «sbagliato» in radio subito dopo un annuncio, oppure valuta quelli della sessione in seguito (pulsante «Radio» della pagina Live). I tipi di annuncio giudicati per lo più inutili o sbagliati diventano meno frequenti; gli annunci di sicurezza (bandiere, danni, box…) sono sempre detti. Le valutazioni restano sul tuo PC.",
            },
          },
          {
            text: {
              en: "Live map overlays (buttons on the map): Speed (your last lap, slow → fast), Delta (time gained / lost on each part of the track against your best lap) and Duel (click a car: mini-sectors of about 350 m timed for the whole field, green where you are faster, red where you are slower). Official turn numbers (and names on hover) appear on Spa, Monza, COTA, Silverstone, Lusail, Sebring, Interlagos, Imola, Bahrain, Road Atlanta, Barcelona, Laguna Seca, Long Beach and Daytona, only when the turns detected on the game's layout match the official numbering.",
              fr: "Surcouches de la carte Live (boutons sur la carte) : Vitesse (ton dernier tour, lent → rapide), Écart (temps gagné / perdu sur chaque portion face à ton meilleur tour) et Duel (clic sur une voiture : mini-secteurs d'environ 350 m chronométrés pour tout le plateau, en vert là où tu es plus rapide, en rouge là où tu es plus lent). Numéros officiels des virages (et noms au survol) sur Spa, Monza, COTA, Silverstone, Lusail, Sebring, Interlagos, Imola, Bahreïn, Road Atlanta, Barcelone, Laguna Seca, Long Beach et Daytona, seulement quand les virages détectés sur le tracé du jeu correspondent à la numérotation officielle.",
              es: "Capas del mapa en directo (botones en el mapa): Velocidad (tu última vuelta, lento → rápido), Diferencia (tiempo ganado / perdido en cada tramo frente a tu mejor vuelta) y Duelo (clic en un coche: minisectores de unos 350 m cronometrados para toda la parrilla, en verde donde eres más rápido, en rojo donde eres más lento). Números oficiales de las curvas (y nombres al pasar el ratón) en Spa, Monza, COTA, Silverstone, Lusail, Sebring, Interlagos, Imola, Baréin, Road Atlanta, Barcelona, Laguna Seca, Long Beach y Daytona, solo cuando las curvas detectadas en el trazado del juego coinciden con la numeración oficial.",
              de: "Ebenen der Live-Karte (Schaltflächen auf der Karte): Tempo (deine letzte Runde, langsam → schnell), Delta (gewonnene / verlorene Zeit je Abschnitt gegenüber deiner besten Runde) und Duell (Klick auf ein Auto: Mini-Sektoren von etwa 350 m für das ganze Feld gestoppt, grün wo du schneller bist, rot wo du langsamer bist). Offizielle Kurvennummern (Namen beim Überfahren) in Spa, Monza, COTA, Silverstone, Lusail, Sebring, Interlagos, Imola, Bahrain, Road Atlanta, Barcelona, Laguna Seca, Long Beach und Daytona, nur wenn die auf dem Streckenverlauf des Spiels erkannten Kurven zur offiziellen Nummerierung passen.",
              it: "Livelli della mappa live (pulsanti sulla mappa): Velocità (il tuo ultimo giro, lento → veloce), Distacco (tempo guadagnato / perso su ogni tratto rispetto al tuo giro migliore) e Duello (clic su un'auto: minisettori di circa 350 m cronometrati per tutto lo schieramento, in verde dove sei più veloce, in rosso dove sei più lento). Numeri ufficiali delle curve (e nomi al passaggio del mouse) a Spa, Monza, COTA, Silverstone, Lusail, Sebring, Interlagos, Imola, Bahrein, Road Atlanta, Barcellona, Laguna Seca, Long Beach e Daytona, solo quando le curve rilevate sul tracciato del gioco corrispondono alla numerazione ufficiale.",
            },
          },
          {
            text: {
              en: "Experimental: the app can now write to the game's pit menu, only if you allow it (Display › Live options, off by default). The Strategy page shows the game's pit menu live and lets you change it from there; every change is read back from the game. Optional automatic pit energy: in races, when the stop gets close, the virtual energy for the stop is set to what you need to finish (+ ½ lap) or a full charge — if you change it yourself, the app leaves it alone until your next stop. For testing off track, a replay bench (Config › Maintenance) records a session and replays it through the engineer's detectors (npm run replay).",
              fr: "Expérimental : l'app peut désormais écrire dans le menu des stands du jeu, seulement si tu l'autorises (Affichage › options Live, coupé par défaut). La page Stratégie affiche le menu des stands du jeu en direct et permet de le modifier d'ici ; chaque changement est relu dans le jeu. Énergie au stand automatique en option : en course, quand l'arrêt approche, l'énergie virtuelle de l'arrêt est réglée sur ce qu'il faut pour finir (+ ½ tour) ou sur le plein — si tu la changes toi-même, l'app n'y touche plus jusqu'à ton prochain arrêt. Pour tester hors piste, un banc de rejeu (Config › Maintenance) enregistre une session et la rejoue dans les détecteurs de l'ingénieur (npm run replay).",
              es: "Experimental: la app ahora puede escribir en el menú de boxes del juego, solo si lo permites (Visualización › opciones En directo, desactivado por defecto). La página Estrategia muestra el menú de boxes del juego en directo y permite modificarlo desde ahí; cada cambio se vuelve a leer en el juego. Energía en boxes automática opcional: en carrera, cuando se acerca la parada, la energía virtual de la parada se ajusta a lo necesario para terminar (+ ½ vuelta) o a la carga completa; si la cambias tú, la app no la toca hasta tu próxima parada. Para probar fuera de pista, un banco de repetición (Config › Mantenimiento) graba una sesión y la repite en los detectores del ingeniero (npm run replay).",
              de: "Experimentell: Die App kann jetzt ins Boxenmenü des Spiels schreiben, aber nur, wenn du es erlaubst (Anzeige › Live-Optionen, standardmäßig aus). Die Seite Strategie zeigt das Boxenmenü des Spiels live und erlaubt es, es dort zu ändern; jede Änderung wird im Spiel zurückgelesen. Optional automatische Energie beim Stopp: Im Rennen wird, wenn der Stopp näher rückt, die virtuelle Energie des Stopps auf das eingestellt, was du bis ins Ziel brauchst (+ ½ Runde), oder auf voll — änderst du sie selbst, lässt die App sie bis zu deinem nächsten Stopp in Ruhe. Zum Testen abseits der Strecke zeichnet ein Wiedergabe-Prüfstand (Config › Wartung) eine Session auf und spielt sie durch die Detektoren des Ingenieurs ab (npm run replay).",
              it: "Sperimentale: l'app ora può scrivere nel menu dei box del gioco, solo se lo consenti (Visualizzazione › opzioni Live, disattivato per impostazione predefinita). La pagina Strategia mostra il menu dei box del gioco in diretta e permette di modificarlo da lì; ogni modifica viene riletta nel gioco. Energia ai box automatica opzionale: in gara, quando la sosta si avvicina, l'energia virtuale della sosta viene impostata su quanto serve per finire (+ ½ giro) o sul pieno — se la cambi tu, l'app non la tocca fino alla tua prossima sosta. Per provare fuori pista, un banco di replay (Config › Manutenzione) registra una sessione e la rigioca nei rilevatori dell'ingegnere (npm run replay).",
            },
          },
          {
            text: {
              en: "Engineer and spotter merged into a single \"Talk to the engineer\" tab: one way of answering for every key (the spotter's former \"Talk\" key becomes a second engineer key), and the editable command list now also works in free speech, with strict recognition as a backup when dictation gets it wrong (\"Commands only\" setting = former spotter behaviour). Status / Mute / Repeat stay as direct keys. New \"Test the engineer\": type a question and hear the answer with or without AI; commands are recognised but not carried out.",
              fr: "Ingénieur et spotter fusionnés dans un seul onglet « Parler à l'ingénieur » : une seule façon de répondre pour toutes les touches (l'ancienne touche « Parler » du spotter devient une seconde touche de l'ingénieur), et la liste des commandes modifiable marche désormais aussi en parole libre, avec la reconnaissance stricte en secours quand la dictée comprend mal (réglage « Commandes seules » = ancien fonctionnement du spotter). Statut / Mute / Répète restent des touches directes. Nouveau « Tester l'ingénieur » : tape une question et écoute la réponse avec ou sans IA ; les commandes sont reconnues mais pas exécutées.",
              es: "Ingeniero y spotter fusionados en una sola pestaña «Hablar con el ingeniero»: una sola forma de responder para todas las teclas (la antigua tecla «Hablar» del spotter pasa a ser una segunda tecla del ingeniero), y la lista de comandos editable funciona ahora también al hablar libremente, con el reconocimiento estricto de respaldo cuando el dictado entiende mal (ajuste «Solo comandos» = funcionamiento anterior del spotter). Estado / Silencio / Repetir siguen como teclas directas. Nuevo «Probar el ingeniero»: escribe una pregunta y escucha la respuesta con o sin IA; los comandos se reconocen pero no se ejecutan.",
              de: "Ingenieur und Spotter in einem Reiter „Mit dem Ingenieur sprechen“ zusammengeführt: eine einzige Antwortlogik für alle Tasten (die frühere „Sprechen“-Taste des Spotters wird zur zweiten Ingenieur-Taste), und die bearbeitbare Befehlsliste funktioniert jetzt auch beim freien Sprechen, mit der strengen Erkennung als Rückfall, wenn das Diktat falsch versteht (Einstellung „Nur Befehle“ = bisheriges Spotter-Verhalten). Status / Stumm / Wiederholen bleiben Direkttasten. Neu: „Ingenieur testen“ — Frage eintippen und die Antwort mit oder ohne KI hören; Befehle werden erkannt, aber nicht ausgeführt.",
              it: "Ingegnere e spotter uniti in un'unica scheda «Parla con l'ingegnere»: un solo modo di rispondere per tutti i tasti (il vecchio tasto «Parla» dello spotter diventa un secondo tasto dell'ingegnere), e l'elenco dei comandi modificabile funziona ora anche parlando liberamente, con il riconoscimento rigoroso di riserva quando la dettatura capisce male (impostazione «Solo comandi» = vecchio funzionamento dello spotter). Stato / Muto / Ripeti restano tasti diretti. Nuovo «Prova l'ingegnere»: scrivi una domanda e ascolta la risposta con o senza IA; i comandi vengono riconosciuti ma non eseguiti.",
            },
          },
          {
            text: {
              en: "Incident map and session highlights. While you drive, the app now records your contacts, track-limit warnings and offs (two wheels on grass or gravel), plus in races your passes, places lost, wheel-to-wheel moments and your start. The Live map shows where your incidents happen on that track across all sessions (red: contact, orange: track limits, purple: off; can be turned off in Display › Live options), and the Incidents tab of a session lists its highlights lap by lap when it was driven with the app open.",
              fr: "Carte des incidents et temps forts des sessions. Pendant que tu roules, l'app enregistre désormais tes contacts, avertissements de limites de piste et sorties (deux roues dans l'herbe ou le gravier), et en course tes dépassements, places perdues, moments de roue dans roue et ton départ. La carte Live montre où se produisent tes incidents sur ce circuit, toutes sessions confondues (rouge : contact, orange : limites de piste, violet : sortie ; désactivable dans Affichage › options du module Live), et l'onglet Incidents d'une session liste ses temps forts tour par tour quand elle a été roulée app ouverte.",
              es: "Mapa de incidentes y momentos destacados de las sesiones. Mientras ruedas, la app registra ahora tus contactos, avisos de límites de pista y salidas (dos ruedas en hierba o grava), y en carrera tus adelantamientos, posiciones perdidas, momentos rueda con rueda y tu salida. El mapa en directo muestra dónde ocurren tus incidentes en ese circuito, en todas las sesiones (rojo: contacto, naranja: límites de pista, violeta: salida; se desactiva en Visualización › opciones del módulo En directo), y la pestaña Incidentes de una sesión enumera sus momentos destacados vuelta a vuelta si se rodó con la app abierta.",
              de: "Vorfallskarte und Session-Highlights. Während du fährst, zeichnet die App jetzt deine Kontakte, Track-Limits-Warnungen und Ausritte auf (zwei Räder im Gras oder Kies), im Rennen außerdem Überholmanöver, verlorene Plätze, Rad-an-Rad-Momente und deinen Start. Die Live-Karte zeigt, wo auf dieser Strecke deine Vorfälle passieren, über alle Sessions (rot: Kontakt, orange: Track Limits, lila: Ausritt; abschaltbar unter Anzeige › Optionen des Live-Moduls), und der Reiter Vorfälle einer Session listet ihre Highlights Runde für Runde, wenn sie mit geöffneter App gefahren wurde.",
              it: "Mappa degli incidenti e momenti salienti delle sessioni. Mentre guidi, l'app ora registra contatti, avvisi dei limiti della pista e uscite (due ruote su erba o ghiaia), e in gara sorpassi, posizioni perse, momenti ruota a ruota e la tua partenza. La mappa live mostra dove avvengono i tuoi incidenti su quel circuito, in tutte le sessioni (rosso: contatto, arancione: limiti della pista, viola: uscita; disattivabile in Visualizzazione › opzioni del modulo Live), e la scheda Incidenti di una sessione elenca i momenti salienti giro per giro se è stata guidata con l'app aperta.",
            },
          },
          {
            text: {
              en: "Online AI voice for the race engineer, with your own key (beta, off by default — Settings → Audio / Voice → \"Online AI voice\"): OpenAI, ElevenLabs, Cartesia or Google Cloud, with the provider's voices listed in a searchable menu and one voice kept per app language. It says everything: information and answers to your questions live, and safety alerts (flags, puncture, box), the spotter and the coach as soon as they are prepared (\"Prepare the voice\"), so they play with no delay. An alert not prepared yet, or one it cannot assemble (a driver's name, for instance), is spoken by the local voice so it is never late; the local voice also takes over without network or if the service is slow. Setting \"Alerts on the local voice\" keeps alerts, spotter and coach on the local voice. Fixed phrases are cached so they are never paid for twice, and the month's usage is shown.",
              fr: "Voix IA en ligne pour l'ingénieur, avec ta propre clé (bêta, désactivée par défaut — Configuration → Audio / Voix → « Voix IA en ligne ») : OpenAI, ElevenLabs, Cartesia ou Google Cloud, avec les voix du fournisseur listées dans un menu (recherche par nom) et une voix retenue par langue de l'app. Elle dit tout : l'information et les réponses à tes questions en direct, et les alertes de sécurité (drapeaux, crevaison, box), le spotter et le coach dès qu'ils sont préparés (« Préparer la voix »), pour qu'ils partent sans délai. Une alerte pas encore préparée, ou qu'elle ne sait pas assembler (un nom de pilote par exemple), est dite par la voix locale pour ne jamais arriver en retard ; la voix locale prend aussi le relais sans réseau ou si le service tarde. Le réglage « Alertes en voix locale » garde alertes, spotter et coach en voix locale. Les phrases fixes sont gardées en cache pour ne jamais être payées deux fois, et la consommation du mois est affichée.",
              es: "Voz IA en línea para el ingeniero, con tu propia clave (beta, desactivada por defecto — Configuración → Audio / Voz → «Voz IA en línea»): OpenAI, ElevenLabs, Cartesia o Google Cloud, con las voces del proveedor en un menú (búsqueda por nombre) y una voz guardada por idioma de la app. Lo dice todo: la información y las respuestas a tus preguntas en directo, y las alertas de seguridad (banderas, pinchazo, box), el spotter y el coach en cuanto están preparados («Preparar la voz»), para que suenen sin retraso. Una alerta aún no preparada, o que no sabe montar (un nombre de piloto, por ejemplo), la dice la voz local para que nunca llegue tarde; la voz local también toma el relevo sin red o si el servicio tarda. El ajuste «Alertas con voz local» mantiene alertas, spotter y coach con la voz local. Las frases fijas se guardan en caché para no pagarlas nunca dos veces, y se muestra el consumo del mes.",
              de: "Online-KI-Stimme für den Renningenieur, mit deinem eigenen Schlüssel (Beta, standardmäßig aus — Einstellungen → Audio / Stimme → „Online-KI-Stimme“): OpenAI, ElevenLabs, Cartesia oder Google Cloud, mit den Stimmen des Anbieters in einem Menü (Suche nach Namen) und einer Stimme pro App-Sprache. Sie sagt alles: Informationen und Antworten auf deine Fragen direkt, und Sicherheitswarnungen (Flaggen, Reifenschaden, Box), Spotter und Coach, sobald sie vorbereitet sind („Stimme vorbereiten“), damit sie ohne Verzögerung kommen. Eine noch nicht vorbereitete Warnung oder eine, die sie nicht zusammensetzen kann (etwa mit einem Fahrernamen), spricht die lokale Stimme, damit sie nie zu spät kommt; die lokale Stimme übernimmt auch ohne Netz oder bei langsamem Dienst. Die Einstellung „Warnungen mit lokaler Stimme“ lässt Warnungen, Spotter und Coach bei der lokalen Stimme. Feste Sätze werden zwischengespeichert und nie doppelt bezahlt; der Verbrauch des Monats wird angezeigt.",
              it: "Voce IA online per l'ingegnere, con la tua chiave (beta, disattivata di default — Impostazioni → Audio / Voce → «Voce IA online»): OpenAI, ElevenLabs, Cartesia o Google Cloud, con le voci del fornitore in un menu (ricerca per nome) e una voce salvata per ogni lingua dell'app. Dice tutto: le informazioni e le risposte alle tue domande in diretta, e gli avvisi di sicurezza (bandiere, foratura, box), lo spotter e il coach appena sono preparati («Prepara la voce»), perché partano senza ritardo. Un avviso non ancora preparato, o che non sa comporre (per esempio con il nome di un pilota), lo dice la voce locale perché non arrivi mai in ritardo; la voce locale subentra anche senza rete o se il servizio è lento. L'impostazione «Avvisi con voce locale» lascia avvisi, spotter e coach sulla voce locale. Le frasi fisse restano in cache per non pagarle mai due volte, e viene mostrato il consumo del mese.",
            },
          },
          {
            text: {
              en: "Profile page: new Season section (filter by year or all time, online/offline and by class). The highlights of the period, your progress (your first 5 races vs your last 5) and a recurring issue when one stands out (frequent retirements, places lost during races).",
              fr: "Page Profil : nouvelle section Saison (filtre par année ou depuis le début, en ligne / hors ligne et par classe). Les temps forts de la période, ta progression (tes 5 premières courses contre les 5 dernières) et un défaut récurrent quand il ressort (abandons fréquents, places perdues en course).",
              es: "Página Perfil: nueva sección Temporada (filtro por año o desde el principio, en línea / sin conexión y por clase). Los momentos destacados del periodo, tu progresión (tus 5 primeras carreras frente a las 5 últimas) y un defecto recurrente cuando destaca (abandonos frecuentes, posiciones perdidas en carrera).",
              de: "Profilseite: neuer Bereich Saison (Filter nach Jahr oder gesamt, online / offline und nach Klasse). Die Highlights des Zeitraums, dein Fortschritt (deine ersten 5 Rennen gegen die letzten 5) und eine wiederkehrende Schwäche, wenn sie auffällt (häufige Ausfälle, im Rennen verlorene Plätze).",
              it: "Pagina Profilo: nuova sezione Stagione (filtro per anno o da sempre, online / offline e per classe). I momenti salienti del periodo, la tua progressione (le tue prime 5 gare contro le ultime 5) e un difetto ricorrente quando emerge (ritiri frequenti, posizioni perse in gara).",
            },
          },
          {
            text: {
              en: "Online AI voice: new \"Prepare the voice\" button. It generates all of the engineer's fixed phrases (every wording, in the app language) in one go, so their first call is instant instead of waiting for the service. The number of phrases, characters and the estimated cost are shown before anything is sent; progress can be followed and cancelled. Safety alerts, the spotter and the coach's fixed tips are generated too, so the AI voice says them with no delay (not with \"Alerts on the local voice\"). If the provider, model, voice, language or speed changes, a running preparation stops and the estimate is recomputed for the new voice.",
              fr: "Voix IA en ligne : nouveau bouton « Préparer la voix ». Il génère en une fois toutes les phrases fixes de l'ingénieur (toutes les formulations, dans la langue de l'app) : leur première annonce est instantanée au lieu d'attendre le service. Le nombre de phrases, de caractères et le coût estimé s'affichent avant tout envoi ; la progression est suivie et annulable. Les alertes de sécurité, le spotter et les conseils fixes du coach sont générés aussi, pour que la voix IA les dise sans délai (pas avec « Alertes en voix locale »). Si le fournisseur, le modèle, la voix, la langue ou la vitesse change, une préparation en cours s'arrête et l'estimation est recalculée pour la nouvelle voix.",
              es: "Voz IA en línea: nuevo botón «Preparar la voz». Genera de una vez todas las frases fijas del ingeniero (todas las formulaciones, en el idioma de la app): su primer aviso es instantáneo en lugar de esperar al servicio. El número de frases, de caracteres y el coste estimado se muestran antes de enviar nada; el progreso se puede seguir y cancelar. También se generan las alertas de seguridad, el spotter y los consejos fijos del coach, para que la voz IA los diga sin retraso (no con «Alertas con voz local»). Si cambian el proveedor, el modelo, la voz, el idioma o la velocidad, una preparación en curso se detiene y la estimación se recalcula para la nueva voz.",
              de: "Online-KI-Stimme: neue Schaltfläche „Stimme vorbereiten“. Sie erzeugt alle festen Sätze des Renningenieurs auf einmal (alle Formulierungen, in der App-Sprache): Ihre erste Ansage kommt sofort, statt auf den Dienst zu warten. Anzahl der Sätze, Zeichen und geschätzte Kosten werden vor jedem Senden angezeigt; der Fortschritt ist sichtbar und abbrechbar. Sicherheitswarnungen, Spotter und feste Tipps des Coachs werden ebenfalls erzeugt, damit die KI-Stimme sie ohne Verzögerung spricht (nicht mit „Warnungen mit lokaler Stimme“). Ändern sich Anbieter, Modell, Stimme, Sprache oder Tempo, stoppt eine laufende Vorbereitung und die Schätzung wird für die neue Stimme neu berechnet.",
              it: "Voce IA online: nuovo pulsante «Prepara la voce». Genera in una volta tutte le frasi fisse dell'ingegnere (tutte le formulazioni, nella lingua dell'app): il loro primo annuncio è istantaneo invece di aspettare il servizio. Numero di frasi, caratteri e costo stimato vengono mostrati prima di qualsiasi invio; l'avanzamento è visibile e annullabile. Vengono generati anche gli avvisi di sicurezza, lo spotter e i consigli fissi del coach, perché la voce IA li dica senza ritardo (non con «Avvisi con voce locale»). Se cambiano fornitore, modello, voce, lingua o velocità, una preparazione in corso si ferma e la stima viene ricalcolata per la nuova voce.",
            },
          },
          {
            text: {
              en: "Online AI voice: announcements with numbers (fuel for 2 laps, gap 0.4, P3, laps remaining, corner coach tips…) are now spoken by the AI voice too, with no delay and no request: \"Prepare the voice\" also records the numbers and the fixed parts of the messages once, and the app joins the pieces when it speaks (your customised messages included). The pieces are counted in the estimate before anything is sent (a few cents). New setting \"Announcements with numbers\": alerts and coach joined (default), everything joined (information included, without a request when it is ready), or local voice (previous behaviour). Driver names and unrecognised phrases stay on the local voice.",
              fr: "Voix IA en ligne : les annonces chiffrées (carburant pour 2 tours, écart 0,4, P3, tours restants, conseils du coach par virage…) sont maintenant dites elles aussi par la voix IA, sans délai ni requête : « Préparer la voix » enregistre une fois les nombres et les parties fixes des messages, et l'app recolle les morceaux au moment de parler (messages personnalisés compris). Les morceaux sont comptés dans le devis avant tout envoi (quelques centimes). Nouveau réglage « Annonces chiffrées » : alertes et coach assemblés (défaut), tout assemblé (information comprise, sans requête quand c'est prêt), ou voix locale (ancien comportement). Les noms de pilotes et les phrases non reconnues restent en voix locale.",
              es: "Voz IA en línea: los avisos con cifras (combustible para 2 vueltas, diferencia 0,4, P3, vueltas restantes, consejos del coach por curva…) ahora también los dice la voz IA, sin retraso ni petición: «Preparar la voz» graba una vez los números y las partes fijas de los mensajes, y la app une los fragmentos al hablar (mensajes personalizados incluidos). Los fragmentos se cuentan en el presupuesto antes de enviar nada (unos céntimos). Nuevo ajuste «Avisos con cifras»: alertas y coach unidos (por defecto), todo unido (información incluida, sin petición cuando está listo) o voz local (comportamiento anterior). Los nombres de pilotos y las frases no reconocidas siguen con la voz local.",
              de: "Online-KI-Stimme: Ansagen mit Zahlen (Kraftstoff für 2 Runden, Abstand 0,4, P3, verbleibende Runden, Tipps des Kurven-Coachs…) spricht jetzt ebenfalls die KI-Stimme, ohne Verzögerung und ohne Anfrage: „Stimme vorbereiten“ nimmt die Zahlen und die festen Teile der Meldungen einmal auf, und die App setzt die Stücke beim Sprechen zusammen (eigene Meldungen inbegriffen). Die Stücke sind vor jedem Senden in der Kostenschätzung enthalten (wenige Cent). Neue Einstellung „Ansagen mit Zahlen“: Warnungen und Coach zusammengesetzt (Standard), alles zusammengesetzt (auch Infos, ohne Anfrage, wenn vorbereitet) oder lokale Stimme (bisheriges Verhalten). Fahrernamen und nicht erkannte Sätze bleiben bei der lokalen Stimme.",
              it: "Voce IA online: anche gli annunci con numeri (carburante per 2 giri, distacco 0,4, P3, giri rimanenti, consigli del coach per curva…) ora li dice la voce IA, senza ritardo né richiesta: «Prepara la voce» registra una volta i numeri e le parti fisse dei messaggi, e l'app unisce i pezzi quando parla (messaggi personalizzati compresi). I pezzi sono contati nella stima prima di qualsiasi invio (pochi centesimi). Nuova impostazione «Annunci con numeri»: avvisi e coach uniti (predefinito), tutto unito (informazioni comprese, senza richiesta quando è pronto) o voce locale (comportamento precedente). I nomi dei piloti e le frasi non riconosciute restano sulla voce locale.",
            },
          },
          {
            text: {
              en: "Online AI voice: new \"Listening bench\" (Settings → Audio / Voice → Online AI voice). It lists the engineer's phrases by family (information, safety alerts, spotter, coach, phrases with numbers with editable values) and shows what would play in a race without network — AI voice from the cache, joined from pieces, or Piper — and why (not prepared yet, missing pieces, \"Alerts on the local voice\"…). Each phrase can be heard through each path to compare, and a free field lets you type any phrase to judge the joins. Nothing is sent to the provider from the bench, except the \"Prepare the voice\" button (cost shown first).",
              fr: "Voix IA en ligne : nouveau « Banc d'écoute » (Configuration → Audio / Voix → Voix IA en ligne). Il liste les phrases de l'ingénieur par famille (information, alertes de sécurité, spotter, coach, phrases chiffrées avec des valeurs modifiables) et affiche ce qui jouerait en course sans réseau — voix IA du cache, assemblée à partir de morceaux, ou Piper — et pourquoi (pas encore préparée, morceaux manquants, « Alertes en voix locale »…). Chaque phrase s'écoute par chaque chemin pour comparer, et un champ libre permet de taper n'importe quelle phrase pour juger les raccords. Rien n'est envoyé au fournisseur depuis le banc, sauf le bouton « Préparer la voix » (coût affiché avant).",
              es: "Voz IA en línea: nuevo «Banco de escucha» (Configuración → Audio / Voz → Voz IA en línea). Lista las frases del ingeniero por familia (información, alertas de seguridad, spotter, coach, frases con cifras con valores editables) y muestra lo que sonaría en carrera sin red —voz IA de la caché, unida a partir de fragmentos o Piper— y por qué (aún no preparada, fragmentos que faltan, «Alertas con voz local»…). Cada frase se puede escuchar por cada camino para comparar, y un campo libre permite escribir cualquier frase para juzgar las uniones. Desde el banco no se envía nada al proveedor, salvo el botón «Preparar la voz» (coste mostrado antes).",
              de: "Online-KI-Stimme: neuer „Hörtest“ (Einstellungen → Audio / Stimme → Online-KI-Stimme). Er listet die Sätze des Renningenieurs nach Familie (Informationen, Sicherheitswarnungen, Spotter, Coach, Sätze mit Zahlen mit änderbaren Werten) und zeigt, was im Rennen ohne Netz zu hören wäre — KI-Stimme aus dem Cache, aus Stücken zusammengesetzt oder Piper — und warum (noch nicht vorbereitet, fehlende Stücke, „Warnungen mit lokaler Stimme“…). Jeder Satz lässt sich über jeden Weg anhören, und ein freies Feld nimmt beliebige Sätze auf, um die Übergänge zu beurteilen. Aus dem Hörtest wird nichts an den Anbieter gesendet, außer über „Stimme vorbereiten“ (Kosten vorher angezeigt).",
              it: "Voce IA online: nuovo «Banco d'ascolto» (Impostazioni → Audio / Voce → Voce IA online). Elenca le frasi dell'ingegnere per famiglia (informazioni, avvisi di sicurezza, spotter, coach, frasi con numeri con valori modificabili) e mostra cosa suonerebbe in gara senza rete — voce IA dalla cache, unita a partire da pezzi, o Piper — e perché (non ancora preparata, pezzi mancanti, «Avvisi con voce locale»…). Ogni frase si ascolta per ogni percorso per confrontare, e un campo libero permette di scrivere qualsiasi frase per giudicare le giunzioni. Dal banco non viene inviato nulla al fornitore, tranne il pulsante «Prepara la voce» (costo mostrato prima).",
            },
          },
          {
            text: {
              en: "Guided setup assistant (new \"Assistant\" tab of a setup). Describe what the car does — understeer, oversteer, unstable under braking, bottoming, jumping over kerbs, lacking top speed or grip — plus the corner phase and whether it's slow or fast corners: the assistant lists the settings to try, most likely first, with the direction and the current value, skips the ones that can't be adjusted on this car and flags the ones already at their limit (real limits read from the game when it's running). \"Try\" creates a new version of the setup with that single setting changed by one click — the original is never touched — and writes the lineage in the notes. Then record your verdict (better / same / worse); if a session is linked to each version, the measured best lap and sector differences are shown.",
              fr: "Assistant setup guidé (nouvel onglet « Assistant » d'un setup). Décris ce que fait la voiture — sous-virage, survirage, instable au freinage, talonne, saute sur les vibreurs, manque de vitesse de pointe ou d'adhérence — ainsi que la phase du virage et s'il s'agit de virages lents ou rapides : l'assistant liste les réglages à essayer, du plus probable au moins probable, avec le sens et la valeur actuelle, écarte ceux qui ne sont pas réglables sur cette voiture et signale ceux déjà en butée (limites réelles lues dans le jeu quand il tourne). « Essayer » crée une nouvelle version du setup avec ce seul réglage changé d'un cran — l'original n'est jamais modifié — et note la lignée dans les notes. Ensuite, donne ton verdict (mieux / pareil / pire) ; si une session est liée à chaque version, l'écart mesuré sur le meilleur tour et les secteurs s'affiche.",
              es: "Asistente de reglajes guiado (nueva pestaña «Asistente» de un setup). Describe lo que hace el coche —subviraje, sobreviraje, inestable al frenar, toca el suelo, salta en los pianos, falta velocidad punta o agarre— además de la fase de la curva y si son curvas lentas o rápidas: el asistente enumera los reglajes a probar, del más probable al menos probable, con el sentido y el valor actual, descarta los que no se pueden ajustar en este coche y señala los que ya están al límite (límites reales leídos del juego cuando está abierto). «Probar» crea una nueva versión del setup con ese único reglaje cambiado un punto —el original nunca se toca— y anota el linaje en las notas. Después, da tu veredicto (mejor / igual / peor); si hay una sesión vinculada a cada versión, se muestra la diferencia medida en la mejor vuelta y los sectores.",
              de: "Geführter Setup-Assistent (neuer Reiter „Assistent“ eines Setups). Beschreibe, was das Auto macht — Untersteuern, Übersteuern, instabil beim Bremsen, setzt auf, springt über Randsteine, fehlende Endgeschwindigkeit oder fehlender Grip — sowie die Kurvenphase und ob langsame oder schnelle Kurven: der Assistent listet die zu testenden Einstellungen, die wahrscheinlichste zuerst, mit Richtung und aktuellem Wert, lässt bei diesem Auto nicht verstellbare weg und markiert die schon am Anschlag (echte Grenzen aus dem Spiel, wenn es läuft). „Testen“ legt eine neue Version des Setups mit nur dieser einen Einstellung um einen Klick verändert an — das Original wird nie angetastet — und vermerkt die Abstammung in den Notizen. Danach gibst du dein Urteil ab (besser / gleich / schlechter); ist jeder Version eine Session zugeordnet, wird der gemessene Unterschied bei Bestzeit und Sektoren angezeigt.",
              it: "Assistente setup guidato (nuova scheda «Assistente» di un setup). Descrivi cosa fa la vettura — sottosterzo, sovrasterzo, instabile in frenata, tocca il fondo, salta sui cordoli, manca velocità di punta o aderenza — più la fase della curva e se si tratta di curve lente o veloci: l'assistente elenca le regolazioni da provare, dalla più probabile alla meno probabile, con il verso e il valore attuale, scarta quelle non regolabili su questa vettura e segnala quelle già al limite (limiti reali letti dal gioco quando è aperto). «Prova» crea una nuova versione del setup con quella sola regolazione cambiata di una tacca — l'originale non viene mai toccato — e annota la genealogia nelle note. Poi dai il tuo verdetto (meglio / uguale / peggio); se a ogni versione è collegata una sessione, viene mostrata la differenza misurata su giro migliore e settori.",
            },
          },
          {
            text: {
              en: "New Strategy page (can be hidden like the other menu entries). Race preparation: a test programme that ticks itself while you drive, per track and car and across sessions — dry pace, fuel use, tyre wear, full-tank pace and pit loss, plus optional long run, tyre warm-up and wet pace — with a \"race ready\" badge. Stint sheet for endurance: full-range stints with the pit loss counted in race time, last stint to the flag, tyres every N stints, drivers in rotation (single, double or triple stints) or balanced by drive time, a driver can be pinned to any stint, max drive time flagged, and night stints placed from the real sunrise and sunset at the track on the chosen date. Defaults (track, lap time, laps per stint, race length, pit loss) are taken from the current session.",
              fr: "Nouvelle page Stratégie (masquable comme les autres entrées du menu). Préparation de course : un programme d'essais qui se coche tout seul en roulant, par circuit et par voiture et d'une session à l'autre — rythme sec, conso, usure des pneus, rythme réservoir plein et perte au stand, plus en option relais long, chauffe des pneus et rythme sous la pluie — avec un badge « Prêt pour la course ». Feuille de relais pour l'endurance : relais à autonomie pleine avec la perte au stand comptée dans le temps de course, dernier relais jusqu'au damier, pneus tous les N relais, pilotes en rotation (relais simples, doubles ou triples) ou équilibrés sur le temps de volant, un pilote peut être épinglé sur n'importe quel relais, temps de volant maximal signalé, et relais de nuit placés d'après le vrai lever et coucher du soleil sur le circuit à la date choisie. Les valeurs de départ (circuit, tour de référence, tours par relais, durée, perte au stand) viennent de la session en cours.",
              es: "Nueva página Estrategia (se puede ocultar como las demás entradas del menú). Preparación de carrera: un programa de pruebas que se marca solo mientras ruedas, por circuito y coche y de una sesión a otra — ritmo en seco, consumo, desgaste de neumáticos, ritmo con depósito lleno y pérdida en boxes, más tanda larga, calentamiento de neumáticos y ritmo en mojado opcionales — con una insignia «Listo para la carrera». Hoja de relevos para resistencia: relevos con autonomía completa y la pérdida en boxes contada en el tiempo de carrera, último relevo hasta la bandera, neumáticos cada N relevos, pilotos en rotación (relevos simples, dobles o triples) o equilibrados por tiempo al volante, un piloto se puede fijar en cualquier relevo, tiempo máximo al volante señalado y relevos nocturnos situados según la salida y la puesta del sol reales en el circuito en la fecha elegida. Los valores iniciales (circuito, vuelta de referencia, vueltas por relevo, duración, pérdida en boxes) vienen de la sesión en curso.",
              de: "Neue Seite Strategie (wie die anderen Menüeinträge ausblendbar). Rennvorbereitung: ein Testprogramm, das sich beim Fahren selbst abhakt, pro Strecke und Auto und über Sessions hinweg — Trockenpace, Verbrauch, Reifenverschleiß, Pace mit vollem Tank und Boxenverlust, optional Longrun, Reifenaufwärmen und Nasspace — mit einem „Rennbereit“-Abzeichen. Stintplan fürs Langstreckenrennen: Stints mit voller Reichweite, Boxenverlust in der Renndauer berücksichtigt, letzter Stint bis zur Flagge, Reifen alle N Stints, Fahrer in Rotation (Einzel-, Doppel- oder Dreifachstints) oder nach Fahrzeit ausgeglichen, ein Fahrer lässt sich auf jeden Stint festlegen, maximale Fahrzeit wird markiert, und Nachtstints werden nach dem echten Sonnenauf- und -untergang an der Strecke am gewählten Datum eingetragen. Startwerte (Strecke, Referenzrunde, Runden pro Stint, Dauer, Boxenverlust) kommen aus der laufenden Session.",
              it: "Nuova pagina Strategia (nascondibile come le altre voci del menu). Preparazione della gara: un programma di prove che si spunta da solo mentre guidi, per circuito e vettura e da una sessione all'altra — passo sull'asciutto, consumo, usura gomme, passo a serbatoio pieno e perdita ai box, più stint lungo, riscaldamento gomme e passo sul bagnato facoltativi — con un badge «Pronto per la gara». Piano degli stint per l'endurance: stint ad autonomia piena con la perdita ai box contata nel tempo di gara, ultimo stint fino alla bandiera, gomme ogni N stint, piloti a rotazione (stint singoli, doppi o tripli) o bilanciati sul tempo di guida, un pilota si può fissare su qualsiasi stint, tempo di guida massimo segnalato e stint notturni collocati in base ad alba e tramonto reali sul circuito alla data scelta. I valori iniziali (circuito, giro di riferimento, giri per stint, durata, perdita ai box) arrivano dalla sessione in corso.",
            },
          },
          {
            text: {
              en: "Tyre calls for the next stop. Ask \"which tyres to change?\": the engineer projects each tyre's measured wear per lap over the next stint and tells you which ones would fall off the cliff (worst first), all four, or none if they last the stint or the rest of the race. It also tells you when to go to wets or back to slicks, from the track wetness and its trend over the last two minutes (with a margin so it doesn't flip-flop), and says it on its own when the change holds for 30 seconds. The cold-tyre warm-up cost after a stop is now measured on every car's out-lap and remembered per track and class (\"expect about 4 seconds of warm-up\"). The AI Coach gets the same figures.",
              fr: "Conseils pneus pour le prochain arrêt. Demande « quels pneus changer ? » : l'ingénieur projette l'usure mesurée de chaque pneu par tour sur le relais suivant et te dit lesquels passeraient la falaise (le plus usé d'abord), les quatre, ou aucun s'ils tiennent le relais ou la fin de course. Il te dit aussi quand passer en pneus pluie ou revenir en slicks, d'après l'humidité de la piste et sa tendance sur les deux dernières minutes (avec une marge pour ne pas osciller), et l'annonce de lui-même quand le changement se confirme 30 secondes. Le coût de chauffe des pneus froids après un arrêt est désormais mesuré sur le tour de sortie de toutes les voitures et mémorisé par circuit et par classe (« compte environ 4 secondes de chauffe »). Le Coach IA reçoit les mêmes chiffres.",
              es: "Consejos de neumáticos para la próxima parada. Pregunta «¿qué neumáticos cambio?»: el ingeniero proyecta el desgaste medido de cada neumático por vuelta sobre el siguiente relevo y te dice cuáles caerían por el precipicio (el más gastado primero), los cuatro, o ninguno si aguantan el relevo o el final de la carrera. También te dice cuándo pasar a lluvia o volver a slicks, según la humedad de la pista y su tendencia en los dos últimos minutos (con un margen para no oscilar), y lo anuncia solo cuando el cambio se confirma durante 30 segundos. El coste de calentamiento de los neumáticos fríos tras una parada se mide ahora en la vuelta de salida de todos los coches y se recuerda por circuito y clase («cuenta unos 4 segundos de calentamiento»). El Coach IA recibe las mismas cifras.",
              de: "Reifenempfehlungen für den nächsten Stopp. Frag „welche Reifen wechseln?“: Der Ingenieur rechnet den gemessenen Verschleiß jedes Reifens pro Runde auf den nächsten Stint hoch und sagt, welche über die Klippe gingen (der abgefahrenste zuerst), alle vier oder keiner, wenn sie den Stint oder den Rest des Rennens halten. Er sagt auch, wann Regenreifen oder wieder Slicks sinnvoll sind, anhand der Streckennässe und ihres Trends der letzten zwei Minuten (mit Spielraum, damit es nicht hin und her springt), und meldet es von selbst, wenn sich der Wechsel 30 Sekunden bestätigt. Die Aufwärmkosten kalter Reifen nach einem Stopp werden jetzt in der Outlap aller Autos gemessen und pro Strecke und Klasse gespeichert („rechne mit etwa 4 Sekunden Aufwärmen“). Der KI-Coach erhält dieselben Zahlen.",
              it: "Consigli gomme per la prossima sosta. Chiedi «quali gomme cambio?»: l'ingegnere proietta l'usura misurata di ogni gomma per giro sullo stint successivo e ti dice quali cadrebbero nel precipizio (la più usurata per prima), tutte e quattro, o nessuna se reggono lo stint o il resto della gara. Ti dice anche quando passare alle gomme da pioggia o tornare alle slick, in base all'umidità della pista e alla sua tendenza negli ultimi due minuti (con un margine per non oscillare), e lo annuncia da solo quando il cambio si conferma per 30 secondi. Il costo di riscaldamento delle gomme fredde dopo una sosta ora è misurato nel giro di uscita di tutte le vetture e memorizzato per circuito e classe («conta circa 4 secondi di riscaldamento»). Il Coach IA riceve gli stessi dati.",
            },
          },
          {
            text: {
              en: "Rival pit stops tracked for the whole field: the race engineer now records every stop, measures each car's stint length (or its class's typical stint) and tells you when your class leader pits (\"The leader, X, is pitting after a 24-lap stint\"). Ask \"when does the leader pit?\", \"stops of the car ahead?\" or name a car: stops made, stint length, next stop and stops left to the finish. The AI Coach sees the same estimates. Simple pit requests that aren't followed by an actual stop are ignored. Both messages can be edited or silenced in the voice messages list.",
              fr: "Arrêts des rivaux suivis pour tout le plateau : l'ingénieur note chaque arrêt, mesure la longueur des relais de chaque voiture (ou le relais type de sa classe) et t'annonce quand le leader de ta classe rentre (« Le leader, X, rentre aux stands après 24 tours de relais »). Demande « quand s'arrête le leader ? », « arrêts de la voiture devant ? » ou cite une voiture : arrêts faits, longueur des relais, prochain arrêt et arrêts restants jusqu'à l'arrivée. Le Coach IA voit les mêmes estimations. Une simple demande d'arrêt non suivie d'effet est ignorée. Les deux annonces se modifient ou se coupent dans la liste des messages vocaux.",
              es: "Paradas de los rivales seguidas para toda la parrilla: el ingeniero anota cada parada, mide la duración de los relevos de cada coche (o el relevo típico de su clase) y te avisa cuando el líder de tu clase entra en boxes («El líder, X, entra en boxes tras un relevo de 24 vueltas»). Pregunta «¿cuándo para el líder?», «¿paradas del coche de delante?» o nombra un coche: paradas hechas, duración de los relevos, próxima parada y paradas restantes hasta el final. El Coach IA ve las mismas estimaciones. Una simple solicitud de parada sin parada real se ignora. Ambos mensajes se pueden editar o silenciar en la lista de mensajes de voz.",
              de: "Boxenstopps der Gegner fürs ganze Feld: Der Renningenieur erfasst jeden Stopp, misst die Stintlänge jedes Autos (oder den typischen Stint seiner Klasse) und meldet, wenn der Führende deiner Klasse an die Box kommt („Der Führende, X, kommt nach 24 Runden Stint an die Box“). Frag „wann stoppt der Führende?“, „Stopps des Vordermanns?“ oder nenne ein Auto: gemachte Stopps, Stintlänge, nächster Stopp und verbleibende Stopps bis ins Ziel. Der KI-Coach sieht dieselben Schätzungen. Eine bloße Stopp-Anfrage ohne echten Stopp wird ignoriert. Beide Meldungen lassen sich in der Liste der Sprachmeldungen bearbeiten oder stummschalten.",
              it: "Soste degli avversari seguite per tutto lo schieramento: l'ingegnere registra ogni sosta, misura la durata degli stint di ogni vettura (o lo stint tipico della sua classe) e ti avvisa quando il leader della tua classe rientra («Il leader, X, rientra ai box dopo uno stint di 24 giri»). Chiedi «quando si ferma il leader?», «soste della macchina davanti?» o nomina una vettura: soste fatte, durata degli stint, prossima sosta e soste rimanenti fino al traguardo. Il Coach IA vede le stesse stime. Una semplice richiesta di sosta non seguita da una sosta reale viene ignorata. Entrambi i messaggi si possono modificare o silenziare nell'elenco dei messaggi vocali.",
            },
          },
          {
            featured: true,
            text: {
              en: "Data read straight from the game (Le Mans Ultimate's local web interface, read-only: nothing is ever changed in the game). The race engineer, the strategy and the AI Coach now use the game's own weather forecast for the session (preferred over the .wet file when it matches the measured air temperature), the game's fuel / virtual energy estimate from the pit menu table as a safety net (before your consumption is measured, or when a lap is distorted by a stop), and the session length as early as the formation lap. A discreet \"Game API\" dot on the Live page shows whether the game answers and which figures come from it. If the game doesn't answer, everything works as before.",
              fr: "Données lues directement dans le jeu (interface web locale de Le Mans Ultimate, en lecture seule : rien n'est jamais modifié dans le jeu). L'ingénieur, la stratégie et le Coach IA utilisent désormais la prévision météo du jeu pour la session (prioritaire sur le fichier .wet quand elle colle à la température d'air mesurée), l'estimation de carburant / d'énergie virtuelle de la table du menu des stands comme garde-fou (avant que ta conso soit mesurée, ou quand un tour est faussé par un arrêt), et la durée de session dès le tour de formation. Un point discret « API du jeu » sur la page Live indique si le jeu répond et quels chiffres en viennent. Si le jeu ne répond pas, tout fonctionne comme avant.",
              es: "Datos leídos directamente del juego (interfaz web local de Le Mans Ultimate, solo lectura: nunca se modifica nada en el juego). El ingeniero, la estrategia y el Coach IA usan ahora la previsión meteorológica del propio juego para la sesión (prioritaria sobre el archivo .wet cuando coincide con la temperatura del aire medida), la estimación de combustible / energía virtual de la tabla del menú de boxes como salvaguarda (antes de medir tu consumo, o cuando una vuelta queda falseada por una parada) y la duración de la sesión desde la vuelta de formación. Un punto discreto «API del juego» en la página Live indica si el juego responde y qué cifras proceden de él. Si el juego no responde, todo funciona como antes.",
              de: "Daten direkt aus dem Spiel gelesen (lokale Web-Oberfläche von Le Mans Ultimate, nur lesend: im Spiel wird nie etwas verändert). Renningenieur, Strategie und KI-Coach nutzen jetzt die Wettervorhersage des Spiels für die Session (Vorrang vor der .wet-Datei, wenn sie zur gemessenen Lufttemperatur passt), die Kraftstoff-/Virtual-Energy-Schätzung aus der Tabelle des Boxenmenüs als Absicherung (bevor dein Verbrauch gemessen ist oder wenn eine Runde durch einen Stopp verfälscht ist) und die Sessiondauer schon ab der Formationsrunde. Ein dezenter Punkt „Spiel-API“ auf der Live-Seite zeigt, ob das Spiel antwortet und welche Werte von dort stammen. Antwortet das Spiel nicht, funktioniert alles wie bisher.",
              it: "Dati letti direttamente dal gioco (interfaccia web locale di Le Mans Ultimate, in sola lettura: nel gioco non viene mai modificato nulla). L'ingegnere, la strategia e il Coach IA usano ora le previsioni meteo del gioco per la sessione (prioritarie sul file .wet quando corrispondono alla temperatura dell'aria misurata), la stima di carburante / energia virtuale della tabella del menu box come salvaguardia (prima che il tuo consumo sia misurato, o quando un giro è falsato da una sosta) e la durata della sessione già dal giro di formazione. Un punto discreto «API del gioco» nella pagina Live indica se il gioco risponde e quali dati ne provengono. Se il gioco non risponde, tutto funziona come prima.",
            },
          },
          {
            text: {
              en: "Brake pad wear (game data, not available until now): the engineer warns at 25% then 10% on the most worn pad, and answers \"brake pads?\" by voice with the front / rear percentages and whether they will last to the end. Damage is now detailed too: which suspension corner is hit, and aero damage.",
              fr: "Usure des plaquettes de frein (donnée du jeu, indisponible jusqu'ici) : l'ingénieur prévient à 25 % puis à 10 % sur la plus usée, et répond à « plaquettes ? » à la voix avec les pourcentages avant / arrière et si elles tiendront jusqu'au bout. Les dégâts sont aussi détaillés : quelle suspension est touchée, et les dégâts aéro.",
              es: "Desgaste de las pastillas de freno (dato del juego, hasta ahora no disponible): el ingeniero avisa al 25 % y luego al 10 % en la más gastada, y responde a «¿pastillas?» por voz con los porcentajes delante / detrás y si aguantarán hasta el final. Los daños también se detallan: qué suspensión está dañada y los daños aerodinámicos.",
              de: "Bremsbelagverschleiß (Spieldaten, bisher nicht verfügbar): Der Ingenieur warnt bei 25 % und dann bei 10 % am am stärksten abgenutzten Belag und beantwortet „Bremsbeläge?“ per Sprache mit den Prozentwerten vorne / hinten und ob sie bis zum Ende halten. Schäden werden jetzt ebenfalls genauer angesagt: welche Aufhängung betroffen ist und Aerodynamikschäden.",
              it: "Usura delle pastiglie dei freni (dato del gioco, finora non disponibile): l'ingegnere avvisa al 25 % e poi al 10 % sulla più consumata, e risponde a «pastiglie?» a voce con le percentuali anteriori / posteriori e se dureranno fino alla fine. Anche i danni sono ora dettagliati: quale sospensione è colpita e i danni aerodinamici.",
            },
          },
          {
            text: {
              en: "Pit-exit prediction (\"where will I rejoin?\", rival stops, undercut): the time lost in the pit lane is now measured separately from the stop itself, and the next stop's duration is read from the game's pit menu (fuel, tyres, repairs) — the estimate follows what you have selected instead of repeating the previous stop. Your manual setting is still used when the game doesn't answer.",
              fr: "Prédiction de sortie des stands (« où je ressors ? », arrêts des rivaux, undercut) : le temps perdu dans la voie des stands est maintenant mesuré à part de l'arrêt lui-même, et la durée du prochain arrêt est lue dans le menu des stands du jeu (carburant, pneus, réparations) — l'estimation suit ce que tu as sélectionné au lieu de répéter l'arrêt précédent. Ton réglage manuel reste utilisé quand le jeu ne répond pas.",
              es: "Predicción de salida de boxes («¿dónde salgo?», paradas de rivales, undercut): el tiempo perdido en el pit lane se mide ahora aparte de la parada en sí, y la duración de la próxima parada se lee en el menú de boxes del juego (combustible, neumáticos, reparaciones): la estimación sigue lo que has seleccionado en lugar de repetir la parada anterior. Tu ajuste manual se sigue usando cuando el juego no responde.",
              de: "Prognose für die Boxenausfahrt („Wo komme ich raus?“, Stopps der Rivalen, Undercut): Die Zeit in der Boxengasse wird jetzt getrennt vom Stopp selbst gemessen, und die Dauer des nächsten Stopps wird aus dem Boxenmenü des Spiels gelesen (Kraftstoff, Reifen, Reparaturen) — die Schätzung folgt deiner Auswahl, statt den letzten Stopp zu wiederholen. Deine manuelle Einstellung gilt weiterhin, wenn das Spiel nicht antwortet.",
              it: "Previsione di uscita dai box («dove rientro?», soste dei rivali, undercut): il tempo perso nella corsia box ora è misurato separatamente dalla sosta vera e propria, e la durata della prossima sosta viene letta dal menu box del gioco (carburante, gomme, riparazioni): la stima segue ciò che hai selezionato invece di ripetere la sosta precedente. La tua impostazione manuale resta in uso quando il gioco non risponde.",
            },
          },
          {
            text: {
              en: "AI Coach: it now receives the game data (brake pads, damage detail, fuel / energy estimate, planned stop duration, class position, pit menu choices, session forecast) and, for setup questions, the adjustment range of every setting of the car loaded in the game, so it never suggests a click outside the limits.",
              fr: "Coach IA : il reçoit désormais les données du jeu (plaquettes, détail des dégâts, estimation carburant / énergie, durée prévue de l'arrêt, position dans la classe, choix du menu des stands, prévision de la session) et, pour les questions de réglage, la plage de chaque réglage de la voiture chargée dans le jeu, pour ne jamais proposer un cran hors limites.",
              es: "Coach IA: ahora recibe los datos del juego (pastillas, detalle de daños, estimación de combustible / energía, duración prevista de la parada, posición en la clase, opciones del menú de boxes, previsión de la sesión) y, para las preguntas de reglaje, el rango de cada ajuste del coche cargado en el juego, para no proponer nunca un clic fuera de los límites.",
              de: "KI-Coach: Er erhält jetzt die Spieldaten (Bremsbeläge, Schadensdetails, Kraftstoff-/Energieschätzung, geplante Stoppdauer, Klassenposition, Auswahl im Boxenmenü, Vorhersage der Session) und bei Setup-Fragen den Einstellbereich jedes Werts des im Spiel geladenen Autos, damit er nie einen Klick außerhalb der Grenzen vorschlägt.",
              it: "Coach IA: ora riceve i dati del gioco (pastiglie, dettaglio dei danni, stima carburante / energia, durata prevista della sosta, posizione nella classe, scelte del menu box, previsioni della sessione) e, per le domande di assetto, l'intervallo di ogni regolazione dell'auto caricata nel gioco, così non propone mai un clic fuori dai limiti.",
            },
          },
          {
            text: {
              en: "Two new downloadable voices: Serena (Italian) and Sharvard (Spanish, male and female), much clearer than Paola and DaveFX in our listening tests. The current voices stay the default; pick the new ones in Settings → Audio / Voice.",
              fr: "Deux nouvelles voix à télécharger : Serena (italien) et Sharvard (espagnol, homme et femme), nettement plus claires que Paola et DaveFX dans nos tests d'écoute. Les voix actuelles restent celles par défaut ; choisis les nouvelles dans Configuration → Audio / Voix.",
              es: "Dos voces nuevas para descargar: Serena (italiano) y Sharvard (español, hombre y mujer), mucho más claras que Paola y DaveFX en nuestras pruebas de escucha. Las voces actuales siguen por defecto; elige las nuevas en Configuración → Audio / Voz.",
              de: "Zwei neue Stimmen zum Herunterladen: Serena (Italienisch) und Sharvard (Spanisch, männlich und weiblich), in unseren Hörtests deutlich klarer als Paola und DaveFX. Die bisherigen Stimmen bleiben Standard; die neuen wählst du unter Einstellungen → Audio / Stimme.",
              it: "Due nuove voci da scaricare: Serena (italiano) e Sharvard (spagnolo, uomo e donna), molto più chiare di Paola e DaveFX nei nostri test d'ascolto. Le voci attuali restano predefinite; scegli le nuove in Impostazioni → Audio / Voce.",
            },
          },
          {
            text: {
              en: "Push-to-talk on a wheel button (Settings → Audio / Voice → \"Wheel button\" → \"Capture button\"): the button is read in the background, even when the game has focus, including on wheels whose buttons Windows doesn't list (more than 32 buttons). It follows the hold or press/press-again mode; the keyboard key stays active.",
              fr: "Push-to-talk sur un bouton de volant (Configuration → Audio / Voix → « Bouton du volant » → « Capter le bouton ») : le bouton est lu en arrière-plan, même quand le jeu a le focus, y compris sur les volants dont Windows ne liste pas les boutons (plus de 32 boutons). Il suit le mode maintenir ou appui/re-appui ; la touche clavier reste active.",
              es: "Pulsar para hablar con un botón del volante (Configuración → Audio / Voz → «Botón del volante» → «Detectar botón»): el botón se lee en segundo plano, incluso con el juego en primer plano, también en volantes cuyos botones Windows no lista (más de 32 botones). Sigue el modo mantener o pulsar/volver a pulsar; la tecla del teclado sigue activa.",
              de: "Push-to-Talk auf einer Lenkradtaste (Einstellungen → Audio / Stimme → „Lenkradtaste“ → „Taste erfassen“): Die Taste wird im Hintergrund gelesen, auch wenn das Spiel im Vordergrund ist, auch bei Lenkrädern, deren Tasten Windows nicht auflistet (mehr als 32 Tasten). Sie folgt dem Modus halten oder drücken/erneut drücken; die Tastaturtaste bleibt aktiv.",
              it: "Push-to-talk su un tasto del volante (Impostazioni → Audio / Voce → «Tasto del volante» → «Rileva il tasto»): il tasto viene letto in background, anche con il gioco in primo piano, anche sui volanti i cui tasti Windows non elenca (più di 32 tasti). Segue la modalità tieni premuto o premi/ripremi; il tasto della tastiera resta attivo.",
            },
          },
          {
            text: {
              en: "Microphone always ready (on by default): your first word is no longer cut off when you press, and in press/press-again mode the question is sent on its own when you stop talking. Nothing is recorded or transcribed outside a press. Turn it off to open the mic only when you press, as before.",
              fr: "Micro prêt en permanence (activé par défaut) : ton premier mot n'est plus coupé à l'appui, et en mode appui/re-appui la question part seule quand tu te tais. Rien n'est enregistré ni transcrit hors appui. Désactive-le pour n'ouvrir le micro qu'à l'appui, comme avant.",
              es: "Micrófono siempre listo (activado por defecto): tu primera palabra ya no se corta al pulsar, y en modo pulsar/volver a pulsar la pregunta se envía sola cuando te callas. No se graba ni transcribe nada fuera de la pulsación. Desactívalo para abrir el micro solo al pulsar, como antes.",
              de: "Mikrofon immer bereit (standardmäßig an): Dein erstes Wort wird beim Drücken nicht mehr abgeschnitten, und im Modus drücken/erneut drücken geht die Frage von selbst raus, wenn du schweigst. Außerhalb eines Tastendrucks wird nichts aufgenommen oder transkribiert. Ausschalten, um das Mikro wie bisher erst beim Drücken zu öffnen.",
              it: "Microfono sempre pronto (attivo per impostazione predefinita): la tua prima parola non viene più tagliata alla pressione, e in modalità premi/ripremi la domanda parte da sola quando smetti di parlare. Fuori dalla pressione non viene registrato né trascritto nulla. Disattivalo per aprire il microfono solo alla pressione, come prima.",
            },
          },
          {
            text: {
              en: "Wake word (beta, off by default): say \"Engineer, just the essentials\" without touching anything. Only the word is recognised continuously, nothing else is transcribed, and it isn't listened for while the engineer is talking. The word can be changed in Settings → Audio / Voice.",
              fr: "Mot déclencheur (bêta, désactivé par défaut) : dis « Ingénieur, juste l'essentiel » sans rien toucher. Seul le mot est reconnu en continu, rien d'autre n'est transcrit, et il n'est pas cherché pendant que l'ingénieur parle. Le mot se change dans Configuration → Audio / Voix.",
              es: "Palabra de activación (beta, desactivada por defecto): di «Ingeniero, solo lo esencial» sin tocar nada. Solo se reconoce la palabra de forma continua, nada más se transcribe, y no se escucha mientras habla el ingeniero. La palabra se cambia en Configuración → Audio / Voz.",
              de: "Aktivierungswort (Beta, standardmäßig aus): Sag „Ingenieur, nur das Wesentliche“, ohne etwas zu berühren. Nur das Wort wird fortlaufend erkannt, sonst wird nichts transkribiert, und während der Ingenieur spricht, wird nicht darauf gehört. Das Wort lässt sich unter Einstellungen → Audio / Stimme ändern.",
              it: "Parola di attivazione (beta, disattivata per impostazione predefinita): di' «Ingegnere, solo l'essenziale» senza toccare nulla. Solo la parola viene riconosciuta di continuo, nient'altro viene trascritto, e non viene ascoltata mentre l'ingegnere parla. La parola si cambia in Impostazioni → Audio / Voce.",
            },
          },
          {
            text: {
              en: "Talk to the race engineer to set the radio — new \"Talk to the engineer\" key (Settings → Audio / Voice, Alt+C by default), which now works without any AI set up; only open questions still go to the AI Coach: \"we're fighting\" (safety calls only until the battle is over), \"bring it home\" (safety and strategy only), \"just the essentials\", \"quiet until lap 12\", \"back to normal\". And driving questions answered from the corner coach's own measurements, without AI: \"coach me\" (the two corners where you lose the most and what to change) and \"where am I losing time?\".",
              fr: "Parle à l'ingénieur pour régler la radio — nouvelle touche « Parler à l'ingénieur » (Configuration → Audio / Voix, Alt+C par défaut), qui fonctionne désormais sans aucune IA configurée ; seules les questions ouvertes partent encore au Coach IA : « on se bat » (sécurité seule jusqu'à la fin de la bagarre), « on ramène la voiture » (sécurité et stratégie seulement), « juste l'essentiel », « tais-toi jusqu'au tour 12 », « tu peux reparler ». Et des questions de pilotage répondues à partir des mesures du coach par virage, sans IA : « coach-moi » (les deux virages où tu perds le plus et quoi changer) et « où je perds du temps ? ».",
              es: "Habla con el ingeniero para ajustar la radio — nueva tecla «Hablar con el ingeniero» (Configuración → Audio / Voz, Alt+C por defecto), que ahora funciona sin ninguna IA configurada; solo las preguntas abiertas siguen yendo al Coach IA: «estoy peleando» (solo seguridad hasta que acabe la pelea), «llevamos el coche a casa» (solo seguridad y estrategia), «solo lo esencial», «silencio hasta la vuelta 12», «puedes volver a hablar». Y preguntas de pilotaje respondidas con las mediciones del coach por curva, sin IA: «entréname» (las dos curvas donde más pierdes y qué cambiar) y «¿dónde pierdo tiempo?».",
              de: "Sprich mit dem Renningenieur, um den Funk einzustellen — neue Taste „Mit dem Ingenieur sprechen“ (Einstellungen → Audio / Stimme, standardmäßig Alt+C), die jetzt ohne eingerichtete KI funktioniert; nur offene Fragen gehen weiterhin an den KI-Coach: „wir kämpfen“ (nur Sicherheit bis zum Ende des Zweikampfs), „bring das Auto heim“ (nur Sicherheit und Strategie), „nur das Wesentliche“, „Ruhe bis Runde 12“, „du kannst wieder reden“. Dazu Fahrfragen, beantwortet aus den Messungen des Kurven-Coachs, ohne KI: „coache mich“ (die zwei Kurven, in denen du am meisten verlierst, und was du ändern solltest) und „wo verliere ich Zeit?“.",
              it: "Parla con l'ingegnere per regolare la radio — nuovo tasto «Parla con l'ingegnere» (Impostazioni → Audio / Voce, Alt+C per impostazione predefinita), che ora funziona senza alcuna IA configurata; solo le domande aperte vanno ancora al Coach IA: «sto lottando» (solo sicurezza fino alla fine della lotta), «portiamo a casa la macchina» (solo sicurezza e strategia), «solo l'essenziale», «zitto fino al giro 12», «puoi riparlare». E domande di guida con risposta dalle misure del coach per curva, senza IA: «allenami» (le due curve in cui perdi di più e cosa cambiare) e «dove perdo tempo?».",
            },
          },
          {
            text: {
              en: "Proximity spotter (beta, Settings → Voice, off by default): \"car left\", \"car right\", \"three wide\", \"clear\". It calibrates itself during the first corners of each session, stays silent until the side is certain, and takes priority over every other call. Not yet validated on track.",
              fr: "Spotter de proximité (bêta, Configuration → Voix, désactivé par défaut) : « voiture à gauche », « à droite », « trois de front », « libre ». Il se calibre seul pendant les premiers virages de chaque session, reste muet tant que le côté n'est pas sûr et passe avant toutes les autres annonces. Pas encore validé en piste.",
              es: "Spotter de proximidad (beta, Configuración → Voz, desactivado por defecto): «coche a la izquierda», «a la derecha», «tres en paralelo», «libre». Se calibra solo durante las primeras curvas de cada sesión, se calla mientras el lado no sea seguro y pasa por delante de todos los demás avisos. Aún no validado en pista.",
              de: "Nahbereichs-Spotter (Beta, Einstellungen → Stimme, standardmäßig aus): „Auto links“, „Auto rechts“, „drei nebeneinander“, „frei“. Er kalibriert sich in den ersten Kurven jeder Session selbst, bleibt stumm, solange die Seite nicht sicher ist, und hat Vorrang vor allen anderen Ansagen. Noch nicht auf der Strecke validiert.",
              it: "Spotter di prossimità (beta, Impostazioni → Voce, disattivato per impostazione predefinita): «macchina a sinistra», «a destra», «tre affiancati», «libero». Si calibra da solo nelle prime curve di ogni sessione, resta muto finché il lato non è sicuro e ha la precedenza su tutti gli altri annunci. Non ancora validato in pista.",
            },
          },
          {
            text: {
              en: "Your first name on the radio (Settings → Voice): said sparingly — start, last lap, taking the lead, personal best — never twice in a row, at most once every 3½ minutes, never in a warning. Empty by default.",
              fr: "Ton prénom à la radio (Configuration → Voix) : dit avec parcimonie — départ, dernier tour, prise de tête, record —, jamais deux phrases de suite, au plus une fois toutes les 3 min 30, jamais dans une alerte. Vide par défaut.",
              es: "Tu nombre por radio (Configuración → Voz): con moderación — salida, última vuelta, tomar el liderato, récord —, nunca dos frases seguidas, como mucho una vez cada 3 min 30, nunca en una alerta. Vacío por defecto.",
              de: "Dein Vorname im Funk (Einstellungen → Stimme): sparsam eingesetzt — Start, letzte Runde, Führungsübernahme, Bestzeit —, nie zwei Sätze hintereinander, höchstens alle 3,5 Minuten, nie in einer Warnung. Standardmäßig leer.",
              it: "Il tuo nome via radio (Impostazioni → Voce): con parsimonia — partenza, ultimo giro, presa del comando, record —, mai due frasi di fila, al massimo una volta ogni 3 min 30, mai in un avviso. Vuoto per impostazione predefinita.",
            },
          },
          {
            text: {
              en: "New setting (Settings → Voice): \"Announce positions within class\". In multi-class sessions, the race engineer now gives your position in your class — place gained/lost, podium, lead, status, gaps to the cars ahead and behind, \"what's my position?\", position after a pit stop. Turn it off to keep overall positions as before.",
              fr: "Nouveau réglage (Configuration → Voix) : « Positions annoncées dans la classe ». En multiclasse, l'ingénieur donne désormais ta place dans ta classe — place gagnée/perdue, podium, prise de tête, statut, écarts devant/derrière, « quelle position ? », position à la sortie des stands. Désactive-le pour garder les positions au général comme avant.",
              es: "Nuevo ajuste (Configuración → Voz): «Posiciones anunciadas en la clase». En multiclase, el ingeniero da ahora tu posición en tu clase — posición ganada/perdida, podio, liderato, estado, diferencias con el de delante y el de detrás, «¿en qué posición voy?», posición al salir de boxes. Desactívalo para mantener las posiciones en la general como antes.",
              de: "Neue Einstellung (Einstellungen → Stimme): „Positionen innerhalb der Klasse ansagen“. In Multiklassen-Sessions nennt der Renningenieur jetzt deine Klassenposition — Platz gewonnen/verloren, Podium, Führung, Status, Abstände nach vorn und hinten, „Welche Position?“, Position nach dem Boxenstopp. Ausschalten, um wie bisher Gesamtpositionen zu hören.",
              it: "Nuova impostazione (Impostazioni → Voce): «Posizioni annunciate nella classe». In multiclasse l'ingegnere ora indica la tua posizione nella tua classe — posizione guadagnata/persa, podio, testa, stato, distacchi da chi ti precede e ti segue, «che posizione?», posizione all'uscita dai box. Disattivala per mantenere le posizioni nella classifica generale come prima.",
            },
          },
          {
            text: {
              en: "Leaderboards (app and lmu.cparfait.ovh): click a driver's name to compare yourself with that driver — you on the left (or the fastest driver if you have no time there), the driver you clicked on the right, either one can be changed. The conclusion comes first (\"… loses 1.238 s per lap, 0.490 s of it in S2\"), the time lost is shown in red next to the slower driver, and one bar per sector shows where the gap is made, with the costliest sector highlighted. Then the detail of each best lap: ideal lap from the best sectors, median pace and consistency, top speed; and, set back, the context: tyres, session type, sessions and laps driven on the combo, game version and date. A note warns when the classes or game versions differ.",
              fr: "Classements (app et lmu.cparfait.ovh) : un clic sur le nom d'un pilote ouvre la comparaison avec ce pilote — vous à gauche (ou le plus rapide si vous n'avez pas de temps ici), le pilote cliqué à droite, chacun modifiable. La conclusion d'abord (« … perd 1.238 s au tour, dont 0.490 s en S2 »), le temps perdu en rouge à côté du plus lent, et une barre par secteur pour voir où se fait l'écart, le secteur le plus coûteux surligné. Puis le détail de chaque meilleur tour : tour idéal (meilleurs secteurs), rythme médian et régularité, vitesse de pointe ; et, en retrait, le contexte : pneus, type de session, sessions et tours roulés sur le combo, version du jeu et date. Une mention prévient quand les classes ou les versions du jeu diffèrent.",
              es: "Clasificaciones (app y lmu.cparfait.ovh): un clic en el nombre de un piloto abre la comparación con ese piloto — tú a la izquierda (o el más rápido si no tienes tiempo aquí), el piloto elegido a la derecha, ambos se pueden cambiar. Primero la conclusión («… pierde 1.238 s por vuelta, 0.490 s de ellos en S2»), el tiempo perdido en rojo junto al más lento y una barra por sector para ver dónde se hace la diferencia, con el sector más costoso resaltado. Después el detalle de cada mejor vuelta: vuelta ideal (mejores sectores), ritmo mediano y regularidad, velocidad punta; y, en segundo plano, el contexto: neumáticos, tipo de sesión, sesiones y vueltas rodadas en el combo, versión del juego y fecha. Un aviso indica cuando las clases o las versiones del juego difieren.",
              de: "Ranglisten (App und lmu.cparfait.ovh): Ein Klick auf den Namen eines Fahrers öffnet den Vergleich mit diesem Fahrer — du links (oder der Schnellste, wenn du hier keine Zeit hast), der angeklickte Fahrer rechts, beide austauschbar. Zuerst das Fazit („… verliert 1.238 s pro Runde, davon 0.490 s in S2“), die verlorene Zeit rot neben dem Langsameren und ein Balken pro Sektor, der zeigt, wo der Abstand entsteht, der teuerste Sektor hervorgehoben. Danach die Details jeder besten Runde: ideale Runde (beste Sektoren), Median-Tempo und Konstanz, Höchstgeschwindigkeit; und, zurückgenommen, der Kontext: Reifen, Session-Typ, Sessions und Runden auf der Kombination, Spielversion und Datum. Ein Hinweis warnt, wenn Klassen oder Spielversionen abweichen.",
              it: "Classifiche (app e lmu.cparfait.ovh): un clic sul nome di un pilota apre il confronto con quel pilota — tu a sinistra (o il più veloce se qui non hai un tempo), il pilota scelto a destra, entrambi modificabili. Prima la conclusione («… perde 1.238 s al giro, di cui 0.490 s in S2»), il tempo perso in rosso accanto al più lento e una barra per settore per vedere dove nasce il distacco, con il settore più costoso evidenziato. Poi il dettaglio di ogni miglior giro: giro ideale (migliori settori), passo mediano e costanza, velocità massima; e, in secondo piano, il contesto: gomme, tipo di sessione, sessioni e giri percorsi sulla combo, versione del gioco e data. Un avviso segnala quando le classi o le versioni del gioco sono diverse.",
            },
          },
          {
            text: {
              en: "Short launch animation: the end of the LMU Stats Viewer intro (the title card, about 2.5 s) plays when the app starts. Click or press Esc to skip it; it can be turned off in Settings → Preferences → \"Launch animation\". And a little surprise: click the driver next to Discord at the bottom of the page.",
              fr: "Courte animation au lancement : la fin de l'intro LMU Stats Viewer (le plan du titre, environ 2,5 s) se joue au démarrage de l'app. Un clic ou Échap la passe ; elle se désactive dans Configuration → Préférences → « Animation au lancement ». Et une petite surprise : clique sur le pilote à côté de Discord, en bas de page.",
              es: "Breve animación al iniciar: el final de la intro de LMU Stats Viewer (el plano del título, unos 2,5 s) se reproduce al abrir la app. Un clic o Esc la salta; se desactiva en Configuración → Preferencias → «Animación al iniciar». Y una pequeña sorpresa: haz clic en el piloto junto a Discord, al pie de la página.",
              de: "Kurze Startanimation: Das Ende des LMU-Stats-Viewer-Intros (die Titeleinblendung, etwa 2,5 s) läuft beim Start der App. Ein Klick oder Esc überspringt sie; abschaltbar unter Einstellungen → Präferenzen → „Startanimation“. Und eine kleine Überraschung: Klick auf den Fahrer neben Discord unten auf der Seite.",
              it: "Breve animazione all'avvio: la fine dell'intro di LMU Stats Viewer (la schermata del titolo, circa 2,5 s) parte all'apertura dell'app. Un clic o Esc la salta; si disattiva in Impostazioni → Preferenze → «Animazione all'avvio». E una piccola sorpresa: clicca sul pilota accanto a Discord, in fondo alla pagina.",
            },
          },
        ],
      },
      {
        kind: "improved",
        items: [
          {
            text: {
              en: "Test the engineer: with no session running, answers use a sample race (multi-class standings, fuel, tyres, weather) instead of “No session in progress”, and say so; radio commands (battle, bring it home, radio silence…) and “coach me” show a readable name.",
              fr: "Tester l'ingénieur : sans session en cours, les réponses s'appuient sur une course d'exemple (classement multiclasse, carburant, pneus, météo) au lieu de « Pas de session en cours », et le signalent ; les commandes radio (bagarre, ramener la voiture, silence radio…) et « coache-moi » affichent un nom lisible.",
              es: "Probar al ingeniero: sin sesión en curso, las respuestas usan una carrera de ejemplo (clasificación multiclase, combustible, neumáticos, meteo) en lugar de «No hay sesión en curso», y lo indican; los comandos de radio (pelea, llevar el coche a casa, silencio de radio…) y «entréname» muestran un nombre legible.",
              de: "Ingenieur testen: Ohne laufende Session nutzen die Antworten ein Beispielrennen (Mehrklassen-Wertung, Kraftstoff, Reifen, Wetter) statt „Keine Session aktiv“ und sagen das; Funkbefehle (Zweikampf, Auto heimbringen, Funkstille…) und „Coache mich“ zeigen einen lesbaren Namen.",
              it: "Prova l'ingegnere: senza sessione in corso, le risposte usano una gara di esempio (classifica multiclasse, carburante, gomme, meteo) invece di «Nessuna sessione in corso», e lo segnalano; i comandi radio (battaglia, portare a casa, silenzio radio…) e «allenami» mostrano un nome leggibile.",
            },
          },
          {
            text: {
              en: "Talk to the engineer and Corner coach tabs: settings grouped into folding sections, like the Announcements tab (the “Talk” and “Tips while driving” sections open by default); push-to-talk beeps join “Talk”, review marks join the shortcuts without talking, and “Instant answers without AI” moves next to the recognised commands.",
              fr: "Onglets Parler à l'ingénieur et Coach par virage : réglages regroupés en sections repliables, comme l'onglet Annonces (« Parler » et « Conseils en roulant » ouvertes par défaut) ; les bips du push-to-talk rejoignent « Parler », les repères de revue les raccourcis sans parler, et « Réponses instantanées sans IA » passe à côté des commandes reconnues.",
              es: "Pestañas Hablar con el ingeniero y Coach por curva: ajustes agrupados en secciones plegables, como Anuncios («Hablar» y «Consejos en pista» abiertas por defecto); los pitidos del push-to-talk pasan a «Hablar», las marcas de revisión a los atajos sin hablar, y «Respuestas instantáneas sin IA» junto a los comandos reconocidos.",
              de: "Tabs Mit dem Ingenieur sprechen und Kurven-Coach: Einstellungen in einklappbaren Abschnitten wie bei Ansagen („Sprechen“ und „Tipps während der Fahrt“ standardmäßig offen); Push-to-talk-Pieptöne zu „Sprechen“, Review-Markierungen zu den Tastenkürzeln ohne Sprechen, „Sofortantworten ohne KI“ neben die erkannten Befehle.",
              it: "Schede Parla con l'ingegnere e Coach per curva: impostazioni raggruppate in sezioni richiudibili, come Annunci («Parlare» e «Consigli in pista» aperte di default); i bip del push-to-talk vanno in «Parlare», i segnalibri di revisione nelle scorciatoie senza parlare, e «Risposte istantanee senza IA» accanto ai comandi riconosciuti.",
            },
          },
          {
            text: {
              en: "Customise announcements: a short guide on wordings separated by |, variables in braces (to keep, but movable), listening and reset; each variable shows an example value (“{n} → 3”).",
              fr: "Personnaliser les annonces : un mode d'emploi sur les formulations séparées par |, les variables entre accolades (à garder, mais déplaçables), l'écoute et la réinitialisation ; chaque variable affiche un exemple de valeur (« {n} → 3 »).",
              es: "Personalizar los anuncios: una breve guía sobre las formulaciones separadas por |, las variables entre llaves (a conservar, pero movibles), la escucha y el restablecimiento; cada variable muestra un valor de ejemplo («{n} → 3»).",
              de: "Ansagen anpassen: eine kurze Anleitung zu mit | getrennten Formulierungen, Variablen in geschweiften Klammern (behalten, aber verschiebbar), Anhören und Zurücksetzen; jede Variable zeigt einen Beispielwert („{n} → 3“).",
              it: "Personalizza gli annunci: una breve guida sulle formulazioni separate da |, le variabili tra graffe (da tenere, ma spostabili), l'ascolto e il ripristino; ogni variabile mostra un valore di esempio («{n} → 3»).",
            },
          },
          {
            text: {
              en: "Announcements tab: settings grouped into folding sections — “When the engineer speaks”, “What he says”, “Proximity spotter” — each setting in its box.",
              fr: "Onglet Annonces : réglages regroupés en sections repliables — « Quand l'ingénieur parle », « Ce qu'il dit », « Spotter de proximité » — chaque réglage dans son encadré.",
              es: "Pestaña Anuncios: ajustes agrupados en secciones plegables — «Cuándo habla el ingeniero», «Qué dice», «Spotter de proximidad» — cada ajuste en su recuadro.",
              de: "Tab Ansagen: Einstellungen in einklappbaren Abschnitten — „Wann der Ingenieur spricht“, „Was er sagt“, „Näherungs-Spotter“ — jede Einstellung in ihrem Kasten.",
              it: "Scheda Annunci: impostazioni raggruppate in sezioni richiudibili — «Quando parla l'ingegnere», «Cosa dice», «Spotter di prossimità» — ogni impostazione nel suo riquadro.",
            },
          },
          {
            text: {
              en: "Audio / Voice: with voice announcements off, the sub-tabs are hidden; only the record beeps and review marks remain, since they also work with beeps.",
              fr: "Audio / Voix : annonces vocales coupées, les sous-onglets sont masqués ; seuls restent les bips de record et les repères de revue, qui marchent aussi avec des bips.",
              es: "Audio / Voz: con los anuncios de voz desactivados, se ocultan las subpestañas; solo quedan los pitidos de récord y las marcas de revisión, que también funcionan con pitidos.",
              de: "Audio / Stimme: Bei ausgeschalteten Sprachansagen sind die Unter-Tabs ausgeblendet; nur Rekord-Pieptöne und Review-Markierungen bleiben, da sie auch mit Pieptönen funktionieren.",
              it: "Audio / Voce: con gli annunci vocali disattivati, le sotto-schede sono nascoste; restano solo i bip dei record e i segnalibri di revisione, che funzionano anche con i bip.",
            },
          },
          {
            text: {
              en: "Neural voices: pick and test a voice right in the download list (one line per voice, the two UPMC voices Jessica and Pierre listed under it); the separate “Voice” drop-down only remains for the System voice.",
              fr: "Voix neuronales : on choisit et on teste la voix directement dans la liste des téléchargements (une ligne par voix, les deux voix d'UPMC, Jessica et Pierre, listées en dessous) ; la liste « Voix » séparée ne reste que pour la voix Système.",
              es: "Voces neuronales: se elige y se prueba la voz directamente en la lista de descargas (una línea por voz; las dos voces de UPMC, Jessica y Pierre, debajo); la lista «Voz» aparte solo queda para la voz Sistema.",
              de: "Neuronale Stimmen: Stimme direkt in der Download-Liste wählen und testen (eine Zeile pro Stimme, die beiden UPMC-Stimmen Jessica und Pierre darunter); die separate Liste „Stimme“ bleibt nur für die System-Stimme.",
              it: "Voci neurali: si sceglie e si prova la voce direttamente nell'elenco dei download (una riga per voce, le due voci di UPMC, Jessica e Pierre, elencate sotto); l'elenco «Voce» separato resta solo per la voce Sistema.",
            },
          },
          {
            text: {
              en: "Radio effect “Test” now uses the active voice (AI included) — the radio treatment applies to the AI voice too. French pronunciation: “medium” tyres are said “médium”. The “voice provider and model” setting of the AI coach is renamed “AI for in-race questions”, since it chooses the AI that answers, not a voice.",
              fr: "« Tester » de l'effet radio utilise désormais la voix active (IA comprise) — l'habillage radio s'applique aussi à la voix IA. Prononciation : les pneus « medium » sont dits « médium ». Le réglage « Fournisseur et modèle vocal » du Coach IA devient « IA des questions en course », car il choisit l'IA qui répond, pas une voix.",
              es: "«Probar» del efecto de radio usa ahora la voz activa (IA incluida) — el tratamiento de radio también se aplica a la voz IA. En francés, los neumáticos «medium» se pronuncian «médium». El ajuste «Proveedor y modelo de voz» del Coach IA pasa a «IA de las preguntas en carrera», porque elige la IA que responde, no una voz.",
              de: "„Testen“ beim Funkeffekt nutzt jetzt die aktive Stimme (inklusive KI) — der Funkklang gilt auch für die KI-Stimme. Im Französischen werden „medium“-Reifen „médium“ ausgesprochen. Die Einstellung „Anbieter und Sprachmodell“ des KI-Coachs heißt jetzt „KI für Fragen im Rennen“, da sie die antwortende KI wählt, keine Stimme.",
              it: "«Prova» dell'effetto radio usa ora la voce attiva (IA compresa) — l'effetto radio si applica anche alla voce IA. In francese le gomme «medium» si pronunciano «médium». L'impostazione «Fornitore e modello vocale» del Coach IA diventa «IA delle domande in gara», perché sceglie l'IA che risponde, non una voce.",
            },
          },
          {
            text: {
              en: "Widgets by address: the page title carries the widget's name from the start (written by the app's server), so OpenKneeboard and OBS name new tabs and sources correctly.",
              fr: "Widgets par adresse : le titre de la page porte le nom du widget dès son envoi (écrit par le serveur de l'app), pour qu'OpenKneeboard et OBS nomment correctement les nouveaux onglets et sources.",
              es: "Widgets por dirección: el título de la página lleva el nombre del widget desde el envío (lo escribe el servidor de la app), para que OpenKneeboard y OBS nombren bien las nuevas pestañas y fuentes.",
              de: "Widgets per Adresse: Der Seitentitel trägt den Widget-Namen schon beim Senden (vom Server der App geschrieben), damit OpenKneeboard und OBS neue Tabs und Quellen richtig benennen.",
              it: "Widget per indirizzo: il titolo della pagina porta il nome del widget fin dall'invio (scritto dal server dell'app), così OpenKneeboard e OBS nominano correttamente le nuove schede e sorgenti.",
            },
          },
          {
            text: {
              en: "Audio / Voice: downloaded voices (and the voice-command model) can be deleted with a bin button, after confirmation, to free disk space; voices shipped with the app stay.",
              fr: "Audio / Voix : les voix téléchargées (et le modèle des commandes vocales) se suppriment avec un bouton poubelle, après confirmation, pour libérer de la place ; les voix fournies avec l'app restent.",
              es: "Audio / Voz: las voces descargadas (y el modelo de comandos de voz) se eliminan con un botón de papelera, tras confirmar, para liberar espacio; las voces incluidas con la app se quedan.",
              de: "Audio / Stimme: Heruntergeladene Stimmen (und das Sprachbefehlsmodell) lassen sich nach Bestätigung per Papierkorb löschen, um Platz zu schaffen; mitgelieferte Stimmen bleiben.",
              it: "Audio / Voce: le voci scaricate (e il modello dei comandi vocali) si eliminano con un pulsante cestino, dopo conferma, per liberare spazio; le voci fornite con l'app restano.",
            },
          },
          {
            text: {
              en: "Speech engine: one line for Piper and one for System (in bold), the automatic fallback underneath; “Embedded” renamed “Piper (neural voice)”, since it has to be downloaded.",
              fr: "Moteur de synthèse : une ligne pour Piper et une pour Système (en gras), le repli automatique en dessous ; « Embarqué » devient « Piper (voix neuronale) », puisqu'il faut le télécharger.",
              es: "Motor de síntesis: una línea para Piper y otra para Sistema (en negrita), el relevo automático debajo; «Integrado» pasa a «Piper (voz neuronal)», ya que hay que descargarlo.",
              de: "Sprachsynthese: eine Zeile für Piper und eine für System (fett), der automatische Rückgriff darunter; „Eingebettet“ heißt jetzt „Piper (neuronale Stimme)“, da es heruntergeladen werden muss.",
              it: "Motore di sintesi: una riga per Piper e una per Sistema (in grassetto), il ripiego automatico sotto; «Integrato» diventa «Piper (voce neurale)», perché va scaricato.",
            },
          },
          {
            text: {
              en: "Audio / Voice: a “Local voice (on your PC)” block, then an “Online AI voice” block with a “How does it work?” button: a step-by-step guide (like the tour) on live phrases, “Prepare the voice”, urgent alerts, announcements with numbers and cost.",
              fr: "Audio / Voix : un bloc « Voix locale (sur ton PC) », puis un bloc « Voix IA en ligne » avec un bouton « Comment ça marche ? » : une aide pas à pas (comme la visite guidée) sur les phrases dites en direct, « Préparer la voix », les alertes urgentes, les annonces chiffrées et le coût.",
              es: "Audio / Voz: un bloque «Voz local (en tu PC)» y luego un bloque «Voz IA en línea» con un botón «¿Cómo funciona?»: una ayuda paso a paso (como la visita guiada) sobre las frases en directo, «Preparar la voz», las alertas urgentes, los anuncios con cifras y el coste.",
              de: "Audio / Stimme: ein Block „Lokale Stimme (auf deinem PC)“, dann ein Block „Online-KI-Stimme“ mit der Schaltfläche „Wie funktioniert das?“: eine Schritt-für-Schritt-Hilfe (wie die Tour) zu Live-Sätzen, „Stimme vorbereiten“, dringenden Warnungen, Ansagen mit Zahlen und Kosten.",
              it: "Audio / Voce: un blocco «Voce locale (sul tuo PC)», poi un blocco «Voce IA online» con un pulsante «Come funziona?»: un aiuto passo passo (come la visita guidata) su frasi in diretta, «Prepara la voce», avvisi urgenti, annunci con numeri e costo.",
            },
          },
          {
            text: {
              en: "Audio / Voice settings in a logical order: engine and voice (download, then choose and test), online AI voice apart, then sound and radio effect. Push-to-talk beeps move to “Talk to the engineer”, “Customise announcements” to “Announcements”.",
              fr: "Réglages Audio / Voix dans un ordre logique : moteur et voix (télécharger, puis choisir et tester), voix IA en ligne à part, puis son et effet radio. Les bips du push-to-talk passent dans « Parler à l'ingénieur », « Personnaliser les annonces » dans « Annonces ».",
              es: "Ajustes de Audio / Voz en un orden lógico: motor y voz (descargar, luego elegir y probar), voz IA en línea aparte, después sonido y efecto de radio. Los pitidos del push-to-talk pasan a «Hablar con el ingeniero» y «Personalizar los anuncios» a «Anuncios».",
              de: "Audio-/Stimmen-Einstellungen in logischer Reihenfolge: Engine und Stimme (herunterladen, dann wählen und testen), Online-KI-Stimme separat, dann Klang und Funkeffekt. Die Push-to-talk-Pieptöne wandern zu „Mit dem Ingenieur sprechen“, „Ansagen anpassen“ zu „Ansagen“.",
              it: "Impostazioni Audio / Voce in ordine logico: motore e voce (scaricare, poi scegliere e provare), voce IA online a parte, poi suono ed effetto radio. I bip del push-to-talk passano in «Parla con l'ingegnere», «Personalizza gli annunci» in «Annunci».",
            },
          },
          {
            text: {
              en: "Widgets by address: each page is named after its widget (“LMU · Standings”…), so tabs in OpenKneeboard and sources in OBS are easy to tell apart.",
              fr: "Widgets par adresse : chaque page porte le nom de son widget (« LMU · Classement »…), pour reconnaître les onglets dans OpenKneeboard et les sources dans OBS.",
              es: "Widgets por dirección: cada página lleva el nombre de su widget («LMU · Clasificación»…), para reconocer las pestañas en OpenKneeboard y las fuentes en OBS.",
              de: "Widgets per Adresse: Jede Seite trägt den Namen ihres Widgets („LMU · Rangliste“…), damit Tabs in OpenKneeboard und Quellen in OBS unterscheidbar sind.",
              it: "Widget per indirizzo: ogni pagina porta il nome del suo widget («LMU · Classifica»…), per riconoscere le schede in OpenKneeboard e le sorgenti in OBS.",
            },
          },
          {
            text: {
              en: "Session details, Regularity tab: a sentence explains what it measures, a verdict under the spread (very consistent → very inconsistent), sectors as small cards (most stable / to work on), bars that finally show the right length, and the tab now sits before AI Coach.",
              fr: "Détail d'une session, onglet Régularité : une phrase explique ce qu'il mesure, un verdict sous l'écart-type (très régulier → très irrégulier), les secteurs en petites cartes (le plus stable / à travailler), des barres enfin à la bonne longueur, et l'onglet passe avant Coach IA.",
              es: "Detalle de una sesión, pestaña Regularidad: una frase explica lo que mide, un veredicto bajo la desviación (muy regular → muy irregular), los sectores en pequeñas tarjetas (el más estable / a trabajar), barras por fin a la longitud correcta, y la pestaña pasa antes de Coach IA.",
              de: "Session-Details, Tab Regelmäßigkeit: Ein Satz erklärt, was er misst, ein Urteil unter der Streuung (sehr konstant → sehr unregelmäßig), Sektoren als kleine Karten (am stabilsten / daran arbeiten), Balken endlich in der richtigen Länge, und der Tab steht jetzt vor KI-Coach.",
              it: "Dettaglio di una sessione, scheda Regolarità: una frase spiega cosa misura, un giudizio sotto lo scarto (molto regolare → molto irregolare), i settori in piccole schede (il più stabile / da migliorare), barre finalmente della lunghezza giusta, e la scheda passa prima di Coach IA.",
            },
          },
          {
            text: {
              en: "Wording: “session” everywhere in French and German (instead of “séance” / “Sitzung”), like the Sessions page; clearer description of the “comparable laps” badge.",
              fr: "Vocabulaire : « session » partout en français et en allemand (au lieu de « séance » / « Sitzung »), comme la page Sessions ; description plus claire du badge « tours comparables ».",
              es: "Vocabulario: «session» en todo el francés y el alemán (en lugar de «séance» / «Sitzung»), como la página Sesiones; descripción más clara de la insignia «vueltas comparables».",
              de: "Wortwahl: überall „Session“ statt „Sitzung“ (und im Französischen „session“), wie auf der Seite Sessions; klarere Beschreibung des Abzeichens „vergleichbare Runden“.",
              it: "Lessico: «session» ovunque in francese e tedesco (invece di «séance» / «Sitzung»), come la pagina Sessioni; descrizione più chiara del badge «giri comparabili».",
            },
          },
          {
            text: {
              en: "Settings: the “Analysis: new features” block is gone, each option now sits where it acts — Preferences › Session details (Regularity tab, “comparable laps” badge), Audio / Voice › Announcements (record announcements, also usable with beeps only), Audio / Voice › Talk to the engineer (review marks).",
              fr: "Configuration : le bloc « Analyse : nouveautés » disparaît, chaque option est rangée là où elle agit — Préférences › Détail des sessions (onglet Régularité, badge « tours comparables »), Audio / Voix › Annonces (annonces de record, utilisables aussi avec les seuls bips), Audio / Voix › Parler à l'ingénieur (repères de revue).",
              es: "Configuración: desaparece el bloque «Análisis: novedades» y cada opción se coloca donde actúa — Preferencias › Detalle de las sesiones (pestaña Regularidad, insignia «vueltas comparables»), Audio / Voz › Anuncios (anuncios de récord, también solo con pitidos), Audio / Voz › Hablar con el ingeniero (marcas de revisión).",
              de: "Einstellungen: Der Block „Analyse: Neuheiten“ entfällt, jede Option steht dort, wo sie wirkt — Präferenzen › Session-Details (Tab Regelmäßigkeit, Abzeichen „vergleichbare Runden“), Audio / Stimme › Ansagen (Rekord-Ansagen, auch nur mit Pieptönen), Audio / Stimme › Mit dem Ingenieur sprechen (Review-Markierungen).",
              it: "Impostazioni: il blocco «Analisi: novità» sparisce, ogni opzione è dove agisce — Preferenze › Dettaglio delle sessioni (scheda Regolarità, badge «giri comparabili»), Audio / Voce › Annunci (annunci di record, anche solo con i bip), Audio / Voce › Parla con l'ingegnere (segnalibri di revisione).",
            },
          },
          {
            text: {
              en: "Settings: every option now sits in its own box with a coloured icon and its description, like the “Analysis: new features” block, instead of plain lines. “Menu modules” moves under Preferences and is folded by default.",
              fr: "Configuration : chaque réglage est désormais présenté dans son encadré, avec une icône en couleur et sa description, comme le bloc « Analyse : nouveautés », au lieu de simples lignes. « Modules du menu » passe sous Préférences et est replié par défaut.",
              es: "Configuración: cada ajuste aparece ahora en su propio recuadro, con un icono en color y su descripción, como el bloque «Análisis: novedades», en lugar de simples líneas. «Módulos del menú» pasa debajo de Preferencias y aparece plegado por defecto.",
              de: "Einstellungen: Jede Option steht jetzt in einem eigenen Kasten mit farbigem Symbol und Beschreibung, wie der Block „Analyse: Neuheiten“, statt in einfachen Zeilen. „Menümodule“ steht unter den Präferenzen und ist standardmäßig eingeklappt.",
              it: "Impostazioni: ogni opzione è ora presentata in un riquadro con icona colorata e descrizione, come il blocco «Analisi: novità», invece di semplici righe. «Moduli del menu» passa sotto Preferenze ed è chiuso di default.",
            },
          },
          {
            text: {
              en: "Guided tour on the real app: each step opens its page, circles the button or menu entry it talks about (the rest of the screen is dimmed) and shows the explanation right next to it. New steps for the steering-wheel button and VR.",
              fr: "Visite guidée sur l'app réelle : chaque étape ouvre sa page, entoure le bouton ou l'entrée de menu dont elle parle (le reste de l'écran est assombri) et affiche l'explication juste à côté. Nouvelles étapes pour le bouton volant et la VR.",
              es: "Visita guiada sobre la app real: cada paso abre su página, rodea el botón o la entrada de menú de la que habla (el resto de la pantalla se oscurece) y muestra la explicación justo al lado. Nuevos pasos para el botón del volante y la VR.",
              de: "Geführte Tour in der echten App: Jeder Schritt öffnet seine Seite, umrandet die Schaltfläche oder den Menüeintrag, um den es geht (der Rest des Bildschirms wird abgedunkelt), und zeigt die Erklärung direkt daneben. Neue Schritte für die Lenkrad-Schaltfläche und VR.",
              it: "Visita guidata sull'app reale: ogni passo apre la sua pagina, cerchia il pulsante o la voce di menu di cui parla (il resto dello schermo è oscurato) e mostra la spiegazione proprio accanto. Nuovi passi per il pulsante volante e la VR.",
            },
          },
          {
            text: {
              en: "Tools & diagnostics: programs found on your PC (OpenKneeboard, SimHub, Crew Chief) appear as cards with what they do and an Add button, above a clear “Add another program…” button.",
              fr: "Outils & diagnostic : les programmes trouvés sur ton PC (OpenKneeboard, SimHub, Crew Chief) s'affichent en cartes, avec leur rôle et un bouton Ajouter, au-dessus d'un bouton « Ajouter un autre programme… » bien visible.",
              es: "Herramientas y diagnóstico: los programas encontrados en tu PC (OpenKneeboard, SimHub, Crew Chief) aparecen en tarjetas con su función y un botón Añadir, encima de un botón «Añadir otro programa…» bien visible.",
              de: "Tools & Diagnose: Auf deinem PC gefundene Programme (OpenKneeboard, SimHub, Crew Chief) erscheinen als Karten mit ihrer Funktion und einer Hinzufügen-Schaltfläche, darunter gut sichtbar „Anderes Programm hinzufügen…“.",
              it: "Strumenti e diagnostica: i programmi trovati sul tuo PC (OpenKneeboard, SimHub, Crew Chief) appaiono in schede con il loro ruolo e un pulsante Aggiungi, sopra un pulsante «Aggiungi un altro programma…» ben visibile.",
            },
          },
          {
            text: {
              en: "Widgets by address, simpler: three steps — turn on, choose where to show it (OBS or a second screen, each with its own how-to), then pick the widget and copy its single address. For VR, the card points to the new VR mode. The port sits next to the on/off switch and the list of all addresses is under “All addresses”; on a second screen the opaque background is suggested automatically.",
              fr: "Widgets par adresse, plus simple : trois étapes — activer, choisir où l'afficher (OBS ou 2ᵉ écran, chacun avec son mode d'emploi), puis choisir le widget et copier son adresse unique. Pour la VR, la carte renvoie vers le nouveau mode VR. Le port est à côté de l'interrupteur et la liste de toutes les adresses passe dans « Toutes les adresses » ; sur un 2ᵉ écran, le fond opaque est proposé d'office.",
              es: "Widgets por dirección, más sencillo: tres pasos — activar, elegir dónde mostrarlo (OBS o 2.ª pantalla, cada uno con sus instrucciones) y elegir el widget para copiar su única dirección. Para la VR, la tarjeta remite al nuevo modo VR. El puerto está junto al interruptor y la lista de todas las direcciones pasa a «Todas las direcciones»; en una 2.ª pantalla se propone el fondo opaco automáticamente.",
              de: "Widgets per Adresse, einfacher: drei Schritte — aktivieren, wählen, wo es angezeigt wird (OBS oder 2. Bildschirm, jeweils mit Anleitung), dann das Widget wählen und seine eine Adresse kopieren. Für VR verweist die Karte auf den neuen VR-Modus. Der Port steht neben dem Schalter, die Liste aller Adressen unter „Alle Adressen“; auf einem 2. Bildschirm wird der deckende Hintergrund automatisch vorgeschlagen.",
              it: "Widget per indirizzo, più semplice: tre passi — attivare, scegliere dove mostrarlo (OBS o 2º schermo, ognuno con le sue istruzioni), poi scegliere il widget e copiarne l'unico indirizzo. Per la VR, la scheda rimanda alla nuova modalità VR. La porta è accanto all'interruttore e l'elenco di tutti gli indirizzi passa in «Tutti gli indirizzi»; su un 2º schermo lo sfondo opaco viene proposto automaticamente.",
            },
          },
          {
            text: {
              en: "Overlays page: each card now shows a live preview of the real widget (sample data, animated, in the appearance you chose), so you can see what it looks like before switching it on.",
              fr: "Page Overlays : chaque carte montre maintenant un aperçu du vrai widget (données d'exemple animées, avec l'apparence choisie), pour voir à quoi il ressemble avant de l'activer.",
              es: "Página Overlays: cada tarjeta muestra ahora una vista previa del widget real (datos de ejemplo animados, con la apariencia elegida), para ver cómo es antes de activarlo.",
              de: "Seite Overlays: Jede Karte zeigt jetzt eine Vorschau des echten Widgets (animierte Beispieldaten, in der gewählten Darstellung), damit du es vor dem Aktivieren siehst.",
              it: "Pagina Overlay: ogni scheda mostra ora un'anteprima del widget reale (dati di esempio animati, con l'aspetto scelto), per vedere com'è prima di attivarlo.",
            },
          },
          {
            text: {
              en: "Rankings page shows at once: your positions are loaded in the background when the app starts (and after each new session), instead of when you open the page.",
              fr: "La page Classements s'affiche tout de suite : tes positions sont chargées en arrière-plan au lancement de l'app (et après chaque nouvelle session), au lieu de l'ouverture de la page.",
              es: "La página Clasificaciones aparece al instante: tus posiciones se cargan en segundo plano al iniciar la app (y tras cada nueva sesión), en lugar de al abrir la página.",
              de: "Die Ranglisten-Seite erscheint sofort: Deine Positionen werden beim Start der App (und nach jeder neuen Session) im Hintergrund geladen statt beim Öffnen der Seite.",
              it: "La pagina Classifiche appare subito: le tue posizioni vengono caricate in background all'avvio dell'app (e dopo ogni nuova sessione), invece che all'apertura della pagina.",
            },
          },
          {
            text: {
              en: "Tablet race control: your car pinned at the top of the timing page, swipe left/right to change page (dots show where you are), full screen on first touch or with the button, and the Map page now shows only the map, turned to fill a portrait screen.",
              fr: "Régie tablette : ta voiture épinglée en tête du classement, balayage gauche/droite pour changer de page (des points indiquent où tu es), plein écran au premier toucher ou par le bouton, et la page Carte n'affiche plus que la carte, tournée pour remplir un écran en portrait.",
              es: "Dirección en tableta: tu coche fijado arriba en la clasificación, desliza a izquierda/derecha para cambiar de página (unos puntos indican dónde estás), pantalla completa al primer toque o con el botón, y la página Mapa muestra solo el mapa, girado para llenar una pantalla vertical.",
              de: "Rennleitung auf Tablet: Dein Auto oben in der Zeitenliste angeheftet, nach links/rechts wischen zum Seitenwechsel (Punkte zeigen die Seite), Vollbild bei der ersten Berührung oder per Schaltfläche, und die Kartenseite zeigt nur noch die Karte, gedreht für ein Hochformat-Display.",
              it: "Direzione gara su tablet: la tua auto fissata in cima alla classifica, scorri a sinistra/destra per cambiare pagina (dei punti indicano dove sei), schermo intero al primo tocco o con il pulsante, e la pagina Mappa mostra solo la mappa, ruotata per riempire uno schermo verticale.",
            },
          },
          {
            text: {
              en: "Pit exit message: “keep the limiter on to the line” instead of a vague “watch the limiter”.",
              fr: "Message de sortie des stands : « garde le limiteur jusqu'à la ligne » au lieu d'un vague « attention au limiteur ».",
              es: "Mensaje de salida de boxes: «mantén el limitador hasta la línea» en lugar de un vago «atención al limitador».",
              de: "Boxenausfahrt-Meldung: „Begrenzer bis zur Linie drin lassen“ statt eines vagen „Achtung auf den Begrenzer“.",
              it: "Messaggio di uscita box: «tieni il limitatore fino alla linea» invece di un vago «occhio al limitatore».",
            },
          },
          {
            text: {
              en: "Overlays page: the “Widgets by address” card is folded by default and now says what it is for (VR headset, OBS stream, second screen); the page no longer changes width for a moment each time a setting is saved.",
              fr: "Page Overlays : la carte « Widgets par adresse » est repliée par défaut et dit à quoi elle sert (casque VR, stream OBS, 2ᵉ écran) ; la page ne change plus de largeur un instant à chaque réglage enregistré.",
              es: "Página Overlays: la tarjeta «Widgets por dirección» aparece plegada por defecto y explica para qué sirve (casco de VR, stream de OBS, 2.ª pantalla); la página ya no cambia de ancho un instante cada vez que se guarda un ajuste.",
              de: "Seite Overlays: Die Karte „Widgets per Adresse“ ist standardmäßig eingeklappt und erklärt, wozu sie dient (VR-Headset, OBS-Stream, 2. Bildschirm); die Seite ändert beim Speichern einer Einstellung nicht mehr kurz ihre Breite.",
              it: "Pagina Overlay: la scheda «Widget per indirizzo» è chiusa di default e spiega a cosa serve (visore VR, stream OBS, 2º schermo); la pagina non cambia più larghezza per un attimo a ogni impostazione salvata.",
            },
          },
          {
            text: {
              en: "Less repetitive radio: about forty frequent calls now have two or three wordings that alternate (never the same one twice in a row) — corner coach advice, delta, sector lost, gaps to the cars around you, fuel, time left, tyres, brakes, rain, blue flag, pit request… Safety reflexes keep a single wording (spotter, yellow and red flags, full course yellow); box box and puncture only get two very close ones. \"Prepare the voice\" for the online AI voice prepares every wording. The corner coach also alternates the wordings you add yourself in the voice message editor (it used to read the | separators out).",
              fr: "Une radio moins répétitive : une quarantaine d'annonces fréquentes ont désormais deux ou trois formulations qui alternent (jamais la même deux fois de suite) — conseils du coach par virage, delta, secteur perdu, écarts avec les voitures autour, carburant, temps restant, pneus, freins, pluie, drapeau bleu, demande d'arrêt… Les réflexes de sécurité gardent une seule phrase (spotter, drapeaux jaune et rouge, full course yellow) ; box box et crevaison n'ont que deux formulations très proches. « Préparer la voix » (voix IA en ligne) prépare chaque formulation. Le coach par virage alterne aussi les formulations que tu ajoutes dans l'éditeur des messages vocaux (il lisait les séparateurs |).",
              es: "Una radio menos repetitiva: unos cuarenta avisos frecuentes tienen ahora dos o tres formulaciones que se alternan (nunca la misma dos veces seguidas): consejos del coach por curva, delta, sector perdido, diferencias con los coches de alrededor, combustible, tiempo restante, neumáticos, frenos, lluvia, bandera azul, petición de parada… Los reflejos de seguridad conservan una sola frase (spotter, banderas amarilla y roja, full course yellow); box box y pinchazo solo tienen dos formulaciones muy parecidas. «Preparar la voz» (voz IA en línea) prepara cada formulación. El coach por curva alterna también las formulaciones que añades en el editor de mensajes de voz (antes leía los separadores |).",
              de: "Weniger eintöniger Funk: Rund vierzig häufige Ansagen haben jetzt zwei oder drei Formulierungen, die sich abwechseln (nie zweimal hintereinander dieselbe) — Tipps des Kurven-Coachs, Delta, verlorener Sektor, Abstände zu den Autos um dich herum, Kraftstoff, Restzeit, Reifen, Bremsen, Regen, blaue Flagge, Boxenstopp-Anfrage… Sicherheitsreflexe behalten einen einzigen Satz (Spotter, gelbe und rote Flagge, Full Course Yellow); Box box und Reifenschaden haben nur zwei sehr ähnliche Formulierungen. „Stimme vorbereiten“ (Online-KI-Stimme) bereitet jede Formulierung vor. Der Kurven-Coach wechselt auch die Formulierungen ab, die du im Editor der Sprachansagen hinzufügst (er hat die Trennzeichen | vorgelesen).",
              it: "Una radio meno ripetitiva: una quarantina di annunci frequenti hanno ora due o tre formulazioni che si alternano (mai la stessa due volte di fila): consigli del coach per curva, delta, settore perso, distacchi dalle auto intorno, carburante, tempo rimanente, gomme, freni, pioggia, bandiera blu, richiesta di sosta… I riflessi di sicurezza mantengono una sola frase (spotter, bandiere gialla e rossa, full course yellow); box box e foratura hanno solo due formulazioni molto simili. «Prepara la voce» (voce IA online) prepara ogni formulazione. Il coach per curva alterna anche le formulazioni che aggiungi nell'editor dei messaggi vocali (prima leggeva i separatori |).",
            },
          },
          {
            text: {
              en: "Maps: one orientation rule everywhere (Live map, overlay, race control, telemetry): each track is rotated to be wider than tall, start line at the bottom, with the same scale on both axes (the Live map used to stretch the track). The \"Maps: north up\" setting (Settings › Live options) keeps the previous orientation. Cars are coloured by class on the Live map (a new class from the game gets its own stable colour), and pit area spots read from the game are shown along the pit lane.",
              fr: "Cartes : une seule règle d'orientation partout (carte Live, overlay, régie, télémétrie) : chaque tracé est tourné pour être plus large que haut, ligne de départ en bas, avec la même échelle sur les deux axes (la carte Live étirait le tracé). Le réglage « Cartes : nord en haut » (Configuration › options Live) garde l'orientation d'avant. Les voitures sont colorées par classe sur la carte Live (une nouvelle classe du jeu reçoit sa propre couleur, stable), et les emplacements de la zone des stands lus dans le jeu sont affichés le long de la voie des stands.",
              es: "Mapas: una sola regla de orientación en todas partes (mapa en directo, overlay, dirección de carrera, telemetría): cada trazado se gira para que sea más ancho que alto, con la línea de salida abajo y la misma escala en ambos ejes (el mapa en directo estiraba el trazado). El ajuste «Mapas: norte arriba» (Configuración › opciones Live) conserva la orientación anterior. Los coches se colorean por clase en el mapa en directo (una nueva clase del juego recibe su propio color, estable) y los puestos de la zona de boxes leídos del juego se muestran a lo largo del pit lane.",
              de: "Karten: eine einzige Ausrichtungsregel überall (Live-Karte, Overlay, Rennleitung, Telemetrie): Jede Strecke wird so gedreht, dass sie breiter als hoch ist, Startlinie unten, mit gleichem Maßstab auf beiden Achsen (die Live-Karte hat die Strecke verzerrt). Die Einstellung „Karten: Norden oben“ (Einstellungen › Live-Optionen) behält die bisherige Ausrichtung. Autos sind auf der Live-Karte nach Klasse eingefärbt (eine neue Klasse des Spiels erhält ihre eigene, feste Farbe), und die aus dem Spiel gelesenen Plätze im Boxenbereich werden entlang der Boxengasse angezeigt.",
              it: "Mappe: un'unica regola di orientamento ovunque (mappa live, overlay, direzione gara, telemetria): ogni tracciato viene ruotato per essere più largo che alto, linea di partenza in basso, con la stessa scala sui due assi (la mappa live deformava il tracciato). L'impostazione «Mappe: nord in alto» (Impostazioni › opzioni Live) mantiene l'orientamento precedente. Le auto sono colorate per classe sulla mappa live (una nuova classe del gioco riceve un proprio colore stabile) e le piazzole della zona box lette dal gioco sono mostrate lungo la corsia box.",
            },
          },
          {
            text: {
              en: "A more reliable AI Coach. Before each open voice question, the app now computes the facts it can (position, gaps, fuel, stops, tyres…) and gives them to the AI as the only source of figures; anything not available is marked as unknown so the AI says so instead of guessing. A built-in base of engineer notes (understeer, exit oversteer, braking instability, tyre temperature spread, rain, fuel saving, cold tyres, traffic, brake bias, undercut…) is added to the AI context with a confidence level, and without the AI the engineer can answer those questions on the radio, but only with the notes rated as sure.",
              fr: "Un Coach IA plus fiable. Avant chaque question vocale ouverte, l'app calcule elle-même les faits qu'elle peut (position, écarts, carburant, arrêts, pneus…) et les donne à l'IA comme seule source des chiffres ; ce qui manque est signalé comme inconnu, pour qu'elle le dise au lieu de deviner. Une base de notes d'ingénieur intégrée (sous-virage, survirage en sortie, instabilité au freinage, écart de température des pneus, pluie, économie de carburant, pneus froids, trafic, répartition de freinage, undercut…) est ajoutée au contexte de l'IA avec un niveau de confiance ; sans IA, l'ingénieur peut répondre à ces questions à la radio, mais seulement avec les notes jugées sûres.",
              es: "Un Coach IA más fiable. Antes de cada pregunta de voz abierta, la app calcula los datos que puede (posición, diferencias, combustible, paradas, neumáticos…) y se los da a la IA como única fuente de cifras; lo que falta se marca como desconocido para que lo diga en lugar de adivinar. Una base de notas de ingeniero integrada (subviraje, sobreviraje a la salida, inestabilidad en frenada, diferencia de temperatura de los neumáticos, lluvia, ahorro de combustible, neumáticos fríos, tráfico, reparto de frenada, undercut…) se añade al contexto de la IA con un nivel de confianza; sin IA, el ingeniero puede responder a esas preguntas por radio, pero solo con las notas consideradas seguras.",
              de: "Ein verlässlicherer KI-Coach. Vor jeder offenen Sprachfrage berechnet die App die verfügbaren Fakten selbst (Position, Abstände, Kraftstoff, Stopps, Reifen…) und gibt sie der KI als einzige Quelle für Zahlen; Fehlendes wird als unbekannt markiert, damit die KI es sagt, statt zu raten. Eine eingebaute Sammlung von Ingenieursnotizen (Untersteuern, Übersteuern am Ausgang, Instabilität beim Bremsen, Temperaturverteilung der Reifen, Regen, Spritsparen, kalte Reifen, Verkehr, Bremsbalance, Undercut…) wird mit einer Vertrauensstufe in den KI-Kontext gegeben; ohne KI beantwortet der Ingenieur diese Fragen per Funk, aber nur mit den als sicher eingestuften Notizen.",
              it: "Un Coach IA più affidabile. Prima di ogni domanda vocale aperta, l'app calcola da sé i dati che può (posizione, distacchi, carburante, soste, gomme…) e li dà all'IA come unica fonte dei numeri; ciò che manca è segnato come sconosciuto, così l'IA lo dice invece di indovinare. Una base integrata di note da ingegnere (sottosterzo, sovrasterzo in uscita, instabilità in frenata, differenza di temperatura delle gomme, pioggia, risparmio carburante, gomme fredde, traffico, ripartizione di frenata, undercut…) viene aggiunta al contesto dell'IA con un livello di affidabilità; senza IA, l'ingegnere può rispondere a queste domande via radio, ma solo con le note ritenute sicure.",
            },
          },
          {
            text: {
              en: "\"Talk to the engineer\" without AI: when no AI model is set up, the engineer now always answers locally — the most likely answer to your question, or the race update if he did not understand — instead of saying that no model is selected. The tip to set up a model stays on screen.",
              fr: "« Parler à l'ingénieur » sans IA : quand aucun modèle d'IA n'est configuré, l'ingénieur répond désormais toujours en local — la réponse la plus probable à ta question, ou le point de course s'il n'a pas compris — au lieu de dire qu'aucun modèle n'est sélectionné. L'astuce pour configurer un modèle reste affichée à l'écran.",
              es: "«Hablar con el ingeniero» sin IA: cuando no hay ningún modelo de IA configurado, el ingeniero responde ahora siempre en local — la respuesta más probable a tu pregunta, o el resumen de carrera si no ha entendido — en lugar de decir que no hay modelo seleccionado. El consejo para configurar un modelo sigue en pantalla.",
              de: "„Mit dem Ingenieur sprechen“ ohne KI: Ist kein KI-Modell eingerichtet, antwortet der Ingenieur jetzt immer lokal — mit der wahrscheinlichsten Antwort auf deine Frage oder dem Rennstand, wenn er nichts verstanden hat — statt zu sagen, dass kein Modell gewählt ist. Der Hinweis zur Modellwahl bleibt auf dem Bildschirm.",
              it: "«Parla con l'ingegnere» senza IA: quando nessun modello di IA è configurato, l'ingegnere risponde ora sempre in locale — la risposta più probabile alla tua domanda, o il punto della gara se non ha capito — invece di dire che nessun modello è selezionato. Il suggerimento per configurare un modello resta sullo schermo.",
            },
          },
          {
            text: {
              en: "A more concise radio. After a big hit, the engineer gives at most two damage messages in the following minute (what happened, then the damage report); critical ones like a puncture always go through. In qualifying, he stays quiet during your flying lap (safety and decisions excepted) and speaks again after the line. Both are part of the \"Race phases\" setting, so turning it off restores the previous behaviour. New: he asks once per session type how you want your lap times (every lap, only the best ones, or none) and remembers your answer; you can change it any time on the radio (\"every lap\", \"only my best laps\", \"no lap times\", \"as before\"). The question can be turned off in Audio / Voice.",
              fr: "Une radio plus concise. Après un gros choc, l'ingénieur donne au plus deux annonces de dégâts dans la minute qui suit (le constat, puis le bilan) ; les critiques comme une crevaison passent toujours. En qualif, il se tait pendant ton tour lancé (sécurité et décisions exceptées) et reparle après la ligne. Les deux font partie du réglage « Phases de course » : le couper rend l'ancien comportement. Nouveau : il te demande une fois par type de session comment tu veux tes chronos (à chaque tour, seulement les meilleurs, ou aucun) et retient ta réponse ; tu peux la changer à tout moment à la radio (« à chaque tour », « seulement mes meilleurs tours », « pas de chronos », « comme avant »). La question se coupe dans Audio / Voix.",
              es: "Una radio más concisa. Tras un golpe fuerte, el ingeniero da como mucho dos mensajes de daños en el minuto siguiente (lo ocurrido y luego el balance); los críticos, como un pinchazo, siempre pasan. En clasificación se calla durante tu vuelta lanzada (salvo seguridad y decisiones) y vuelve a hablar tras la línea. Ambos forman parte del ajuste «Fases de carrera»: desactivarlo devuelve el comportamiento anterior. Nuevo: te pregunta una vez por tipo de sesión cómo quieres tus tiempos (en cada vuelta, solo los mejores o ninguno) y recuerda tu respuesta; puedes cambiarla en cualquier momento por radio («cada vuelta», «solo mis mejores vueltas», «sin tiempos», «como antes»). La pregunta se desactiva en Audio / Voz.",
              de: "Ein knapperer Funk. Nach einem harten Einschlag gibt der Ingenieur in der folgenden Minute höchstens zwei Schadensmeldungen (was passiert ist, dann die Bilanz); kritische wie ein Reifenschaden kommen immer durch. Im Qualifying schweigt er während deiner schnellen Runde (außer Sicherheit und Entscheidungen) und spricht nach der Linie wieder. Beides gehört zur Einstellung „Rennphasen“: Ausschalten stellt das bisherige Verhalten her. Neu: Er fragt einmal pro Sessiontyp, wie du deine Rundenzeiten willst (jede Runde, nur die besten oder keine), und merkt sich die Antwort; du kannst sie jederzeit per Funk ändern („jede Runde“, „nur meine besten Runden“, „keine Rundenzeiten“, „wie vorher“). Die Frage lässt sich unter Audio / Stimme abschalten.",
              it: "Una radio più concisa. Dopo un urto forte, l'ingegnere dà al massimo due messaggi di danni nel minuto successivo (cosa è successo, poi il bilancio); quelli critici come una foratura passano sempre. In qualifica tace durante il tuo giro lanciato (tranne sicurezza e decisioni) e riprende a parlare dopo la linea. Entrambi fanno parte dell'opzione «Fasi di gara»: disattivarla ripristina il comportamento precedente. Novità: ti chiede una volta per tipo di sessione come vuoi i tuoi tempi (a ogni giro, solo i migliori o nessuno) e ricorda la risposta; puoi cambiarla in qualsiasi momento via radio («ogni giro», «solo i miei giri migliori», «niente tempi», «come prima»). La domanda si disattiva in Audio / Voce.",
            },
          },
          {
            text: {
              en: "Live map: the track is now drawn as grey asphalt with a light centre line, matched to the light and dark themes, instead of a dark band that turned olive. Sectors are easy to spot: a bar across the track and an S1 / S2 / S3 label, with S1 on a chequered start line. The yellow band that covered most of the track is gone: the game gives no reliable per-sector yellow data.",
              fr: "Carte Live : la piste est dessinée en asphalte gris avec une ligne médiane claire, adaptée aux thèmes clair et sombre, au lieu d'un ruban sombre qui virait à l'olive. Les secteurs se repèrent d'un coup d'œil : une barre en travers de la piste et une étiquette S1 / S2 / S3, S1 sur une ligne de départ en damier. Le ruban jaune qui recouvrait une bonne partie du circuit a disparu : le jeu ne fournit pas d'information fiable de jaune par secteur.",
              es: "Mapa Live: la pista se dibuja ahora como asfalto gris con una línea central clara, adaptada a los temas claro y oscuro, en lugar de una banda oscura que se volvía verde oliva. Los sectores se ven de un vistazo: una barra que cruza la pista y una etiqueta S1 / S2 / S3, con S1 sobre una línea de salida a cuadros. La franja amarilla que cubría buena parte del circuito ha desaparecido: el juego no da información fiable de amarilla por sector.",
              de: "Live-Karte: Die Strecke wird jetzt als grauer Asphalt mit heller Mittellinie gezeichnet, passend zum hellen und dunklen Design, statt als dunkles Band, das olivgrün wirkte. Sektoren sind auf einen Blick erkennbar: ein Balken quer über die Strecke und ein Etikett S1 / S2 / S3, S1 auf einer karierten Startlinie. Das gelbe Band, das große Teile der Strecke bedeckte, ist weg: Das Spiel liefert keine verlässlichen Gelb-Daten pro Sektor.",
              it: "Mappa Live: la pista è ora disegnata in asfalto grigio con una linea centrale chiara, adattata ai temi chiaro e scuro, invece di una fascia scura che diventava color oliva. I settori si individuano a colpo d'occhio: una barra trasversale sulla pista e un'etichetta S1 / S2 / S3, con S1 su una linea di partenza a scacchi. La fascia gialla che copriva buona parte del circuito è sparita: il gioco non fornisce dati affidabili di giallo per settore.",
            },
          },
          {
            en: "AI Coach: the Config section is now called \"AI Coach\" (the AI voice settings are under Audio / Voice) and the coach's \"Open Config\" button leads straight to it. With no provider added, no provider or model is shown any more (an old \"Google\" default made it look ready), and a line explains where the analysis model and the voice coach provider are set. The voice coach setting is now labelled \"Voice provider and model\" and shows what it currently uses. A local provider such as Ollama is checked on opening: if it isn't running or the chosen model isn't installed, the coach says so instead of looking ready.",
            fr: "Coach IA : la section de la Config s'appelle désormais « Coach IA » (les réglages de la voix IA sont dans Audio / Voix) et le bouton « Ouvrir la Config » du coach y mène directement. Sans fournisseur ajouté, plus aucun fournisseur ni modèle n'est affiché (une ancienne valeur par défaut « Google » laissait croire que c'était prêt), et une ligne indique où se règlent le modèle d'analyse et le fournisseur du coach vocal. Le réglage vocal s'intitule maintenant « Fournisseur et modèle vocal » et affiche ce qu'il utilise. Un fournisseur local comme Ollama est vérifié à l'ouverture : s'il n'est pas lancé ou si le modèle choisi n'est pas installé, le coach le dit au lieu d'avoir l'air prêt.",
            es: "Coach IA: la sección de Config se llama ahora «Coach IA» (los ajustes de la voz IA están en Audio / Voz) y el botón «Abrir Config» del coach lleva directamente a ella. Sin proveedor añadido, ya no se muestra ningún proveedor ni modelo (un antiguo valor por defecto «Google» hacía creer que estaba listo), y una línea indica dónde se ajustan el modelo de análisis y el proveedor del coach por voz. El ajuste de voz se llama ahora «Proveedor y modelo de voz» y muestra lo que usa. Un proveedor local como Ollama se comprueba al abrir: si no está iniciado o el modelo elegido no está instalado, el coach lo indica en lugar de parecer listo.",
            de: "KI-Coach: Der Einstellungsbereich heißt jetzt „KI-Coach“ (die Einstellungen der KI-Stimme stehen unter Audio / Stimme), und die Schaltfläche „Einstellungen öffnen“ des Coachs führt direkt dorthin. Ohne hinzugefügten Anbieter wird kein Anbieter und kein Modell mehr angezeigt (ein alter Standardwert „Google“ ließ es fertig wirken), und eine Zeile erklärt, wo Analysemodell und Anbieter des Sprach-Coachs eingestellt werden. Die Spracheinstellung heißt jetzt „Sprach-Anbieter und -Modell“ und zeigt, was verwendet wird. Ein lokaler Anbieter wie Ollama wird beim Öffnen geprüft: Läuft er nicht oder ist das gewählte Modell nicht installiert, sagt der Coach es, statt bereit zu wirken.",
            it: "Coach IA: la sezione di Config ora si chiama «Coach IA» (le impostazioni della voce IA sono in Audio / Voce) e il pulsante «Apri Config» del coach porta direttamente lì. Senza fornitore aggiunto non viene più mostrato alcun fornitore né modello (un vecchio valore predefinito «Google» lo faceva sembrare pronto), e una riga indica dove si impostano il modello di analisi e il fornitore del coach vocale. L'impostazione vocale si chiama ora «Fornitore e modello vocale» e mostra cosa usa. Un fornitore locale come Ollama viene verificato all'apertura: se non è avviato o il modello scelto non è installato, il coach lo dice invece di sembrare pronto.",
          },
          {
            text: {
              en: "Track map (Live page and overlay): the complete outline now comes from the game as soon as cars are on track — no more waiting for a full lap, on every circuit — and wrong points (off-track excursions) are corrected with it. The pit lane is drawn, the start line and the measured sector boundaries are marked.",
              fr: "Carte du circuit (page Live et overlay) : le tracé complet vient désormais du jeu dès que des voitures roulent — plus besoin d'attendre un tour complet, sur tous les circuits — et les points faux (sorties de piste) sont corrigés grâce à lui. La voie des stands est dessinée, la ligne de départ et les limites de secteurs (mesurées) sont repérées.",
              es: "Mapa del circuito (página Live y overlay): el trazado completo llega ahora del juego en cuanto hay coches en pista —ya no hay que esperar una vuelta completa, en todos los circuitos— y con él se corrigen los puntos erróneos (salidas de pista). Se dibuja el pit lane, se marcan la línea de salida y los límites de sector (medidos).",
              de: "Streckenkarte (Live-Seite und Overlay): Der vollständige Streckenverlauf kommt jetzt aus dem Spiel, sobald Autos fahren — kein Warten mehr auf eine volle Runde, auf allen Strecken — und falsche Punkte (Ausflüge neben die Strecke) werden damit korrigiert. Die Boxengasse wird gezeichnet, Startlinie und gemessene Sektorgrenzen werden markiert.",
              it: "Mappa del circuito (pagina Live e overlay): il tracciato completo arriva ora dal gioco appena ci sono auto in pista — niente più attesa di un giro completo, su tutti i circuiti — e i punti errati (uscite di pista) vengono corretti grazie a esso. La corsia box è disegnata, la linea di partenza e i limiti dei settori (misurati) sono segnati.",
            },
          },
          {
            text: {
              en: "Settings → Audio / Voice reorganised into four tabs under the \"Voice announcements\" switch: Voice, Announcements, Talk to the engineer, Corner coach. Every setting is still there; the \"Announcement settings\" and \"Spotter settings\" fold-outs are gone (their settings are shown directly in their tab). New \"Test\" button next to your first name on the radio.",
              fr: "Configuration → Audio / Voix réorganisée en quatre onglets sous l'interrupteur « Annonces vocales » : Voix, Annonces, Parler à l'ingénieur, Coach par virage. Tous les réglages sont toujours là ; les dépliants « Réglages des annonces » et « Réglages du spotter » disparaissent (leurs réglages s'affichent directement dans leur onglet). Nouveau bouton « Tester » à côté de ton prénom à la radio.",
              es: "Configuración → Audio / Voz reorganizada en cuatro pestañas bajo el interruptor «Anuncios de voz»: Voz, Anuncios, Hablar con el ingeniero, Coach por curva. Todos los ajustes siguen ahí; los desplegables «Ajustes de anuncios» y de ajustes del spotter desaparecen (sus ajustes se muestran directamente en su pestaña). Nuevo botón «Probar» junto a tu nombre en la radio.",
              de: "Einstellungen → Audio / Stimme in vier Reiter unter dem Schalter „Sprachansagen“ gegliedert: Stimme, Ansagen, Mit dem Ingenieur sprechen, Kurven-Coach. Alle Einstellungen sind noch da; die Ausklappmenüs „Ansage-Einstellungen“ und Spotter-Einstellungen entfallen (ihre Einstellungen stehen direkt im jeweiligen Reiter). Neue Schaltfläche „Testen“ neben deinem Vornamen im Funk.",
              it: "Impostazioni → Audio / Voce riorganizzata in quattro schede sotto l'interruttore «Annunci vocali»: Voce, Annunci, Parla con l'ingegnere, Coach per curva. Tutte le impostazioni ci sono ancora; i menu «Impostazioni degli annunci» e delle impostazioni dello spotter scompaiono (le impostazioni sono mostrate direttamente nella loro scheda). Nuovo pulsante «Prova» accanto al tuo nome alla radio.",
            },
          },
          {
            text: {
              en: "The race engineer talks at the right moment: it learns where you brake and no longer starts a call within 200 m of a braking point, while braking or steering, or while you hold a push-to-talk key (the check is repeated just before speaking; safety always gets through). The corner coach follows the same rule. With the \"Engineer\" rate, it also follows the race phases (quiet at the start, in the pit lane and after the flag, strategy frozen in the last 20 minutes, calm after a big hit or a box call) and caps race chatter (positions once per lap, lap times every 3 laps, 2 calls per rival). Each behaviour has its own setting to go back to the previous one.",
              fr: "L'ingénieur parle au bon moment : il apprend où tu freines et n'entame plus d'annonce à moins de 200 m d'un freinage, frein appuyé ou volant tourné, ni pendant que tu tiens une touche de push-to-talk (vérifié juste avant de parler ; la sécurité passe toujours). Le coach par virage suit la même règle. En débit « Ingénieur », il suit aussi les phases de course (silence au départ, dans les stands et après le damier, stratégie gelée dans les 20 dernières minutes, calme après un gros choc ou un appel au box) et limite le bavardage en course (positions une fois par tour, chronos tous les 3 tours, 2 messages par rival). Chaque comportement a son réglage pour revenir à l'ancien.",
              es: "El ingeniero habla en el momento adecuado: aprende dónde frenas y ya no empieza un aviso a menos de 200 m de una frenada, al frenar o girar el volante, ni mientras mantienes una tecla de pulsar para hablar (comprobado justo antes de hablar; la seguridad siempre pasa). El coach por curva sigue la misma regla. Con el ritmo «Ingeniero», también sigue las fases de carrera (silencio en la salida, en boxes y tras la bandera, estrategia congelada en los últimos 20 minutos, calma tras un golpe fuerte o una llamada a boxes) y limita la charla en carrera (posiciones una vez por vuelta, tiempos cada 3 vueltas, 2 avisos por rival). Cada comportamiento tiene su ajuste para volver al anterior.",
              de: "Der Renningenieur spricht im richtigen Moment: Er lernt, wo du bremst, und beginnt keine Ansage mehr innerhalb von 200 m vor einem Bremspunkt, beim Bremsen oder Lenken oder solange du eine Push-to-Talk-Taste hältst (direkt vor dem Sprechen geprüft; Sicherheit kommt immer durch). Der Kurven-Coach folgt derselben Regel. Im Modus „Ingenieur“ beachtet er auch die Rennphasen (Stille am Start, in der Boxengasse und nach der Zielflagge, Strategie in den letzten 20 Minuten eingefroren, Ruhe nach einem harten Einschlag oder einem Boxenruf) und begrenzt den Funkverkehr im Rennen (Positionen einmal pro Runde, Rundenzeiten alle 3 Runden, 2 Meldungen pro Gegner). Jedes Verhalten hat eine eigene Einstellung, um zum bisherigen zurückzukehren.",
              it: "L'ingegnere parla al momento giusto: impara dove freni e non inizia più un annuncio a meno di 200 m da una frenata, quando freni o sterzi, né mentre tieni premuto un tasto push-to-talk (verificato subito prima di parlare; la sicurezza passa sempre). Il coach per curva segue la stessa regola. Con la frequenza «Ingegnere» segue anche le fasi di gara (silenzio alla partenza, ai box e dopo la bandiera, strategia congelata negli ultimi 20 minuti, calma dopo un urto forte o una chiamata ai box) e limita le chiacchiere in gara (posizioni una volta per giro, tempi ogni 3 giri, 2 messaggi per avversario). Ogni comportamento ha la sua impostazione per tornare al precedente.",
            },
          },
          {
            text: {
              en: "You no longer miss a call: a call cut off by a more urgent one is repeated once (\"I repeat: …\") if it's still relevant, an important call that couldn't get through gets a second chance, and the same sentence isn't repeated for 5 laps (no more back-and-forth like \"rain coming\" / \"rain stopping\" / \"rain coming\").",
              fr: "Tu ne rates plus une annonce : une annonce coupée par une plus urgente est redite une fois (« Je répète : … ») si elle est encore d'actualité, une consigne importante qui n'a pas pu passer a droit à une seconde chance, et une même phrase n'est pas répétée pendant 5 tours (fini les va-et-vient « la pluie arrive » / « la pluie s'arrête » / « la pluie arrive »).",
              es: "Ya no te pierdes un aviso: un aviso cortado por otro más urgente se repite una vez («Repito: …») si sigue vigente, un aviso importante que no pudo pasar tiene una segunda oportunidad, y la misma frase no se repite durante 5 vueltas (se acabaron los vaivenes «llega la lluvia» / «para la lluvia» / «llega la lluvia»).",
              de: "Du verpasst keine Ansage mehr: Eine von einer dringenderen unterbrochene Ansage wird einmal wiederholt („Ich wiederhole: …“), wenn sie noch aktuell ist, eine wichtige Ansage, die nicht durchkam, bekommt eine zweite Chance, und derselbe Satz wird 5 Runden lang nicht wiederholt (kein Hin und Her mehr wie „Regen kommt“ / „Regen hört auf“ / „Regen kommt“).",
              it: "Non perdi più un annuncio: un annuncio interrotto da uno più urgente viene ripetuto una volta («Ripeto: …») se è ancora attuale, un annuncio importante che non è passato ha una seconda possibilità, e la stessa frase non viene ripetuta per 5 giri (niente più botta e risposta «arriva la pioggia» / «smette di piovere» / «arriva la pioggia»).",
            },
          },
          {
            text: {
              en: "A faster, livelier voice: the Piper voice now stays loaded between sentences (about 3 to 6 times faster after the first sentence), urgent fixed calls (flags, box box, puncture, pit limiter) are prepared in advance, lap times are read to the tenth (thousandths still available in Settings → Voice), and the most frequent calls now have several wordings that alternate. In the voice message editor, separate your own wordings with |.",
              fr: "Une voix plus rapide et plus vivante : la voix Piper reste chargée entre deux phrases (environ 3 à 6 fois plus rapide après la première), les annonces urgentes fixes (drapeaux, box box, crevaison, limiteur) sont préparées d'avance, les chronos sont dits au dixième (le millième reste disponible dans Configuration → Voix), et les annonces les plus fréquentes ont désormais plusieurs formulations qui alternent. Dans l'éditeur des messages vocaux, sépare tes propres formulations par |.",
              es: "Una voz más rápida y viva: la voz Piper permanece cargada entre frases (entre 3 y 6 veces más rápida tras la primera), los avisos urgentes fijos (banderas, box box, pinchazo, limitador) se preparan de antemano, los tiempos se dicen a la décima (la milésima sigue disponible en Configuración → Voz), y los avisos más frecuentes tienen ahora varias formulaciones que se alternan. En el editor de mensajes de voz, separa tus propias formulaciones con |.",
              de: "Eine schnellere, lebendigere Stimme: Die Piper-Stimme bleibt zwischen zwei Sätzen geladen (nach dem ersten Satz etwa 3- bis 6-mal schneller), dringende feste Ansagen (Flaggen, Box Box, Reifenschaden, Limiter) werden vorab vorbereitet, Rundenzeiten werden auf die Zehntel angesagt (Tausendstel weiterhin unter Einstellungen → Stimme), und die häufigsten Ansagen haben jetzt mehrere Formulierungen, die sich abwechseln. Im Editor der Sprachansagen eigene Formulierungen mit | trennen.",
              it: "Una voce più rapida e viva: la voce Piper resta caricata tra una frase e l'altra (da 3 a 6 volte più rapida dopo la prima), gli annunci urgenti fissi (bandiere, box box, foratura, limitatore) sono preparati in anticipo, i tempi sono detti al decimo (il millesimo resta disponibile in Impostazioni → Voce), e gli annunci più frequenti ora hanno più formulazioni che si alternano. Nell'editor dei messaggi vocali, separa le tue formulazioni con |.",
            },
          },
          {
            text: {
              en: "A more honest corner coach (\"Rigorous coach\" setting, on by default): a tip is now judged on your time in the corner before and after it (at least 3 passes, statistical test) instead of two clean passes that could be luck. The coach says \"that's better\" or \"forget my advice, go back to what you were doing\", announces that it will check the next passes, and leaves a corner alone for the session when its tip changed nothing. In races, at most one tip every 12 laps.",
              fr: "Un coach par virage plus honnête (réglage « Coach rigoureux », actif par défaut) : un conseil est désormais jugé sur ton temps dans le virage avant et après (au moins 3 passages, test statistique) et non sur deux passages propres qui pouvaient être de la chance. Le coach dit « c'est mieux » ou « oublie mon conseil, reviens à ce que tu faisais », annonce qu'il va vérifier les prochains passages, et laisse tranquille pour la session un virage où son conseil n'a rien changé. En course, un conseil tous les 12 tours au plus.",
              es: "Un coach por curva más honesto (ajuste «Coach riguroso», activado por defecto): un consejo se juzga ahora por tu tiempo en la curva antes y después (al menos 3 pasadas, prueba estadística) y no por dos pasadas limpias que podían ser suerte. El coach dice «mejor» u «olvida mi consejo, vuelve a lo que hacías», anuncia que mirará las próximas pasadas y deja tranquila durante la sesión una curva donde su consejo no cambió nada. En carrera, como mucho un consejo cada 12 vueltas.",
              de: "Ein ehrlicherer Kurven-Coach (Einstellung „Gründlicher Coach“, standardmäßig an): Ein Tipp wird jetzt an deiner Zeit in der Kurve vorher und nachher gemessen (mindestens 3 Durchfahrten, statistischer Test) statt an zwei sauberen Durchfahrten, die Glück sein konnten. Der Coach sagt „besser“ oder „vergiss meinen Tipp, mach es wieder wie vorher“, kündigt an, die nächsten Durchfahrten zu prüfen, und lässt eine Kurve für die Session in Ruhe, wenn sein Tipp nichts geändert hat. Im Rennen höchstens ein Tipp alle 12 Runden.",
              it: "Un coach per curva più onesto (impostazione «Coach rigoroso», attiva per impostazione predefinita): un consiglio ora viene giudicato sul tuo tempo in curva prima e dopo (almeno 3 passaggi, test statistico) e non su due passaggi puliti che potevano essere fortuna. Il coach dice «meglio» o «dimentica il mio consiglio, torna a come facevi prima», annuncia che controllerà i prossimi passaggi e lascia in pace per la sessione una curva in cui il suo consiglio non ha cambiato nulla. In gara, al massimo un consiglio ogni 12 giri.",
            },
          },
          {
            text: {
              en: "One website for LMU Stats Viewer: the app's presentation and the community leaderboards now live together on lmu.cparfait.ovh (the old address redirects there). The \"Also on lmu.cparfait.ovh\" link on the Leaderboards page opens the leaderboards directly.",
              fr: "Un seul site pour LMU Stats Viewer : la présentation de l'app et les classements communautaires sont désormais réunis sur lmu.cparfait.ovh (l'ancienne adresse y redirige). Le lien « Aussi sur lmu.cparfait.ovh » de la page Classements ouvre directement les classements.",
              es: "Un solo sitio para LMU Stats Viewer: la presentación de la app y las clasificaciones de la comunidad están ahora juntas en lmu.cparfait.ovh (la antigua dirección redirige allí). El enlace «También en lmu.cparfait.ovh» de la página Clasificaciones abre directamente las clasificaciones.",
              de: "Eine einzige Website für LMU Stats Viewer: Die Vorstellung der App und die Community-Ranglisten sind jetzt gemeinsam auf lmu.cparfait.ovh (die alte Adresse leitet dorthin um). Der Link „Auch auf lmu.cparfait.ovh“ auf der Ranglisten-Seite öffnet direkt die Ranglisten.",
              it: "Un solo sito per LMU Stats Viewer: la presentazione dell'app e le classifiche della community ora si trovano insieme su lmu.cparfait.ovh (il vecchio indirizzo vi reindirizza). Il link «Anche su lmu.cparfait.ovh» della pagina Classifiche apre direttamente le classifiche.",
            },
          },
          {
            text: {
              en: "Leaderboards: opening a combo (or a track's all-classes leaderboard) now scrolls its row to the top of the screen, so the detail fills the window instead of spilling off the bottom.",
              fr: "Classements : ouvrir un combo (ou le classement toutes classes d'un circuit) fait remonter sa ligne en haut de l'écran ; le détail occupe la fenêtre au lieu de déborder en bas.",
              es: "Clasificaciones: al abrir un combo (o la clasificación de todas las clases de un circuito), su fila sube a la parte superior de la pantalla; el detalle ocupa la ventana en lugar de salirse por abajo.",
              de: "Ranglisten: Beim Öffnen einer Kombination (oder der Rangliste aller Klassen einer Strecke) rückt ihre Zeile an den oberen Bildschirmrand; die Details füllen das Fenster, statt unten herauszuragen.",
              it: "Classifiche: aprendo una combo (o la classifica di tutte le classi di un circuito) la sua riga sale in cima allo schermo; il dettaglio occupa la finestra invece di uscire dal fondo.",
            },
          },
          {
            text: {
              en: "Brake overheating callout: with the \"Engineer\" announcement rate, the alert now follows the average brake temperature (over about 30 s) instead of every braking peak — one call when the average goes over the limit, repeated only after the brakes have cooled down. The limit depends on the brake material: 850 °C for the carbon brakes of Hypercars and LMP2s, 750 °C for the steel brakes of LMP3s and LMGT3s. The \"Full\" rate keeps the previous behaviour.",
              fr: "Alerte de surchauffe des freins : en débit « Ingénieur », elle suit désormais la température moyenne des freins (sur environ 30 s) et non chaque pic de freinage — une annonce quand la moyenne dépasse le seuil, répétée seulement après refroidissement. Le seuil dépend du matériau des freins : 850 °C pour le carbone des Hypercars et LMP2, 750 °C pour l'acier des LMP3 et LMGT3. Le débit « Complet » garde l'ancien comportement.",
              es: "Aviso de sobrecalentamiento de frenos: con el ritmo «Ingeniero», ahora sigue la temperatura media de los frenos (unos 30 s) y no cada pico de frenada — un aviso cuando la media supera el límite, repetido solo tras enfriarse. El límite depende del material de los frenos: 850 °C para el carbono de Hypercars y LMP2, 750 °C para el acero de LMP3 y LMGT3. El ritmo «Completo» conserva el comportamiento anterior.",
              de: "Ansage „Bremsen überhitzen“: Im Modus „Ingenieur“ folgt sie jetzt der durchschnittlichen Bremstemperatur (über ca. 30 s) statt jeder Bremsspitze — eine Ansage, wenn der Durchschnitt die Grenze überschreitet, erneut erst nach dem Abkühlen. Die Grenze hängt vom Bremsmaterial ab: 850 °C für die Carbonbremsen der Hypercars und LMP2, 750 °C für die Stahlbremsen der LMP3 und LMGT3. Der Modus „Vollständig“ behält das bisherige Verhalten.",
              it: "Avviso di surriscaldamento dei freni: con la frequenza «Ingegnere» ora segue la temperatura media dei freni (su circa 30 s) e non ogni picco di frenata — un avviso quando la media supera il limite, ripetuto solo dopo il raffreddamento. La soglia dipende dal materiale dei freni: 850 °C per il carbonio di Hypercar e LMP2, 750 °C per l'acciaio di LMP3 e LMGT3. La frequenza «Completo» mantiene il comportamento precedente.",
            },
          },
          {
            text: {
              en: "Setups page: the matrix title now names the selected circuit or car (\"Setups for Bahrain — one row per car\"), so the \"By circuit\" and \"By car\" views no longer look swapped.",
              fr: "Page Setups : le titre de la matrice nomme désormais le circuit ou la voiture choisi(e) (« Setups pour Bahrain — une ligne par voiture ») : les vues « Par circuit » et « Par voiture » ne semblent plus inversées.",
              es: "Página Setups: el título de la matriz indica ahora el circuito o el coche elegido («Setups para Bahrain — una fila por coche»), así las vistas «Por circuito» y «Por coche» ya no parecen invertidas.",
              de: "Setups-Seite: Der Titel der Matrix nennt jetzt die gewählte Strecke bzw. das gewählte Auto („Setups für Bahrain — eine Zeile pro Auto“), damit die Ansichten „Nach Strecke“ und „Nach Auto“ nicht mehr vertauscht wirken.",
              it: "Pagina Setup: il titolo della matrice ora indica il circuito o l'auto scelti («Setup per Bahrain — una riga per auto»), così le viste «Per circuito» e «Per auto» non sembrano più invertite.",
            },
          },
        ],
      },
      {
        kind: "fixed",
        items: [
          {
            text: {
              en: "Session details, lap cards: the car logo and name in the coloured header were dark on orange and almost invisible: the logo now keeps its colours on a small white badge, the name and car number are white. Same for the lap count next to each track on the Records page.",
              fr: "Détail de session, cartes des tours : le logo et le nom de la voiture dans le bandeau de couleur étaient sombres sur l'orange, presque invisibles : le logo garde ses couleurs sur une petite pastille blanche, le nom et le numéro de la voiture sont en blanc. Idem pour le nombre de tours à côté de chaque circuit dans la page Records.",
              es: "Detalle de sesión, tarjetas de vueltas: el logo y el nombre del coche en la cabecera de color eran oscuros sobre el naranja y casi invisibles: el logo conserva sus colores sobre una pequeña pastilla blanca, el nombre y el número del coche son blancos. Lo mismo para el número de vueltas junto a cada circuito en la página Récords.",
              de: "Session-Details, Rundenkarten: Logo und Name des Autos in der farbigen Kopfzeile waren dunkel auf Orange und kaum sichtbar: Das Logo behält seine Farben auf einem kleinen weißen Feld, Name und Startnummer sind weiß. Ebenso die Rundenanzahl neben jeder Strecke auf der Seite Rekorde.",
              it: "Dettaglio sessione, schede dei giri: il logo e il nome dell'auto nell'intestazione colorata erano scuri sull'arancione e quasi invisibili: il logo mantiene i suoi colori su una piccola pastiglia bianca, nome e numero dell'auto sono bianchi. Lo stesso per il numero di giri accanto a ogni circuito nella pagina Record.",
            },
          },
          {
            text: {
              en: "Help (“?” in the top bar): the window now opens in the middle of the screen instead of being cut off at the top left; wider, in two columns (shortcuts, what each feature needs) with a link to the right screen for each item, plus VR and community rankings.",
              fr: "Aide (« ? » de la barre du haut) : la fenêtre s'ouvre au milieu de l'écran au lieu d'être coupée en haut à gauche ; plus large, sur deux colonnes (raccourcis, prérequis de chaque fonction) avec un lien vers le bon écran pour chacun, plus la VR et les classements communautaires.",
              es: "Ayuda («?» de la barra superior): la ventana se abre en el centro de la pantalla en lugar de aparecer cortada arriba a la izquierda; más ancha, en dos columnas (atajos, requisitos de cada función) con un enlace a la pantalla correcta para cada uno, además de la VR y las clasificaciones de la comunidad.",
              de: "Hilfe („?“ in der oberen Leiste): Das Fenster öffnet sich in der Bildschirmmitte statt oben links abgeschnitten; breiter, in zwei Spalten (Tastenkürzel, Voraussetzungen jeder Funktion) mit einem Link zum passenden Bildschirm, dazu VR und Community-Ranglisten.",
              it: "Aiuto («?» della barra in alto): la finestra si apre al centro dello schermo invece di comparire tagliata in alto a sinistra; più larga, su due colonne (scorciatoie, requisiti di ogni funzione) con un link alla schermata giusta per ciascuno, più la VR e le classifiche della community.",
            },
          },
          {
            text: {
              en: "Online AI voice: the new pit limiter reminders are now part of “Prepare the voice”, so they are said without delay (unless “Alerts in local voice” is on).",
              fr: "Voix IA en ligne : les nouveaux rappels du limiteur font partie de « Préparer la voix » et sont dits sans délai (sauf avec « Alertes en voix locale »).",
              es: "Voz IA en línea: los nuevos recordatorios del limitador forman parte de «Preparar la voz» y se dicen sin retraso (salvo con «Alertas en voz local»).",
              de: "Online-KI-Stimme: Die neuen Begrenzer-Erinnerungen gehören jetzt zu „Stimme vorbereiten“ und werden ohne Verzögerung gesagt (außer mit „Warnungen in lokaler Stimme“).",
              it: "Voce IA online: i nuovi promemoria del limitatore fanno parte di «Prepara la voce» e vengono detti senza ritardo (tranne con «Avvisi in voce locale»).",
            },
          },
          {
            text: {
              en: "The engineer no longer says you are within a second of the car ahead (or under attack) when you are stopped or crawling: crash, spin, slow return to the pits.",
              fr: "L'ingénieur ne dit plus que tu es dans la seconde de celui devant (ou sous attaque) quand tu es arrêté ou au ralenti : accident, tête-à-queue, retour lent aux stands.",
              es: "El ingeniero ya no dice que estás a menos de un segundo del de delante (o bajo ataque) cuando estás parado o muy lento: accidente, trompo, vuelta lenta a boxes.",
              de: "Der Ingenieur sagt nicht mehr, dass du unter einer Sekunde hinter dem Vordermann bist (oder angegriffen wirst), wenn du stehst oder schleichst: Unfall, Dreher, langsame Rückkehr an die Box.",
              it: "L'ingegnere non dice più che sei entro un secondo da chi ti precede (o sotto attacco) quando sei fermo o lentissimo: incidente, testacoda, rientro lento ai box.",
            },
          },
          {
            text: {
              en: "AI settings: a model from another provider (e.g. a Gemini model with Ollama) could be selected after switching provider; it is now reset and replaced by a model of the active provider.",
              fr: "Réglages IA : un modèle d'un autre fournisseur (par exemple un Gemini avec Ollama) pouvait rester choisi après un changement de fournisseur ; il est maintenant remis à zéro et remplacé par un modèle du fournisseur actif.",
              es: "Ajustes de IA: un modelo de otro proveedor (por ejemplo un Gemini con Ollama) podía quedar elegido tras cambiar de proveedor; ahora se reinicia y se sustituye por un modelo del proveedor activo.",
              de: "KI-Einstellungen: Nach einem Anbieterwechsel konnte ein Modell eines anderen Anbieters (z. B. ein Gemini mit Ollama) ausgewählt bleiben; es wird jetzt zurückgesetzt und durch ein Modell des aktiven Anbieters ersetzt.",
              it: "Impostazioni IA: dopo un cambio di fornitore poteva restare selezionato un modello di un altro fornitore (ad esempio un Gemini con Ollama); ora viene azzerato e sostituito da un modello del fornitore attivo.",
            },
          },
          {
            text: {
              en: "Talking to the engineer: when an answer fails (AI Coach model removed, key refused, quota, network, nothing recognised), the radio no longer reads out the technical error message. It says a short line instead, with variations (“Sorry, didn't catch that”, “No answer, check the AI coach connection”…) and, the first time only, a reminder to check the coach model or API key in the settings. The detailed message now appears on screen so you know what to fix.",
              fr: "Parler à l'ingénieur : quand une réponse échoue (modèle du Coach IA retiré, clé refusée, quota, réseau, rien de reconnu), la radio ne lit plus le message d'erreur technique. Elle dit une phrase courte, avec des variantes (« Désolé, j'ai pas compris », « Pas de réponse, vérifie la connexion du coach IA »…) et, la première fois seulement, un rappel de vérifier le modèle ou la clé API du coach dans la configuration. Le message détaillé s'affiche désormais à l'écran pour savoir quoi corriger.",
              es: "Hablar con el ingeniero: cuando una respuesta falla (modelo del Coach IA retirado, clave rechazada, cuota, red, nada reconocido), la radio ya no lee el mensaje de error técnico. Dice una frase corta, con variantes («Perdona, no te he entendido», «Sin respuesta, revisa la conexión del coach IA»…) y, solo la primera vez, un aviso para revisar el modelo o la clave API del coach en la configuración. El mensaje detallado aparece ahora en pantalla para saber qué corregir.",
              de: "Mit dem Renningenieur sprechen: Wenn eine Antwort scheitert (Modell des KI-Coachs entfernt, Schlüssel abgelehnt, Kontingent, Netzwerk, nichts erkannt), liest der Funk die technische Fehlermeldung nicht mehr vor. Er sagt einen kurzen Satz mit Varianten („Sorry, nicht verstanden“, „Keine Antwort, prüf die Verbindung des KI-Coachs“…) und nur beim ersten Mal einen Hinweis, das Coach-Modell oder den API-Schlüssel in den Einstellungen zu prüfen. Die ausführliche Meldung erscheint jetzt auf dem Bildschirm, damit du weißt, was zu beheben ist.",
              it: "Parlare con l'ingegnere: quando una risposta non riesce (modello del Coach IA ritirato, chiave rifiutata, quota, rete, niente riconosciuto), la radio non legge più il messaggio d'errore tecnico. Dice una frase breve, con varianti («Scusa, non ho capito», «Nessuna risposta, controlla la connessione del coach IA»…) e, solo la prima volta, un promemoria per controllare il modello o la chiave API del coach nelle impostazioni. Il messaggio dettagliato ora compare sullo schermo per sapere cosa correggere.",
            },
          },
          {
            text: {
              en: "Wake word: the engineer no longer answers when nobody is talking to him. Another voice (radio, game, someone in the room) could pass for the wake word, and the sentence heard (“twelve percent”…) was sent as a question. The full transcription must now contain the wake word, otherwise nothing is sent. Also, with the online AI voice, “Prepare the voice” now includes the engineer's replies (“Copy, checking”, “Sorry, didn't catch that”, “AI coach unreachable”…): they are said in the AI voice rather than Piper.",
              fr: "Mot déclencheur : l'ingénieur ne répond plus quand on ne lui parle pas. Une autre voix (radio, jeu, quelqu'un dans la pièce) pouvait passer pour le mot déclencheur, et la phrase entendue (« douze pour cent »…) partait comme une question. La transcription complète doit désormais contenir le mot, sinon rien n'est envoyé. Et avec la voix IA en ligne, « Préparer la voix » inclut maintenant les réponses de l'ingénieur (« Reçu, je regarde », « Désolé, j'ai pas compris », « Coach IA injoignable »…) : elles sont dites avec la voix IA plutôt qu'avec Piper.",
              es: "Palabra de activación: el ingeniero ya no responde cuando nadie le habla. Otra voz (radio, juego, alguien en la habitación) podía pasar por la palabra de activación, y la frase oída («doce por ciento»…) se enviaba como pregunta. La transcripción completa debe contener ahora la palabra; si no, no se envía nada. Además, con la voz IA en línea, «Preparar la voz» incluye ahora las respuestas del ingeniero («Recibido, lo miro», «Perdona, no te he entendido», «Coach IA inaccesible»…): se dicen con la voz IA en lugar de Piper.",
              de: "Aktivierungswort: Der Renningenieur antwortet nicht mehr, wenn niemand mit ihm spricht. Eine andere Stimme (Funk, Spiel, jemand im Raum) konnte als Aktivierungswort gelten, und der gehörte Satz („zwölf Prozent“…) wurde als Frage gesendet. Die vollständige Transkription muss jetzt das Wort enthalten, sonst wird nichts gesendet. Außerdem enthält „Stimme vorbereiten“ mit der Online-KI-Stimme jetzt die Antworten des Ingenieurs („Verstanden, ich schaue nach“, „Sorry, nicht verstanden“, „KI-Coach nicht erreichbar“…): Sie werden mit der KI-Stimme statt mit Piper gesprochen.",
              it: "Parola di attivazione: l'ingegnere non risponde più quando nessuno gli parla. Un'altra voce (radio, gioco, qualcuno nella stanza) poteva passare per la parola di attivazione, e la frase sentita («dodici per cento»…) partiva come domanda. Ora la trascrizione completa deve contenere la parola, altrimenti non viene inviato nulla. Inoltre, con la voce IA online, «Prepara la voce» include ora le risposte dell'ingegnere («Ricevuto, controllo», «Scusa, non ho capito», «Coach IA irraggiungibile»…): vengono dette con la voce IA invece che con Piper.",
            },
          },
          {
            text: {
              en: "Engineer's microphone: it no longer closes and reopens every few seconds. While a sentence was being transcribed after the wake word, the listening engine thought the microphone was lost and reopened it, which could cut off what you were saying.",
              fr: "Micro de l'ingénieur : il n'est plus fermé puis rouvert toutes les quelques secondes. Pendant la transcription d'une phrase après le mot déclencheur, le moteur d'écoute croyait le micro perdu et le rouvrait, ce qui pouvait couper ce que tu disais.",
              es: "Micrófono del ingeniero: ya no se cierra y se vuelve a abrir cada pocos segundos. Mientras se transcribía una frase tras la palabra de activación, el motor de escucha creía perdido el micrófono y lo reabría, lo que podía cortar lo que decías.",
              de: "Mikrofon des Renningenieurs: Es wird nicht mehr alle paar Sekunden geschlossen und wieder geöffnet. Während ein Satz nach dem Aktivierungswort transkribiert wurde, hielt die Hörfunktion das Mikrofon für verloren und öffnete es neu, was dich mitten im Satz abschneiden konnte.",
              it: "Microfono dell'ingegnere: non viene più chiuso e riaperto ogni pochi secondi. Durante la trascrizione di una frase dopo la parola di attivazione, il motore di ascolto credeva perso il microfono e lo riapriva, il che poteva interrompere quello che dicevi.",
            },
          },
          {
            text: {
              en: "Talking to the engineer without the AI Coach: a question he cannot answer locally now gets “Sorry, I don't get the question” (with variations) instead of the race status. If the AI Coach is enabled but not ready, he says to check that it is connected. The race status is still available on request (“status”, Status key).",
              fr: "Parler à l'ingénieur sans Coach IA : une question à laquelle il ne sait pas répondre seul reçoit désormais « Désolé, je comprends pas la question » (avec des variantes) au lieu du point de course. Si le Coach IA est activé mais pas prêt, il dit de vérifier qu'il est bien branché. Le point de course reste disponible à la demande (« le point », touche Statut).",
              es: "Hablar con el ingeniero sin Coach IA: una pregunta que no sabe responder solo recibe ahora «Perdona, no entiendo la pregunta» (con variantes) en lugar del resumen de carrera. Si el Coach IA está activado pero no listo, dice que revises que esté conectado. El resumen de carrera sigue disponible a petición («el resumen», tecla Estado).",
              de: "Mit dem Renningenieur sprechen ohne KI-Coach: Auf eine Frage, die er nicht selbst beantworten kann, kommt jetzt „Sorry, die Frage verstehe ich nicht“ (mit Varianten) statt des Rennstands. Ist der KI-Coach aktiviert, aber nicht bereit, sagt er, du sollst die Verbindung prüfen. Der Rennstand bleibt auf Abruf verfügbar („Status“, Status-Taste).",
              it: "Parlare con l'ingegnere senza Coach IA: a una domanda a cui non sa rispondere da solo ora risponde «Scusa, non capisco la domanda» (con varianti) invece della situazione di gara. Se il Coach IA è attivato ma non pronto, dice di controllare che sia collegato. La situazione di gara resta disponibile su richiesta («la situazione», tasto Stato).",
            },
          },
          {
            en: "Online AI voice, \"Prepare the voice\": a slow provider no longer stops the preparation after a while with \"error decoding response body\". Each phrase gets more time, a failed phrase is retried once after 3 s (one request at a time from then on), and the error message now says plainly when the provider is too slow. Clicking again still resumes where it stopped: only the missing phrases are sent, and the progress now shows how many were already ready. When everything is prepared, a green \"Voice ready\" mark replaces the greyed-out button.",
            fr: "Voix IA en ligne, « Préparer la voix » : un fournisseur lent n'arrête plus la préparation au bout d'un moment avec « error decoding response body ». Chaque phrase a plus de temps, une phrase ratée est retentée une fois après 3 s (puis une requête à la fois), et le message d'erreur dit clairement quand le fournisseur est trop lent. Recliquer reprend toujours là où ça s'est arrêté : seules les phrases manquantes sont envoyées, et la progression indique combien étaient déjà prêtes. Quand tout est préparé, un repère vert « Voix prête » remplace le bouton grisé.",
            es: "Voz IA en línea, «Preparar la voz»: un proveedor lento ya no detiene la preparación al cabo de un rato con «error decoding response body». Cada frase tiene más tiempo, una frase fallida se reintenta una vez tras 3 s (y luego una petición a la vez), y el mensaje de error dice claramente cuando el proveedor es demasiado lento. Volver a hacer clic sigue retomando donde se detuvo: solo se envían las frases que faltan, y el progreso indica cuántas ya estaban listas. Cuando todo está preparado, una marca verde «Voz lista» sustituye al botón en gris.",
            de: "Online-KI-Stimme, „Stimme vorbereiten“: Ein langsamer Anbieter bricht die Vorbereitung nicht mehr nach einer Weile mit „error decoding response body“ ab. Jeder Satz hat mehr Zeit, ein fehlgeschlagener Satz wird nach 3 s einmal wiederholt (danach eine Anfrage nach der anderen), und die Fehlermeldung sagt klar, wenn der Anbieter zu langsam ist. Ein erneuter Klick setzt weiterhin dort fort, wo es aufgehört hat: Nur fehlende Sätze werden gesendet, und der Fortschritt zeigt, wie viele schon fertig waren. Ist alles vorbereitet, ersetzt ein grünes „Stimme bereit“ die graue Schaltfläche.",
            it: "Voce IA online, «Prepara la voce»: un fornitore lento non interrompe più la preparazione dopo un po' con «error decoding response body». Ogni frase ha più tempo, una frase non riuscita viene ritentata una volta dopo 3 s (poi una richiesta alla volta) e il messaggio d'errore dice chiaramente quando il fornitore è troppo lento. Un nuovo clic riprende sempre da dove si era fermata: vengono inviate solo le frasi mancanti e l'avanzamento indica quante erano già pronte. Quando tutto è preparato, un segno verde «Voce pronta» sostituisce il pulsante grigio.",
          },
          {
            en: "Online AI voice: the AI Coach's \"Test the AI\" button and the race status asked with the spotter's Status key are now read with the AI voice when it is on (local voice as a fallback), like the answers to your questions.",
            fr: "Voix IA en ligne : le bouton « Tester l'IA » du Coach IA et le point de course demandé avec la touche Statut du spotter sont désormais lus avec la voix IA quand elle est activée (voix locale en secours), comme les réponses à tes questions.",
            es: "Voz IA en línea: el botón «Probar la IA» del Coach IA y el resumen de carrera pedido con la tecla Estado del spotter se leen ahora con la voz IA cuando está activada (voz local como respaldo), como las respuestas a tus preguntas.",
            de: "Online-KI-Stimme: Die Schaltfläche „KI testen“ des KI-Coachs und der mit der Status-Taste des Spotters abgefragte Rennstand werden jetzt mit der KI-Stimme vorgelesen, wenn sie aktiv ist (lokale Stimme als Ersatz), wie die Antworten auf deine Fragen.",
            it: "Voce IA online: il pulsante «Prova l'IA» del Coach IA e il punto gara chiesto con il tasto Stato dello spotter ora vengono letti con la voce IA quando è attiva (voce locale come riserva), come le risposte alle tue domande.",
          },
          {
            en: "Online AI voice: the chosen voice is now shown in the voice field (typing still searches the list). In the listening bench, \"Prepare the voice\" moves to the top and the AI button is greyed out until the phrase is prepared, instead of an unclear error. The engineer's longer fixed phrases (such as the question about lap times) can now be prepared too.",
            fr: "Voix IA en ligne : la voix choisie s'affiche dans le champ de la voix (taper lance toujours la recherche). Dans le banc d'écoute, « Préparer la voix » passe en haut et le bouton IA reste grisé tant que la phrase n'est pas préparée, au lieu d'une erreur peu claire. Les phrases fixes plus longues de l'ingénieur (comme la question sur les chronos) se préparent aussi.",
            es: "Voz IA en línea: la voz elegida aparece ahora en el campo de la voz (escribir sigue buscando en la lista). En el banco de escucha, «Preparar la voz» pasa arriba y el botón IA queda en gris hasta que la frase está preparada, en lugar de un error poco claro. Las frases fijas más largas del ingeniero (como la pregunta sobre los tiempos) también se pueden preparar.",
            de: "Online-KI-Stimme: Die gewählte Stimme wird jetzt im Stimmfeld angezeigt (Tippen sucht weiterhin in der Liste). Im Hörtest steht „Stimme vorbereiten“ jetzt oben, und die KI-Schaltfläche bleibt grau, bis der Satz vorbereitet ist, statt einer unklaren Fehlermeldung. Längere feste Sätze des Renningenieurs (etwa die Frage zu den Rundenzeiten) lassen sich jetzt ebenfalls vorbereiten.",
            it: "Voce IA online: la voce scelta ora compare nel campo della voce (digitare continua a cercare nell'elenco). Nel banco d'ascolto, «Prepara la voce» passa in alto e il pulsante IA resta grigio finché la frase non è preparata, invece di un errore poco chiaro. Anche le frasi fisse più lunghe dell'ingegnere (come la domanda sui tempi) si possono preparare.",
          },
          {
            text: {
              en: "Online AI voice: no announcement said twice any more. A phrase that came back while it was still being generated is no longer said a second time, an urgent alert no longer waits for an online request in progress (the interrupted announcement follows once, without \"I repeat\" and without being paid twice), an acknowledgement right after a question is no longer held back, and the local voice \"Test\" button always plays the local voice.",
              fr: "Voix IA en ligne : plus d'annonce dite en double. Une phrase revenue pendant qu'elle était encore en cours de génération n'est plus redite, une alerte urgente n'attend plus la fin d'une requête en ligne en cours (l'annonce devancée suit une fois, sans « Je répète » et sans être payée deux fois), un accusé de réception juste après une question n'est plus retenu, et le bouton « Tester » de la voix locale fait toujours entendre la voix locale.",
              es: "Voz IA en línea: ningún aviso se dice dos veces. Una frase que vuelve mientras aún se está generando ya no se repite, una alerta urgente ya no espera a que termine una petición en línea en curso (el aviso adelantado sigue una vez, sin «Repito» y sin pagarse dos veces), un acuse de recibo justo después de una pregunta ya no se retiene, y el botón «Probar» de la voz local siempre reproduce la voz local.",
              de: "Online-KI-Stimme: keine Ansage mehr doppelt. Ein Satz, der zurückkommt, während er noch erzeugt wird, wird nicht mehr zweimal gesagt, eine dringende Warnung wartet nicht mehr auf eine laufende Online-Anfrage (die überholte Ansage folgt einmal, ohne „Ich wiederhole“ und ohne doppelt bezahlt zu werden), eine Bestätigung direkt nach einer Frage wird nicht mehr zurückgehalten, und die Schaltfläche „Testen“ der lokalen Stimme spielt immer die lokale Stimme.",
              it: "Voce IA online: nessun annuncio detto due volte. Una frase tornata mentre era ancora in generazione non viene più ripetuta, un avviso urgente non aspetta più la fine di una richiesta online in corso (l'annuncio superato segue una volta, senza «Ripeto» e senza essere pagato due volte), una conferma subito dopo una domanda non viene più trattenuta, e il pulsante «Prova» della voce locale fa sempre sentire la voce locale.",
            },
          },
          {
            text: {
              en: "Voice: \"brake temperature\" (or \"are my brakes hot?\") is now answered — front and rear temperature with a verdict (cold, in the window, too hot) based on the car's disc material.",
              fr: "Voix : « température des freins » (ou « mes freins sont chauds ? ») a désormais une réponse — température avant et arrière avec un verdict (froids, dans la fenêtre, trop chauds) selon le matériau des disques de la voiture.",
              es: "Voz: «temperatura de frenos» (o «¿frenos calientes?») ya tiene respuesta: temperatura delantera y trasera con un veredicto (fríos, en la ventana, demasiado calientes) según el material de los discos del coche.",
              de: "Sprache: „Bremstemperatur“ (oder „Bremsen heiß?“) wird jetzt beantwortet — Temperatur vorne und hinten mit Urteil (kalt, im Fenster, zu heiß) je nach Scheibenmaterial des Autos.",
              it: "Voce: «temperatura dei freni» (o «freni caldi?») ora ha una risposta — temperatura anteriore e posteriore con un verdetto (freddi, nella finestra, troppo caldi) in base al materiale dei dischi della vettura.",
            },
          },
          {
            en: "Game data: the app no longer queries the game's screens (car condition, pit menu, setup ranges) while you are in the garage, paused or back in the menus. Le Mans Ultimate can crash when asked for them there; they are read again as soon as you drive. In the garage, the setup ranges the AI Coach needs and the brake pad condition are read once, only when you ask (setup question, \"pads?\"). The game's track map is still read in the garage, but no longer while paused or in the menus. Setting \"Query the game off track\" (Config → Maintenance) restores the previous behaviour.",
            fr: "Données du jeu : l'app n'interroge plus les écrans du jeu (état de la voiture, menu des stands, bornes du setup) quand tu es au garage, en pause ou revenu aux menus. Le Mans Ultimate peut planter quand on les lui demande à ce moment-là ; ils sont relus dès que tu roules. Au garage, les bornes du setup utiles au Coach IA et l'état des plaquettes sont lus une seule fois, seulement quand tu poses la question (réglage, « plaquettes ? »). Le tracé du circuit fourni par le jeu reste lu au garage, mais plus en pause ni aux menus. Le réglage « Interroger le jeu hors piste » (Config → Maintenance) rétablit l'ancien comportement.",
            es: "Datos del juego: la app ya no consulta las pantallas del juego (estado del coche, menú de boxes, rangos del setup) cuando estás en el garaje, en pausa o de vuelta en los menús. Le Mans Ultimate puede cerrarse si se le piden en ese momento; se vuelven a leer en cuanto conduces. En el garaje, los rangos del setup que necesita el Coach IA y el estado de las pastillas se leen una sola vez, solo cuando lo preguntas (reglaje, «¿pastillas?»). El trazado del circuito que da el juego se sigue leyendo en el garaje, pero ya no en pausa ni en los menús. El ajuste «Consultar el juego fuera de pista» (Config → Mantenimiento) restablece el comportamiento anterior.",
            de: "Spieldaten: Die App fragt die Bildschirme des Spiels (Fahrzeugzustand, Boxenmenü, Setup-Bereiche) nicht mehr ab, wenn du in der Garage bist, pausierst oder wieder in den Menüs bist. Le Mans Ultimate kann abstürzen, wenn sie dort abgefragt werden; sobald du fährst, werden sie wieder gelesen. In der Garage werden die Setup-Bereiche für den KI-Coach und der Zustand der Bremsbeläge nur einmal gelesen, und zwar nur, wenn du danach fragst (Setup-Frage, „Beläge?“). Der Streckenplan des Spiels wird in der Garage weiterhin gelesen, aber nicht mehr in der Pause oder in den Menüs. Die Einstellung „Spiel auch abseits der Strecke abfragen“ (Einstellungen → Wartung) stellt das bisherige Verhalten wieder her.",
            it: "Dati del gioco: l'app non interroga più le schermate del gioco (stato dell'auto, menu dei box, intervalli del setup) quando sei in garage, in pausa o tornato ai menu. Le Mans Ultimate può chiudersi se gli vengono chiesti in quel momento; vengono riletti appena guidi. In garage, gli intervalli del setup utili al Coach IA e lo stato delle pastiglie vengono letti una sola volta, solo quando lo chiedi (assetto, «pastiglie?»). Il tracciato del circuito fornito dal gioco viene ancora letto in garage, ma non più in pausa né nei menu. L'impostazione «Interroga il gioco fuori pista» (Config → Manutenzione) ripristina il comportamento precedente.",
          },
          {
            en: "Sector yellow flags: the Flags overlay and the driving coach no longer show a local yellow in sectors all the time. In Le Mans Ultimate this game data doesn't reliably indicate local yellows (two sectors \"yellow\" in a practice session with no incident), so per-sector yellows are switched off until a reliable source is found; laps are no longer all wrongly excluded as \"under yellow\". Full-course yellows are unaffected.",
            fr: "Drapeaux jaunes par secteur : l'overlay Drapeaux et le coach de pilotage n'affichent plus un jaune local dans les secteurs en permanence. Dans Le Mans Ultimate, cette donnée du jeu n'indique pas les jaunes locaux de façon fiable (deux secteurs « jaunes » en essais sans aucun incident) : les jaunes par secteur sont désactivés en attendant une source fiable, et les tours ne sont plus tous écartés à tort comme « sous jaune ». Les FCY (jaune général) ne changent pas.",
            es: "Banderas amarillas por sector: el overlay de Banderas y el coach de pilotaje ya no muestran un amarillo local en los sectores todo el tiempo. En Le Mans Ultimate este dato del juego no indica los amarillos locales de forma fiable (dos sectores «amarillos» en libres sin ningún incidente): los amarillos por sector se desactivan hasta encontrar una fuente fiable, y las vueltas ya no se descartan todas por error como «bajo amarillo». Los FCY no cambian.",
            de: "Gelbe Flaggen pro Sektor: Das Flaggen-Overlay und der Fahrcoach zeigen nicht mehr ständig lokales Gelb in den Sektoren. In Le Mans Ultimate zeigt dieser Spielwert lokale Gelbphasen nicht zuverlässig an (zwei Sektoren „gelb“ im Training ohne jeden Zwischenfall): Gelb pro Sektor ist deaktiviert, bis eine verlässliche Quelle gefunden ist, und Runden werden nicht mehr alle fälschlich als „unter Gelb“ verworfen. FCY bleiben unverändert.",
            it: "Bandiere gialle per settore: l'overlay Bandiere e il coach di guida non mostrano più un giallo locale nei settori in permanenza. In Le Mans Ultimate questo dato del gioco non indica i gialli locali in modo affidabile (due settori «gialli» in prova senza alcun incidente): i gialli per settore sono disattivati in attesa di una fonte affidabile, e i giri non vengono più tutti scartati per errore come «sotto giallo». Le FCY non cambiano.",
          },
          {
            en: "Damage call-outs no longer loop when the car sits damaged on the verge (\"heavy damage\", suspension, puncture, wheel off…): each one is said once and only comes back after the car is really back to normal, at most once a minute. Aero damage is capped at 100 % (the game can report more after a big crash).",
            fr: "Les annonces de dégâts ne tournent plus en boucle quand la voiture reste abîmée sur le bas-côté (« dégâts importants », suspension, crevaison, roue arrachée…) : chacune est dite une fois et ne revient qu'après un vrai retour à la normale, au plus une fois par minute. Les dégâts aéro sont plafonnés à 100 % (le jeu peut annoncer plus après un gros choc).",
            es: "Los avisos de daños ya no se repiten en bucle cuando el coche queda dañado en el arcén («daños importantes», suspensión, pinchazo, rueda arrancada…): cada uno se dice una vez y solo vuelve tras un verdadero regreso a la normalidad, como mucho una vez por minuto. Los daños aerodinámicos se limitan al 100 % (el juego puede indicar más tras un fuerte golpe).",
            de: "Schadensmeldungen laufen nicht mehr in Schleife, wenn das Auto beschädigt am Streckenrand steht („schwere Schäden“, Aufhängung, Reifenschaden, Rad ab…): Jede wird einmal gesagt und kommt erst nach echter Rückkehr zum Normalzustand wieder, höchstens einmal pro Minute. Aero-Schäden sind auf 100 % begrenzt (das Spiel kann nach einem schweren Unfall mehr melden).",
            it: "Gli avvisi di danni non si ripetono più in loop quando l'auto resta danneggiata a bordo pista («danni importanti», sospensione, foratura, ruota staccata…): ognuno viene detto una volta e torna solo dopo un vero ritorno alla normalità, al massimo una volta al minuto. I danni aerodinamici sono limitati al 100 % (il gioco può indicare di più dopo un forte urto).",
          },
          {
            text: {
              en: "Overlay track map: a partial outline could stay frozen for good (the map froze as soon as two frames had the same number of points); it now freezes only once the lap is complete. Gaps in an incomplete outline are no longer joined by straight lines across the infield.",
              fr: "Carte de l'overlay : un tracé partiel pouvait rester figé pour de bon (la carte se figeait dès que deux trames avaient le même nombre de points) ; elle ne se fige plus qu'une fois le tour complet. Les trous d'un tracé incomplet ne sont plus reliés par des lignes droites à travers l'intérieur du circuit.",
              es: "Mapa del overlay: un trazado parcial podía quedarse congelado para siempre (el mapa se congelaba en cuanto dos fotogramas tenían el mismo número de puntos); ahora solo se congela cuando la vuelta está completa. Los huecos de un trazado incompleto ya no se unen con líneas rectas a través del interior del circuito.",
              de: "Overlay-Streckenkarte: Ein unvollständiger Verlauf konnte dauerhaft eingefroren bleiben (die Karte fror ein, sobald zwei Frames gleich viele Punkte hatten); jetzt friert sie erst ein, wenn die Runde vollständig ist. Lücken in einem unvollständigen Verlauf werden nicht mehr durch gerade Linien quer durchs Infield verbunden.",
              it: "Mappa dell'overlay: un tracciato parziale poteva restare bloccato per sempre (la mappa si bloccava appena due fotogrammi avevano lo stesso numero di punti); ora si blocca solo quando il giro è completo. I buchi di un tracciato incompleto non sono più collegati da linee rette attraverso l'interno del circuito.",
            },
          },
          {
            text: {
              en: "Brake temperatures were shown 273 °C too high (the game sends them in Kelvin): the Live page, the tyre overlay, the AI coach and the brake overheating callout now use the real temperature. This is why the overheating alert went off at almost every braking point.",
              fr: "Les températures de freins étaient affichées 273 °C trop haut (le jeu les envoie en Kelvin) : la page Live, l'overlay pneus, le coach IA et l'alerte de surchauffe des freins utilisent désormais la vraie température. C'est ce qui faisait sonner l'alerte de surchauffe à presque chaque freinage.",
              es: "Las temperaturas de frenos se mostraban 273 °C demasiado altas (el juego las envía en Kelvin): la página Live, el overlay de neumáticos, el coach IA y el aviso de sobrecalentamiento usan ahora la temperatura real. Por eso el aviso saltaba en casi cada frenada.",
              de: "Bremstemperaturen wurden 273 °C zu hoch angezeigt (das Spiel liefert sie in Kelvin): Live-Seite, Reifen-Overlay, KI-Coach und die Überhitzungsansage nutzen jetzt die echte Temperatur. Deshalb kam die Überhitzungswarnung fast bei jedem Bremsen.",
              it: "Le temperature dei freni erano mostrate 273 °C troppo alte (il gioco le invia in Kelvin): la pagina Live, l'overlay gomme, il coach IA e l'avviso di surriscaldamento usano ora la temperatura reale. Ecco perché l'avviso scattava quasi a ogni frenata.",
            },
          },
          {
            text: {
              en: "AI coach: a sector time the game doesn't report (lap incomplete, invalidated, or car back in the garage) is no longer sent as \"0.000\", and tyre temperatures of a car in the garage are no longer sent as −273 °C — the coach used to read them as a lost sector or a sensor fault. The coach is also told when the car is in the pits.",
              fr: "Coach IA : un temps de secteur non fourni par le jeu (tour incomplet, invalidé ou voiture rentrée au garage) n'est plus transmis comme « 0.000 », et les températures pneus d'une voiture au garage ne sont plus transmises à −273 °C — le coach y voyait un secteur perdu ou un capteur en panne. Le coach sait aussi quand la voiture est aux stands.",
              es: "Coach IA: un tiempo de sector que el juego no proporciona (vuelta incompleta, invalidada o coche de vuelta en el garaje) ya no se envía como «0.000», y las temperaturas de neumáticos de un coche en el garaje ya no se envían a −273 °C — el coach lo interpretaba como un sector perdido o un sensor averiado. El coach también sabe cuándo el coche está en boxes.",
              de: "KI-Coach: Eine Sektorzeit, die das Spiel nicht liefert (Runde unvollständig, ungültig oder Auto zurück in der Garage), wird nicht mehr als „0.000“ gesendet, und Reifentemperaturen eines Autos in der Garage nicht mehr als −273 °C — der Coach deutete das als verlorenen Sektor oder defekten Sensor. Der Coach weiß jetzt auch, wann das Auto an der Box steht.",
              it: "Coach IA: un tempo di settore non fornito dal gioco (giro incompleto, invalidato o auto rientrata ai box) non viene più inviato come «0.000», e le temperature gomme di un'auto ai box non vengono più inviate a −273 °C — il coach li interpretava come un settore perso o un sensore guasto. Il coach sa anche quando l'auto è ai box.",
            },
          },
          {
            text: {
              en: "AI coach: the internal reasoning of \"thinking\" models (Gemini/Gemma thought parts, <think> blocks of DeepSeek R1, Qwen, local models…) is no longer shown in the answer.",
              fr: "Coach IA : le raisonnement interne des modèles « thinking » (parties de réflexion Gemini/Gemma, blocs <think> de DeepSeek R1, Qwen, modèles locaux…) n'apparaît plus dans la réponse.",
              es: "Coach IA: el razonamiento interno de los modelos «thinking» (partes de reflexión de Gemini/Gemma, bloques <think> de DeepSeek R1, Qwen, modelos locales…) ya no aparece en la respuesta.",
              de: "KI-Coach: Das interne Nachdenken von „Thinking“-Modellen (Gedanken-Teile von Gemini/Gemma, <think>-Blöcke von DeepSeek R1, Qwen, lokalen Modellen…) erscheint nicht mehr in der Antwort.",
              it: "Coach IA: il ragionamento interno dei modelli «thinking» (parti di riflessione di Gemini/Gemma, blocchi <think> di DeepSeek R1, Qwen, modelli locali…) non compare più nella risposta.",
            },
          },
        ],
      },
    ],
  },
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
