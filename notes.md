## 🇫🇷 Français

### ✅ Ajouté

- **L'application est disponible en italien, sa 5ᵉ langue : toute l'interface, les annonces vocales de l'ingénieur (deux voix Piper italiennes à télécharger dans Configuration → Voix), les commandes vocales hors ligne et le coach IA, qui répond en italien.**
- Classements : votre pays (celui de votre profil dans le jeu) s'affiche en drapeau à côté de votre nom, avec votre avatar Steam. Vous partagez déjà ? Un clic sur la page Classements récupère votre avatar. Ni l'un ni l'autre en mode anonyme ; vous pouvez retirer l'avatar (Configuration → Communauté), ce qui efface aussi votre identifiant Steam du serveur.

### 🐛 Corrigé

- Coach IA : la répartition de freinage lue dans la télémétrie lui était transmise en part arrière seule (ex. « 46 % » pour un réglage 54:46) ; il la prenait pour la part avant et donnait des conseils inversés. Il reçoit désormais avant:arrière comme dans le jeu (54.0:46.0), et la valeur BB de la page Télémétrie suit le même format.
- Niveau ohne_speed : les variantes de circuit (Bahreïn Paddock ou Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) étaient comparées au tracé principal, d'où « Alien » presque à chaque tour ; chaque variante utilise désormais sa propre référence, et une variante absente de la feuille de référence affiche « — ». Le niveau était aussi trop généreux d'un cran (un tour à 103,6 % affichait « Bon » au lieu de « Peloton »).
- Télémétrie : les courbes (vitesse, accélérateur, frein…) d'un tour pouvaient rester plates et ne montrer que quelques mètres de piste quand le tour commençait ou finissait pile sur la ligne, ou partait de la voie des stands (tour de sortie) ; elles couvrent désormais toujours le tour entier.
- Télémétrie : les temps des secteurs 2 et 3 du tour affiché étaient faux (S2 incluait S1, S3 était presque nul).
- Télémétrie : au tout début d'un tour, la valeur sous les courbes affichait la fin du tour au lieu du départ.
- Page Sessions ouverte depuis le Profil, les Records ou les Références : le filtre voiture ou tracé du lien était perdu, la liste montrait donc toutes les voitures de la classe ou tous les tracés du circuit.

### ⬆️ Amélioré

- Courses multiclasses : votre position dans votre classe passe en premier, avec la position générale à côté, dans l'en-tête de la page Live, les overlays Tableau de bord et Endurance et le coach IA en live (qui reçoit aussi les écarts au leader de la classe et à la voiture de la classe devant vous, au lieu de voitures d'autres classes). Les overlays Classement et Relatif numérotent les voitures par position en classe ; décochez « Position en classe » dans leur onglet Contenu pour revenir à la numérotation générale.
- Les filtres sont conservés sur chaque page : quittez une page et revenez-y, vous retrouvez les mêmes filtres, le même tri, la même page et la même vue (Tableau de bord, Sessions, Records, Classements, Références, Télémétrie, Setups, filtre de classes du Live). Ils repartent à zéro au redémarrage de l'app.
- Page Classements : tous les classements de la communauté sont listés, avec leur record et le pilote du record, même sur les circuits que vous n'avez pas roulés ; le bouton « Mes combos » n'affiche que les vôtres, en évidence en orange. Un clic sur le nom d'un circuit ouvre son classement complet, tous les pilotes de toutes les classes (comme sur le site) ; un clic sur le badge d'une classe n'y garde que cette classe.
- Page Classements, détail : le classement complet (secteurs, version, date, votre ligne surlignée) sous une carte « Votre position », comme sur le site, puis la répartition des temps avec les places correspondantes. Le pilote du record vient juste après la classe, et « Position » et « Top » ne forment plus qu'une colonne. Le classement ouvert est nettement mis en évidence (ligne teintée, barre orange jusqu'au bas de son détail, tout le reste grisé) et son titre indique le tracé et la classe.
- Page Classements : le détail d'un classement s'ouvre désormais avec l'icône en forme d'œil en début de ligne, comme sur les autres pages.
- Page Classements : l'écart au plus rapide est placé juste après votre temps, et une colonne « Version » indique la version du jeu de chaque classement.

