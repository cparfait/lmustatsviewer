// Site communautaire lmu.cparfait.ovh — socle commun (i18n, thème, API, rendu).
// Toute donnée venant des joueurs passe par esc() avant d'entrer dans le DOM.
/* global TRACK_PATHS */
"use strict";

const I18N = {
  fr: {
    "home.title": "Classements communautaires", "home.lead": "Les meilleurs tours des pilotes LMU Stats Viewer, par circuit et par classe. Cliquez sur un temps pour ouvrir le classement complet.", "home.trust": "Chronos lus dans les fichiers du jeu : rien n'est saisi à la main.",
    "home.me": "Ma fiche pilote", "home.board": "Tous les classements", "home.count": "{n} classements", "home.count1": "1 classement",
    "view.grid": "Par circuit", "view.list": "Liste", "sort.popular": "Plus roulés", "sort.az": "A → Z",
    "mx.legend": "Fréquentation : nombre de pilotes, comparé au classement le plus roulé de la même classe. Un classement est provisoire tant qu'il compte moins de 20 pilotes.", "col.recordCar": "Voiture du record", "col.pop": "Fréquentation", "home.pending": "Provisoire : {n} / 20 pilotes", "home.open": "Classement",
    "nav.tracks": "Circuits", "nav.how": "Contribuer", "nav.app": "L'app", "nav.share": "Partager mes tours",
    "stat.drivers": "Pilotes", "stat.sessions": "Sessions partagées", "stat.layouts": "Circuits et tracés", "stat.ranked": "Combos classés",
    "stat.week": "+{n} cette semaine", "stat.rankedSub": "20 pilotes ou plus", "stat.live": "Mis à jour en direct",
    "drivers": "pilotes", "driver1": "pilote",
    "search": "Rechercher un circuit…", "noResult": "Aucun circuit ne correspond.", "f.reset": "Réinitialiser les filtres",
    "how.kicker": "Contribuer", "how.title": "Quatre étapes, et c'est vous qui décidez",
    "how.0t": "Installez l'app", "how.0d": "LMU Stats Viewer, pour Windows 10 et 11. Il lit vos résultats directement dans les fichiers du jeu : rien à saisir.", "how.0cta": "Télécharger l'app",
    "how.1t": "Activez le partage", "how.1d": "Dans l'app, Configuration → Communauté. Vous voyez exactement ce qui part avant de valider.",
    "how.2t": "Roulez", "how.2d": "Après chaque session, votre meilleur tour valide part tout seul. Jamais ceux des autres pilotes.",
    "how.3t": "Comparez", "how.3d": "Votre position sur chaque combo, dans l'app et ici, par classe, par voiture et par version.",
    "privacy": "Rien ne part sans votre accord. Vous apparaissez sous votre nom de pilote LMU ou restez anonyme, au choix. Un clic dans l'app efface toutes vos données du serveur.",
    "empty.title": "Les classements s'ouvrent", "empty.text": "Aucun tour partagé pour l'instant. Installez l'app et activez le partage pour être parmi les premiers.",
    "offline": "Le service ne répond pas pour l'instant. Réessayez dans quelques minutes.",
    "maint.title": "Mise à jour en cours", "maint.text": "Le site peut être indisponible quelques instants. Les tours partagés depuis l'app sont conservés et renvoyés automatiquement.", "footer.tagline": "Fait pour la communauté Le Mans Ultimate.", "footer.app": "L'application", "footer.privacy": "Confidentialité",
    "footer.legal": "LMU Stats Viewer n'est pas affilié à Studio 397 ni à Le Mans Ultimate.",
    "crumbs": "Classements", "provisional": "Classement provisoire : {n} / 20 pilotes. Les chiffres se stabilisent avec les partages.",
    "kpi.drivers": "Pilotes", "kpi.best": "Meilleur tour", "kpi.p10": "Top 10 %", "kpi.median": "Médiane", "kpi.laps": "Tours valides",
    "hist.title": "Où se situent les pilotes", "hist.sub": "Chaque barre compte les pilotes dont le meilleur tour tombe dans cette tranche de 0,5 s. À gauche les plus rapides, à droite les plus lents.", "hist.fast": "← plus rapide", "hist.slow": "plus lent →", "hist.axisY": "pilotes", "hist.top10": "Top 10 %", "hist.median": "Médiane", "hist.p90": "90 %", "hist.bar": "{n} pilote(s) entre {a} et {b}", "hist.you": "Vous", "me.btn": "Ma position", "me.title": "Votre position", "me.none": "Vous n'avez pas encore de temps sur ce combo avec ces filtres.", "me.unknown": "Ouvrez ce classement depuis l'app (Classements → Voir sur le site), ou cliquez « C'est moi » sur votre fiche pilote.", "me.set": "C'est moi", "me.pickPh": "Votre nom de pilote LMU…", "me.pickNone": "Aucun pilote de ce nom sur ce classement (un pilote anonyme n'est pas trouvable par son nom).", "me.saved": "Enregistré : votre ligne sera épinglée en haut des classements.", "me.clear": "Oublier", "me.jump": "Voir dans le tableau", "coffee": "Offrir un café", "coffeeTitle": "Soutenir le projet",
    "calc.title": "Où se situe votre temps ?", "calc.sub": "Tapez un chrono pour vous placer — l'app le fait toute seule après chaque session.",
    "calc.first": "Meilleur temps", "calc.bottom": "Derniers {pct} %", "calc.top": "Top {pct} %", "calc.of": "sur {n} pilotes", "calc.rank": "Position", "calc.gapBest": "Écart au meilleur", "calc.gapMedian": "Écart à la médiane",
    "lb.title": "Classement", "lb.sub": "Meilleurs secteurs du classement en violet · anonymat au choix de chaque pilote", "lb.more": "Afficher plus",
    "col.driver": "Pilote", "col.car": "Voiture", "col.time": "Temps", "col.gap": "Écart", "col.version": "Version", "col.date": "Date",
    "byCar.title": "Par voiture", "byCar.sub": "Du meilleur tour (début de barre) à la médiane (trait) de chaque modèle",
    "versions.title": "Versions du jeu", "versions.sub": "Chaque mise à jour et sa BoP ont leur propre classement",
    "brakes.title": "Zones de freinage de la communauté", "brakes.soon": "Bientôt", "brakes.text": "Calculées à partir des tours partagés — jamais saisies à la main.",
    "share.title": "Partager cette page", "share.copy": "Copier le lien", "share.copied": "Lien copié",
    "dry": "Sec", "wet": "Pluie", "aidsClean": "Sans aide au freinage", "aidsAll": "Toutes aides",
    "versions.all": "Toutes", "find.ph": "Trouver un pilote dans ce classement…", "find.none": "Aucun pilote de ce nom sur ce combo.", "find.matches": "Résultats : {n}", "search.ph": "Rechercher un pilote…", "search.none": "Aucun pilote trouvé", "search.combos": "{n} combos", "profile.kicker": "Fiche pilote", "profile.sub": "Son meilleur tour et son rang sur chaque combo (toutes versions)", "profile.none": "Pilote introuvable (il est peut-être anonyme).", "provisional.short": "provisoire ({n}/20)", "col.track": "Circuit", "col.class": "Classe", "col.rank": "Position", "col.top": "Top", "noOutline": "Tracé bientôt disponible",
    "f.circuit": "Circuit", "f.layout": "Tracé", "f.class": "Classe", "f.car": "Voiture", "f.session": "Session", "f.mode": "Mode", "f.version": "Version", "f.conditions": "Conditions", "f.aids": "Aides", "f.all": "Tous", "f.allF": "Toutes", "f.race": "Course", "f.qualify": "Qualif", "f.practice": "Essais", "f.online": "En ligne", "f.offline": "Hors ligne", "f.latest": "Dernière", "f.several": "Plusieurs",
    "anon": "Pilote {tag}", "notFound": "Ce combo n'a encore aucun tour partagé.", "back": "Retour aux circuits", "latest": "actuelle",
  },
  en: {
    "home.title": "Community leaderboards", "home.lead": "The best laps of LMU Stats Viewer drivers, by track and class. Click a lap time to open the full leaderboard.", "home.trust": "Times read from the game's own files: nothing is typed in by hand.",
    "home.me": "My driver page", "home.board": "All leaderboards", "home.count": "{n} leaderboards", "home.count1": "1 leaderboard",
    "view.grid": "By track", "view.list": "List", "sort.popular": "Most driven", "sort.az": "A → Z",
    "mx.legend": "Popularity: number of drivers, compared with the most driven leaderboard of the same class. A leaderboard stays provisional until it has 20 drivers.", "col.recordCar": "Record car", "col.pop": "Popularity", "home.pending": "Provisional: {n} / 20 drivers", "home.open": "Leaderboard",
    "nav.tracks": "Tracks", "nav.how": "Contribute", "nav.app": "The app", "nav.share": "Share my laps",
    "stat.drivers": "Drivers", "stat.sessions": "Sessions shared", "stat.layouts": "Tracks and layouts", "stat.ranked": "Ranked combos",
    "stat.week": "+{n} this week", "stat.rankedSub": "20 drivers or more", "stat.live": "Updated live",
    "drivers": "drivers", "driver1": "driver",
    "search": "Search a track…", "noResult": "No track matches.", "f.reset": "Reset filters",
    "how.kicker": "Contribute", "how.title": "Four steps, and you stay in control",
    "how.0t": "Install the app", "how.0d": "LMU Stats Viewer, for Windows 10 and 11. It reads your results straight from the game's files: nothing to type in.", "how.0cta": "Download the app",
    "how.1t": "Turn sharing on", "how.1d": "In the app, Settings → Community. You see exactly what is sent before confirming.",
    "how.2t": "Drive", "how.2d": "After each session, your best valid lap is sent automatically. Never the other drivers' laps.",
    "how.3t": "Compare", "how.3d": "Your position on every combo, in the app and here, by class, car and version.",
    "privacy": "Nothing leaves without your consent. You appear under your LMU driver name or stay anonymous, your choice. One click in the app deletes all your data from the server.",
    "empty.title": "The leaderboards are opening", "empty.text": "No laps shared yet. Install the app and turn sharing on to be among the first.",
    "offline": "The service is not responding right now. Please try again in a few minutes.",
    "maint.title": "Update in progress", "maint.text": "The site may be unavailable for a few moments. Laps shared from the app are kept and sent again automatically.", "footer.tagline": "Made for the Le Mans Ultimate community.", "footer.app": "The app", "footer.privacy": "Privacy",
    "footer.legal": "LMU Stats Viewer is not affiliated with Studio 397 or Le Mans Ultimate.",
    "crumbs": "Leaderboards", "provisional": "Provisional ranking: {n} / 20 drivers. Figures settle as more laps are shared.",
    "kpi.drivers": "Drivers", "kpi.best": "Best lap", "kpi.p10": "Top 10%", "kpi.median": "Median", "kpi.laps": "Valid laps",
    "hist.title": "Where drivers stand", "hist.sub": "Each bar counts the drivers whose best lap falls in that 0.5 s slice. Fastest on the left, slowest on the right.", "hist.fast": "← faster", "hist.slow": "slower →", "hist.axisY": "drivers", "hist.top10": "Top 10%", "hist.median": "Median", "hist.p90": "90%", "hist.bar": "{n} driver(s) between {a} and {b}", "hist.you": "You", "me.btn": "My position", "me.title": "Your position", "me.none": "You have no time on this combo with these filters yet.", "me.unknown": "Open this leaderboard from the app (Leaderboards → View on the site), or click “This is me” on your driver profile.", "me.set": "This is me", "me.pickPh": "Your LMU driver name…", "me.pickNone": "No driver by that name in this leaderboard (anonymous drivers cannot be found by name).", "me.saved": "Saved: your row will be pinned at the top of leaderboards.", "me.clear": "Forget", "me.jump": "Show in the table", "coffee": "Buy me a coffee", "coffeeTitle": "Support the project",
    "calc.title": "Where does your time stand?", "calc.sub": "Type a lap time to place yourself — the app does it automatically after each session.",
    "calc.first": "Fastest time", "calc.bottom": "Bottom {pct}%", "calc.top": "Top {pct}%", "calc.of": "out of {n} drivers", "calc.rank": "Position", "calc.gapBest": "Gap to best", "calc.gapMedian": "Gap to median",
    "lb.title": "Leaderboard", "lb.sub": "Best sectors of the leaderboard in purple · anonymity is each driver's choice", "lb.more": "Show more",
    "col.driver": "Driver", "col.car": "Car", "col.time": "Time", "col.gap": "Gap", "col.version": "Version", "col.date": "Date",
    "byCar.title": "By car", "byCar.sub": "From best lap (start of bar) to median (tick) for each model",
    "versions.title": "Game versions", "versions.sub": "Each update and its BoP get their own leaderboard",
    "brakes.title": "Community braking zones", "brakes.soon": "Coming soon", "brakes.text": "Computed from shared laps — never typed in by hand.",
    "share.title": "Share this page", "share.copy": "Copy link", "share.copied": "Link copied",
    "dry": "Dry", "wet": "Wet", "aidsClean": "No braking aid", "aidsAll": "All aids",
    "versions.all": "All", "find.ph": "Find a driver in this leaderboard…", "find.none": "No driver by that name on this combo.", "find.matches": "Results: {n}", "search.ph": "Search a driver…", "search.none": "No driver found", "search.combos": "{n} combos", "profile.kicker": "Driver profile", "profile.sub": "Their best lap and position on each combo (all versions)", "profile.none": "Driver not found (they may be anonymous).", "provisional.short": "provisional ({n}/20)", "col.track": "Track", "col.class": "Class", "col.rank": "Position", "col.top": "Top", "noOutline": "Track outline coming soon",
    "f.circuit": "Track", "f.layout": "Layout", "f.class": "Class", "f.car": "Car", "f.session": "Session", "f.mode": "Mode", "f.version": "Version", "f.conditions": "Conditions", "f.aids": "Aids", "f.all": "All", "f.allF": "All", "f.race": "Race", "f.qualify": "Qualifying", "f.practice": "Practice", "f.online": "Online", "f.offline": "Offline", "f.latest": "Latest", "f.several": "Several",
    "anon": "Driver {tag}", "notFound": "No lap has been shared on this combo yet.", "back": "Back to tracks", "latest": "current",
  },
  es: {
    "home.title": "Clasificaciones de la comunidad", "home.lead": "Las mejores vueltas de los pilotos de LMU Stats Viewer, por circuito y por clase. Haz clic en un tiempo para abrir la clasificación completa.", "home.trust": "Tiempos leídos de los archivos del juego: nada se introduce a mano.",
    "home.me": "Mi ficha de piloto", "home.board": "Todas las clasificaciones", "home.count": "{n} clasificaciones", "home.count1": "1 clasificación",
    "view.grid": "Por circuito", "view.list": "Lista", "sort.popular": "Más rodados", "sort.az": "A → Z",
    "mx.legend": "Participación: número de pilotos, comparado con la clasificación más rodada de la misma clase. Una clasificación es provisional mientras tenga menos de 20 pilotos.", "col.recordCar": "Coche del récord", "col.pop": "Participación", "home.pending": "Provisional: {n} / 20 pilotos", "home.open": "Clasificación",
    "nav.tracks": "Circuitos", "nav.how": "Contribuir", "nav.app": "La app", "nav.share": "Compartir mis vueltas",
    "stat.drivers": "Pilotos", "stat.sessions": "Sesiones compartidas", "stat.layouts": "Circuitos y trazados", "stat.ranked": "Combos clasificados",
    "stat.week": "+{n} esta semana", "stat.rankedSub": "20 pilotos o más", "stat.live": "Actualizado en directo",
    "drivers": "pilotos", "driver1": "piloto",
    "search": "Buscar un circuito…", "noResult": "Ningún circuito coincide.", "f.reset": "Restablecer filtros",
    "how.kicker": "Contribuir", "how.title": "Cuatro pasos, y tú decides",
    "how.0t": "Instala la app", "how.0d": "LMU Stats Viewer, para Windows 10 y 11. Lee tus resultados directamente de los archivos del juego: nada que introducir.", "how.0cta": "Descargar la app",
    "how.1t": "Activa el uso compartido", "how.1d": "En la app, Configuración → Comunidad. Ves exactamente lo que se envía antes de confirmar.",
    "how.2t": "Rueda", "how.2d": "Tras cada sesión, tu mejor vuelta válida se envía sola. Nunca las de los demás pilotos.",
    "how.3t": "Compara", "how.3d": "Tu posición en cada combo, en la app y aquí, por clase, coche y versión.",
    "privacy": "Nada sale sin tu consentimiento. Apareces con tu nombre de piloto de LMU o permaneces anónimo, tú eliges. Un clic en la app borra todos tus datos del servidor.",
    "empty.title": "Las clasificaciones se abren", "empty.text": "Todavía no hay vueltas compartidas. Instala la app y activa el uso compartido para estar entre los primeros.",
    "offline": "El servicio no responde por ahora. Inténtalo de nuevo en unos minutos.",
    "maint.title": "Actualización en curso", "maint.text": "El sitio puede no estar disponible durante unos instantes. Las vueltas compartidas desde la app se conservan y se reenvían automáticamente.", "footer.tagline": "Hecho para la comunidad de Le Mans Ultimate.", "footer.app": "La aplicación", "footer.privacy": "Privacidad",
    "footer.legal": "LMU Stats Viewer no está afiliado a Studio 397 ni a Le Mans Ultimate.",
    "crumbs": "Clasificaciones", "provisional": "Clasificación provisional: {n} / 20 pilotos. Las cifras se estabilizan con más vueltas compartidas.",
    "kpi.drivers": "Pilotos", "kpi.best": "Mejor vuelta", "kpi.p10": "Top 10 %", "kpi.median": "Mediana", "kpi.laps": "Vueltas válidas",
    "hist.title": "Dónde están los pilotos", "hist.sub": "Cada barra cuenta los pilotos cuya mejor vuelta cae en esa franja de 0,5 s. A la izquierda los más rápidos, a la derecha los más lentos.", "hist.fast": "← más rápido", "hist.slow": "más lento →", "hist.axisY": "pilotos", "hist.top10": "Top 10 %", "hist.median": "Mediana", "hist.p90": "90 %", "hist.bar": "{n} piloto(s) entre {a} y {b}", "hist.you": "Tú", "me.btn": "Mi posición", "me.title": "Tu posición", "me.none": "Aún no tienes tiempo en este combo con estos filtros.", "me.unknown": "Abre esta clasificación desde la app (Clasificaciones → Ver en el sitio), o pulsa «Soy yo» en tu ficha de piloto.", "me.set": "Soy yo", "me.pickPh": "Tu nombre de piloto LMU…", "me.pickNone": "Ningún piloto con ese nombre en esta clasificación (un piloto anónimo no se puede buscar por nombre).", "me.saved": "Guardado: tu fila quedará fijada arriba de las clasificaciones.", "me.clear": "Olvidar", "me.jump": "Ver en la tabla", "coffee": "Invítame a un café", "coffeeTitle": "Apoyar el proyecto",
    "calc.title": "¿Dónde queda tu tiempo?", "calc.sub": "Escribe un tiempo para situarte — la app lo hace sola tras cada sesión.",
    "calc.first": "Mejor tiempo", "calc.bottom": "Últimos {pct} %", "calc.top": "Top {pct} %", "calc.of": "de {n} pilotos", "calc.rank": "Posición", "calc.gapBest": "Diferencia con el mejor", "calc.gapMedian": "Diferencia con la mediana",
    "lb.title": "Clasificación", "lb.sub": "Mejores sectores de la clasificación en violeta · anonimato a elección de cada piloto", "lb.more": "Ver más",
    "col.driver": "Piloto", "col.car": "Coche", "col.time": "Tiempo", "col.gap": "Diferencia", "col.version": "Versión", "col.date": "Fecha",
    "byCar.title": "Por coche", "byCar.sub": "De la mejor vuelta (inicio de la barra) a la mediana (marca) de cada modelo",
    "versions.title": "Versiones del juego", "versions.sub": "Cada actualización y su BoP tienen su propia clasificación",
    "brakes.title": "Zonas de frenada de la comunidad", "brakes.soon": "Próximamente", "brakes.text": "Calculadas a partir de las vueltas compartidas, nunca introducidas a mano.",
    "share.title": "Compartir esta página", "share.copy": "Copiar el enlace", "share.copied": "Enlace copiado",
    "dry": "Seco", "wet": "Lluvia", "aidsClean": "Sin ayuda de frenada", "aidsAll": "Todas las ayudas",
    "versions.all": "Todas", "find.ph": "Buscar un piloto en esta clasificación…", "find.none": "Ningún piloto con ese nombre en este combo.", "find.matches": "Resultados: {n}", "search.ph": "Buscar un piloto…", "search.none": "Ningún piloto encontrado", "search.combos": "{n} combos", "profile.kicker": "Ficha del piloto", "profile.sub": "Su mejor vuelta y su posición en cada combo (todas las versiones)", "profile.none": "Piloto no encontrado (quizá sea anónimo).", "provisional.short": "provisional ({n}/20)", "col.track": "Circuito", "col.class": "Clase", "col.rank": "Posición", "col.top": "Top", "noOutline": "Trazado disponible pronto",
    "f.circuit": "Circuito", "f.layout": "Trazado", "f.class": "Clase", "f.car": "Coche", "f.session": "Sesión", "f.mode": "Modo", "f.version": "Versión", "f.conditions": "Condiciones", "f.aids": "Ayudas", "f.all": "Todos", "f.allF": "Todas", "f.race": "Carrera", "f.qualify": "Clasificación", "f.practice": "Libres", "f.online": "En línea", "f.offline": "Sin conexión", "f.latest": "Última", "f.several": "Varias",
    "anon": "Piloto {tag}", "notFound": "Nadie ha compartido todavía una vuelta en este combo.", "back": "Volver a los circuitos", "latest": "actual",
  },
  de: {
    "home.title": "Community-Ranglisten", "home.lead": "Die besten Runden der LMU-Stats-Viewer-Fahrer, nach Strecke und Klasse. Klicke auf eine Zeit, um die ganze Rangliste zu öffnen.", "home.trust": "Rundenzeiten aus den Dateien des Spiels: nichts wird von Hand eingetragen.",
    "home.me": "Meine Fahrerseite", "home.board": "Alle Ranglisten", "home.count": "{n} Ranglisten", "home.count1": "1 Rangliste",
    "view.grid": "Nach Strecke", "view.list": "Liste", "sort.popular": "Meistgefahren", "sort.az": "A → Z",
    "mx.legend": "Beteiligung: Anzahl der Fahrer, verglichen mit der meistgefahrenen Rangliste derselben Klasse. Eine Rangliste bleibt vorläufig, bis sie 20 Fahrer hat.", "col.recordCar": "Rekordauto", "col.pop": "Beteiligung", "home.pending": "Vorläufig: {n} / 20 Fahrer", "home.open": "Rangliste",
    "nav.tracks": "Strecken", "nav.how": "Mitmachen", "nav.app": "Die App", "nav.share": "Meine Runden teilen",
    "stat.drivers": "Fahrer", "stat.sessions": "Geteilte Sessions", "stat.layouts": "Strecken und Varianten", "stat.ranked": "Gewertete Kombos",
    "stat.week": "+{n} diese Woche", "stat.rankedSub": "ab 20 Fahrern", "stat.live": "Live aktualisiert",
    "drivers": "Fahrer", "driver1": "Fahrer",
    "search": "Strecke suchen…", "noResult": "Keine Strecke gefunden.", "f.reset": "Filter zurücksetzen",
    "how.kicker": "Mitmachen", "how.title": "Vier Schritte, und du entscheidest",
    "how.0t": "Installiere die App", "how.0d": "LMU Stats Viewer, für Windows 10 und 11. Die App liest deine Ergebnisse direkt aus den Dateien des Spiels: nichts einzutippen.", "how.0cta": "App herunterladen",
    "how.1t": "Teilen aktivieren", "how.1d": "In der App unter Einstellungen → Community. Du siehst genau, was gesendet wird, bevor du bestätigst.",
    "how.2t": "Fahren", "how.2d": "Nach jeder Session wird deine beste gültige Runde automatisch gesendet. Nie die Runden anderer Fahrer.",
    "how.3t": "Vergleichen", "how.3d": "Deine Position auf jeder Kombo, in der App und hier, nach Klasse, Auto und Version.",
    "privacy": "Ohne deine Zustimmung wird nichts gesendet. Du erscheinst mit deinem LMU-Fahrernamen oder bleibst anonym, ganz wie du willst. Ein Klick in der App löscht alle deine Daten vom Server.",
    "empty.title": "Die Ranglisten öffnen", "empty.text": "Noch keine geteilten Runden. Installiere die App und aktiviere das Teilen, um zu den Ersten zu gehören.",
    "offline": "Der Dienst antwortet gerade nicht. Bitte versuche es in ein paar Minuten erneut.",
    "maint.title": "Aktualisierung läuft", "maint.text": "Die Website ist möglicherweise kurz nicht erreichbar. Aus der App geteilte Runden bleiben erhalten und werden automatisch erneut gesendet.", "footer.tagline": "Gemacht für die Le-Mans-Ultimate-Community.", "footer.app": "Die App", "footer.privacy": "Datenschutz",
    "footer.legal": "LMU Stats Viewer ist nicht mit Studio 397 oder Le Mans Ultimate verbunden.",
    "crumbs": "Ranglisten", "provisional": "Vorläufige Wertung: {n} / 20 Fahrer. Die Werte stabilisieren sich mit weiteren geteilten Runden.",
    "kpi.drivers": "Fahrer", "kpi.best": "Beste Runde", "kpi.p10": "Top 10 %", "kpi.median": "Median", "kpi.laps": "Gültige Runden",
    "hist.title": "Wo die Fahrer stehen", "hist.sub": "Jeder Balken zählt die Fahrer, deren beste Runde in diesem 0,5-s-Bereich liegt. Links die Schnellsten, rechts die Langsamsten.", "hist.fast": "← schneller", "hist.slow": "langsamer →", "hist.axisY": "Fahrer", "hist.top10": "Top 10 %", "hist.median": "Median", "hist.p90": "90 %", "hist.bar": "{n} Fahrer zwischen {a} und {b}", "hist.you": "Du", "me.btn": "Meine Position", "me.title": "Deine Position", "me.none": "Du hast mit diesen Filtern noch keine Zeit auf dieser Kombination.", "me.unknown": "Öffne diese Rangliste aus der App (Ranglisten → Auf der Website ansehen) oder klicke auf deinem Fahrerprofil auf „Das bin ich“.", "me.set": "Das bin ich", "me.pickPh": "Dein LMU-Fahrername…", "me.pickNone": "Kein Fahrer mit diesem Namen in dieser Rangliste (anonyme Fahrer sind nicht per Name auffindbar).", "me.saved": "Gespeichert: deine Zeile wird oben in den Ranglisten angeheftet.", "me.clear": "Vergessen", "me.jump": "In der Tabelle zeigen", "coffee": "Spendier mir einen Kaffee", "coffeeTitle": "Das Projekt unterstützen",
    "calc.title": "Wo liegt deine Zeit?", "calc.sub": "Gib eine Rundenzeit ein, um dich einzuordnen — die App macht das nach jeder Session automatisch.",
    "calc.first": "Bestzeit", "calc.bottom": "Letzte {pct} %", "calc.top": "Top {pct} %", "calc.of": "von {n} Fahrern", "calc.rank": "Position", "calc.gapBest": "Abstand zur Bestzeit", "calc.gapMedian": "Abstand zum Median",
    "lb.title": "Rangliste", "lb.sub": "Beste Sektoren der Rangliste in Violett · Anonymität nach Wahl jedes Fahrers", "lb.more": "Mehr anzeigen",
    "col.driver": "Fahrer", "col.car": "Auto", "col.time": "Zeit", "col.gap": "Abstand", "col.version": "Version", "col.date": "Datum",
    "byCar.title": "Nach Auto", "byCar.sub": "Von der besten Runde (Balkenanfang) bis zum Median (Strich) jedes Modells",
    "versions.title": "Spielversionen", "versions.sub": "Jedes Update und seine BoP haben eine eigene Rangliste",
    "brakes.title": "Bremszonen der Community", "brakes.soon": "Demnächst", "brakes.text": "Aus geteilten Runden berechnet — nie von Hand eingetragen.",
    "share.title": "Diese Seite teilen", "share.copy": "Link kopieren", "share.copied": "Link kopiert",
    "dry": "Trocken", "wet": "Regen", "aidsClean": "Ohne Bremshilfe", "aidsAll": "Alle Hilfen",
    "versions.all": "Alle", "find.ph": "Fahrer in dieser Rangliste finden…", "find.none": "Kein Fahrer mit diesem Namen auf dieser Kombo.", "find.matches": "Treffer: {n}", "search.ph": "Fahrer suchen…", "search.none": "Kein Fahrer gefunden", "search.combos": "{n} Kombos", "profile.kicker": "Fahrerprofil", "profile.sub": "Seine beste Runde und Position auf jeder Kombo (alle Versionen)", "profile.none": "Fahrer nicht gefunden (vielleicht anonym).", "provisional.short": "vorläufig ({n}/20)", "col.track": "Strecke", "col.class": "Klasse", "col.rank": "Position", "col.top": "Top", "noOutline": "Streckenverlauf folgt bald",
    "f.circuit": "Strecke", "f.layout": "Variante", "f.class": "Klasse", "f.car": "Auto", "f.session": "Session", "f.mode": "Modus", "f.version": "Version", "f.conditions": "Bedingungen", "f.aids": "Hilfen", "f.all": "Alle", "f.allF": "Alle", "f.race": "Rennen", "f.qualify": "Qualifying", "f.practice": "Training", "f.online": "Online", "f.offline": "Offline", "f.latest": "Neueste", "f.several": "Mehrere",
    "anon": "Fahrer {tag}", "notFound": "Auf dieser Kombo wurde noch keine Runde geteilt.", "back": "Zurück zu den Strecken", "latest": "aktuell",
  },
};

