// Site lmu.cparfait.ovh (vitrine + classements) — socle commun (i18n, thème, en-tête, API, rendu).
// Toute donnée venant des joueurs passe par esc() avant d'entrer dans le DOM.
/* global TRACK_PATHS */
"use strict";

const I18N = {
  fr: {
    "home.title": "Classements communautaires", "home.lead": "Les meilleurs tours des pilotes LMU Stats Viewer, par circuit et par classe. Cliquez sur un temps pour ouvrir le classement complet.", "home.trust": "Chronos lus dans les fichiers du jeu : rien n'est saisi à la main.",
    "home.me": "Ma fiche pilote", "home.board": "Tous les classements", "home.count": "{n} classements", "home.count1": "1 classement",
    "view.grid": "Par circuit", "view.list": "Liste", "sort.popular": "Plus roulés", "sort.az": "A → Z",
    "mx.legend": "Fréquentation : nombre de pilotes, comparé au classement le plus roulé de la même classe. Un classement est provisoire tant qu'il compte moins de 20 pilotes.", "col.recordCar": "Voiture", "col.recordDriver": "Pilote du record", "col.pop": "Fréquentation", "home.pending": "Provisoire : {n} / 20 pilotes", "home.open": "Classement",
    "nav.share": "Partager mes tours",
    "stat.drivers": "Pilotes", "stat.sessions": "Sessions partagées", "stat.layouts": "Circuits et tracés", "stat.ranked": "Classements",
    "stat.week": "+{n} cette semaine", "stat.rankedSub": "dont {n} à 20 pilotes ou plus", "stat.live": "Mis à jour en direct",
    "drivers": "pilotes", "driver1": "pilote",
    "search": "Rechercher un circuit…", "noResult": "Aucun circuit ne correspond.", "f.reset": "Réinitialiser les filtres",
    "how.kicker": "Contribuer", "how.title": "Quatre étapes, et c'est vous qui décidez",
    "how.0t": "Installez l'app", "how.0d": "LMU Stats Viewer, pour Windows 10 et 11. Il lit vos résultats directement dans les fichiers du jeu : rien à saisir.", "how.0cta": "Télécharger l'app",
    "how.1t": "Activez le partage", "how.1d": "Dans l'app, Configuration → Communauté. Vous voyez exactement ce qui part avant de valider.",
    "how.2t": "Roulez", "how.2d": "Après chaque session, votre meilleur tour valide part tout seul. Jamais ceux des autres pilotes.",
    "how.3t": "Comparez", "how.3d": "Votre position sur chaque combo, dans l'app et ici, par classe, par voiture et par version.",
    "privacy": "Rien ne part sans votre accord. Vous apparaissez sous votre nom de pilote LMU, avec votre pays et votre avatar Steam, ou restez anonyme, au choix. Un clic dans l'app efface toutes vos données du serveur.",
    "empty.title": "Les classements s'ouvrent", "empty.text": "Aucun tour partagé pour l'instant. Installez l'app et activez le partage pour être parmi les premiers.",
    "offline": "Le service ne répond pas pour l'instant. Réessayez dans quelques minutes.",
    "maint.title": "Mise à jour en cours", "maint.text": "Le site peut être indisponible quelques instants. Les tours partagés depuis l'app sont conservés et renvoyés automatiquement.", "footer.tagline": "Fait pour la communauté Le Mans Ultimate.", 
    "footer.legal": "Licence MIT · LMU Stats Viewer n'est pas affilié à Studio 397 ni à Le Mans Ultimate. Les temps de référence proviennent d'OhneSpeed, affichés avec crédit.",
    "crumbs": "Classements", "provisional": "Classement provisoire : {n} / 20 pilotes. Les chiffres se stabilisent avec les partages.",
    "kpi.drivers": "Pilotes", "kpi.best": "Meilleur tour", "kpi.p10": "Top 10 %", "kpi.median": "Médiane", "kpi.laps": "Tours valides",
    "hist.title": "Où se situent les pilotes", "hist.sub": "Chaque barre compte les pilotes dont le meilleur tour tombe dans cette tranche de 0,5 s. À gauche les plus rapides, à droite les plus lents.", "hist.fast": "← plus rapide", "hist.slow": "plus lent →", "hist.axisY": "pilotes", "hist.top10": "Top 10 %", "hist.median": "Médiane", "hist.p90": "90 %", "hist.bar": "{n} pilote(s) entre {a} et {b}", "hist.you": "Vous", "me.btn": "Ma position", "me.title": "Votre position", "me.none": "Vous n'avez pas encore de temps sur ce combo avec ces filtres.", "me.unknown": "Ouvrez ce classement depuis l'app (Classements → Voir sur le site), ou cliquez « C'est moi » sur votre fiche pilote.", "me.set": "C'est moi", "me.pickPh": "Votre nom de pilote LMU…", "me.pickNone": "Aucun pilote de ce nom sur ce classement (un pilote anonyme n'est pas trouvable par son nom).", "me.saved": "Enregistré : votre ligne sera épinglée en haut des classements.", "me.clear": "Oublier", "me.jump": "Voir ma position", "me.where": "Où vous êtes", "coffee": "Offrir un café",
    "calc.title": "Où se situe votre temps ?", "calc.sub": "Tapez un chrono pour vous placer — l'app le fait toute seule après chaque session.",
    "calc.first": "Meilleur temps", "calc.last": "Dernier", "calc.nth": "{n}ᵉ", "calc.bottom": "Derniers {pct} %", "calc.top": "Top {pct} %", "calc.of": "sur {n} pilotes", "calc.rank": "Position", "calc.gapBest": "Écart au meilleur", "calc.gapMedian": "Écart à la médiane",
    "lg.title": "Comprendre les couleurs", "lg.record": "record du classement", "lg.prov": "record provisoire (moins de 20 pilotes)", "lg.best": "secteur le plus rapide de tous les pilotes", "lg.pop": "fréquentation, à la couleur de la classe (comparée au classement le plus roulé de la classe)", "lg.pend": "en attente de 20 pilotes", "lb.title": "Classement", "lb.sub": "Meilleurs secteurs du classement en violet · anonymat au choix de chaque pilote", "lb.more": "Afficher plus",
    "col.driver": "Pilote", "col.car": "Voiture", "col.time": "Temps", "col.gap": "Écart", "col.version": "Version", "col.date": "Date",
    "byCar.title": "Par voiture", "byCar.sub": "Du meilleur tour (début de barre) à la médiane (trait) de chaque modèle",
    "versions.title": "Versions du jeu", "versions.sub": "Chaque mise à jour et sa BoP ont leur propre classement",
    "brakes.title": "Zones de freinage de la communauté", "brakes.soon": "Bientôt", "brakes.text": "Calculées à partir des tours partagés — jamais saisies à la main.",
    "share.title": "Partager cette page", "share.copy": "Copier le lien", "share.copied": "Lien copié",
    "dry": "Sec", "wet": "Pluie", "aidsClean": "Sans aide au freinage", "aidsAll": "Toutes aides",
    "versions.all": "Toutes", "find.ph": "Trouver un pilote dans ce classement…", "find.none": "Aucun pilote de ce nom sur ce combo.", "find.matches": "Résultats : {n}", "search.ph": "Rechercher un pilote…", "search.none": "Aucun pilote trouvé", "search.combos": "{n} combos", "profile.kicker": "Fiche pilote", "profile.sub": "Son meilleur tour et son rang sur chaque combo (toutes versions)", "profile.none": "Pilote introuvable (il est peut-être anonyme).", "profile.positions": "Ses positions par combo", "profile.k.combos": "Combos roulés", "profile.k.ranked": "Définitifs (20+ pilotes)", "profile.k.records": "Records", "profile.k.podiums": "Podiums", "profile.k.best": "Meilleur classement", "col.where": "Où il se situe", "col.gapFirst": "Écart au 1er", "provisional.short": "provisoire ({n}/20)", "col.track": "Circuit", "col.class": "Classe", "col.rank": "Position", "col.top": "Top",
    "f.toggle": "Filtres", "search.open": "Rechercher un pilote", "f.circuit": "Circuit", "f.layout": "Tracé", "f.class": "Classe", "f.car": "Voiture", "f.session": "Session", "f.mode": "Mode", "f.version": "Version", "f.conditions": "Conditions", "f.aids": "Aides", "f.all": "Tous", "f.allF": "Toutes", "f.allClasses": "Toutes les classes", "home.allClasses": "Classement du circuit, toutes classes", "f.race": "Course", "f.qualify": "Qualif", "f.practice": "Essais", "f.online": "En ligne", "f.offline": "Hors ligne", "f.latest": "Dernière", "f.several": "Plusieurs",
    "anon": "Pilote {tag}", "notFound": "Ce combo n'a encore aucun tour partagé.", "back": "Retour aux circuits", "latest": "actuelle",
    "f.search": "Rechercher…", "inline.notDone": "Vous n'avez pas encore fait ce combo.", "inline.open": "Page du classement", "inline.more": "Voir les {n} pilotes", "col.detail": "Détail", "col.compare": "Comparer", "profile.open": "Voir sa fiche (ses combos, comparés aux vôtres)", "profile.you": "Vous", "profile.vsGap": "Votre écart", "profile.ahead": "Vous êtes devant sur <b>{a} / {n}</b> combos en commun.", "profile.noCommon": "Aucun combo en commun avec vous.", "profile.compare": "Comparer", "cmp.tip": "Comparer avec ce pilote", "cmp.title": "Comparaison de pilotes", "cmp.close": "Fermer", "cmp.gap": "Écart", "cmp.sectors": "Où se fait l'écart", "cmp.detail": "Meilleur tour", "cmp.behind": "{name} perd <b>{gap} s</b> au tour, dont <b>{part} s en {sector}</b>.", "cmp.behindOnly": "{name} perd <b>{gap} s</b> au tour.", "cmp.gains": "En {sector}, c'est l'inverse : <b>{gain} s</b> de mieux.", "cmp.tie": "Même temps au tour.", "cmp.optimal": "Tour idéal (meilleurs secteurs)", "cmp.median": "Rythme médian", "cmp.spread": "Régularité (médian − meilleur)", "cmp.vmax": "Vitesse de pointe", "cmp.tyres": "Pneus", "cmp.session": "Session", "cmp.sessions": "Sessions sur ce combo", "cmp.laps": "Tours valides sur ce combo", "cmp.diffClass": "Classes différentes : écart indicatif.", "cmp.diffVersion": "Versions du jeu différentes ({a} / {b}) : l'équilibrage a pu changer.", "cmp.context": "Contexte", "cmp.alone": "Seul pilote de ce classement : personne à qui se comparer.", "cmp.you": "vous",
    "nav.features": "Fonctionnalités", "nav.community": "Classements", "nav.screenshots": "Captures", "nav.install": "Installation", "nav.faq": "FAQ", "nav.changelog": "Nouveautés", "nav.download": "Télécharger", "footer.soloTip": "Un mot du développeur", "footer.solo": "Un passionné, seul, le soir après le boulot — et pas développeur de métier. Autant dire qu'il reste des bugs : considérez l'application en tour de rodage. Si vous en croisez un, signalez-le, c'est le plus sûr moyen de le voir disparaître.", "footer.noCookie": "Ce site ne dépose aucun cookie et ne collecte aucune donnée personnelle sur ses visiteurs.", "footer.releases": "Versions", "footer.issues": "Signaler un bug",
  },
  en: {
    "home.title": "Community leaderboards", "home.lead": "The best laps of LMU Stats Viewer drivers, by track and class. Click a lap time to open the full leaderboard.", "home.trust": "Times read from the game's own files: nothing is typed in by hand.",
    "home.me": "My driver page", "home.board": "All leaderboards", "home.count": "{n} leaderboards", "home.count1": "1 leaderboard",
    "view.grid": "By track", "view.list": "List", "sort.popular": "Most driven", "sort.az": "A → Z",
    "mx.legend": "Popularity: number of drivers, compared with the most driven leaderboard of the same class. A leaderboard stays provisional until it has 20 drivers.", "col.recordCar": "Car", "col.recordDriver": "Record holder", "col.pop": "Popularity", "home.pending": "Provisional: {n} / 20 drivers", "home.open": "Leaderboard",
    "nav.share": "Share my laps",
    "stat.drivers": "Drivers", "stat.sessions": "Sessions shared", "stat.layouts": "Tracks and layouts", "stat.ranked": "Leaderboards",
    "stat.week": "+{n} this week", "stat.rankedSub": "{n} with 20+ drivers", "stat.live": "Updated live",
    "drivers": "drivers", "driver1": "driver",
    "search": "Search a track…", "noResult": "No track matches.", "f.reset": "Reset filters",
    "how.kicker": "Contribute", "how.title": "Four steps, and you stay in control",
    "how.0t": "Install the app", "how.0d": "LMU Stats Viewer, for Windows 10 and 11. It reads your results straight from the game's files: nothing to type in.", "how.0cta": "Download the app",
    "how.1t": "Turn sharing on", "how.1d": "In the app, Settings → Community. You see exactly what is sent before confirming.",
    "how.2t": "Drive", "how.2d": "After each session, your best valid lap is sent automatically. Never the other drivers' laps.",
    "how.3t": "Compare", "how.3d": "Your position on every combo, in the app and here, by class, car and version.",
    "privacy": "Nothing leaves without your consent. You appear under your LMU driver name, with your country and Steam avatar, or stay anonymous, your choice. One click in the app deletes all your data from the server.",
    "empty.title": "The leaderboards are opening", "empty.text": "No laps shared yet. Install the app and turn sharing on to be among the first.",
    "offline": "The service is not responding right now. Please try again in a few minutes.",
    "maint.title": "Update in progress", "maint.text": "The site may be unavailable for a few moments. Laps shared from the app are kept and sent again automatically.", "footer.tagline": "Made for the Le Mans Ultimate community.", 
    "footer.legal": "MIT licence · LMU Stats Viewer is not affiliated with Studio 397 or Le Mans Ultimate. Reference times come from OhneSpeed and are shown with credit.",
    "crumbs": "Leaderboards", "provisional": "Provisional ranking: {n} / 20 drivers. Figures settle as more laps are shared.",
    "kpi.drivers": "Drivers", "kpi.best": "Best lap", "kpi.p10": "Top 10%", "kpi.median": "Median", "kpi.laps": "Valid laps",
    "hist.title": "Where drivers stand", "hist.sub": "Each bar counts the drivers whose best lap falls in that 0.5 s slice. Fastest on the left, slowest on the right.", "hist.fast": "← faster", "hist.slow": "slower →", "hist.axisY": "drivers", "hist.top10": "Top 10%", "hist.median": "Median", "hist.p90": "90%", "hist.bar": "{n} driver(s) between {a} and {b}", "hist.you": "You", "me.btn": "My position", "me.title": "Your position", "me.none": "You have no time on this combo with these filters yet.", "me.unknown": "Open this leaderboard from the app (Leaderboards → View on the site), or click “This is me” on your driver profile.", "me.set": "This is me", "me.pickPh": "Your LMU driver name…", "me.pickNone": "No driver by that name in this leaderboard (anonymous drivers cannot be found by name).", "me.saved": "Saved: your row will be pinned at the top of leaderboards.", "me.clear": "Forget", "me.jump": "Show my position", "me.where": "Where you stand", "coffee": "Buy me a coffee",
    "calc.title": "Where does your time stand?", "calc.sub": "Type a lap time to place yourself — the app does it automatically after each session.",
    "calc.first": "Fastest time", "calc.last": "Last", "calc.nth": "{n}{sfx}", "calc.bottom": "Bottom {pct}%", "calc.top": "Top {pct}%", "calc.of": "out of {n} drivers", "calc.rank": "Position", "calc.gapBest": "Gap to best", "calc.gapMedian": "Gap to median",
    "lg.title": "What the colours mean", "lg.record": "leaderboard record", "lg.prov": "provisional record (fewer than 20 drivers)", "lg.best": "fastest sector of all drivers", "lg.pop": "popularity, in the class colour (compared with the class's most driven leaderboard)", "lg.pend": "waiting for 20 drivers", "lb.title": "Leaderboard", "lb.sub": "Best sectors of the leaderboard in purple · anonymity is each driver's choice", "lb.more": "Show more",
    "col.driver": "Driver", "col.car": "Car", "col.time": "Time", "col.gap": "Gap", "col.version": "Version", "col.date": "Date",
    "byCar.title": "By car", "byCar.sub": "From best lap (start of bar) to median (tick) for each model",
    "versions.title": "Game versions", "versions.sub": "Each update and its BoP get their own leaderboard",
    "brakes.title": "Community braking zones", "brakes.soon": "Coming soon", "brakes.text": "Computed from shared laps — never typed in by hand.",
    "share.title": "Share this page", "share.copy": "Copy link", "share.copied": "Link copied",
    "dry": "Dry", "wet": "Wet", "aidsClean": "No braking aid", "aidsAll": "All aids",
    "versions.all": "All", "find.ph": "Find a driver in this leaderboard…", "find.none": "No driver by that name on this combo.", "find.matches": "Results: {n}", "search.ph": "Search a driver…", "search.none": "No driver found", "search.combos": "{n} combos", "profile.kicker": "Driver profile", "profile.sub": "Their best lap and position on each combo (all versions)", "profile.none": "Driver not found (they may be anonymous).", "profile.positions": "Positions by combo", "profile.k.combos": "Combos driven", "profile.k.ranked": "Final (20+ drivers)", "profile.k.records": "Records", "profile.k.podiums": "Podiums", "profile.k.best": "Best standing", "col.where": "Where they stand", "col.gapFirst": "Gap to P1", "provisional.short": "provisional ({n}/20)", "col.track": "Track", "col.class": "Class", "col.rank": "Position", "col.top": "Top",
    "f.toggle": "Filters", "search.open": "Search a driver", "f.circuit": "Track", "f.layout": "Layout", "f.class": "Class", "f.car": "Car", "f.session": "Session", "f.mode": "Mode", "f.version": "Version", "f.conditions": "Conditions", "f.aids": "Aids", "f.all": "All", "f.allF": "All", "f.allClasses": "All classes", "home.allClasses": "Track leaderboard, all classes", "f.race": "Race", "f.qualify": "Qualifying", "f.practice": "Practice", "f.online": "Online", "f.offline": "Offline", "f.latest": "Latest", "f.several": "Several",
    "anon": "Driver {tag}", "notFound": "No lap has been shared on this combo yet.", "back": "Back to tracks", "latest": "current",
    "f.search": "Search…", "inline.notDone": "You haven't driven this combo yet.", "inline.open": "Leaderboard page", "inline.more": "See all {n} drivers", "col.detail": "Details", "col.compare": "Compare", "profile.open": "Open their profile (their combos, compared with yours)", "profile.you": "You", "profile.vsGap": "Your gap", "profile.ahead": "You are ahead on <b>{a} / {n}</b> combos in common.", "profile.noCommon": "No combo in common with you.", "profile.compare": "Compare", "cmp.tip": "Compare with this driver", "cmp.title": "Driver comparison", "cmp.close": "Close", "cmp.gap": "Gap", "cmp.sectors": "Where the gap is made", "cmp.detail": "Best lap", "cmp.behind": "{name} loses <b>{gap} s</b> per lap, <b>{part} s of it in {sector}</b>.", "cmp.behindOnly": "{name} loses <b>{gap} s</b> per lap.", "cmp.gains": "In {sector} it's the other way round: <b>{gain} s</b> faster.", "cmp.tie": "Same lap time.", "cmp.optimal": "Ideal lap (best sectors)", "cmp.median": "Median pace", "cmp.spread": "Consistency (median − best)", "cmp.vmax": "Top speed", "cmp.tyres": "Tyres", "cmp.session": "Session", "cmp.sessions": "Sessions on this combo", "cmp.laps": "Valid laps on this combo", "cmp.diffClass": "Different classes: the gap is only indicative.", "cmp.diffVersion": "Different game versions ({a} / {b}): the balance may have changed.", "cmp.context": "Context", "cmp.alone": "Only driver on this leaderboard: nobody to compare with.", "cmp.you": "you",
    "nav.features": "Features", "nav.community": "Leaderboards", "nav.screenshots": "Screenshots", "nav.install": "Install", "nav.faq": "FAQ", "nav.changelog": "What's new", "nav.download": "Download", "footer.soloTip": "A word from the developer", "footer.solo": "One enthusiast, on his own, in the evenings after work — and not a developer by trade. Which is to say there are bugs left: consider the app on its shakedown lap. Run into one? Report it, that is the surest way to see it gone.", "footer.noCookie": "This site sets no cookies and collects no personal data about its visitors.", "footer.releases": "Releases", "footer.issues": "Report a bug",
  },
  es: {
    "home.title": "Clasificaciones de la comunidad", "home.lead": "Las mejores vueltas de los pilotos de LMU Stats Viewer, por circuito y por clase. Haz clic en un tiempo para abrir la clasificación completa.", "home.trust": "Tiempos leídos de los archivos del juego: nada se introduce a mano.",
    "home.me": "Mi ficha de piloto", "home.board": "Todas las clasificaciones", "home.count": "{n} clasificaciones", "home.count1": "1 clasificación",
    "view.grid": "Por circuito", "view.list": "Lista", "sort.popular": "Más rodados", "sort.az": "A → Z",
    "mx.legend": "Participación: número de pilotos, comparado con la clasificación más rodada de la misma clase. Una clasificación es provisional mientras tenga menos de 20 pilotos.", "col.recordCar": "Coche", "col.recordDriver": "Piloto del récord", "col.pop": "Participación", "home.pending": "Provisional: {n} / 20 pilotos", "home.open": "Clasificación",
    "nav.share": "Compartir mis vueltas",
    "stat.drivers": "Pilotos", "stat.sessions": "Sesiones compartidas", "stat.layouts": "Circuitos y trazados", "stat.ranked": "Clasificaciones",
    "stat.week": "+{n} esta semana", "stat.rankedSub": "{n} con 20+ pilotos", "stat.live": "Actualizado en directo",
    "drivers": "pilotos", "driver1": "piloto",
    "search": "Buscar un circuito…", "noResult": "Ningún circuito coincide.", "f.reset": "Restablecer filtros",
    "how.kicker": "Contribuir", "how.title": "Cuatro pasos, y tú decides",
    "how.0t": "Instala la app", "how.0d": "LMU Stats Viewer, para Windows 10 y 11. Lee tus resultados directamente de los archivos del juego: nada que introducir.", "how.0cta": "Descargar la app",
    "how.1t": "Activa el uso compartido", "how.1d": "En la app, Configuración → Comunidad. Ves exactamente lo que se envía antes de confirmar.",
    "how.2t": "Rueda", "how.2d": "Tras cada sesión, tu mejor vuelta válida se envía sola. Nunca las de los demás pilotos.",
    "how.3t": "Compara", "how.3d": "Tu posición en cada combo, en la app y aquí, por clase, coche y versión.",
    "privacy": "Nada sale sin tu consentimiento. Apareces con tu nombre de piloto de LMU, tu país y tu avatar de Steam, o permaneces anónimo, tú eliges. Un clic en la app borra todos tus datos del servidor.",
    "empty.title": "Las clasificaciones se abren", "empty.text": "Todavía no hay vueltas compartidas. Instala la app y activa el uso compartido para estar entre los primeros.",
    "offline": "El servicio no responde por ahora. Inténtalo de nuevo en unos minutos.",
    "maint.title": "Actualización en curso", "maint.text": "El sitio puede no estar disponible durante unos instantes. Las vueltas compartidas desde la app se conservan y se reenvían automáticamente.", "footer.tagline": "Hecho para la comunidad de Le Mans Ultimate.", 
    "footer.legal": "Licencia MIT · LMU Stats Viewer no está afiliado a Studio 397 ni a Le Mans Ultimate. Los tiempos de referencia proceden de OhneSpeed y se muestran con su crédito.",
    "crumbs": "Clasificaciones", "provisional": "Clasificación provisional: {n} / 20 pilotos. Las cifras se estabilizan con más vueltas compartidas.",
    "kpi.drivers": "Pilotos", "kpi.best": "Mejor vuelta", "kpi.p10": "Top 10 %", "kpi.median": "Mediana", "kpi.laps": "Vueltas válidas",
    "hist.title": "Dónde están los pilotos", "hist.sub": "Cada barra cuenta los pilotos cuya mejor vuelta cae en esa franja de 0,5 s. A la izquierda los más rápidos, a la derecha los más lentos.", "hist.fast": "← más rápido", "hist.slow": "más lento →", "hist.axisY": "pilotos", "hist.top10": "Top 10 %", "hist.median": "Mediana", "hist.p90": "90 %", "hist.bar": "{n} piloto(s) entre {a} y {b}", "hist.you": "Tú", "me.btn": "Mi posición", "me.title": "Tu posición", "me.none": "Aún no tienes tiempo en este combo con estos filtros.", "me.unknown": "Abre esta clasificación desde la app (Clasificaciones → Ver en el sitio), o pulsa «Soy yo» en tu ficha de piloto.", "me.set": "Soy yo", "me.pickPh": "Tu nombre de piloto LMU…", "me.pickNone": "Ningún piloto con ese nombre en esta clasificación (un piloto anónimo no se puede buscar por nombre).", "me.saved": "Guardado: tu fila quedará fijada arriba de las clasificaciones.", "me.clear": "Olvidar", "me.jump": "Ver mi posición", "me.where": "Dónde estás", "coffee": "Invítame a un café",
    "calc.title": "¿Dónde queda tu tiempo?", "calc.sub": "Escribe un tiempo para situarte — la app lo hace sola tras cada sesión.",
    "calc.first": "Mejor tiempo", "calc.last": "Último", "calc.nth": "{n}.º", "calc.bottom": "Últimos {pct} %", "calc.top": "Top {pct} %", "calc.of": "de {n} pilotos", "calc.rank": "Posición", "calc.gapBest": "Diferencia con el mejor", "calc.gapMedian": "Diferencia con la mediana",
    "lg.title": "Qué significan los colores", "lg.record": "récord de la clasificación", "lg.prov": "récord provisional (menos de 20 pilotos)", "lg.best": "sector más rápido de todos los pilotos", "lg.pop": "participación, con el color de la clase (comparada con la clasificación más rodada de la clase)", "lg.pend": "a la espera de 20 pilotos", "lb.title": "Clasificación", "lb.sub": "Mejores sectores de la clasificación en violeta · anonimato a elección de cada piloto", "lb.more": "Ver más",
    "col.driver": "Piloto", "col.car": "Coche", "col.time": "Tiempo", "col.gap": "Diferencia", "col.version": "Versión", "col.date": "Fecha",
    "byCar.title": "Por coche", "byCar.sub": "De la mejor vuelta (inicio de la barra) a la mediana (marca) de cada modelo",
    "versions.title": "Versiones del juego", "versions.sub": "Cada actualización y su BoP tienen su propia clasificación",
    "brakes.title": "Zonas de frenada de la comunidad", "brakes.soon": "Próximamente", "brakes.text": "Calculadas a partir de las vueltas compartidas, nunca introducidas a mano.",
    "share.title": "Compartir esta página", "share.copy": "Copiar el enlace", "share.copied": "Enlace copiado",
    "dry": "Seco", "wet": "Lluvia", "aidsClean": "Sin ayuda de frenada", "aidsAll": "Todas las ayudas",
    "versions.all": "Todas", "find.ph": "Buscar un piloto en esta clasificación…", "find.none": "Ningún piloto con ese nombre en este combo.", "find.matches": "Resultados: {n}", "search.ph": "Buscar un piloto…", "search.none": "Ningún piloto encontrado", "search.combos": "{n} combos", "profile.kicker": "Ficha del piloto", "profile.sub": "Su mejor vuelta y su posición en cada combo (todas las versiones)", "profile.none": "Piloto no encontrado (quizá sea anónimo).", "profile.positions": "Sus puestos por combinación", "profile.k.combos": "Combinaciones rodadas", "profile.k.ranked": "Definitivas (20+ pilotos)", "profile.k.records": "Récords", "profile.k.podiums": "Podios", "profile.k.best": "Mejor clasificación", "col.where": "Dónde se sitúa", "col.gapFirst": "Diferencia con el 1.º", "provisional.short": "provisional ({n}/20)", "col.track": "Circuito", "col.class": "Clase", "col.rank": "Posición", "col.top": "Top",
    "f.toggle": "Filtros", "search.open": "Buscar un piloto", "f.circuit": "Circuito", "f.layout": "Trazado", "f.class": "Clase", "f.car": "Coche", "f.session": "Sesión", "f.mode": "Modo", "f.version": "Versión", "f.conditions": "Condiciones", "f.aids": "Ayudas", "f.all": "Todos", "f.allF": "Todas", "f.allClasses": "Todas las clases", "home.allClasses": "Clasificación del circuito, todas las clases", "f.race": "Carrera", "f.qualify": "Clasificación", "f.practice": "Libres", "f.online": "En línea", "f.offline": "Sin conexión", "f.latest": "Última", "f.several": "Varias",
    "anon": "Piloto {tag}", "notFound": "Nadie ha compartido todavía una vuelta en este combo.", "back": "Volver a los circuitos", "latest": "actual",
    "f.search": "Buscar…", "inline.notDone": "Aún no has hecho este combo.", "inline.open": "Página de la clasificación", "inline.more": "Ver los {n} pilotos", "col.detail": "Detalle", "col.compare": "Comparar", "profile.open": "Ver su ficha (sus combos, comparados con los tuyos)", "profile.you": "Tú", "profile.vsGap": "Tu diferencia", "profile.ahead": "Vas por delante en <b>{a} / {n}</b> combos en común.", "profile.noCommon": "Ningún combo en común contigo.", "profile.compare": "Comparar", "cmp.tip": "Comparar con este piloto", "cmp.title": "Comparación de pilotos", "cmp.close": "Cerrar", "cmp.gap": "Diferencia", "cmp.sectors": "Dónde se hace la diferencia", "cmp.detail": "Mejor vuelta", "cmp.behind": "{name} pierde <b>{gap} s</b> por vuelta, <b>{part} s de ellos en {sector}</b>.", "cmp.behindOnly": "{name} pierde <b>{gap} s</b> por vuelta.", "cmp.gains": "En {sector} es al revés: <b>{gain} s</b> más rápido.", "cmp.tie": "Mismo tiempo por vuelta.", "cmp.optimal": "Vuelta ideal (mejores sectores)", "cmp.median": "Ritmo mediano", "cmp.spread": "Regularidad (mediana − mejor)", "cmp.vmax": "Velocidad punta", "cmp.tyres": "Neumáticos", "cmp.session": "Sesión", "cmp.sessions": "Sesiones en este combo", "cmp.laps": "Vueltas válidas en este combo", "cmp.diffClass": "Clases distintas: la diferencia es orientativa.", "cmp.diffVersion": "Versiones del juego distintas ({a} / {b}): el equilibrio puede haber cambiado.", "cmp.context": "Contexto", "cmp.alone": "Único piloto de esta clasificación: nadie con quien compararse.", "cmp.you": "tú",
    "nav.features": "Funciones", "nav.community": "Clasificaciones", "nav.screenshots": "Capturas", "nav.install": "Instalación", "nav.faq": "Preguntas", "nav.changelog": "Novedades", "nav.download": "Descargar", "footer.soloTip": "Unas palabras del desarrollador", "footer.solo": "Un aficionado, solo, por las noches después del trabajo — y que no es programador de profesión. O sea que quedan bugs: considera que la aplicación está en vuelta de reconocimiento. Si te encuentras con uno, avísame: es la forma más segura de que desaparezca.", "footer.noCookie": "Este sitio no instala cookies ni recoge datos personales de sus visitantes.", "footer.releases": "Versiones", "footer.issues": "Informar de un fallo",
  },
  de: {
    "home.title": "Community-Ranglisten", "home.lead": "Die besten Runden der LMU-Stats-Viewer-Fahrer, nach Strecke und Klasse. Klicke auf eine Zeit, um die ganze Rangliste zu öffnen.", "home.trust": "Rundenzeiten aus den Dateien des Spiels: nichts wird von Hand eingetragen.",
    "home.me": "Meine Fahrerseite", "home.board": "Alle Ranglisten", "home.count": "{n} Ranglisten", "home.count1": "1 Rangliste",
    "view.grid": "Nach Strecke", "view.list": "Liste", "sort.popular": "Meistgefahren", "sort.az": "A → Z",
    "mx.legend": "Beteiligung: Anzahl der Fahrer, verglichen mit der meistgefahrenen Rangliste derselben Klasse. Eine Rangliste bleibt vorläufig, bis sie 20 Fahrer hat.", "col.recordCar": "Auto", "col.recordDriver": "Rekordhalter", "col.pop": "Beteiligung", "home.pending": "Vorläufig: {n} / 20 Fahrer", "home.open": "Rangliste",
    "nav.share": "Meine Runden teilen",
    "stat.drivers": "Fahrer", "stat.sessions": "Geteilte Sessions", "stat.layouts": "Strecken und Varianten", "stat.ranked": "Ranglisten",
    "stat.week": "+{n} diese Woche", "stat.rankedSub": "davon {n} mit 20+ Fahrern", "stat.live": "Live aktualisiert",
    "drivers": "Fahrer", "driver1": "Fahrer",
    "search": "Strecke suchen…", "noResult": "Keine Strecke gefunden.", "f.reset": "Filter zurücksetzen",
    "how.kicker": "Mitmachen", "how.title": "Vier Schritte, und du entscheidest",
    "how.0t": "Installiere die App", "how.0d": "LMU Stats Viewer, für Windows 10 und 11. Die App liest deine Ergebnisse direkt aus den Dateien des Spiels: nichts einzutippen.", "how.0cta": "App herunterladen",
    "how.1t": "Teilen aktivieren", "how.1d": "In der App unter Einstellungen → Community. Du siehst genau, was gesendet wird, bevor du bestätigst.",
    "how.2t": "Fahren", "how.2d": "Nach jeder Session wird deine beste gültige Runde automatisch gesendet. Nie die Runden anderer Fahrer.",
    "how.3t": "Vergleichen", "how.3d": "Deine Position auf jeder Kombo, in der App und hier, nach Klasse, Auto und Version.",
    "privacy": "Ohne deine Zustimmung wird nichts gesendet. Du erscheinst mit deinem LMU-Fahrernamen, deinem Land und deinem Steam-Avatar oder bleibst anonym, ganz wie du willst. Ein Klick in der App löscht alle deine Daten vom Server.",
    "empty.title": "Die Ranglisten öffnen", "empty.text": "Noch keine geteilten Runden. Installiere die App und aktiviere das Teilen, um zu den Ersten zu gehören.",
    "offline": "Der Dienst antwortet gerade nicht. Bitte versuche es in ein paar Minuten erneut.",
    "maint.title": "Aktualisierung läuft", "maint.text": "Die Website ist möglicherweise kurz nicht erreichbar. Aus der App geteilte Runden bleiben erhalten und werden automatisch erneut gesendet.", "footer.tagline": "Gemacht für die Le-Mans-Ultimate-Community.", 
    "footer.legal": "MIT-Lizenz · LMU Stats Viewer steht in keiner Verbindung zu Studio 397 oder Le Mans Ultimate. Die Referenzzeiten stammen von OhneSpeed und werden mit Quellenangabe gezeigt.",
    "crumbs": "Ranglisten", "provisional": "Vorläufige Wertung: {n} / 20 Fahrer. Die Werte stabilisieren sich mit weiteren geteilten Runden.",
    "kpi.drivers": "Fahrer", "kpi.best": "Beste Runde", "kpi.p10": "Top 10 %", "kpi.median": "Median", "kpi.laps": "Gültige Runden",
    "hist.title": "Wo die Fahrer stehen", "hist.sub": "Jeder Balken zählt die Fahrer, deren beste Runde in diesem 0,5-s-Bereich liegt. Links die Schnellsten, rechts die Langsamsten.", "hist.fast": "← schneller", "hist.slow": "langsamer →", "hist.axisY": "Fahrer", "hist.top10": "Top 10 %", "hist.median": "Median", "hist.p90": "90 %", "hist.bar": "{n} Fahrer zwischen {a} und {b}", "hist.you": "Du", "me.btn": "Meine Position", "me.title": "Deine Position", "me.none": "Du hast mit diesen Filtern noch keine Zeit auf dieser Kombination.", "me.unknown": "Öffne diese Rangliste aus der App (Ranglisten → Auf der Website ansehen) oder klicke auf deinem Fahrerprofil auf „Das bin ich“.", "me.set": "Das bin ich", "me.pickPh": "Dein LMU-Fahrername…", "me.pickNone": "Kein Fahrer mit diesem Namen in dieser Rangliste (anonyme Fahrer sind nicht per Name auffindbar).", "me.saved": "Gespeichert: deine Zeile wird oben in den Ranglisten angeheftet.", "me.clear": "Vergessen", "me.jump": "Meine Position zeigen", "me.where": "Wo du stehst", "coffee": "Spendier mir einen Kaffee",
    "calc.title": "Wo liegt deine Zeit?", "calc.sub": "Gib eine Rundenzeit ein, um dich einzuordnen — die App macht das nach jeder Session automatisch.",
    "calc.first": "Bestzeit", "calc.last": "Letzter", "calc.nth": "{n}.", "calc.bottom": "Letzte {pct} %", "calc.top": "Top {pct} %", "calc.of": "von {n} Fahrern", "calc.rank": "Position", "calc.gapBest": "Abstand zur Bestzeit", "calc.gapMedian": "Abstand zum Median",
    "lg.title": "Was die Farben bedeuten", "lg.record": "Rekord der Rangliste", "lg.prov": "vorläufiger Rekord (weniger als 20 Fahrer)", "lg.best": "schnellster Sektor aller Fahrer", "lg.pop": "Beteiligung, in der Farbe der Klasse (im Vergleich zur meistgefahrenen Rangliste der Klasse)", "lg.pend": "wartet auf 20 Fahrer", "lb.title": "Rangliste", "lb.sub": "Beste Sektoren der Rangliste in Violett · Anonymität nach Wahl jedes Fahrers", "lb.more": "Mehr anzeigen",
    "col.driver": "Fahrer", "col.car": "Auto", "col.time": "Zeit", "col.gap": "Abstand", "col.version": "Version", "col.date": "Datum",
    "byCar.title": "Nach Auto", "byCar.sub": "Von der besten Runde (Balkenanfang) bis zum Median (Strich) jedes Modells",
    "versions.title": "Spielversionen", "versions.sub": "Jedes Update und seine BoP haben eine eigene Rangliste",
    "brakes.title": "Bremszonen der Community", "brakes.soon": "Demnächst", "brakes.text": "Aus geteilten Runden berechnet — nie von Hand eingetragen.",
    "share.title": "Diese Seite teilen", "share.copy": "Link kopieren", "share.copied": "Link kopiert",
    "dry": "Trocken", "wet": "Regen", "aidsClean": "Ohne Bremshilfe", "aidsAll": "Alle Hilfen",
    "versions.all": "Alle", "find.ph": "Fahrer in dieser Rangliste finden…", "find.none": "Kein Fahrer mit diesem Namen auf dieser Kombo.", "find.matches": "Treffer: {n}", "search.ph": "Fahrer suchen…", "search.none": "Kein Fahrer gefunden", "search.combos": "{n} Kombos", "profile.kicker": "Fahrerprofil", "profile.sub": "Seine beste Runde und Position auf jeder Kombo (alle Versionen)", "profile.none": "Fahrer nicht gefunden (vielleicht anonym).", "profile.positions": "Platzierungen pro Kombination", "profile.k.combos": "Gefahrene Kombos", "profile.k.ranked": "Endgültig (20+ Fahrer)", "profile.k.records": "Rekorde", "profile.k.podiums": "Podien", "profile.k.best": "Beste Platzierung", "col.where": "Wo er steht", "col.gapFirst": "Abstand zu P1", "provisional.short": "vorläufig ({n}/20)", "col.track": "Strecke", "col.class": "Klasse", "col.rank": "Position", "col.top": "Top",
    "f.toggle": "Filter", "search.open": "Fahrer suchen", "f.circuit": "Strecke", "f.layout": "Variante", "f.class": "Klasse", "f.car": "Auto", "f.session": "Session", "f.mode": "Modus", "f.version": "Version", "f.conditions": "Bedingungen", "f.aids": "Hilfen", "f.all": "Alle", "f.allF": "Alle", "f.allClasses": "Alle Klassen", "home.allClasses": "Rangliste der Strecke, alle Klassen", "f.race": "Rennen", "f.qualify": "Qualifying", "f.practice": "Training", "f.online": "Online", "f.offline": "Offline", "f.latest": "Neueste", "f.several": "Mehrere",
    "anon": "Fahrer {tag}", "notFound": "Auf dieser Kombo wurde noch keine Runde geteilt.", "back": "Zurück zu den Strecken", "latest": "aktuell",
    "f.search": "Suchen…", "inline.notDone": "Du bist diese Kombination noch nicht gefahren.", "inline.open": "Seite der Rangliste", "inline.more": "Alle {n} Fahrer ansehen", "col.detail": "Details", "col.compare": "Vergleich", "profile.open": "Profil öffnen (seine Kombinationen, mit deinen verglichen)", "profile.you": "Du", "profile.vsGap": "Dein Abstand", "profile.ahead": "Du liegst bei <b>{a} / {n}</b> gemeinsamen Kombinationen vorn.", "profile.noCommon": "Keine gemeinsame Kombination mit dir.", "profile.compare": "Vergleichen", "cmp.tip": "Mit diesem Fahrer vergleichen", "cmp.title": "Fahrervergleich", "cmp.close": "Schließen", "cmp.gap": "Abstand", "cmp.sectors": "Wo der Abstand entsteht", "cmp.detail": "Beste Runde", "cmp.behind": "{name} verliert <b>{gap} s</b> pro Runde, davon <b>{part} s in {sector}</b>.", "cmp.behindOnly": "{name} verliert <b>{gap} s</b> pro Runde.", "cmp.gains": "In {sector} ist es umgekehrt: <b>{gain} s</b> schneller.", "cmp.tie": "Gleiche Rundenzeit.", "cmp.optimal": "Ideale Runde (beste Sektoren)", "cmp.median": "Median-Tempo", "cmp.spread": "Konstanz (Median − Bestzeit)", "cmp.vmax": "Höchstgeschwindigkeit", "cmp.tyres": "Reifen", "cmp.session": "Session", "cmp.sessions": "Sessions auf dieser Kombination", "cmp.laps": "Gültige Runden auf dieser Kombination", "cmp.diffClass": "Unterschiedliche Klassen: Abstand nur als Richtwert.", "cmp.diffVersion": "Unterschiedliche Spielversionen ({a} / {b}): die Balance kann sich geändert haben.", "cmp.context": "Kontext", "cmp.alone": "Einziger Fahrer in dieser Rangliste: niemand zum Vergleichen.", "cmp.you": "du",
    "nav.features": "Funktionen", "nav.community": "Ranglisten", "nav.screenshots": "Screenshots", "nav.install": "Installation", "nav.faq": "FAQ", "nav.changelog": "Neuerungen", "nav.download": "Herunterladen", "footer.soloTip": "Ein Wort vom Entwickler", "footer.solo": "Ein Enthusiast, allein, abends nach Feierabend — und von Beruf kein Entwickler. Heißt: Es sind noch Bugs drin. Betrachte die App als in der Einrollrunde. Wenn dir einer begegnet, meld ihn — so verschwindet er am schnellsten.", "footer.noCookie": "Diese Website setzt keine Cookies und erhebt keine personenbezogenen Daten über ihre Besucher.", "footer.releases": "Versionen", "footer.issues": "Fehler melden",
  },
  it: {
    "home.title": "Classifiche della community", "home.lead": "I giri migliori dei piloti di LMU Stats Viewer, per circuito e per classe. Clicca su un tempo per aprire la classifica completa.", "home.trust": "Tempi letti dai file del gioco: nulla viene inserito a mano.",
    "home.me": "La mia scheda pilota", "home.board": "Tutte le classifiche", "home.count": "{n} classifiche", "home.count1": "1 classifica",
    "view.grid": "Per circuito", "view.list": "Elenco", "sort.popular": "Più frequentati", "sort.az": "A → Z",
    "mx.legend": "Partecipazione: numero di piloti, rispetto alla classifica più frequentata della stessa classe. Una classifica resta provvisoria finché conta meno di 20 piloti.", "col.recordCar": "Vettura", "col.recordDriver": "Detentore del record", "col.pop": "Partecipazione", "home.pending": "Provvisoria: {n} / 20 piloti", "home.open": "Classifica",
    "nav.share": "Condividi i miei giri",
    "stat.drivers": "Piloti", "stat.sessions": "Sessioni condivise", "stat.layouts": "Circuiti e tracciati", "stat.ranked": "Classifiche",
    "stat.week": "+{n} questa settimana", "stat.rankedSub": "di cui {n} con 20+ piloti", "stat.live": "Aggiornato in tempo reale",
    "drivers": "piloti", "driver1": "pilota",
    "search": "Cerca un circuito…", "noResult": "Nessun circuito corrisponde.", "f.reset": "Azzera i filtri",
    "how.kicker": "Partecipa", "how.title": "Quattro passi, e decidi tu",
    "how.0t": "Installa l'app", "how.0d": "LMU Stats Viewer, per Windows 10 e 11. Legge i tuoi risultati direttamente dai file del gioco: niente da inserire.", "how.0cta": "Scarica l'app",
    "how.1t": "Attiva la condivisione", "how.1d": "Nell'app, Impostazioni → Community. Vedi esattamente cosa viene inviato prima di confermare.",
    "how.2t": "Guida", "how.2d": "Dopo ogni sessione, il tuo miglior giro valido viene inviato da solo. Mai quelli degli altri piloti.",
    "how.3t": "Confronta", "how.3d": "La tua posizione su ogni combo, nell'app e qui, per classe, vettura e versione.",
    "privacy": "Nulla viene inviato senza il tuo consenso. Appari con il tuo nome pilota di LMU, il tuo paese e il tuo avatar Steam, oppure resti anonimo, a tua scelta. Un clic nell'app cancella tutti i tuoi dati dal server.",
    "empty.title": "Le classifiche aprono", "empty.text": "Ancora nessun giro condiviso. Installa l'app e attiva la condivisione per essere tra i primi.",
    "offline": "Il servizio non risponde al momento. Riprova tra qualche minuto.",
    "maint.title": "Aggiornamento in corso", "maint.text": "Il sito potrebbe non essere disponibile per qualche istante. I giri condivisi dall'app vengono conservati e reinviati automaticamente.", "footer.tagline": "Fatto per la community di Le Mans Ultimate.", 
    "footer.legal": "Licenza MIT · LMU Stats Viewer non è affiliato a Studio 397 né a Le Mans Ultimate. I tempi di riferimento provengono da OhneSpeed e sono mostrati citandone la fonte.",
    "crumbs": "Classifiche", "provisional": "Classifica provvisoria: {n} / 20 piloti. I valori si stabilizzano con più giri condivisi.",
    "kpi.drivers": "Piloti", "kpi.best": "Miglior giro", "kpi.p10": "Top 10 %", "kpi.median": "Mediana", "kpi.laps": "Giri validi",
    "hist.title": "Dove si collocano i piloti", "hist.sub": "Ogni barra conta i piloti il cui miglior giro cade in quella fascia di 0,5 s. A sinistra i più veloci, a destra i più lenti.", "hist.fast": "← più veloce", "hist.slow": "più lento →", "hist.axisY": "piloti", "hist.top10": "Top 10 %", "hist.median": "Mediana", "hist.p90": "90 %", "hist.bar": "{n} pilota/i tra {a} e {b}", "hist.you": "Tu", "me.btn": "La mia posizione", "me.title": "La tua posizione", "me.none": "Non hai ancora un tempo su questa combo con questi filtri.", "me.unknown": "Apri questa classifica dall'app (Classifiche → Vedi sul sito), oppure clicca «Sono io» sulla tua scheda pilota.", "me.set": "Sono io", "me.pickPh": "Il tuo nome pilota LMU…", "me.pickNone": "Nessun pilota con questo nome in questa classifica (un pilota anonimo non si può trovare per nome).", "me.saved": "Salvato: la tua riga sarà fissata in cima alle classifiche.", "me.clear": "Dimentica", "me.jump": "Mostra la mia posizione", "me.where": "Dove ti trovi", "coffee": "Offrimi un caffè",
    "calc.title": "Dove si colloca il tuo tempo?", "calc.sub": "Inserisci un tempo sul giro per collocarti — l'app lo fa da sola dopo ogni sessione.",
    "calc.first": "Miglior tempo", "calc.last": "Ultimo", "calc.nth": "{n}º", "calc.bottom": "Ultimi {pct} %", "calc.top": "Top {pct} %", "calc.of": "su {n} piloti", "calc.rank": "Posizione", "calc.gapBest": "Distacco dal migliore", "calc.gapMedian": "Distacco dalla mediana",
    "lg.title": "Cosa significano i colori", "lg.record": "record della classifica", "lg.prov": "record provvisorio (meno di 20 piloti)", "lg.best": "settore più veloce di tutti i piloti", "lg.pop": "partecipazione, nel colore della classe (rispetto alla classifica più frequentata della classe)", "lg.pend": "in attesa di 20 piloti", "lb.title": "Classifica", "lb.sub": "Migliori settori della classifica in viola · anonimato a scelta di ogni pilota", "lb.more": "Mostra altri",
    "col.driver": "Pilota", "col.car": "Vettura", "col.time": "Tempo", "col.gap": "Distacco", "col.version": "Versione", "col.date": "Data",
    "byCar.title": "Per vettura", "byCar.sub": "Dal miglior giro (inizio della barra) alla mediana (tacca) di ogni modello",
    "versions.title": "Versioni del gioco", "versions.sub": "Ogni aggiornamento e il suo BoP hanno una classifica propria",
    "brakes.title": "Zone di frenata della community", "brakes.soon": "Prossimamente", "brakes.text": "Calcolate dai giri condivisi — mai inserite a mano.",
    "share.title": "Condividi questa pagina", "share.copy": "Copia il link", "share.copied": "Link copiato",
    "dry": "Asciutto", "wet": "Pioggia", "aidsClean": "Senza aiuto in frenata", "aidsAll": "Tutti gli aiuti",
    "versions.all": "Tutte", "find.ph": "Trova un pilota in questa classifica…", "find.none": "Nessun pilota con questo nome su questa combo.", "find.matches": "Risultati: {n}", "search.ph": "Cerca un pilota…", "search.none": "Nessun pilota trovato", "search.combos": "{n} combo", "profile.kicker": "Scheda pilota", "profile.sub": "Il suo miglior giro e la sua posizione su ogni combo (tutte le versioni)", "profile.none": "Pilota non trovato (forse è anonimo).", "profile.positions": "Le sue posizioni per combo", "profile.k.combos": "Combo guidate", "profile.k.ranked": "Definitive (20+ piloti)", "profile.k.records": "Record", "profile.k.podiums": "Podi", "profile.k.best": "Miglior piazzamento", "col.where": "Dove si colloca", "col.gapFirst": "Distacco dal 1º", "provisional.short": "provvisoria ({n}/20)", "col.track": "Circuito", "col.class": "Classe", "col.rank": "Posizione", "col.top": "Top",
    "f.toggle": "Filtri", "search.open": "Cerca un pilota", "f.circuit": "Circuito", "f.layout": "Tracciato", "f.class": "Classe", "f.car": "Vettura", "f.session": "Sessione", "f.mode": "Modo", "f.version": "Versione", "f.conditions": "Condizioni", "f.aids": "Aiuti", "f.all": "Tutti", "f.allF": "Tutte", "f.allClasses": "Tutte le classi", "home.allClasses": "Classifica del circuito, tutte le classi", "f.race": "Gara", "f.qualify": "Qualifica", "f.practice": "Prove libere", "f.online": "Online", "f.offline": "Offline", "f.latest": "Ultima", "f.several": "Diverse",
    "anon": "Pilota {tag}", "notFound": "Nessuno ha ancora condiviso un giro su questa combo.", "back": "Torna ai circuiti", "latest": "attuale",
    "f.search": "Cerca…", "inline.notDone": "Non hai ancora fatto questa combo.", "inline.open": "Pagina della classifica", "inline.more": "Vedi tutti i {n} piloti", "col.detail": "Dettagli", "col.compare": "Confronta", "profile.open": "Apri la sua scheda (le sue combo, confrontate con le tue)", "profile.you": "Tu", "profile.vsGap": "Il tuo distacco", "profile.ahead": "Sei davanti su <b>{a} / {n}</b> combo in comune.", "profile.noCommon": "Nessuna combo in comune con te.", "profile.compare": "Confronta", "cmp.tip": "Confronta con questo pilota", "cmp.title": "Confronto piloti", "cmp.close": "Chiudi", "cmp.gap": "Distacco", "cmp.sectors": "Dove nasce il distacco", "cmp.detail": "Miglior giro", "cmp.behind": "{name} perde <b>{gap} s</b> al giro, di cui <b>{part} s in {sector}</b>.", "cmp.behindOnly": "{name} perde <b>{gap} s</b> al giro.", "cmp.gains": "In {sector} è il contrario: <b>{gain} s</b> più veloce.", "cmp.tie": "Stesso tempo sul giro.", "cmp.optimal": "Giro ideale (migliori settori)", "cmp.median": "Passo mediano", "cmp.spread": "Costanza (mediano − migliore)", "cmp.vmax": "Velocità massima", "cmp.tyres": "Gomme", "cmp.session": "Sessione", "cmp.sessions": "Sessioni su questa combo", "cmp.laps": "Giri validi su questa combo", "cmp.diffClass": "Classi diverse: il distacco è solo indicativo.", "cmp.diffVersion": "Versioni del gioco diverse ({a} / {b}): il bilanciamento può essere cambiato.", "cmp.context": "Contesto", "cmp.alone": "Unico pilota in questa classifica: nessuno con cui confrontarsi.", "cmp.you": "tu",
    "nav.features": "Funzionalità", "nav.community": "Classifiche", "nav.screenshots": "Screenshot", "nav.install": "Installazione", "nav.faq": "FAQ", "nav.changelog": "Novità", "nav.download": "Scarica", "footer.soloTip": "Una parola dallo sviluppatore", "footer.solo": "Un appassionato, da solo, la sera dopo il lavoro — e non sviluppatore di professione. Vale a dire che qualche bug c'è ancora: considera l'app nel suo giro di rodaggio. Se ne incontri uno, segnalalo: è il modo più sicuro per vederlo sparire.", "footer.noCookie": "Questo sito non usa cookie e non raccoglie dati personali sui suoi visitatori.", "footer.releases": "Versioni", "footer.issues": "Segnala un bug",
  },
};