---

## 🇬🇧 English

### ✅ Added

- **The app is now available in Italian, its 5th language: the whole interface, the race engineer's voice callouts (two Italian Piper voices to download from Settings → Voice), offline voice commands, and the AI coach, which answers in Italian.**
- Leaderboards: your country (taken from your game profile) shows as a flag next to your name, along with your Steam avatar. Already sharing? One click on the Leaderboards page fetches your avatar. Neither is shown in anonymous mode; you can remove the avatar (Settings → Community), which also makes the server forget your Steam ID.

### 🐛 Fixed

- AI coach: the brake bias read from telemetry was given as the rear share only (e.g. “46 %” for a 54:46 setting), so the coach took it for the front bias and gave inverted advice. It now receives front:rear like the game (54.0:46.0), and the BB value on the Telemetry page uses the same format.
- ohne_speed level: track variants (Bahrain Paddock or Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) were compared with the main layout, so almost every lap showed “Alien”; each variant now uses its own reference, and a variant missing from the reference sheet shows “—”. The level was also one notch too generous (a lap at 103.6 % showed “Good” instead of “Midpack”).
- Telemetry: the speed, throttle, brake… graphs of a lap could stay flat and show only a few metres of track when the lap started or ended right on the line, or began in the pit lane (out lap); they now always cover the whole lap.
- Telemetry: sector 2 and sector 3 times of the selected lap were wrong (S2 included S1, S3 was almost zero).
- Telemetry: at the very start of a lap, the value under the graphs showed the end of the lap instead of the start.
- Sessions page opened from the Profile, Records or References: the car or layout filter of the link was dropped, so the list showed every car of the class or every layout of the track.

### ⬆️ Improved

- Multi-class races: your position in your class now comes first, with the overall position next to it, in the Live page header, the Dashboard and Endurance overlays, and the live AI coach (which also gets the gaps to the class leader and to the class car ahead, instead of cars from other classes). The Standings and Relative overlays number cars by class position; untick “Class position” in their Content tab to get overall numbers back.
- Filters are kept on every page: leave a page and come back, and you find the same filters, sort order, page and view (Dashboard, Sessions, Records, Leaderboards, References, Telemetry, Setups, Live class filter). They start again from scratch when the app restarts.
- Leaderboards page: every community leaderboard is now listed, with its record and record holder, even on tracks you have not driven; the “My combos” button shows only yours, highlighted in orange. A click on a track name opens its full leaderboard with every driver of every class (as on the website); a click on a class badge there keeps only that class.
- Leaderboards page, details: the full leaderboard (sectors, version, date, your row highlighted) under a “Your position” card, like on the website, then the lap time spread with the matching leaderboard positions. The record holder now comes right after the class, and “Position” and “Top” are merged into one column. The open leaderboard is clearly highlighted (tinted row, orange bar down to the end of its details, everything else greyed out) and its title names the layout and class.
- Leaderboards page: the details of a leaderboard now open with the eye icon at the start of the row, as on the other pages.
- Leaderboards page: the gap to the fastest now sits right after your time, and a “Version” column shows the game version of each leaderboard.

---

## 🇪🇸 Español

### ✅ Añadido

- **La aplicación ya está disponible en italiano, su 5.º idioma: toda la interfaz, los avisos de voz del ingeniero (dos voces Piper italianas para descargar en Configuración → Voz), los comandos de voz sin conexión y el coach IA, que responde en italiano.**
- Clasificaciones: tu país (el de tu perfil del juego) aparece como bandera junto a tu nombre, con tu avatar de Steam. ¿Ya compartes? Un clic en la página Clasificaciones recupera tu avatar. Nada de ello en modo anónimo; puedes quitar el avatar (Configuración → Comunidad), lo que también borra tu identificador de Steam del servidor.

### 🐛 Corregido

