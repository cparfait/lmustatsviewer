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
            },
          },
          {
            featured: true,
            text: {
              en: "Purging empty sessions can no longer wipe your whole history. If the player name in Config did not exactly match the name in the result files (renamed in-game, a stray space, settings reset), the “player” purge treated every file as empty and deleted them all from disk. The purge is now refused, with an explanation, whenever no session is recognised as yours, and files are only deleted once the database change has been safely committed.",
              fr: "La purge des sessions vides ne peut plus effacer tout votre historique. Si le nom de joueur de la Config ne correspondait pas exactement au nom présent dans les fichiers de résultats (pseudo changé en jeu, espace en trop, configuration réinitialisée), la purge « joueur » considérait tous les fichiers comme vides et les supprimait du disque. La purge est désormais refusée, avec une explication, dès qu'aucune session n'est reconnue comme la vôtre, et les fichiers ne sont supprimés qu'une fois la base mise à jour sans erreur.",
              es: "La purga de sesiones vacías ya no puede borrar todo tu historial. Si el nombre de jugador de la Configuración no coincidía exactamente con el de los archivos de resultados (alias cambiado en el juego, un espacio de más, configuración reiniciada), la purga «jugador» consideraba vacíos todos los archivos y los borraba del disco. Ahora la purga se rechaza, con una explicación, en cuanto ninguna sesión se reconoce como tuya, y los archivos solo se borran tras guardar los cambios en la base de datos.",
              de: "Das Bereinigen leerer Sitzungen kann nicht mehr den gesamten Verlauf löschen. Stimmte der Spielername in der Konfiguration nicht exakt mit dem Namen in den Ergebnisdateien überein (im Spiel geändert, ein zusätzliches Leerzeichen, zurückgesetzte Einstellungen), hielt die „Spieler“-Bereinigung alle Dateien für leer und löschte sie von der Festplatte. Die Bereinigung wird jetzt mit einer Erklärung abgelehnt, sobald keine Sitzung als deine erkannt wird, und Dateien werden erst nach erfolgreichem Speichern in der Datenbank entfernt.",
            },
          },
          {
            featured: true,
            text: {
              en: "Your car setups are protected against corruption. Saving a setup or a note now writes to a temporary file first and keeps a .bak copy, so a crash or an antivirus can no longer leave a truncated .svm the game refuses to load. Edits also start from the file on disk instead of the last scan, so changes you made in-game are no longer silently overwritten. Creating or duplicating a setup never overwrites an existing one, and setup names can no longer write outside the game folder.",
              fr: "Vos setups sont protégés contre la corruption. L'enregistrement d'un setup ou d'une note passe maintenant par un fichier temporaire et conserve une copie .bak : un plantage ou un antivirus ne peut plus laisser un .svm tronqué que le jeu refuse de charger. Les modifications repartent du fichier réel et non du dernier scan, si bien que les réglages faits dans le jeu ne sont plus écrasés en silence. Créer ou dupliquer un setup n'écrase jamais un fichier existant, et un nom de setup ne peut plus écrire hors du dossier du jeu.",
              es: "Tus setups están protegidos contra la corrupción. Guardar un setup o una nota pasa ahora por un archivo temporal y conserva una copia .bak: un cierre inesperado o un antivirus ya no puede dejar un .svm truncado que el juego rechace. Las ediciones parten del archivo real y no del último escaneo, así que los ajustes hechos en el juego ya no se sobrescriben en silencio. Crear o duplicar un setup nunca sobrescribe uno existente, y un nombre de setup ya no puede escribir fuera de la carpeta del juego.",
              de: "Deine Setups sind vor Beschädigung geschützt. Ein Setup oder eine Notiz zu speichern läuft jetzt über eine temporäre Datei und behält eine .bak-Kopie: Ein Absturz oder ein Virenscanner kann keine abgeschnittene .svm mehr hinterlassen, die das Spiel nicht lädt. Änderungen gehen von der echten Datei aus statt vom letzten Scan, sodass im Spiel gemachte Einstellungen nicht mehr stillschweigend überschrieben werden. Anlegen oder Duplizieren überschreibt nie ein vorhandenes Setup, und ein Setup-Name kann nicht mehr außerhalb des Spielordners schreiben.",
            },
          },
          {
            en: "Exporting a setup now asks where to save it. The file used to be written to the application's working folder under the setup name, where it was impossible to find — or failed outright for lack of permissions.",
            fr: "L'export d'un setup demande maintenant où l'enregistrer. Le fichier était auparavant écrit dans le dossier de travail de l'application sous le nom du setup, où il était introuvable — quand il n'échouait pas faute de droits.",
            es: "Exportar un setup ahora pregunta dónde guardarlo. Antes el archivo se escribía en la carpeta de trabajo de la aplicación con el nombre del setup, donde era imposible de encontrar, o fallaba por falta de permisos.",
            de: "Der Setup-Export fragt jetzt nach dem Speicherort. Zuvor wurde die Datei unter dem Setup-Namen in den Arbeitsordner der Anwendung geschrieben, wo sie nicht auffindbar war — oder mangels Rechten scheiterte.",
          },
          {
            featured: true,
            text: {
              en: "A long AI analysis is no longer cut off after one minute. The request had a sixty second budget covering the whole answer, so a detailed analysis on a reasoning model was interrupted mid-sentence and everything already received was thrown away, leaving only a network error. The time limit now applies to silence between packets, not to the total length, and any text already received is kept and flagged as incomplete.",
              fr: "Une longue analyse IA n'est plus coupée au bout d'une minute. La requête disposait de soixante secondes pour l'ensemble de la réponse : une analyse détaillée sur un modèle de raisonnement était donc interrompue en pleine phrase, et tout ce qui était déjà reçu était jeté, ne laissant qu'une erreur réseau. Le délai porte désormais sur le silence entre deux paquets, pas sur la durée totale, et le texte déjà reçu est conservé et signalé comme incomplet.",
              es: "Un análisis largo de la IA ya no se corta al cabo de un minuto. La petición disponía de sesenta segundos para toda la respuesta: un análisis detallado en un modelo de razonamiento se interrumpía a media frase y todo lo ya recibido se descartaba, dejando solo un error de red. Ahora el límite se aplica al silencio entre paquetes, no a la duración total, y el texto ya recibido se conserva y se marca como incompleto.",
              de: "Eine lange KI-Analyse wird nicht mehr nach einer Minute abgeschnitten. Die Anfrage hatte sechzig Sekunden für die gesamte Antwort: Eine ausführliche Analyse auf einem Reasoning-Modell wurde mitten im Satz unterbrochen und alles bereits Empfangene verworfen, übrig blieb nur ein Netzwerkfehler. Die Frist gilt jetzt für die Stille zwischen zwei Paketen, nicht für die Gesamtdauer, und bereits empfangener Text bleibt erhalten und wird als unvollständig gekennzeichnet.",
            },
          },
          {
            en: "Accented characters no longer turn into garbage in AI answers. Network packets regularly split a character in two, and each packet was decoded on its own, so letters like é or à became a replacement symbol in the middle of a sentence. Text is now decoded one complete line at a time.",
            fr: "Les caractères accentués ne se transforment plus en symboles parasites dans les réponses de l'IA. Les paquets réseau coupent régulièrement un caractère en deux, et chaque paquet était décodé isolément : un é ou un à devenait donc un symbole de remplacement au milieu d'une phrase. Le texte est maintenant décodé ligne complète par ligne complète.",
            es: "Los caracteres acentuados ya no se convierten en símbolos extraños en las respuestas de la IA. Los paquetes de red cortan a menudo un carácter en dos, y cada paquete se decodificaba por separado: una é o una à se convertía en un símbolo de reemplazo en mitad de una frase. Ahora el texto se decodifica línea completa a línea completa.",
            de: "Akzentzeichen werden in KI-Antworten nicht mehr zu Störzeichen. Netzwerkpakete zerteilen regelmäßig ein Zeichen, und jedes Paket wurde einzeln dekodiert: Ein é oder à wurde so mitten im Satz zu einem Ersatzzeichen. Text wird jetzt vollständige Zeile für vollständige Zeile dekodiert.",
          },
          {
            en: "Errors reported by the AI provider mid-answer are now shown. An overload, a quota limit or a safety filter could arrive inside the stream while the request itself reported success. The answer simply came back empty or truncated with no explanation at all.",
            fr: "Les erreurs signalées par le fournisseur d'IA en cours de réponse sont maintenant affichées. Une surcharge, une limite de quota ou un filtre de sécurité pouvaient arriver à l'intérieur du flux alors que la requête elle-même annonçait un succès. La réponse revenait alors vide ou tronquée, sans la moindre explication.",
            es: "Los errores que el proveedor de IA notifica durante la respuesta ahora se muestran. Una sobrecarga, un límite de cuota o un filtro de seguridad podían llegar dentro del flujo mientras la petición se declaraba correcta. La respuesta volvía vacía o truncada, sin explicación alguna.",
            de: "Fehler, die der KI-Anbieter mitten in der Antwort meldet, werden jetzt angezeigt. Überlastung, Kontingentgrenze oder ein Sicherheitsfilter konnten im Datenstrom auftreten, während die Anfrage selbst Erfolg meldete. Die Antwort kam dann leer oder abgeschnitten zurück, ganz ohne Erklärung.",
          },
          {
            en: "Claude answers no longer come back empty on short questions. The reasoning tokens count against the output budget, and the voice coach budget was small enough for the model to spend all of it thinking. Worse, the resulting empty answer stayed in the conversation and made every following question fail.",
            fr: "Les réponses de Claude ne reviennent plus vides sur les questions courtes. Les tokens de raisonnement sont décomptés du budget de sortie, et celui du coach vocal était assez petit pour que le modèle le dépense entièrement à réfléchir. Pire, la réponse vide obtenue restait dans la conversation et faisait échouer toutes les questions suivantes.",
            es: "Las respuestas de Claude ya no vuelven vacías en preguntas cortas. Los tokens de razonamiento se descuentan del presupuesto de salida, y el del coach de voz era lo bastante pequeño como para que el modelo lo gastara entero pensando. Peor aún, la respuesta vacía se quedaba en la conversación y hacía fallar todas las preguntas siguientes.",
            de: "Claude-Antworten kommen bei kurzen Fragen nicht mehr leer zurück. Die Reasoning-Tokens werden vom Ausgabebudget abgezogen, und das des Sprach-Coaches war klein genug, dass das Modell es komplett fürs Denken verbrauchte. Schlimmer noch: Die leere Antwort blieb im Gespräch und ließ jede weitere Frage scheitern.",
          },
          {
            en: "Your Google API key can no longer leak into an error message. It travelled as part of the web address, and network errors include that address, so it appeared on screen and in any screenshot sent to report a bug. It is now sent as a private header, and addresses are stripped from error messages.",
            fr: "Votre clé d'API Google ne peut plus fuiter dans un message d'erreur. Elle voyageait dans l'adresse web, et les erreurs réseau reprennent cette adresse : elle s'affichait donc à l'écran, et dans toute capture envoyée pour signaler un bug. Elle est désormais transmise dans un en-tête privé, et les adresses sont retirées des messages d'erreur.",
            es: "Tu clave de API de Google ya no puede filtrarse en un mensaje de error. Viajaba dentro de la dirección web, y los errores de red incluyen esa dirección: aparecía en pantalla y en cualquier captura enviada para reportar un fallo. Ahora se envía en una cabecera privada y las direcciones se eliminan de los mensajes de error.",
            de: "Dein Google-API-Schlüssel kann nicht mehr in eine Fehlermeldung gelangen. Er reiste in der Webadresse mit, und Netzwerkfehler enthalten diese Adresse: Er erschien auf dem Bildschirm und in jedem Screenshot, der zur Fehlermeldung verschickt wurde. Er wird jetzt in einem privaten Header übertragen, und Adressen werden aus Fehlermeldungen entfernt.",
          },
          {
            featured: true,
            text: {
              en: "Wheelspin and lockup are now measured, not guessed. Both verdicts used to be inferred from longitudinal acceleration: “full throttle with little acceleration” means wheelspin, which is also the normal state of a Hypercar through a fast corner and on every upshift. The coach now reads the actual slip of each wheel, so it calls wheelspin when a driven wheel really spins, and a lockup when a wheel really stops turning.",
              fr: "Le patinage et le blocage sont maintenant mesurés, plus devinés. Les deux verdicts étaient déduits de l'accélération longitudinale : « plein gaz avec peu d'accélération » signifiait patinage, ce qui est aussi l'état normal d'une Hypercar en virage rapide et à chaque passage de rapport. Le coach lit désormais le glissement réel de chaque roue. Il annonce donc un patinage quand une roue motrice patine vraiment, et un blocage quand une roue cesse vraiment de tourner.",
              es: "El patinaje y el bloqueo ahora se miden, no se deducen. Ambos veredictos se inferían de la aceleración longitudinal: «a fondo con poca aceleración» significaba patinaje, que es también el estado normal de un Hypercar en curva rápida y en cada cambio de marcha. El coach lee ahora el deslizamiento real de cada rueda. Así avisa de patinaje cuando una rueda motriz patina de verdad, y de bloqueo cuando una rueda deja realmente de girar.",
              de: "Durchdrehen und Blockieren werden jetzt gemessen statt geschätzt. Beide Urteile wurden aus der Längsbeschleunigung abgeleitet: „Vollgas bei wenig Beschleunigung“ hieß Durchdrehen, was auch der Normalzustand eines Hypercars in schnellen Kurven und bei jedem Hochschalten ist. Der Coach liest nun den tatsächlichen Schlupf jedes Rades. Er meldet Durchdrehen, wenn ein Antriebsrad wirklich durchdreht, und Blockieren, wenn ein Rad wirklich stehen bleibt.",
            },
          },
          {
            featured: true,
            text: {
              en: "“Lift and coast” no longer fires all race long. The advice compared your fuel against what is needed to reach the end of the session. In any race with a mandatory pit stop that is impossible from lap one, so the coach kept telling you to save fuel for hours while the plan was simply to refuel. It now only speaks when the shortfall is small enough to actually be recovered by lifting.",
              fr: "Le conseil « lève et laisse rouler » ne tombe plus toute la course. Il comparait votre carburant à ce qu'il faut pour rejoindre la fin de la session. Dans toute course à ravitaillement obligatoire, c'est impossible dès le premier tour : le coach vous demandait donc d'économiser pendant des heures alors que le plan était simplement de refaire le plein. Il ne parle désormais que si le manque est assez faible pour être réellement comblé en levant le pied.",
              es: "El consejo de «levantar y rodar» ya no salta durante toda la carrera. Comparaba tu combustible con el necesario para llegar al final de la sesión. En cualquier carrera con parada obligatoria eso es imposible desde la primera vuelta, así que el coach te pedía ahorrar durante horas cuando el plan era simplemente repostar. Ahora solo habla si la falta es lo bastante pequeña como para compensarse levantando el pie.",
              de: "Der Hinweis „Lift and Coast“ kommt nicht mehr das ganze Rennen über. Er verglich deinen Kraftstoff mit dem Bedarf bis zum Sitzungsende. In jedem Rennen mit Pflichtstopp ist das ab der ersten Runde unmöglich, also forderte der Coach stundenlang zum Sparen auf, obwohl schlicht ein Tankstopp geplant war. Er meldet sich jetzt nur, wenn der Fehlbetrag klein genug ist, um durch Lupfen wirklich aufgeholt zu werden.",
            },
          },
          {
            en: "Tyre fade detection is far less trigger-happy. It judged fade from two passes only, with a threshold at the level of normal lap-to-lap noise, and it counted laps spent behind a slower car. It also used your two out-laps on cold tyres as the reference, which hid real degradation. It now ignores the warm-up laps, skips passes made in traffic, and needs a longer run of clean laps.",
            fr: "La détection d'usure des pneus se déclenche beaucoup moins à tort. Elle jugeait sur deux passages seulement, avec un seuil au niveau du bruit normal d'un tour à l'autre, et comptait les tours passés derrière une voiture plus lente. Elle prenait aussi vos deux tours de sortie sur pneus froids comme référence, ce qui masquait les vraies dégradations. Elle ignore désormais les tours de chauffe, écarte les passages dans le trafic et exige une série de tours propres plus longue.",
            es: "La detección de degradación de neumáticos salta mucho menos por error. Juzgaba con solo dos pasadas, con un umbral al nivel del ruido normal entre vueltas, y contaba las vueltas detrás de un coche más lento. También tomaba tus dos vueltas de salida con neumáticos fríos como referencia, lo que ocultaba las degradaciones reales. Ahora ignora las vueltas de calentamiento, descarta las pasadas en tráfico y exige una serie más larga de vueltas limpias.",
            de: "Die Reifenabbau-Erkennung schlägt deutlich seltener fälschlich an. Sie urteilte über nur zwei Durchfahrten, mit einer Schwelle auf dem Niveau des normalen Rundenrauschens, und zählte Runden hinter einem langsameren Auto mit. Sie nahm zudem deine beiden Auslaufrunden auf kalten Reifen als Referenz, was echten Abbau verdeckte. Jetzt ignoriert sie die Aufwärmrunden, verwirft Durchfahrten im Verkehr und verlangt eine längere Serie sauberer Runden.",
          },
          {
            en: "Track-limit warnings now name the right corner. A cut happens on the exit kerb, before the corner is considered finished, so the count was charged to the previous corner. You could be told off for a corner you had taken cleanly.",
            fr: "Les avertissements de limites de piste désignent maintenant le bon virage. Une coupure a lieu sur le vibreur de sortie, avant que le virage ne soit considéré comme terminé, si bien que le compte était porté au virage précédent. Vous pouviez vous faire reprocher un virage que vous aviez parfaitement négocié.",
            es: "Los avisos de límites de pista ahora nombran la curva correcta. Un pisado ocurre en el piano de salida, antes de que la curva se considere terminada, así que se cargaba a la curva anterior. Podían reprocharte una curva que habías tomado limpiamente.",
            de: "Warnungen zu Streckenbegrenzungen nennen jetzt die richtige Kurve. Ein Verstoß passiert am Ausgangskerb, bevor die Kurve als beendet gilt, sodass er der vorherigen Kurve angelastet wurde. Man konnte für eine Kurve gerügt werden, die man sauber gefahren hatte.",
          },
          {
            en: "A new reference lap can be recorded again after a game update. Once the game changed the car's performance, no lap could beat the old reference any more, and the coach stayed stuck giving relative advice for good. It now replaces a reference that no longer matches the current conditions.",
            fr: "Un nouveau tour de référence peut de nouveau être enregistré après une mise à jour du jeu. Dès que le jeu changeait les performances de la voiture, plus aucun tour ne battait l'ancienne référence et le coach restait bloqué sur des conseils relatifs pour de bon. Il remplace désormais une référence qui ne correspond plus aux conditions du moment.",
            es: "Se puede volver a registrar una vuelta de referencia tras una actualización del juego. En cuanto el juego cambiaba el rendimiento del coche, ninguna vuelta batía la referencia antigua y el coach se quedaba dando consejos relativos para siempre. Ahora sustituye una referencia que ya no corresponde a las condiciones actuales.",
            de: "Nach einem Spiel-Update kann wieder eine neue Referenzrunde aufgezeichnet werden. Sobald das Spiel die Fahrzeugleistung änderte, schlug keine Runde mehr die alte Referenz, und der Coach blieb dauerhaft bei relativen Hinweisen. Er ersetzt jetzt eine Referenz, die nicht mehr zu den aktuellen Bedingungen passt.",
          },
          {
            en: "Your corner-by-corner progress is no longer thrown away. Progress needs three passes through a corner to be summarised, but everything was discarded on each pit entry. With short runs interrupted by trips back to the garage, no corner ever reached three passes, so the history stayed permanently empty and Drill mode had no targets. Passes now accumulate across short runs.",
            fr: "Votre progression virage par virage n'est plus jetée. Le résumé exige trois passages dans un virage, mais tout était effacé à chaque entrée aux stands. Avec des sorties courtes entrecoupées de retours au garage, aucun virage n'atteignait jamais trois passages : l'historique restait vide en permanence et le mode Drill n'avait aucune cible. Les passages s'accumulent désormais d'une sortie à l'autre.",
            es: "Tu progresión curva a curva ya no se descarta. El resumen exige tres pasadas por una curva, pero todo se borraba en cada entrada a boxes. Con salidas cortas interrumpidas por vueltas al garaje, ninguna curva llegaba nunca a tres pasadas: el historial quedaba vacío permanentemente y el modo Drill no tenía objetivos. Ahora las pasadas se acumulan entre salidas.",
            de: "Dein Fortschritt Kurve für Kurve wird nicht mehr verworfen. Die Auswertung braucht drei Durchfahrten pro Kurve, doch alles wurde bei jeder Boxeneinfahrt gelöscht. Bei kurzen Ausfahrten mit Rückkehr in die Garage erreichte keine Kurve je drei Durchfahrten: Der Verlauf blieb dauerhaft leer und der Drill-Modus hatte keine Ziele. Durchfahrten summieren sich jetzt über kurze Ausfahrten hinweg.",
          },
          {
            featured: true,
            text: {
              en: "The voice coach no longer talks over your braking. A tip could start just before the finish line and end in the braking zone of turn 1, because the quiet window ignored the next lap. Stint, track-limits, drill and session-recall messages bypassed that window entirely and spoke the instant they were computed, often mid corner exit. All of them now wait for the same quiet window as the rest of the coaching.",
              fr: "Le coach vocal ne parle plus par-dessus vos freinages. Un conseil pouvait démarrer juste avant la ligne d'arrivée et se terminer dans la zone de freinage du virage 1, parce que la fenêtre de silence ignorait le tour suivant. Les messages de relais, de limites de piste, de drill et de rappel de session contournaient carrément cette fenêtre et parlaient dès leur calcul, souvent en pleine sortie de virage. Ils attendent désormais tous la même fenêtre calme que le reste du coaching.",
              es: "El coach de voz ya no habla encima de tus frenadas. Un consejo podía empezar justo antes de la línea de meta y acabar en la zona de frenada de la curva 1, porque la ventana de silencio ignoraba la vuelta siguiente. Los mensajes de stint, límites de pista, drill y recordatorio de sesión se saltaban esa ventana y hablaban nada más calcularse, a menudo en plena salida de curva. Ahora todos esperan la misma ventana tranquila que el resto del coaching.",
              de: "Der Sprach-Coach redet nicht mehr in deine Bremsphasen hinein. Ein Hinweis konnte kurz vor der Ziellinie beginnen und in der Bremszone von Kurve 1 enden, weil das Ruhefenster die nächste Runde ignorierte. Meldungen zu Stint, Streckenbegrenzung, Drill und Sitzungserinnerung umgingen dieses Fenster ganz und sprachen sofort nach der Berechnung, oft mitten im Kurvenausgang. Sie warten jetzt alle auf dasselbe ruhige Fenster wie der Rest des Coachings.",
            },
          },
          {
            en: "The voice coach no longer goes silent when you are alone on track. With no car ahead, the gap was read as “zero seconds” instead of “clear track”, so no lap ever qualified as a reference and the coach stayed quiet for the whole session.",
            fr: "Le coach vocal ne reste plus muet quand vous êtes seul en piste. Sans voiture devant, l'écart était lu comme « zéro seconde » au lieu de « piste libre » : aucun tour n'était retenu comme référence et le coach se taisait toute la session.",
            es: "El coach de voz ya no se queda mudo cuando estás solo en pista. Sin coche delante, la diferencia se leía como «cero segundos» en lugar de «pista libre»: ninguna vuelta se tomaba como referencia y el coach callaba toda la sesión.",
            de: "Der Sprach-Coach verstummt nicht mehr, wenn du allein auf der Strecke bist. Ohne Fahrzeug vor dir wurde der Abstand als „null Sekunden“ statt „freie Strecke“ gelesen: Keine Runde wurde als Referenz akzeptiert und der Coach schwieg die ganze Sitzung.",
          },
          {
            en: "The voice coach keeps working after a session change. Going from practice to qualifying or to the race — or restarting a session — reset the game's lap counter, and the coach stopped registering laps for good: no reference lap, no calibration, no advice for the rest of the event.",
            fr: "Le coach vocal continue de fonctionner après un changement de session. Passer des essais à la qualif ou à la course — ou redémarrer une session — remettait à zéro le compteur de tours du jeu, et le coach cessait définitivement d'enregistrer les tours : plus de tour de référence, plus de calibration, plus aucun conseil pour le reste de l'événement.",
            es: "El coach de voz sigue funcionando tras un cambio de sesión. Pasar de entrenamientos a clasificación o a carrera — o reiniciar una sesión — ponía a cero el contador de vueltas del juego, y el coach dejaba de registrar vueltas para siempre: sin vuelta de referencia, sin calibración y sin consejos durante el resto del evento.",
            de: "Der Sprach-Coach arbeitet nach einem Sitzungswechsel weiter. Der Wechsel vom Training zum Qualifying oder Rennen — oder ein Neustart der Sitzung — setzte den Rundenzähler des Spiels zurück, und der Coach erfasste endgültig keine Runden mehr: keine Referenzrunde, keine Kalibrierung, kein Hinweis für den Rest der Veranstaltung.",
          },
          {
            en: "Stutters in-game after closing an overlay are gone. The live data thread kept running at full rate and broadcasting to every window for the rest of the session, because closing the overlay window never released it. Each reopen made it worse.",
            fr: "Les saccades en jeu après la fermeture d'un overlay ont disparu. Le flux de données live continuait de tourner à pleine cadence et d'émettre vers toutes les fenêtres pour le reste de la session, car la fermeture de la fenêtre overlay ne le libérait jamais. Chaque réouverture aggravait le problème.",
            es: "Los tirones en el juego tras cerrar un overlay han desaparecido. El flujo de datos en vivo seguía a pleno ritmo y emitiendo a todas las ventanas durante el resto de la sesión, porque cerrar la ventana del overlay nunca lo liberaba. Cada reapertura lo empeoraba.",
            de: "Ruckler im Spiel nach dem Schließen eines Overlays sind behoben. Der Live-Datenstrom lief mit voller Rate weiter und sendete an alle Fenster für den Rest der Sitzung, weil das Schließen des Overlay-Fensters ihn nie freigab. Jedes erneute Öffnen verschlimmerte es.",
          },
          {
            en: "The app no longer closes without warning when opening telemetry. A recorded file with an empty distance channel — a session stopped before the first sample, or a file still being written by the game — shut the application down instantly.",
            fr: "L'application ne se ferme plus sans prévenir à l'ouverture de la télémétrie. Un fichier enregistré avec un canal de distance vide — session interrompue avant le premier échantillon, ou fichier encore en cours d'écriture par le jeu — provoquait une fermeture immédiate.",
            es: "La aplicación ya no se cierra sin avisar al abrir la telemetría. Un archivo grabado con el canal de distancia vacío — sesión detenida antes de la primera muestra, o archivo aún en escritura por el juego — la cerraba al instante.",
            de: "Die Anwendung schließt sich beim Öffnen der Telemetrie nicht mehr ohne Vorwarnung. Eine Aufzeichnung mit leerem Distanzkanal — vor der ersten Messung abgebrochene Sitzung oder eine vom Spiel noch geschriebene Datei — beendete sie sofort.",
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
            },
            featured: true,
          },
          {
            en: "The AI Coach covers the new American tracks from the US Track Pass. Daytona (road course) and Laguna Seca get video lap guides per class (Hypercar and LMGT3 — HYMO Academy and GO Setups on YouTube, credited in the app) plus a corner-by-corner braking reference (Turn 1, International Horseshoe, Le Mans Chicane, Andretti Hairpin, the Corkscrew…). These braking figures are approximate, compiled from public track notes and flagged as such to the coach — they will be replaced by ApexPoints data once that guide covers the tracks. Watkins Glen and Indianapolis are pre-wired for the next packs.",
            fr: "Le Coach IA couvre les nouveaux circuits américains du US Track Pass. Daytona (tracé routier) et Laguna Seca reçoivent leurs guides vidéo par catégorie (Hypercar et LMGT3 — HYMO Academy et GO Setups sur YouTube, crédités dans l'app) ainsi qu'une référence de freinage virage par virage (Turn 1, International Horseshoe, chicane Le Mans, épingle Andretti, Corkscrew…). Ces chiffres de freinage sont approximatifs, compilés depuis les notes de circuit publiques et signalés comme tels au coach — ils seront remplacés par les données ApexPoints dès que ce guide couvrira ces circuits. Watkins Glen et Indianapolis sont pré-câblés pour les prochains packs.",
            es: "El Coach IA cubre los nuevos circuitos americanos del US Track Pass. Daytona (trazado rutero) y Laguna Seca reciben sus guías de vuelta en vídeo por categoría (Hypercar y LMGT3 — HYMO Academy y GO Setups en YouTube, acreditados en la app) además de una referencia de frenada curva a curva (Turn 1, International Horseshoe, chicane Le Mans, horquilla Andretti, el Corkscrew…). Esas cifras de frenada son aproximadas, compiladas de notas públicas de circuito y señaladas como tales al coach — se sustituirán por los datos de ApexPoints cuando esa guía cubra estos circuitos. Watkins Glen e Indianápolis quedan preparados para los próximos packs.",
            de: "Der KI-Coach deckt die neuen US-Strecken des US Track Pass ab. Daytona (Rundkurs) und Laguna Seca bekommen Video-Lap-Guides pro Klasse (Hypercar und LMGT3 — HYMO Academy und GO Setups auf YouTube, in der App genannt) sowie eine Kurve-für-Kurve-Bremsreferenz (Turn 1, International Horseshoe, Le-Mans-Schikane, Andretti-Haarnadel, Corkscrew…). Diese Bremswerte sind Näherungen aus öffentlichen Streckennotizen und dem Coach als solche gekennzeichnet — sie werden durch ApexPoints-Daten ersetzt, sobald dieser Guide die Strecken abdeckt. Watkins Glen und Indianapolis sind für die nächsten Packs vorverdrahtet.",
          },
          {
            en: "A “Test the AI” button next to the connection test. Instead of a bare ping, the model receives your real stats — last race, most used car, favourite track — and answers with a short radio message from your race engineer, displayed AND spoken by the coach's voice. One click proves the whole chain works: key, model, data, language and speech.",
            fr: "Un bouton « Tester l'IA » à côté du test de connexion. Au lieu d'un simple ping, le modèle reçoit vos vraies statistiques — dernière course, voiture la plus utilisée, circuit favori — et répond par un court message radio de votre ingénieur de course, affiché ET lu par la voix du coach. Un clic prouve toute la chaîne : clé, modèle, données, langue et synthèse vocale.",
            es: "Un botón «Probar la IA» junto a la prueba de conexión. En vez de un simple ping, el modelo recibe tus estadísticas reales — última carrera, coche más usado, circuito favorito — y responde con un breve mensaje de radio de tu ingeniero de carrera, mostrado Y leído por la voz del coach. Un clic demuestra toda la cadena: clave, modelo, datos, idioma y voz.",
            de: "Ein Button „KI testen“ neben dem Verbindungstest. Statt eines bloßen Pings erhält das Modell deine echten Statistiken — letztes Rennen, meistgenutztes Auto, Lieblingsstrecke — und antwortet mit einer kurzen Funknachricht deines Renningenieurs, angezeigt UND von der Coach-Stimme vorgelesen. Ein Klick beweist die ganze Kette: Schlüssel, Modell, Daten, Sprache und Sprachausgabe.",
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
          },
          {
            en: "The coach works with OpenAI's recent models (GPT-5.x, o-series). These models reject the output-limit parameter the app was sending (max_tokens, deprecated in favour of max_completion_tokens) and returned an error. The suggested OpenAI models were also refreshed (gpt-5-mini, gpt-5.2, gpt-5.5).",
            fr: "Le coach fonctionne avec les modèles OpenAI récents (GPT-5.x, séries o). Ces modèles rejettent le paramètre de limite de sortie que l'app envoyait (max_tokens, déprécié au profit de max_completion_tokens) et renvoyaient une erreur. Les modèles OpenAI suggérés ont aussi été rafraîchis (gpt-5-mini, gpt-5.2, gpt-5.5).",
            es: "El coach funciona con los modelos recientes de OpenAI (GPT-5.x, series o). Estos modelos rechazan el parámetro de límite de salida que enviaba la app (max_tokens, obsoleto en favor de max_completion_tokens) y devolvían un error. Los modelos de OpenAI sugeridos también se han actualizado (gpt-5-mini, gpt-5.2, gpt-5.5).",
            de: "Der Coach funktioniert mit den neueren OpenAI-Modellen (GPT-5.x, o-Serien). Diese Modelle lehnen den Ausgabelimit-Parameter ab, den die App sendete (max_tokens, zugunsten von max_completion_tokens veraltet), und lieferten einen Fehler. Die vorgeschlagenen OpenAI-Modelle wurden ebenfalls aufgefrischt (gpt-5-mini, gpt-5.2, gpt-5.5).",
          },
          {
            en: "The coach's voice now pronounces racing jargon correctly. “P13” was read as one garbled word instead of “P thirteen”; lap times like “1:42.123” came out as “colon… point…”; “km/h”, “°C”, signed gaps (“+0.5s”) and class names (GT3, LMP2, LMGT3…) were mangled too. Everything is now spoken in full words, in all four languages — on-screen text is unchanged. Lap times follow radio convention (“1:42.881” is spoken “one, forty-two, eight-eighty-one”), and when the coach reads a full analysis aloud it now pauses briefly after each section title.",
            fr: "La voix du coach prononce désormais correctement le jargon course. « P13 » était lu comme un mot déformé au lieu de « P treize » ; les temps au tour comme « 1:42.123 » sortaient en « deux-points… point… » ; « km/h », « °C », les écarts signés (« +0.5s ») et les catégories (GT3, LMP2, LMGT3…) étaient également écorchés. Tout est maintenant énoncé en toutes lettres, dans les quatre langues — le texte affiché ne change pas. Les temps au tour suivent la convention radio (« 1:42.881 » se dit « une, 42, 881 »), et la lecture d'une analyse marque désormais une courte pause après chaque titre de section.",
            es: "La voz del coach pronuncia ahora correctamente la jerga de carreras. «P13» se leía como una palabra deformada en vez de «P trece»; los tiempos de vuelta como «1:42.123» salían con «dos puntos… punto…»; «km/h», «°C», las diferencias con signo («+0.5s») y las categorías (GT3, LMP2, LMGT3…) también se estropeaban. Ahora todo se enuncia con palabras completas, en los cuatro idiomas — el texto en pantalla no cambia. Los tiempos de vuelta siguen la convención de radio («1:42.881» se dice «uno, 42, 881»), y la lectura de un análisis hace ahora una breve pausa tras cada título de sección.",
            de: "Die Coach-Stimme spricht Rennjargon jetzt korrekt aus. „P13“ wurde als verzerrtes Wort gelesen statt „P dreizehn“; Rundenzeiten wie „1:42.123“ kamen als „Doppelpunkt… Punkt…“ heraus; auch „km/h“, „°C“, Abstände mit Vorzeichen („+0.5s“) und Klassen (GT3, LMP2, LMGT3…) wurden verstümmelt. Alles wird jetzt in ganzen Wörtern gesprochen, in allen vier Sprachen — der angezeigte Text bleibt unverändert. Rundenzeiten folgen der Funk-Konvention („1:42.881“ wird „eins, 42, 881“ gesprochen), und beim Vorlesen einer Analyse macht der Coach nach jedem Abschnittstitel eine kurze Pause.",
          },
          {
            en: "Answers no longer come back empty with reasoning models — whatever the provider (Gemini 3, OpenAI o-series, DeepSeek R1, local “thinking” models via Ollama…). These models spend part of their output budget thinking before they answer, which could swallow the whole allowance of a short reply (voice coach, quick analysis) and return nothing. Every provider's budget now includes room for that reasoning.",
            fr: "Les réponses ne reviennent plus vides avec les modèles de raisonnement — quel que soit le fournisseur (Gemini 3, séries o d'OpenAI, DeepSeek R1, modèles « thinking » locaux via Ollama…). Ces modèles dépensent une partie de leur budget de sortie à réfléchir avant de répondre, ce qui pouvait absorber tout le quota d'une réponse courte (coach vocal, analyse rapide) et ne rien renvoyer. Le budget de chaque fournisseur prévoit désormais cette place.",
            es: "Las respuestas ya no llegan vacías con los modelos de razonamiento — sea cual sea el proveedor (Gemini 3, series o de OpenAI, DeepSeek R1, modelos «thinking» locales vía Ollama…). Estos modelos gastan parte de su presupuesto de salida en pensar antes de responder, lo que podía consumir toda la cuota de una respuesta corta (coach de voz, análisis rápido) y no devolver nada. El presupuesto de cada proveedor ya reserva ese espacio.",
            de: "Antworten kommen mit Reasoning-Modellen nicht mehr leer zurück — egal bei welchem Anbieter (Gemini 3, OpenAI o-Serien, DeepSeek R1, lokale „Thinking“-Modelle über Ollama…). Diese Modelle verwenden einen Teil ihres Ausgabebudgets aufs Nachdenken, was bei kurzen Antworten (Sprach-Coach, Schnellanalyse) das gesamte Kontingent aufbrauchen und nichts zurückgeben konnte. Das Budget jedes Anbieters berücksichtigt diesen Bedarf jetzt.",
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