// Italien : « combo » au féminin (usage courant chez les simracers italiens) ; « Modo »
// plutôt que « Modalità » pour s'accorder avec « Tutti » (f.all, partagé avec le circuit).
const LANGS = ["fr", "en", "es", "de", "it"];
// Langue posée par boot.js avant le rendu (?lang=, choix mémorisé, navigateur, anglais).
let LANG = document.documentElement.dataset.lang || localStorage.getItem("lmu-lang") || (navigator.language || "fr").slice(0, 2);
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
  return d.toLocaleDateString(LANG, { day: "2-digit", month: "2-digit", year: "numeric" });
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
/** Œil « Détail » (comme la colonne Détails de l'app) : ouvre le classement du combo. */
const ICON_EYE = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.06 12.35a1 1 0 0 1 0-.7 10.75 10.75 0 0 1 19.88 0 1 1 0 0 1 0 .7 10.75 10.75 0 0 1-19.88 0"/><circle cx="12" cy="12" r="3"/></svg>';
const ICON_USERS = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const detailLink = (url) => `<a class="eye-link" href="${esc(url)}" title="${esc(t("col.detail"))}" aria-label="${esc(t("col.detail"))}">${ICON_EYE}</a>`;
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
  const img = e.target;
  if (!(img instanceof HTMLImageElement)) return;
  // Drapeau de pays inconnu : son code en texte ; avatar indisponible : retiré.
  if (img.classList.contains("cflag")) img.replaceWith(Object.assign(document.createElement("span"), { className: "cflag-txt", textContent: img.alt, title: img.title }));
  else if (img.classList.contains("av")) img.remove();
  else img.style.visibility = "hidden";
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