- Coach IA: el reparto de frenada leído de la telemetría se le enviaba solo como parte trasera (p. ej. «46 %» para un reglaje 54:46), así que lo tomaba por la parte delantera y daba consejos invertidos. Ahora recibe delante:detrás como en el juego (54.0:46.0), y el valor BB de la página Telemetría usa el mismo formato.
- Nivel ohne_speed: las variantes de circuito (Baréin Paddock u Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) se comparaban con el trazado principal, de ahí «Alien» casi en cada vuelta; cada variante usa ahora su propia referencia, y una variante ausente de la hoja de referencia muestra «—». El nivel también era un escalón demasiado generoso (una vuelta al 103,6 % mostraba «Bueno» en lugar de «Pelotón»).
- Telemetría: las gráficas (velocidad, acelerador, freno…) de una vuelta podían quedarse planas y mostrar solo unos metros de pista cuando la vuelta empezaba o terminaba justo en la línea, o salía del pit lane (vuelta de salida); ahora cubren siempre la vuelta completa.
- Telemetría: los tiempos de los sectores 2 y 3 de la vuelta mostrada eran erróneos (S2 incluía S1, S3 era casi nulo).
- Telemetría: al principio de una vuelta, el valor bajo las gráficas mostraba el final de la vuelta en lugar de la salida.
- Página Sesiones abierta desde el Perfil, los Récords o las Referencias: se perdía el filtro de coche o de trazado del enlace, así que la lista mostraba todos los coches de la clase o todos los trazados del circuito.

### ⬆️ Mejorado

- Carreras multiclase: tu posición en tu clase aparece primero, con la posición general al lado, en la cabecera de la página Live, los overlays Tablero y Resistencia y el coach IA en directo (que además recibe las diferencias con el líder de la clase y con el coche de la clase que va delante, en lugar de coches de otras clases). Los overlays Clasificación y Relativo numeran los coches por posición en clase; desmarca «Posición en clase» en su pestaña Contenido para volver a la numeración general.
- Los filtros se conservan en cada página: sal de una página y vuelve, y encontrarás los mismos filtros, el mismo orden, la misma página y la misma vista (Panel, Sesiones, Récords, Clasificaciones, Referencias, Telemetría, Setups, filtro de clases del Live). Se reinician al reiniciar la app.
- Página Clasificaciones: se listan todas las clasificaciones de la comunidad, con su récord y el piloto del récord, incluso en circuitos que no has rodado; el botón «Mis combos» muestra solo las tuyas, resaltadas en naranja. Un clic en el nombre de un circuito abre su clasificación completa, todos los pilotos de todas las clases (como en la web); un clic en la insignia de una clase deja solo esa clase.
- Página Clasificaciones, detalle: la clasificación completa (sectores, versión, fecha, tu fila resaltada) bajo una tarjeta «Tu posición», como en la web, y luego el reparto de tiempos con los puestos correspondientes. El piloto del récord aparece justo después de la clase, y «Posición» y «Top» forman una sola columna. La clasificación abierta se resalta claramente (fila tintada, barra naranja hasta el final de su detalle, todo lo demás en gris) y su título indica el trazado y la clase.
- Página Clasificaciones: el detalle de una clasificación se abre ahora con el icono del ojo al principio de la fila, como en las demás páginas.
- Página Clasificaciones: la diferencia con el más rápido aparece justo después de tu tiempo, y una columna «Versión» indica la versión del juego de cada clasificación.

---

## 🇩🇪 Deutsch

### ✅ Hinzugefügt

- **Die App gibt es jetzt auf Italienisch, ihrer 5. Sprache: die ganze Oberfläche, die Sprachansagen des Ingenieurs (zwei italienische Piper-Stimmen zum Herunterladen unter Einstellungen → Stimme), die Offline-Sprachbefehle und der KI-Coach, der auf Italienisch antwortet.**
- Ranglisten: Dein Land (aus deinem Spielprofil) erscheint als Flagge neben deinem Namen, zusammen mit deinem Steam-Avatar. Du teilst bereits? Ein Klick auf der Seite Ranglisten holt deinen Avatar. Im anonymen Modus nichts davon; du kannst den Avatar entfernen (Einstellungen → Community), wodurch auch deine Steam-ID vom Server gelöscht wird.

### 🐛 Behoben