const LANGS = ["fr", "en", "es", "de"];
let LANG = localStorage.getItem("lmu-lang") || (navigator.language || "fr").slice(0, 2);
if (!LANGS.includes(LANG)) LANG = "en";

function t(key, vars = {}) {
  const s = (I18N[LANG] && I18N[LANG][key]) || I18N.en[key] || key;
  return s.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? ""));
}

/** Échappement HTML : obligatoire pour tout ce qui vient de l'API (noms de pilotes…). */
function esc(v) {
  return String(v ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function fmtTime(s) {
  if (s == null || !isFinite(s)) return "—";
  const ms = Math.round(s * 1000);
  const m = Math.floor(ms / 60000);
  return `${m}:${((ms % 60000) / 1000).toFixed(3).padStart(6, "0")}`;
}
const fmtNum = (n) => Number(n ?? 0).toLocaleString(LANG);
const fmtDate = (iso) => {
  if (!iso) return "";
  const d = new Date(iso + "T12:00:00Z");
  return d.toLocaleDateString(LANG, { day: "2-digit", month: "2-digit" });
};

async function api(route, query = {}) {
  const qs = new URLSearchParams(Object.entries(query).filter(([, v]) => v != null && v !== "")).toString();
  const res = await fetch(`/api/v1/${route}${qs ? "?" + qs : ""}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ── Données partagées avec l'app : drapeaux (circuits.json) et visuels (cars.json) ──
let FLAGS = [];
let CARS = [];
let BRANDS = [];
const dataReady = Promise.all([
  fetch("/data/circuits.json?v=3").then((r) => r.json()).then((d) => { FLAGS = Object.entries(d.flags || {}); }).catch(() => {}),
  fetch("/data/cars.json?v=4").then((r) => r.json()).then((d) => { CARS = d.cars || []; BRANDS = Object.entries(d.brands || {}); }).catch(() => {}),
]);
const slugify = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
function flagUrl(track) {
  const lower = (track || "").toLowerCase();
  const hit = FLAGS.find(([k]) => lower.includes(k));
  return hit ? `/flags/${hit[1]}.png` : null;
}
function carUrl(car) {
  const lower = (car || "").toLowerCase();
  const hit = CARS.find((c) => (c.keywords || []).some((k) => lower.includes(k.toLowerCase())));
  return `/cars/${slugify(hit ? hit.modelName : car)}.png`;
}
const flagImg = (track) => { const u = flagUrl(track); return u ? `<img class="flag-img" src="${u}" alt="">` : ""; };
/**
 * Logo de la marque (même table que l'app : `brands` de cars.json). Pas de photo de la
 * voiture : la livrée affichée ne serait pas celle avec laquelle le pilote a roulé.
 */
function brandUrl(car) {
  const lower = (car || "").toLowerCase().replace(/[\s_-]/g, "");
  const hit = BRANDS.find(([k]) => lower.includes(k.replace(/[\s_-]/g, "")));
  return hit ? `/logos/${hit[1]}` : null;
}
const carImg = (car) => {
  const u = brandUrl(car);
  return u ? `<img class="brand-img" src="${esc(u)}" alt="" loading="lazy">` : `<span class="brand-img"></span>`;
};
// Visuel absent : on masque l'image (pas de gestionnaire en ligne, interdit par la CSP).
document.addEventListener("error", (e) => {
  if (e.target instanceof HTMLImageElement) e.target.style.visibility = "hidden";
}, true);

/** Badge de classe (couleurs de l'app). */
/** Famille de classe (couleurs) : hyper, lmp2, lmp3, gt3, gte. */
const classKey = (c) => (/hyper|lmh|lmdh/i.test(c) ? "hyper" : /p2/i.test(c) ? "lmp2" : /p3/i.test(c) ? "lmp3" : /gt3/i.test(c) ? "gt3" : "gte");
function classBadge(c) {
  const k = classKey(c);
  return `<span class="cls cls-${k}">${esc(c.toUpperCase())}</span>`;
}

/** Contour du TRACÉ exact (clé = `track_course`) ; "" s'il n'est pas connu. */
function trackSvg(course, pad = 6) {
  const d = typeof TRACK_PATHS !== "undefined" ? TRACK_PATHS[course] : null;
  if (!d) return "";
  const first = d.match(/M([\d.]+) ([\d.]+)/);
  return `<svg viewBox="${-pad} ${-pad} ${200 + 2 * pad} ${200 + 2 * pad}" aria-hidden="true"><path class="track-glow" d="${d}"/><path class="track-line" d="${d}"/>${first ? `<circle class="track-sf" cx="${first[1]}" cy="${first[2]}" r="5"/>` : ""}</svg>`;
}

/** Visuel de remplacement quand le tracé n'est pas encore connu : grand drapeau. */
function mapFallback(track) {
  const u = flagUrl(track);
  return `<div class="map-fallback">${u ? `<img src="${u}" alt="">` : ""}<span>${esc(t("noOutline"))}</span></div>`;
}

const driverName = (d) => (d.name ? esc(d.name) + (d.homonym ? ` <span class="muted">· ${esc(d.tag)}</span>` : "") : `<span class="anon">${esc(t("anon", { tag: d.tag }))}</span>`);

// ── En-tête / pied de page ─────────────────────────────────────────────────
const COFFEE_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 2v2M14 2v2M16 8a1 1 0 0 1 1 1v8a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V9a1 1 0 0 1 1-1h14a4 4 0 1 1 0 8h-1M6 2v2"/></svg>';

/** « Moi » sur le site : repère public (#xxxx) retenu dans ce navigateur (lien depuis l'app ou « C'est moi »). */
function getMe() {
  const params = new URLSearchParams(location.search);
  const fromUrl = params.get("me");
  if (fromUrl && /^#[0-9a-f]{4}$/.test(fromUrl)) localStorage.setItem("lmu-me", fromUrl);
  if (params.has("me")) {
    // Mémorisé : on le retire de l'adresse, pour ne pas le transmettre en partageant le lien.
    params.delete("me");
    const qs = params.toString();
    history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash);
  }
  return localStorage.getItem("lmu-me") || "";
}
function setMe(tag) {
  if (tag) localStorage.setItem("lmu-me", tag);
  else localStorage.removeItem("lmu-me");
}

function chrome() {
  // Repère transmis par l'app (`?me=`) : mémorisé quelle que soit la page d'arrivée.
  getMe();
  const theme = localStorage.getItem("lmu-theme") || "light";
  document.documentElement.dataset.theme = theme;
  document.documentElement.lang = LANG;
  const header = document.querySelector("header.site-header");
  header.innerHTML = `
    <div class="wrap header-inner">
      <a class="brand" href="/"><img class="brand-logo" src="/assets/icon-32.png?v=1" alt=""><span>LMU Stats Viewer <span class="brand-sub">${esc(t("crumbs"))}</span></span></a>
      <nav class="nav"><a href="/#tracks">${t("nav.tracks")}</a><a href="/#how">${t("nav.how")}</a></nav>
      <div class="header-actions">
        <div class="dsearch"><input class="search" id="driverSearch" placeholder="${esc(t("search.ph"))}" autocomplete="off"><div class="dsearch-list" id="driverResults" hidden></div></div>
        <select class="lang-select" aria-label="Langue">${LANGS.map((l) => `<option value="${l}" ${l === LANG ? "selected" : ""}>${l.toUpperCase()}</option>`).join("")}</select>
        <button class="icon-btn" id="themeBtn" aria-label="Thème">
          <svg class="i-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <svg class="i-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        </button>
        <a class="btn btn-ghost btn-sm" href="https://lmustatsviewer.cparfait.ovh/">${t("nav.app")}</a>
        <a class="btn btn-sm btn-coffee" href="https://buymeacoffee.com/cristof" target="_blank" rel="noopener noreferrer" title="${esc(t("coffeeTitle"))}">${COFFEE_SVG}<span>${esc(t("coffee"))}</span></a>
      </div>
    </div>`;
  header.querySelector("#themeBtn").addEventListener("click", () => {
    const next = document.documentElement.dataset.theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    localStorage.setItem("lmu-theme", next);
  });
  // Recherche de pilote (les anonymes ne sont jamais trouvables).
  const input = header.querySelector("#driverSearch");
  const list = header.querySelector("#driverResults");
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      const res = await api("drivers", { q }).catch(() => null);
      const drivers = res?.drivers ?? [];
      list.innerHTML = drivers.length
        ? drivers.map((d) => `<a href="/pilote.html?tag=${encodeURIComponent(d.tag)}"><b>${esc(d.name)}</b>${d.homonym ? ` <span class="muted">${esc(d.tag)}</span>` : ""}<span class="muted">${esc(t("search.combos", { n: d.combos }))}</span></a>`).join("")
        : `<span class="muted">${esc(t("search.none"))}</span>`;
      list.hidden = false;
    }, 250);
  });
  document.addEventListener("click", (e) => { if (!e.target.closest(".dsearch")) list.hidden = true; });
  header.querySelector(".lang-select").addEventListener("change", (e) => {
    localStorage.setItem("lmu-lang", e.target.value);
    location.reload();
  });
  document.querySelector("footer.site-footer").innerHTML = `
    <div class="wrap footer-inner">
      <div><strong>LMU Stats Viewer</strong> — ${t("footer.tagline")}<br><span style="font-size:.8rem">${t("footer.legal")}</span></div>
      <nav class="footer-links">
        <a href="https://lmustatsviewer.cparfait.ovh/">${t("footer.app")}</a>
        <a href="https://github.com/cparfait/lmustatsviewer">GitHub</a>
        <a href="https://discord.gg/G9ng9GdvSU">Discord</a>
        <a class="btn btn-sm btn-coffee" href="https://buymeacoffee.com/cristof" target="_blank" rel="noopener noreferrer">${COFFEE_SVG}<span>${esc(t("coffee"))}</span></a>
      </nav>
    </div>`;
  document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  watchMaintenance();
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}

// ── Barre de filtres (même présentation que l'app : icône + libellé + liste) ──
const FILTER_ICONS = {
  track: '<path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><path d="M4 22v-7"/>',
  course: '<circle cx="6" cy="19" r="3"/><path d="M9 19h8.5a3.5 3.5 0 0 0 0-7h-11a3.5 3.5 0 0 1 0-7H15"/><circle cx="18" cy="5" r="3"/>',
  class: '<path d="M12.6 2.6 21.4 11.4a2 2 0 0 1 0 2.8l-7.2 7.2a2 2 0 0 1-2.8 0L2.6 12.6A2 2 0 0 1 2 11.2V4a2 2 0 0 1 2-2h7.2a2 2 0 0 1 1.4.6Z"/><circle cx="7.5" cy="7.5" r="1"/>',
  car: '<path d="M19 17h2c.6 0 1-.4 1-1v-3c0-.9-.7-1.7-1.5-1.9L18 10l-2.7-3.4A2 2 0 0 0 13.7 6H6.3a2 2 0 0 0-1.7.9L2.3 10.2A2 2 0 0 0 2 11.3V16c0 .6.4 1 1 1h2"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/>',
  session: '<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2 2M10 2h4"/>',
  mode: '<circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15 15 0 0 1 0 20M12 2a15 15 0 0 0 0 20"/>',
  version: '<path d="m7.5 4.3 9 5.2M21 8 12 3 3 8v8l9 5 9-5Z"/><path d="M3.3 7 12 12l8.7-5M12 22V12"/>',
  conditions: '<path d="M4 14.9A7 7 0 1 1 15.7 8h1.8a4.5 4.5 0 0 1 2.5 8.2"/><path d="M16 14v6M8 14v6M12 16v6"/>',
  aids: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
};

/** defs : [{ key, label, value, options: [[valeur, libellé], …] }] → HTML de la barre. */
function filterBar(defs) {
  return `<div class="fbar">${defs
    .map((d) => d.multi ? multiFilter(d) : `
    <label class="fsel">
      <span class="fsel-k"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FILTER_ICONS[d.key] || ""}</svg>${esc(d.label)}</span>
      <select data-key="${esc(d.key)}">${d.options
        .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(d.value) ? "selected" : ""}>${esc(l)}</option>`)
        .join("")}</select>
    </label>`,
    )
    .join("")}</div>`;
}
/** Filtre à choix multiple : `d.multi = { all: [valeur, libellé], items: [[valeur, libellé]], selected: [...] | "all" }`. */
function multiFilter(d) {
  const m = d.multi;
  const isAll = m.selected === "all" || (Array.isArray(m.selected) && m.items.length > 0 && m.items.every(([v]) => m.selected.includes(v)));
  const label = isAll ? m.all[1] : m.items.filter(([v]) => m.selected.includes(v)).map(([, l, short]) => short ?? l).join(" + ") || m.empty || m.all[1];
  return `
    <div class="fsel fmulti" data-key="${esc(d.key)}">
      <span class="fsel-k"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FILTER_ICONS[d.key] || ""}</svg>${esc(d.label)}</span>
      <button type="button" class="fmulti-btn">${esc(label)}</button>
      <div class="fmulti-list" hidden>
        <label><input type="checkbox" value="__all" ${isAll ? "checked" : ""}> <b>${esc(m.all[1])}</b></label>
        ${m.items.map(([v, l]) => `<label><input type="checkbox" value="${esc(v)}" ${isAll || m.selected.includes(v) ? "checked" : ""}> ${esc(l)}</label>`).join("")}
      </div>
    </div>`;
}
function bindFilterBar(root, onChange) {
  root.querySelectorAll(".fsel select").forEach((sel) => sel.addEventListener("change", () => onChange(sel.dataset.key, sel.value)));
  root.querySelectorAll(".fmulti").forEach((box) => {
    const list = box.querySelector(".fmulti-list");
    box.querySelector(".fmulti-btn").addEventListener("click", () => { list.hidden = !list.hidden; });
    document.addEventListener("click", (e) => { if (!box.contains(e.target)) list.hidden = true; });
    list.addEventListener("change", (e) => {
      const boxes = [...list.querySelectorAll("input:not([value=__all])")];
      if (e.target.value === "__all") boxes.forEach((b) => { b.checked = e.target.checked; });
      const on = boxes.filter((b) => b.checked).map((b) => b.value);
      onChange(box.dataset.key, on.length === boxes.length ? "all" : on);
    });
  });
}

/** « Top X % » (moitié haute, vert) ou « Derniers X % » (moitié basse, orange). */
function standing(topPct, rank, n) {
  if (rank === 1) return { label: t("calc.first"), cls: "st-top" };
  if (topPct <= 50) return { label: t("calc.top", { pct: topPct }), cls: "st-top" };
  const bottom = rank && n ? Math.max(1, Math.ceil(((n - rank + 1) / n) * 100)) : Math.max(1, 101 - topPct);
  return { label: t("calc.bottom", { pct: bottom }), cls: "st-bottom" };
}

/**
 * Bandeau « mise à jour en cours » : état lu sur /api/v1/status au chargement puis
 * toutes les 30 s. Pendant le redémarrage de l'API (quelques secondes), la requête
 * échoue : le bandeau déjà affiché reste en place.
 */
function watchMaintenance() {
  const bar = document.createElement("div");
  bar.className = "maint";
  bar.setAttribute("role", "status");
  bar.hidden = true;
  bar.innerHTML = `<span class="maint-dot"></span><b>${esc(t("maint.title"))}</b><span>${esc(t("maint.text"))}</span>`;
  document.querySelector("header.site-header").prepend(bar);
  const check = async () => {
    try {
      const res = await fetch("/api/v1/status", { cache: "no-store" });
      if (!res.ok) return;
      const s = await res.json();
      bar.hidden = !s.maintenance;
      if (s.maintenance?.message) bar.querySelector("span:last-child").textContent = s.maintenance.message;
    } catch {
      /* API en redémarrage : on garde l'état affiché */
    }
  };
  check();
  setInterval(check, 30_000);
}

/** « 1 pilote » / « 12 pilotes » (libellé seul, sans le nombre). */
const driversWord = (n) => t(n === 1 ? "driver1" : "drivers");