/** Nom du pays dans la langue du site (« FR » → « France »). */
function regionName(code) {
  try {
    return new Intl.DisplayNames([LANG], { type: "region" }).of(code.toUpperCase()) || code;
  } catch {
    return code;
  }
}
/** Drapeau du pays du profil du jeu (« FR ») ; code en texte si le drapeau manque. */
function countryFlag(code) {
  if (!code || !/^[A-Za-z]{2,3}$/.test(code)) return "";
  const file = code.toLowerCase() === "uk" ? "gb" : code.toLowerCase();
  const name = regionName(code);
  return `<img class="cflag" src="/cflags/${esc(file)}.svg" alt="${esc(code.toUpperCase())}" title="${esc(name)}" loading="lazy">`;
}
/** Avatar Steam (pilotes qui l'ont choisi), relayé par le serveur. */
const avatarImg = (d, cls = "av") => (d.avatar && /^[0-9a-f]{40}$/.test(d.avatar) ? `<img class="${cls}" src="/api/v1/avatar/${d.avatar}" alt="" loading="lazy">` : "");
/**
 * Pays puis avatar, dans des emplacements de largeur fixe (vides s'ils manquent) : les
 * noms restent alignés d'une ligne à l'autre. Anonyme : vide.
 */
/** Sans avatar : pastille à la couleur de la classe affichée (`cls`) — sinon couleur stable
 *  tirée du repère, même calcul que l'app ; initiales seulement en grand (fiche pilote). */