- KI-Coach: Die Bremsbalance aus der Telemetrie wurde nur als Hinterachsanteil übergeben (z. B. „46 %“ bei 54:46), sodass der Coach sie für den Vorderachsanteil hielt und umgekehrte Ratschläge gab. Er erhält jetzt vorne:hinten wie im Spiel (54.0:46.0), und der BB-Wert auf der Telemetrie-Seite nutzt dasselbe Format.
- ohne_speed-Stufe: Streckenvarianten (Bahrain Paddock oder Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) wurden mit der Hauptvariante verglichen, daher fast jede Runde „Alien“; jede Variante nutzt jetzt ihre eigene Referenz, und eine Variante ohne Eintrag in der Referenztabelle zeigt „—“. Die Stufe war außerdem eine Stufe zu großzügig (eine Runde mit 103,6 % zeigte „Gut“ statt „Mittelfeld“).
- Telemetrie: Die Kurven (Geschwindigkeit, Gas, Bremse…) einer Runde konnten flach bleiben und nur wenige Meter Strecke zeigen, wenn die Runde genau auf der Linie begann oder endete oder in der Boxengasse startete (Out-Lap); sie decken jetzt immer die ganze Runde ab.
- Telemetrie: Die Zeiten von Sektor 2 und 3 der angezeigten Runde waren falsch (S2 enthielt S1, S3 war fast null).
- Telemetrie: Ganz am Anfang einer Runde zeigte der Wert unter den Kurven das Rundenende statt des Starts.
- Seite Sessions aus Profil, Rekorden oder Referenzen geöffnet: Der Fahrzeug- oder Layout-Filter des Links ging verloren, die Liste zeigte also alle Fahrzeuge der Klasse oder alle Layouts der Strecke.

### ⬆️ Verbessert

- Mehrklassenrennen: Deine Position in deiner Klasse steht jetzt an erster Stelle, die Gesamtposition daneben – im Kopf der Live-Seite, in den Overlays Übersicht und Langstrecke und beim Live-KI-Coach (der außerdem die Abstände zum Klassenführenden und zum Klassenvordermann erhält statt zu Autos anderer Klassen). Die Overlays Wertung und Relativ nummerieren nach Klassenposition; entferne im Tab Inhalt das Häkchen bei „Klassenposition“, um wieder die Gesamtnummerierung zu sehen.
- Filter bleiben auf jeder Seite erhalten: Verlasse eine Seite und kehre zurück, und du findest dieselben Filter, dieselbe Sortierung, dieselbe Seite und dieselbe Ansicht (Dashboard, Sessions, Rekorde, Ranglisten, Referenzen, Telemetrie, Setups, Klassenfilter im Live). Beim Neustart der App werden sie zurückgesetzt.
- Seite Ranglisten: Alle Community-Ranglisten werden aufgeführt, mit Rekord und Rekordhalter, auch auf Strecken, die du nicht gefahren bist; der Knopf „Meine Kombos“ zeigt nur deine, orange hervorgehoben. Ein Klick auf einen Streckennamen öffnet die komplette Rangliste mit allen Fahrern aller Klassen (wie auf der Website); ein Klick auf das Abzeichen einer Klasse zeigt nur diese Klasse.
- Seite Ranglisten, Details: die komplette Rangliste (Sektoren, Version, Datum, deine Zeile hervorgehoben) unter einer Karte „Deine Position“ wie auf der Website, darunter die Zeitverteilung mit den passenden Platzierungen. Der Rekordhalter steht direkt nach der Klasse, und „Position“ und „Top“ sind zu einer Spalte zusammengefasst. Die geöffnete Rangliste ist deutlich hervorgehoben (getönte Zeile, orangefarbener Balken bis zum Ende ihrer Details, alles andere ausgegraut), und ihr Titel nennt Layout und Klasse.
- Seite Ranglisten: Die Details einer Rangliste öffnen sich jetzt über das Augen-Symbol am Zeilenanfang, wie auf den anderen Seiten.
- Seite Ranglisten: Der Abstand zum Schnellsten steht jetzt direkt nach deiner Zeit, und eine Spalte „Version“ zeigt die Spielversion jeder Rangliste.

---

## 🇮🇹 Italiano

### ✅ Aggiunto

- **L'app è ora disponibile in italiano, la sua 5ª lingua: tutta l'interfaccia, gli annunci vocali dell'ingegnere di pista (due voci Piper italiane da scaricare in Impostazioni → Voce), i comandi vocali offline e il coach IA, che risponde in italiano.**
- Classifiche: il tuo paese (preso dal tuo profilo di gioco) appare come bandiera accanto al tuo nome, insieme al tuo avatar Steam. Condividi già? Un clic sulla pagina Classifiche recupera il tuo avatar. Nessuno dei due viene mostrato in modalità anonima; puoi rimuovere l'avatar (Impostazioni → Community), e così il server dimentica anche il tuo ID Steam.

### 🐛 Corretto

- Coach IA: il bilanciamento di frenata letto dalla telemetria gli veniva passato solo come quota posteriore (es. «46 %» per una regolazione 54:46), quindi il coach lo scambiava per la quota anteriore e dava consigli invertiti. Ora riceve anteriore:posteriore come nel gioco (54.0:46.0), e il valore BB nella pagina Telemetria usa lo stesso formato.
- Livello ohne_speed: le varianti di circuito (Bahrain Paddock o Outer, Sebring School, Le Mans Mulsanne, Fuji Classic…) venivano confrontate con il tracciato principale, per cui quasi ogni giro risultava «Alien»; ora ogni variante usa il proprio riferimento, e una variante assente dalla tabella di riferimento mostra «—». Il livello era anche di un gradino troppo generoso (un giro al 103,6 % mostrava «Buono» invece di «Centro gruppo»).
- Telemetria: i grafici (velocità, acceleratore, freno…) di un giro potevano restare piatti e mostrare solo pochi metri di pista quando il giro iniziava o finiva esattamente sulla linea, o partiva dalla corsia box (giro di uscita); ora coprono sempre l'intero giro.
- Telemetria: i tempi del settore 2 e del settore 3 del giro selezionato erano sbagliati (S2 includeva S1, S3 era quasi zero).
- Telemetria: proprio all'inizio di un giro, il valore sotto i grafici mostrava la fine del giro invece della partenza.
- Pagina Sessioni aperta da Profilo, Record o Riferimenti: il filtro vettura o tracciato del link andava perso, quindi l'elenco mostrava tutte le vetture della classe o tutti i tracciati del circuito.

### ⬆️ Migliorato

- Gare multiclasse: la tua posizione nella tua classe ora viene per prima, con la posizione assoluta accanto, nell'intestazione della pagina Live, negli overlay Dashboard ed Endurance e nel coach IA live (che riceve anche i distacchi dal leader di classe e dalla vettura della tua classe davanti, invece che da vetture di altre classi). Gli overlay Classifica e Relativo numerano le vetture per posizione di classe; togli la spunta a «Posizione di classe» nella loro scheda Contenuto per tornare alla numerazione assoluta.
- I filtri vengono mantenuti su ogni pagina: esci da una pagina e torna indietro, e ritrovi gli stessi filtri, lo stesso ordinamento, la stessa pagina e la stessa vista (Dashboard, Sessioni, Record, Classifiche, Riferimenti, Telemetria, Setup, filtro classi del Live). Si azzerano al riavvio dell'app.
- Pagina Classifiche: ora sono elencate tutte le classifiche della community, con il loro record e il detentore del record, anche sui circuiti su cui non hai mai guidato; il pulsante «Le mie combo» mostra solo le tue, evidenziate in arancione. Un clic sul nome di un circuito apre la sua classifica completa con tutti i piloti di tutte le classi (come sul sito); lì, un clic sul badge di una classe mantiene solo quella classe.
- Pagina Classifiche, dettaglio: la classifica completa (settori, versione, data, la tua riga evidenziata) sotto un riquadro «La tua posizione», come sul sito, poi la distribuzione dei tempi con le posizioni corrispondenti in classifica. Il detentore del record ora viene subito dopo la classe, e «Posizione» e «Top» sono unite in un'unica colonna. La classifica aperta è chiaramente evidenziata (riga colorata, barra arancione fino in fondo al suo dettaglio, tutto il resto in grigio) e il suo titolo indica il tracciato e la classe.
- Pagina Classifiche: il dettaglio di una classifica ora si apre con l'icona a forma di occhio all'inizio della riga, come nelle altre pagine.
- Pagina Classifiche: il distacco dal più veloce ora si trova subito dopo il tuo tempo, e una colonna «Versione» indica la versione del gioco di ogni classifica.