const initialsOf = (name) => {
  const w = String(name || "").trim().split(/[\s._-]+/).filter(Boolean).map((x) => Array.from(x));
  if (!w.length) return "";
  return (w.length > 1 ? w[0][0] + w[w.length - 1][0] : w[0].slice(0, 2).join("")).toUpperCase();
};
const hueOf = (key) => {
  let h = 0;
  for (const ch of String(key)) h = (h * 31 + ch.codePointAt(0)) % 360;
  return h;
};
const initialsBadge = (d, cls = "av", carClass = "") =>
  `<span class="${cls} av-ini${carClass ? ` dot-${classKey(carClass)}` : ""}"${carClass ? "" : ` style="background:hsl(${hueOf(d.tag || d.name)} 55% 50%)"`} aria-hidden="true">${cls === "av-lg" ? esc(initialsOf(d.name)) : ""}</span>`;
const driverMarks = (d, carClass = "") =>
  `<span class="dmarks"><span class="fl-slot">${d.name ? countryFlag(d.country) : ""}</span><span class="av-slot">${d.name ? avatarImg(d) || initialsBadge(d, "av", carClass) : ""}</span></span>`;
/** Nom affiché ; `marks` : avatar et drapeau devant (sauf tableau qui leur donne une colonne). */
const driverName = (d, marks = true, carClass = "") =>
  (marks ? driverMarks(d, carClass) : "") +
  (d.name
    ? esc(d.name) + (d.homonym ? ` <span class="muted">· ${esc(d.tag)}</span>` : "")
    : `<span class="anon">${esc(t("anon", { tag: d.tag }))}</span>`);

// ── Classement d'un combo : lignes partagées (page du combo, classement ouvert sur place) ──
const CMP_SVG = '<svg class="ico" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>';
const LB_COLS = 12;

/** En-tête du tableau (mêmes colonnes que la page d'un combo). */
const lbHeadHtml = () =>
  `<thead><tr><th class="c">#</th><th class="marks" aria-hidden="true"></th><th>${esc(t("col.driver"))}</th><th class="c cmp-col">${esc(t("col.compare"))}</th><th>${esc(t("col.car"))}</th><th class="perf sep r">${esc(t("col.time"))}</th><th class="perf r">${esc(t("col.gap"))}</th><th class="perf r">S1</th><th class="perf r">S2</th><th class="perf r">S3</th><th class="sep c">${esc(t("col.version"))}</th><th class="r">${esc(t("col.date"))}</th></tr></thead>`;

/**
 * Une ligne du classement. `ctx` : `q` (classe affichée), `me` (repère « c'est moi »),
 * `bestTime` (temps du 1er), `bestS` (meilleurs secteurs, en violet), `cmpHref(tag)` : lien
 * de comparaison (classement ouvert sur place) — sinon bouton (fenêtre de la page du combo).
 */
function lbRowHtml(r, ctx) {
  const cls = ctx.q.class || r.car_class || "";
  const cmp = ctx.cmpHref
    ? `<a class="drv-btn cmp-btn" href="${esc(ctx.cmpHref(r.driver.tag))}" title="${esc(t("cmp.tip"))}" aria-label="${esc(t("cmp.tip"))}">${CMP_SVG}</a>`
    : `<button type="button" class="drv-btn cmp-btn" data-tag="${esc(r.driver.tag)}" title="${esc(t("cmp.tip"))}" aria-label="${esc(t("cmp.tip"))}">${CMP_SVG}</button>`;
  const name = r.driver.name
    ? `<a class="drv-btn" href="/pilote.html?${new URLSearchParams({ tag: r.driver.tag })}" title="${esc(t("profile.open"))}">${driverName(r.driver, false)}</a>`
    : ctx.cmpHref
      ? `<a class="drv-btn" href="${esc(ctx.cmpHref(r.driver.tag))}" title="${esc(t("cmp.tip"))}">${driverName(r.driver, false)}</a>`
      : `<button type="button" class="drv-btn" data-tag="${esc(r.driver.tag)}" title="${esc(t("cmp.tip"))}">${driverName(r.driver, false)}</button>`;
  return `
      <tr class="${ctx.me && r.driver.tag === ctx.me ? "is-me" : ""}" data-rank="${r.rank}">
        <td class="pos c">${r.rank <= 3 ? `<span class="medal m${r.rank}">${r.rank}</span>` : r.rank}</td>
        <td class="marks">${driverMarks(r.driver, cls)}</td>
        <td class="drv">${name}</td>
        <td class="cmp-cell c">${cmp}</td>
        <td><div class="car">${ctx.q.class ? "" : classBadge(r.car_class)}<span class="logo-slot">${carImg(r.car_model)}</span><span>${esc(r.car_model)}</span></div></td>
        <td class="t perf sep r">${fmtTime(r.time)}</td>
        <td class="gap perf r">${r.rank === 1 || ctx.bestTime == null ? "—" : "+" + (r.time - ctx.bestTime).toFixed(3)}</td>
        ${["s1", "s2", "s3"].map((k, i) => `<td class="sec perf r ${r[k] != null && r[k] === ctx.bestS[i] ? "pb" : ""}">${r[k] != null ? r[k].toFixed(3) : "—"}</td>`).join("")}
        <td class="sep c"><span class="ver">${esc(r.game_version)}</span></td>
        <td class="muted r">${esc(fmtDate(r.played_on))}</td>
      </tr>`;
}

/** Réaffiche la ligne d'un combo refermé (masquée tant que son classement est ouvert). */
function restoreRow(tr) {
  tr.classList.remove("row-open", "row-hidden");
}

/**
 * Bandeau en tête d'un classement ouvert sur place : votre position (place, temps, écart au
 * 1er) — ou « pas encore fait ce combo », ou le choix de votre nom si le site ne vous connaît
 * pas encore — et à droite le drapeau, le tracé, la classe, la page complète et la fermeture.
 */
function inlineBannerHtml(q, url, me, meRow, lead, drivers) {
  const side = `<div class="me-side cgd-side">${flagImg(q.track)}<b>${esc(q.course || q.track)}</b>${q.class ? classBadge(q.class) : ""}
      <a class="eye-link" href="${esc(url)}" title="${esc(t("inline.open"))}" aria-label="${esc(t("inline.open"))}">${ICON_EYE}</a>
      <button type="button" class="cgd-close" title="${esc(t("cmp.close"))}" aria-label="${esc(t("cmp.close"))}">×</button></div>`;
  if (!me) {
    return `<div class="me-card me-empty me-pick cgd-banner"><div class="cgd-pick">
        <input class="search cgd-pick-in" placeholder="${esc(t("me.pickPh"))}" autocomplete="off">
        <div class="me-pick-list cgd-pick-list"></div></div>${side}</div>`;
  }
  if (!meRow) return `<div class="me-card me-empty cgd-banner"><span>${esc(t("inline.notDone"))}</span>${side}</div>`;
  const gap = lead && lead.driver.tag !== meRow.driver.tag ? "+" + (meRow.time - lead.time).toFixed(3) : "—";
  return `<div class="me-card cgd-banner">
      <div class="me-rank">${meRow.rank}<small style="font-size:.9rem;color:var(--muted)"> / ${fmtNum(drivers)}</small></div>
      <div class="me-main"><span class="me-k">${esc(t("me.title"))}</span><b>${driverName(meRow.driver, true, q.class || meRow.car_class || "")}</b></div>
      <div class="me-main"><span class="me-k">${esc(t("col.time"))}</span><span class="me-time">${fmtTime(meRow.time)}</span></div>
      <div class="me-main"><span class="me-k">${esc(t("col.gap"))}</span><span class="me-time">${gap}</span></div>
      ${side}</div>`;
}

/**
 * Clic sur une ligne de combo (page Classements, fiche pilote) : le classement s'ouvre sur
 * place, comme dans l'app — la ligne cède la place à un bandeau (votre position, ou de quoi
 * vous identifier) puis aux 50 premiers. Croix ou nouveau clic sur un autre combo : refermé ;
 * l'œil « Détail » mène toujours à la page complète.
 */
async function toggleInlineBoard(tr) {
  tr.closest(".lb")?.querySelectorAll("tr.cg-detail").forEach((x) => x.remove());
  tr.closest(".lb")?.querySelectorAll("tr.row-open").forEach(restoreRow);
  const url = tr.dataset.href;
  const p = new URLSearchParams(url.split("?")[1] || "");
  const q = {};
  for (const k of ["track", "course", "class", "version", "aids", "conditions", "car", "session", "mode"]) if (p.get(k)) q[k] = p.get(k);
  const span = tr.children.length;
  const row = document.createElement("tr");
  row.className = "cg-detail";
  row.innerHTML = `<td colspan="${span}"><div class="cg-detail-in"><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div><div class="skeleton sk-line"></div></div></td>`;
  tr.after(row);
  tr.classList.add("row-open", "row-hidden");
  const close = () => {
    row.remove();
    restoreRow(tr);
  };
  const me = getMe();
  const [lb, mine] = await Promise.all([
    api("combos/leaderboard", { ...q, limit: 50, offset: 0 }).catch(() => null),
    me ? api("combos/leaderboard", { ...q, limit: 1, offset: 0, tag: me }).catch(() => null) : null,
  ]);
  if (!row.isConnected) return;
  const box = row.querySelector(".cg-detail-in");
  if (!lb) {
    box.innerHTML = `<p class="muted">${esc(t("offline"))} <button type="button" class="cgd-close" aria-label="${esc(t("cmp.close"))}">×</button></p>`;
    box.querySelector(".cgd-close").addEventListener("click", close);
    return;
  }
  const rows = lb.rows;
  const lead = rows[0]?.rank === 1 ? rows[0] : null;
  const bestS = [Infinity, Infinity, Infinity];
  for (const r of rows) ["s1", "s2", "s3"].forEach((k, i) => { if (r[k] != null && r[k] < bestS[i]) bestS[i] = r[k]; });
  const ctx = { q, me, bestTime: lead?.time ?? null, bestS, cmpHref: (tag) => `${url}&${new URLSearchParams({ cmp: tag })}` };
  box.innerHTML = `
    ${inlineBannerHtml(q, url, me, mine?.me ?? null, lead, lb.drivers)}
    <div class="lb-scroll"><table class="lb lb-dense">${lbHeadHtml()}<tbody>${rows.map((r) => lbRowHtml(r, ctx)).join("")}</tbody></table></div>
    ${lb.drivers > rows.length ? `<div class="cgd-more"><a class="go-link" href="${esc(url)}">${esc(t("inline.more", { n: fmtNum(lb.drivers) }))}</a></div>` : ""}`;
  box.querySelector(".cgd-close").addEventListener("click", close);
  // Site qui ne vous connaît pas : choix de votre nom dans CE classement, puis ré-ouverture.
  const input = box.querySelector(".cgd-pick-in");
  if (input) {
    let tm = null;
    input.addEventListener("input", () => {
      clearTimeout(tm);
      tm = setTimeout(async () => {
        const v = input.value.trim();
        const list = box.querySelector(".cgd-pick-list");
        if (v.length < 2) { list.innerHTML = ""; return; }
        const res = await api("combos/leaderboard", { ...q, limit: 6, offset: 0, name: v }).catch(() => null);
        const found = res?.rows ?? [];
        list.innerHTML = found.length
          ? found.map((r) => `<button type="button" data-tag="${esc(r.driver.tag)}"><span class="mono">${r.rank}<small class="muted"> / ${fmtNum(res.drivers)}</small></span><span>${driverName(r.driver)}</span><span class="mono">${fmtTime(r.time)}</span></button>`).join("")
          : `<span class="muted">${esc(t("me.pickNone"))}</span>`;
      }, 250);
    });
    box.querySelector(".cgd-pick-list").addEventListener("click", (e) => {
      const b = e.target.closest("button[data-tag]");
      if (!b) return;
      setMe(b.dataset.tag);
      close();
      toggleInlineBoard(tr);
    });
  }
}

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

/** Liens de l'en-tête : la vitrine (ancres de la page d'accueil), les classements, les nouveautés. */
const NAV = [
  ["/#features", "nav.features"],
  ["/#gallery", "nav.screenshots"],
  ["/classements.html", "nav.community"],
  ["/#install", "nav.install"],
  ["/#faq", "nav.faq"],
  ["/changelog.html", "nav.changelog"],
];
const BURGER_SVG = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 6h18M3 12h18M3 18h18"/></svg>';

/**
 * En-tête et pied de page communs à tout le site (vitrine et classements), langue et thème.
 * Les pages de la vitrine traduisent elles-mêmes leur contenu (`js/app.js`, dictionnaire de la
 * vitrine) : ici, seuls les `data-i18n` des pages de classements sont traduits.
 */
function chrome() {
  // Repère transmis par l'app (`?me=`) : mémorisé quelle que soit la page d'arrivée.
  getMe();
  const root = document.documentElement;
  // Thème posé par boot.js avant le rendu (clair par défaut) ; repli s'il n'a pas tourné.
  if (!root.dataset.theme) root.dataset.theme = localStorage.getItem("lmu-theme") === "dark" ? "dark" : "light";
  root.lang = LANG;
  const path = location.pathname;
  const onBoards = /\/(classements|combo|pilote)\.html$/.test(path);
  const current = (href) =>
    (href === "/classements.html" && onBoards) || (href === "/changelog.html" && path.endsWith("/changelog.html"));
  const header = document.querySelector("header.site-header");
  header.innerHTML = `
    <div class="wrap header-inner">
      <div class="brand-wrap"><button type="button" class="dev-note-btn" aria-expanded="false" title="${esc(t("footer.soloTip"))}" aria-label="${esc(t("footer.soloTip"))}"><img class="brand-logo" src="/assets/icon-32.png?v=1" alt=""></button><a class="brand" href="/"><span>LMU Stats Viewer</span></a></div>
      <nav class="nav" id="nav">${NAV.map(([href, k]) => `<a href="${href}"${current(href) ? ' aria-current="page"' : ""}>${esc(t(k))}</a>`).join("")}</nav>
      <div class="header-actions">
        <div class="dsearch"><input class="search" id="driverSearch" placeholder="${esc(t("search.ph"))}" autocomplete="off"><div class="dsearch-list" id="driverResults" hidden></div></div>
        <button class="icon-btn dsearch-btn" id="searchBtn" aria-label="${esc(t("search.open"))}" aria-expanded="false"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg></button>
        <select class="lang-select" aria-label="Langue">${LANGS.map((l) => `<option value="${l}" ${l === LANG ? "selected" : ""}>${l.toUpperCase()}</option>`).join("")}</select>
        <button class="icon-btn" id="themeBtn" aria-label="Thème">
          <svg class="i-sun" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg>
          <svg class="i-moon" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
        </button>
        <a class="btn btn-primary btn-sm dl-btn" data-dl="entete" href="https://github.com/cparfait/lmustatsviewer/releases/latest">${esc(t("nav.download"))}</a>
        <button class="icon-btn burger" id="burger" aria-label="Menu" aria-expanded="false" aria-controls="nav">${BURGER_SVG}</button>
      </div>
    </div>`;
  header.querySelector("#themeBtn").addEventListener("click", () => {
    const next = root.dataset.theme === "light" ? "dark" : "light";
    root.dataset.theme = next;
    localStorage.setItem("lmu-theme", next);
    // La vitrine change ses captures d'écran (variantes claire et sombre).
    document.dispatchEvent(new CustomEvent("lmu:theme", { detail: next }));
  });
  // Menu des petits écrans : la navigation s'ouvre sous l'en-tête.
  const nav = header.querySelector("#nav");
  const burger = header.querySelector("#burger");
  const closeNav = () => {
    nav.classList.remove("open");
    burger.setAttribute("aria-expanded", "false");
  };
  burger.addEventListener("click", () => burger.setAttribute("aria-expanded", String(nav.classList.toggle("open"))));
  nav.addEventListener("click", (e) => { if (e.target.closest("a")) closeNav(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeNav(); });
  // Recherche de pilote (les anonymes ne sont jamais trouvables).
  const input = header.querySelector("#driverSearch");
  const list = header.querySelector("#driverResults");
  // Mobile : la recherche s'ouvre sous l'en-tête depuis la loupe.
  const searchBtn = header.querySelector("#searchBtn");
  searchBtn.addEventListener("click", () => {
    const open = header.classList.toggle("search-open");
    searchBtn.setAttribute("aria-expanded", String(open));
    if (open) input.focus();
  });
  let timer = null;
  input.addEventListener("input", () => {
    clearTimeout(timer);
    const q = input.value.trim();
    if (q.length < 2) { list.hidden = true; return; }
    timer = setTimeout(async () => {
      const res = await api("drivers", { q }).catch(() => null);
      const drivers = res?.drivers ?? [];
      list.innerHTML = drivers.length
        ? drivers.map((d) => `<a href="/pilote.html?tag=${encodeURIComponent(d.tag)}"><b>${driverMarks(d)}${esc(d.name)}</b>${d.homonym ? ` <span class="muted">${esc(d.tag)}</span>` : ""}<span class="muted">${esc(t("search.combos", { n: d.combos }))}</span></a>`).join("")
        : `<span class="muted">${esc(t("search.none"))}</span>`;
      list.hidden = false;
    }, 250);
  });
  document.addEventListener("click", (e) => {
    if (!e.target.closest("#nav, #burger")) closeNav();
    if (e.target.closest(".dsearch, #searchBtn")) return;
    list.hidden = true;
    header.classList.remove("search-open");
    searchBtn.setAttribute("aria-expanded", "false");
  });
  header.querySelector(".lang-select").addEventListener("change", (e) => {
    localStorage.setItem("lmu-lang", e.target.value);
    location.reload();
  });
  document.querySelector("footer.site-footer").innerHTML = `
    <div class="wrap footer-inner">
      <div class="footer-about">
        <div class="footer-brand"><button type="button" class="dev-note-btn" aria-expanded="false" title="${esc(t("footer.soloTip"))}" aria-label="${esc(t("footer.soloTip"))}"><img src="/assets/icon-32.png?v=1" width="24" height="24" alt=""></button><div><strong>LMU Stats Viewer</strong><span>${esc(t("footer.tagline"))}</span></div></div>
      </div>
      <nav class="footer-links">
        <a href="/changelog.html">${esc(t("nav.changelog"))}</a>
        <a href="/classements.html">${esc(t("nav.community"))}</a>
        <a href="https://github.com/cparfait/lmustatsviewer">GitHub</a>
        <a href="https://github.com/cparfait/lmustatsviewer/releases">${esc(t("footer.releases"))}</a>
        <a href="https://github.com/cparfait/lmustatsviewer/issues">${esc(t("footer.issues"))}</a>
        <a href="https://discord.gg/G9ng9GdvSU">Discord</a>
        <a class="btn btn-sm btn-coffee" href="https://buymeacoffee.com/cristof" target="_blank" rel="noopener noreferrer">${COFFEE_SVG}<span>${esc(t("coffee"))}</span></a>
      </nav>
    </div>
    <div class="wrap footer-legal">
      <p>${esc(t("footer.legal"))}</p>
      <p>${esc(t("footer.noCookie"))}</p>
    </div>`;
  // Pages de la vitrine : leur script les traduit avec le dictionnaire de la vitrine.
  if (!window.VITRINE_I18N) document.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  document.querySelectorAll(".dev-note-btn").forEach((b) => b.addEventListener("click", () => toggleDevNote(b)));
  watchMaintenance();
  document.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
  document.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  document.querySelectorAll("[data-i18n-aria]").forEach((el) => { el.setAttribute("aria-label", t(el.dataset.i18nAria)); });
  // Bouton « i » : ouvre / ferme son menu d'explications (Échap ou clic dehors pour fermer).
  document.querySelectorAll(".info-btn[aria-controls]").forEach((btn) => {
    const pop = document.getElementById(btn.getAttribute("aria-controls"));
    if (!pop) return;
    const set = (open) => {
      pop.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
      if (open) {
        const r = btn.getBoundingClientRect();
        pop.style.top = `${r.bottom + 8}px`;
        pop.style.left = `${Math.max(8, Math.min(r.right - pop.offsetWidth, window.innerWidth - pop.offsetWidth - 8))}px`;
      }
    };
    btn.addEventListener("click", () => set(pop.hidden));
    document.addEventListener("mousedown", (e) => { if (!pop.hidden && !pop.contains(e.target) && !btn.contains(e.target)) set(false); }, true);
    document.addEventListener("keydown", (e) => { if (e.key === "Escape" && !pop.hidden) { set(false); btn.focus(); } });
    window.addEventListener("scroll", () => { if (!pop.hidden) set(true); }, true);
    window.addEventListener("resize", () => { if (!pop.hidden) set(true); });
  });
}

/**
 * Le mot du développeur (« un passionné, seul… ») : plus dans le pied de page, mais dans une
 * bulle qui s'ouvre d'un clic sur le petit personnage (logo de l'en-tête et du pied de page).
 */
let devNoteOpen = null;
function toggleDevNote(btn) {
  if (devNoteOpen) {
    const same = devNoteOpen.btn === btn;
    devNoteOpen.close();
    if (same) return;
  }
  const note = document.createElement("div");
  note.className = "dev-note";
  note.setAttribute("role", "dialog");
  note.setAttribute("aria-label", t("footer.soloTip"));
  note.innerHTML = `<p>${esc(t("footer.solo"))}</p><a href="https://github.com/cparfait/lmustatsviewer/issues" target="_blank" rel="noopener noreferrer">${esc(t("footer.issues"))} ›</a>`;
  document.body.appendChild(note);
  // Sous le personnage (ou au-dessus s'il est en bas de l'écran), ramenée dans l'écran.
  const place = () => {
    const r = btn.getBoundingClientRect();
    const below = r.bottom + note.offsetHeight + 12 < window.innerHeight;
    note.style.top = `${below ? r.bottom + 10 : r.top - note.offsetHeight - 10}px`;
    note.style.left = `${Math.max(8, Math.min(r.left - 6, window.innerWidth - note.offsetWidth - 8))}px`;
    note.classList.toggle("is-above", !below);
  };
  place();
  btn.setAttribute("aria-expanded", "true");
  const onOutside = (e) => { if (!note.contains(e.target) && !btn.contains(e.target)) close(); };
  const onKey = (e) => { if (e.key === "Escape") { close(); btn.focus(); } };
  const close = () => {
    note.remove();
    btn.setAttribute("aria-expanded", "false");
    document.removeEventListener("mousedown", onOutside, true);
    document.removeEventListener("keydown", onKey);
    window.removeEventListener("scroll", place, true);
    window.removeEventListener("resize", place);
    devNoteOpen = null;
  };
  document.addEventListener("mousedown", onOutside, true);
  document.addEventListener("keydown", onKey);
  window.addEventListener("scroll", place, true);
  window.addEventListener("resize", place);
  devNoteOpen = { btn, close };
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
    <div class="fsel">
      <span class="fsel-k"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${FILTER_ICONS[d.key] || ""}</svg>${esc(d.label)}</span>
      <select data-key="${esc(d.key)}">${d.options
        .map(([v, l]) => `<option value="${esc(v)}" ${String(v) === String(d.value) ? "selected" : ""}>${esc(l)}</option>`)
        .join("")}</select>
    </div>`,
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
/**
 * Mobile : la barre de filtres se replie derrière un bouton « Filtres » qui rappelle les
 * choix en cours (les listes « Tous / Toutes » n'y figurent pas). Sans effet sur ordinateur.
 */
function foldFilterBar(root) {
  const bar = root.querySelector(".fbar");
  if (!bar) return;
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "ftoggle";
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 5h18M6 12h12M10 19h4"/></svg><b>${esc(t("f.toggle"))}</b><span class="ftoggle-sum"></span><svg class="ftoggle-chev" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>`;
  bar.before(btn);
  const summary = () => {
    const parts = [];
    bar.querySelectorAll(".fsel select").forEach((sel) => {
      if (sel.value === "" || sel.value === "all") return;
      parts.push(sel.selectedOptions[0]?.textContent ?? "");
    });
    bar.querySelectorAll(".fmulti").forEach((box) => {
      const all = box.querySelector(".fmulti-list input[value=__all]");
      if (!all?.checked) parts.push(box.querySelector(".fmulti-btn").textContent);
    });
    btn.querySelector(".ftoggle-sum").textContent = [...new Set(parts.filter(Boolean))].join(" · ");
  };
  summary();
  bar.addEventListener("change", summary);
  btn.addEventListener("click", () => btn.setAttribute("aria-expanded", String(root.classList.toggle("is-open"))));
}
/**
 * Menus des filtres aux couleurs du site : la liste déroulante native (grise, système) est
 * remplacée par un menu du site — fond, bordure, orange de la sélection, coche, recherche
 * dans les listes longues, clavier (↑ ↓ Entrée Échap, lettres). Le `<select>` reste en
 * coulisse : il porte la valeur et émet `change` comme avant (filtres, résumé mobile).
 */
const FDROP_CHECK = '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>';
const FDROP_CHEV = '<svg class="fdrop-chev" viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m6 9 6 6 6-6"/></svg>';
let fdropOpen = null; // menu ouvert : { list, btn, close }

function enhanceSelect(sel) {
  const box = sel.closest(".fsel");
  sel.classList.add("fsel-native");
  sel.tabIndex = -1;
  sel.setAttribute("aria-hidden", "true");
  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "fdrop-btn";
  btn.setAttribute("aria-haspopup", "listbox");
  btn.setAttribute("aria-expanded", "false");
  const label = box.querySelector(".fsel-k")?.textContent.trim() || "";
  btn.setAttribute("aria-label", label);
  // Repère visuel devant chaque choix : drapeau (circuit, tracé), logo (voiture), pastille de
  // couleur (classe). « Tous / Toutes » : rien.
  const key = sel.dataset.key;
  const deco = (v) => {
    if (!v || v === "all") return "";
    if (key === "track") return flagImg(v);
    if (key === "course") return flagImg(v) || flagImg(box.closest(".fbar")?.querySelector('select[data-key="track"]')?.value || "");
    if (key === "car") return `<span class="fdrop-logo">${carImg(v)}</span>`;
    if (key === "class") return `<i class="cls-dot dot-${classKey(v)}"></i>`;
    return "";
  };
  const dflt = [...sel.options].find((o) => o.value === "" || o.value === "all")?.value;
  const paint = () => {
    btn.innerHTML = `<span class="fdrop-val">${deco(sel.value)}<span>${esc(sel.selectedOptions[0]?.textContent ?? "")}</span></span>${FDROP_CHEV}`;
    const set = dflt !== undefined && sel.value !== dflt;
    box.classList.toggle("is-set", set);
  };
  sel.after(btn);
  paint();
  sel.addEventListener("change", paint);

  const pick = (v) => {
    if (sel.value !== v) {
      sel.value = v;
      sel.dispatchEvent(new Event("change", { bubbles: true }));
    }
    fdropOpen?.close(true);
  };

  const open = () => {
    if (fdropOpen) fdropOpen.close(false);
    const opts = [...sel.options];
    const list = document.createElement("div");
    list.className = "fdrop-list";
    list.setAttribute("role", "listbox");
    list.setAttribute("aria-label", label);
    const search = opts.length > 10;
    list.innerHTML = `${search ? `<input class="fdrop-search" type="search" placeholder="${esc(t("f.search"))}" aria-label="${esc(t("f.search"))}">` : ""}
      <div class="fdrop-opts">${opts.map((o) => `<button type="button" role="option" class="fdrop-opt${o.selected ? " is-on" : ""}" aria-selected="${o.selected}" data-v="${esc(o.value)}"><span class="fdrop-lbl">${deco(o.value)}<span>${esc(o.textContent)}</span></span>${o.selected ? FDROP_CHECK : ""}</button>`).join("")}</div>`;
    document.body.appendChild(list);
    // Sous le filtre, aligné à gauche ; ramené dans l'écran s'il déborde. Recalculé au
    // défilement (clavier du téléphone qui apparaît, page qu'on fait glisser).
    const place = () => {
      const r = box.getBoundingClientRect();
      list.style.minWidth = `${Math.max(r.width, 200)}px`;
      list.style.top = `${r.bottom + 6}px`;
      const left = Math.min(r.left, window.innerWidth - list.offsetWidth - 8);
      list.style.left = `${Math.max(8, left)}px`;
      list.style.maxHeight = `${Math.max(180, window.innerHeight - r.bottom - 20)}px`;
    };
    place();
    btn.setAttribute("aria-expanded", "true");
    box.classList.add("is-open");
    const items = () => [...list.querySelectorAll(".fdrop-opt:not([hidden])")];
    const close = (refocus) => {
      list.remove();
      btn.setAttribute("aria-expanded", "false");
      box.classList.remove("is-open");
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
      document.removeEventListener("mousedown", onOutside, true);
      fdropOpen = null;
      if (refocus) btn.focus();
    };
    const onScroll = (e) => { if (!list.contains(e.target)) place(); };
    const onOutside = (e) => { if (!list.contains(e.target) && !btn.contains(e.target)) close(false); };
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    document.addEventListener("mousedown", onOutside, true);
    fdropOpen = { list, btn, close };
    list.addEventListener("click", (e) => {
      const o = e.target.closest(".fdrop-opt");
      if (o) pick(o.dataset.v);
    });
    list.addEventListener("keydown", (e) => {
      const all = items();
      const i = all.indexOf(document.activeElement);
      if (e.key === "ArrowDown") { e.preventDefault(); (all[i + 1] ?? all[0])?.focus(); }
      else if (e.key === "ArrowUp") { e.preventDefault(); (i <= 0 ? list.querySelector(".fdrop-search") ?? all[all.length - 1] : all[i - 1])?.focus(); }
      else if (e.key === "Escape") { e.preventDefault(); close(true); }
      else if (e.key === "Tab") close(false);
      else if (e.key === "Enter" && document.activeElement?.classList.contains("fdrop-search")) { e.preventDefault(); all[0] && pick(all[0].dataset.v); }
      else if (!search && e.key.length === 1) {
        // Saut à la première option qui commence par la lettre tapée.
        const k = e.key.toLowerCase();
        all.find((o) => o.textContent.trim().toLowerCase().startsWith(k))?.focus();
      }
    });
    const input = list.querySelector(".fdrop-search");
    if (input) {
      input.addEventListener("input", () => {
        const q = input.value.trim().toLowerCase();
        list.querySelectorAll(".fdrop-opt").forEach((o) => { o.hidden = !!q && !o.textContent.toLowerCase().includes(q); });
      });
      input.focus();
    } else {
      (list.querySelector(".fdrop-opt.is-on") ?? list.querySelector(".fdrop-opt"))?.focus();
    }
    list.querySelector(".fdrop-opt.is-on")?.scrollIntoView({ block: "nearest" });
  };

  btn.addEventListener("click", () => (fdropOpen?.btn === btn ? fdropOpen.close(true) : open()));
  btn.addEventListener("keydown", (e) => {
    if (e.key === "ArrowDown" || e.key === "ArrowUp") { e.preventDefault(); open(); }
  });
  // Clic sur l'intitulé du filtre (« CLASSE ») : ouvre aussi le menu.
  box.querySelector(".fsel-k")?.addEventListener("click", (e) => { e.preventDefault(); open(); });
}

function bindFilterBar(root, onChange) {
  root.querySelectorAll(".fsel select").forEach(enhanceSelect);
  foldFilterBar(root);
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
const enSuffix = (n) => (n % 100 >= 11 && n % 100 <= 13 ? "th" : ["th", "st", "nd", "rd"][n % 10] ?? "th");
function standing(topPct, rank, n) {
  if (rank === 1) return { label: t("calc.first"), cls: "st-top" };
  // Moins de 20 pilotes : place en clair, un pourcentage n'a pas de sens (dernier sur 4 = « Derniers 25 % »).
  if (rank && n && n < 20) {
    if (rank === n) return { label: t("calc.last"), cls: "st-bottom" };
    return { label: t("calc.nth", { n: rank, sfx: enSuffix(rank) }), cls: rank <= n / 2 ? "st-top" : "st-bottom" };
  }
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
/**
 * Lignes d'une carte circuit regroupées par TRACÉ (Bahreïn : Grand Prix, Outer, Paddock…) :
 * tracé principal (même nom que le circuit) d'abord, puis les plus roulés. `withHeaders` :
 * un sous-titre par tracé s'il y en a plusieurs, ou si l'unique tracé porte un autre nom.
 */
function groupByCourse(list, track, weight = (c) => c.drivers ?? 0) {
  const m = new Map();
  for (const c of list) {
    if (!m.has(c.track_course)) m.set(c.track_course, []);
    m.get(c.track_course).push(c);
  }
  const groups = [...m.entries()]
    .map(([course, rows]) => ({ course, rows, w: rows.reduce((s, c) => s + weight(c), 0) }))
    .sort((a, b) => (b.course === track) - (a.course === track) || b.w - a.w || a.course.localeCompare(b.course));
  const withHeaders = groups.length > 1 || (groups[0] && groups[0].course !== track);
  return { groups, withHeaders };
}
const courseHeader = (course, cols) => `<tr class="cg-sub"><td colspan="${cols}"><span>${esc(course)}</span></td></tr>`;

const driversWord = (n) => t(n === 1 ? "driver1" : "drivers");
