<?php
require_once 'includes/init.php';
require_once 'includes/db.php';
require_once 'includes/indexer.php';

// Premier lancement : redirection vers la config si le dossier de résultats n'est pas défini
if (empty($config['results_dir'])) {
    header('Location: config.php?first_launch=1');
    exit;
}

// --- DELTA SYNC : parse uniquement les fichiers nouveaux ou modifiés ---
// Pas de limite de temps : le premier indexage avec des milliers de sessions peut dépasser 30 s.
set_time_limit(0);
$syncStats   = sync_xml_to_db();
$syncMessage = null;
if ($syncStats['added'] > 0 || $syncStats['updated'] > 0 || $syncStats['removed'] > 0) {
    $parts = [];
    if ($syncStats['added'])   $parts[] = $syncStats['added']   . ' ajoutée(s)';
    if ($syncStats['updated']) $parts[] = $syncStats['updated'] . ' mise(s) à jour';
    if ($syncStats['removed']) $parts[] = $syncStats['removed'] . ' supprimée(s)';
    $syncMessage = 'Base de données synchronisée — ' . implode(', ', $parts) . '.';
}
$db = get_db();

// --- OPTIONS DE FILTRE (depuis la DB, sans parser aucun XML) ---
$filterOpts               = get_index_filter_options($db);
$allAvailableTracks       = $filterOpts['tracks'];
$trackLayoutsMap          = $filterOpts['layouts_map'];
$allAvailableClasses      = $filterOpts['classes'];
$allAvailableCars         = $filterOpts['cars'];
$carClassMap              = $filterOpts['car_class_map'];
$carsByClassMap           = $filterOpts['cars_by_class'];
$allAvailableSessionTypes = $filterOpts['session_types'];
$allAvailableSettings     = $filterOpts['settings'];
$allAvailableVersions     = $filterOpts['versions'];

$uniqueVersionsForFilter = array_keys($allAvailableVersions);
if (!empty($uniqueVersionsForFilter)) {
    $uniqueVersionsForFilter = sort_versions_desc($uniqueVersionsForFilter);
}

// --- CONSTRUCTION DE $results (meilleurs tours par circuit/voiture) ---
$allPlayerSessions = get_sessions_with_best_laps($db);

// Grouper par (track|carClass|uniqueCarName) — sans track_course pour éviter
// les doublons quand un circuit a plusieurs layouts (Paul Ricard, Silverstone…)
$groupedSessions = [];
foreach ($allPlayerSessions as $s) {
    $key = $s['track'] . '|' . $s['car_class'] . '|' . $s['unique_car_name'];
    $groupedSessions[$key][] = $s;
}

$results = [];
foreach ($groupedSessions as $key => $sessions) {
    $bestLapRow  = $sessions[0]; // déjà trié par best_lap ASC, premier = meilleur
    $absBestS1   = INF; $absBestS1Date = 0;
    $absBestS2   = INF; $absBestS2Date = 0;
    $absBestS3   = INF; $absBestS3Date = 0;
    $bestVmax    = 0.0;

    foreach ($sessions as $s) {
        if ($s['abs_best_s1'] !== null && $s['abs_best_s1'] < $absBestS1) {
            $absBestS1 = $s['abs_best_s1']; $absBestS1Date = $s['abs_best_s1_date'] ?? $s['timestamp'];
        }
        if ($s['abs_best_s2'] !== null && $s['abs_best_s2'] < $absBestS2) {
            $absBestS2 = $s['abs_best_s2']; $absBestS2Date = $s['abs_best_s2_date'] ?? $s['timestamp'];
        }
        if ($s['abs_best_s3'] !== null && $s['abs_best_s3'] < $absBestS3) {
            $absBestS3 = $s['abs_best_s3']; $absBestS3Date = $s['abs_best_s3_date'] ?? $s['timestamp'];
        }
        if ($s['vmax'] !== null && (float)$s['vmax'] > $bestVmax) {
            $bestVmax = (float)$s['vmax'];
        }
    }

    [$track, $class, $type] = explode('|', $key, 3);
    $trackCourse = $bestLapRow['track_course'] ?? '';
    $optimalLap = compute_optimal_lap($absBestS1, $absBestS2, $absBestS3);

    $results[] = [
        'Track Venue'        => $track,
        'Track Course'       => $trackCourse,
        'Car Class'          => $class,
        'Car Type'           => $type,
        'Car Name'           => $bestLapRow['car_name'],
        'Date'               => date('d/m/Y H:i', $bestLapRow['timestamp']),
        'DateRaw'            => $bestLapRow['timestamp'],
        'SessionTimestamp'   => $bestLapRow['event_id'],
        'SessionType'        => $bestLapRow['session_type'],
        'FinishPos'          => $bestLapRow['class_position'],
        'Setting'            => $bestLapRow['setting'],
        'Progression'        => $bestLapRow['progression'],
        'GameVersion'        => $bestLapRow['game_version'],
        'Status'             => $bestLapRow['finish_status'],
        'BestLapRaw'         => $bestLapRow['best_lap'],
        'BestLapS1'          => $bestLapRow['best_lap_s1'],
        'BestLapS2'          => $bestLapRow['best_lap_s2'],
        'BestLapS3'          => $bestLapRow['best_lap_s3'],
        'AbsoluteBestS1Raw'  => $absBestS1 !== INF ? $absBestS1 : null,
        'AbsoluteBestS2Raw'  => $absBestS2 !== INF ? $absBestS2 : null,
        'AbsoluteBestS3Raw'  => $absBestS3 !== INF ? $absBestS3 : null,
        'AbsoluteBestS1_Date'=> $absBestS1Date ? date('d/m/Y H:i', $absBestS1Date) : 'N/A',
        'AbsoluteBestS2_Date'=> $absBestS2Date ? date('d/m/Y H:i', $absBestS2Date) : 'N/A',
        'AbsoluteBestS3_Date'=> $absBestS3Date ? date('d/m/Y H:i', $absBestS3Date) : 'N/A',
        'OptimalLapRaw'      => $optimalLap !== INF ? $optimalLap : null,
        'BestVmaxRaw'        => $bestVmax,
    ];
}

// --- CONSTRUCTION DE $stats ---
$stats = get_player_overview_stats($db);

// --- LOGIQUE DE TRI ET FILTRAGE ---

// ÉTAPE 1 : On récupère les filtres sélectionnés D'ABORD
$isFilterSubmitted = isset($_GET['track']) || isset($_GET['track_course']) || isset($_GET['class']) || isset($_GET['car1']) || isset($_GET['session_type']) || isset($_GET['setting']) || isset($_GET['filter_version_submitted']);
$selectedTrack = $_GET['track'] ?? 'all';
$selectedTrackCourse = $_GET['track_course'] ?? 'all';
$selectedClass = $_GET['class'] ?? 'all';
$selectedCar1 = $_GET['car1'] ?? 'all';
$selectedSessionType = $_GET['session_type'] ?? 'all';
$selectedSetting = $_GET['setting'] ?? 'all';

$selectedVersion = $_GET['version'] ?? resolve_default_version($uniqueVersionsForFilter, $config);
$filterOnlyVersion = !empty($_GET['filter_only_version']);

// ÉTAPE 3 : On génère les listes pour les menus de filtres
$uniqueTrackVenuesForFilter = array_keys($allAvailableTracks);

// On génère la liste des tracés en fonction du circuit sélectionné
$uniqueTrackCoursesForFilter = [];
if ($selectedTrack !== 'all' && isset($trackLayoutsMap[$selectedTrack])) {
    $uniqueTrackCoursesForFilter = $trackLayoutsMap[$selectedTrack];
} else if ($selectedTrack === 'all') {
    $allCourses = [];
    foreach($trackLayoutsMap as $courses) {
        $allCourses = array_merge($allCourses, $courses);
    }
    $uniqueTrackCoursesForFilter = array_unique($allCourses);
    sort($uniqueTrackCoursesForFilter);
}

$uniqueCarClassesForFilter = array_keys($allAvailableClasses);
$uniqueCarTypesForFilter = array_keys($allAvailableCars);
// Cascade classe → voitures disponibles
if ($selectedClass !== 'all' && isset($carsByClassMap[$selectedClass])) {
    $uniqueCarTypesForFilter = array_values(array_filter($uniqueCarTypesForFilter, fn($car) => isset($carsByClassMap[$selectedClass][$car])));
}
$uniqueSessionTypesForFilter = array_keys($allAvailableSessionTypes);
$uniqueSettingsForFilter = array_keys($allAvailableSettings);

// On trie les listes pour un affichage alphabétique
sort($uniqueTrackVenuesForFilter);

// Tri personnalisé pour les classes
usort($uniqueCarClassesForFilter, fn($a, $b) => (CLASS_ORDER[$a] ?? 99) <=> (CLASS_ORDER[$b] ?? 99));

sort($uniqueCarTypesForFilter);
sort($uniqueSessionTypesForFilter);
sort($uniqueSettingsForFilter);


// ÉTAPE 4 : On applique les filtres sur les résultats
$selectedCar = ($selectedCar1 !== 'all') ? $selectedCar1 : 'all';

// Auto-sélection de la classe quand une voiture est choisie sans classe explicite
if ($selectedCar !== 'all' && $selectedClass === 'all' && isset($carClassMap[$selectedCar])) {
    $selectedClass = $carClassMap[$selectedCar];
}
$filteredResults = array_filter($results, function ($time) use ($selectedTrack, $selectedTrackCourse, $selectedClass, $selectedCar, $selectedSessionType, $selectedSetting, $selectedVersion, $filterOnlyVersion) {
    $matchTrack = ($selectedTrack === 'all' || $time['Track Venue'] === $selectedTrack);
    $matchTrackCourse = ($selectedTrackCourse === 'all' || (isset($time['Track Course']) && $time['Track Course'] === $selectedTrackCourse));
    $matchClass = ($selectedClass === 'all' || $time['Car Class'] === $selectedClass);
    $matchCar = ($selectedCar === 'all' || $time['Car Type'] === $selectedCar);
    
    $matchVersion = true;
    if ($selectedVersion !== 'all') {
        if ($filterOnlyVersion) {
            $matchVersion = $time['GameVersion'] === $selectedVersion;
        } else {
            $matchVersion = version_compare($time['GameVersion'], $selectedVersion, '>=');
        }
    }
    
    $matchSetting = ($selectedSetting === 'all' || $time['Setting'] === $selectedSetting);
    $matchSessionType = ($selectedSessionType === 'all' || $time['SessionType'] === $selectedSessionType);
    return $matchTrack && $matchTrackCourse && $matchClass && $matchCar && $matchVersion && $matchSetting && $matchSessionType;
});

foreach ($trackLayoutsMap as &$courses) {
    sort($courses);
}
unset($courses);

// Tri par circuit, PUIS par classe, PUIS par meilleur temps
usort($filteredResults, function($a, $b) {
    // 1. Tri par circuit principal
    if ($a['Track Venue'] !== $b['Track Venue']) {
        return strcmp($a['Track Venue'], $b['Track Venue']);
    }

    // 2. Tri par tracé (version plus robuste)
    $courseA = $a['Track Course'] ?? null;
    $courseB = $b['Track Course'] ?? null;
    
    if ($courseA !== $courseB) {
        if ($courseA === null) return -1; // Les entrées sans tracé spécifique viennent en premier
        if ($courseB === null) return 1;  // Celles avec un tracé viennent après
        return strcmp($courseA, $courseB); // Sinon, on trie par nom de tracé
    }

    // 3. Si le circuit et le tracé sont identiques, tri par classe prioritaire
    $a_prio = CLASS_ORDER[$a['Car Class']] ?? 99;
    $b_prio = CLASS_ORDER[$b['Car Class']] ?? 99;
    if ($a_prio !== $b_prio) {
        return $a_prio <=> $b_prio;
    }

    // 4. Si la classe est la même, tri par meilleur temps
    return $a['BestLapRaw'] <=> $b['BestLapRaw'];
});

// --- SESSIONS : filtrage, tri et pagination via SQL ---
$sortBy  = $_GET['sort_by']  ?? 'Date';
$sortDir = (isset($_GET['sort_dir']) && strtolower($_GET['sort_dir']) === 'asc') ? 'asc' : 'desc';

// Construction du WHERE dynamique
$conditions = [];
$sqlParams  = [];

if ($selectedTrack !== 'all') {
    $conditions[] = 'ps.track = :track';
    $sqlParams[':track'] = $selectedTrack;
}
if ($selectedTrackCourse !== 'all') {
    $conditions[] = 'ps.track_course = :track_course';
    $sqlParams[':track_course'] = $selectedTrackCourse;
}
if ($selectedClass !== 'all') {
    $conditions[] = 'ps.car_class = :car_class';
    $sqlParams[':car_class'] = $selectedClass;
}
if ($selectedCar !== 'all') {
    $conditions[] = 'ps.unique_car_name = :car';
    $sqlParams[':car'] = $selectedCar;
}
if ($selectedSessionType !== 'all') {
    $conditions[] = 'ps.session_type = :session_type';
    $sqlParams[':session_type'] = $selectedSessionType;
}
if ($selectedSetting !== 'all') {
    $conditions[] = 'ps.setting = :setting';
    $sqlParams[':setting'] = $selectedSetting;
}
if ($selectedVersion !== 'all') {
    $conditions[] = $filterOnlyVersion ? 'ps.game_version = :version' : 'ps.game_version >= :version';
    $sqlParams[':version'] = $selectedVersion;
}

$whereSQL = $conditions ? ('WHERE ' . implode(' AND ', $conditions)) : '';

// Correspondance colonne de tri → expression SQL
$columnMap = [
    'Date'        => 'ps.event_id',
    'Track'       => 'ps.track',
    'TrackCourse' => 'ps.track_course',
    'Setting'     => 'ps.setting',
    'SessionType' => 'ps.session_type',
    'Class'       => "CASE ps.car_class WHEN 'Hyper' THEN 1 WHEN 'LMP2 ELMS' THEN 2 WHEN 'LMP2' THEN 3 WHEN 'LMP3' THEN 4 WHEN 'GT3' THEN 5 WHEN 'GTE' THEN 6 ELSE 99 END",
    'Car'         => 'ps.unique_car_name',
    'Livery'      => 'ps.car_name',
    'BestLap'     => 'ps.best_lap',
    'GridPos'     => 'ps.grid_pos',
    'Position'    => 'ps.class_position',
    'Progression' => 'ps.progression',
    'Pitstops'    => 'ps.pitstops',
    'GameVersion' => 'ps.game_version',
];

$safeSort = $columnMap[$sortBy] ?? 'ps.event_id';
$safeDir  = $sortDir === 'asc' ? 'ASC' : 'DESC';

if ($sortBy === 'Date') {
    // Tri secondaire par type de session (Course > Qualif > Essais), direction fixe
    $orderSQL = "ORDER BY ps.event_id $safeDir, CASE ps.session_type WHEN 'Race' THEN 0 WHEN 'Qualify' THEN 1 ELSE 2 END ASC";
} elseif ($sortBy === 'BestLap') {
    // Valeurs NULL repoussées en fin quelle que soit la direction
    $orderSQL = "ORDER BY CASE WHEN ps.best_lap IS NULL THEN 1 ELSE 0 END ASC, ps.best_lap $safeDir";
} else {
    $orderSQL = "ORDER BY $safeSort $safeDir";
}

// Comptage total (pour la pagination)
$stmtCount = $db->prepare("SELECT COUNT(*) FROM player_sessions ps $whereSQL");
$stmtCount->execute($sqlParams);
$totalSessions = (int)$stmtCount->fetchColumn();

// Pagination
$racesPerPageOptions = [15, 25, 50, 100, 200];
$racesPerPage = isset($_GET['per_page']) && in_array((int)$_GET['per_page'], $racesPerPageOptions) ? (int)$_GET['per_page'] : 15;
$currentPage  = max(1, (int)($_GET['page'] ?? 1));
$totalPages   = $racesPerPage > 0 ? (int)ceil($totalSessions / $racesPerPage) : 1;
if ($totalPages < 1) $totalPages = 1;
if ($currentPage > $totalPages) $currentPage = $totalPages;

$sqlOffset  = ($currentPage - 1) * $racesPerPage;
$limitSQL   = "LIMIT $racesPerPage OFFSET $sqlOffset";

// Récupération de la page courante
$stmtPage = $db->prepare("SELECT * FROM player_sessions ps $whereSQL $orderSQL $limitSQL");
$stmtPage->execute($sqlParams);
$pageRows = $stmtPage->fetchAll();

// Mapping vers la structure attendue par le template HTML
$paginatedSessions = [];
foreach ($pageRows as $row) {
    $paginatedSessions[] = [
        'SessionID'    => $row['event_id'],
        'SessionType'  => $row['session_type'],
        'Date'         => $row['timestamp'],
        'Track'        => $row['track'],
        'TrackCourse'  => $row['track_course'],
        'Car'          => $row['unique_car_name'],
        'Livery'       => $row['car_name'],
        'Class'        => $row['car_class'],
        'GridPos'      => $row['grid_pos'],
        'Position'     => $row['class_position'],
        'Progression'  => $row['progression'],
        'Participants' => $row['participants'],
        'Pitstops'     => $row['pitstops'],
        'Status'       => $row['finish_status'],
        'BestLap'      => $row['best_lap'],
        'Setting'      => $row['setting'],
        'GameVersion'  => $row['game_version'],
    ];
}

?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>" data-theme="<?php echo $current_theme; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $lang['title'] . ' ' . htmlspecialchars(PLAYER_NAME); ?></title>
    <link rel="icon" href="logos/favicon.ico" type="image/x-icon">
    <script src="js/chart.js"></script>
    <link rel="stylesheet" href="css/style.css?v=<?php echo filemtime('css/style.css'); ?>">
</head>
<body class="<?php if ($current_theme === 'dark') echo 'dark-mode'; ?>">
    <?php if ($syncMessage): ?>
    <div class="sync-notice" id="syncNotice">
        🔄 <?php echo htmlspecialchars($syncMessage); ?>
        <button onclick="document.getElementById('syncNotice').style.display='none'" style="margin-left:12px;background:none;border:none;cursor:pointer;font-size:1em;opacity:.7;">✕</button>
    </div>
    <script>
    (function () {
        var el = document.getElementById('syncNotice');
        if (el) {
            setTimeout(function () {
                el.style.transition = 'opacity 0.5s';
                el.style.opacity = '0';
                setTimeout(function () { el.style.display = 'none'; }, 500);
            }, 5000);
        }
    })();
    </script>
    <?php endif; ?>
    <?php if (!empty($stats)): ?>
    <div class="stats-panel">
        <div class="panel-header">
            <div class="header-left">
                <a href="index.php"><img src="logos/lmu.png" alt="Le Mans Ultimate Logo" id="page-logo"></a>
            </div>
            <h1><?php echo $lang['title'] . ' ' . htmlspecialchars(PLAYER_NAME); ?></h1>
            <?php
                $toggleTheme = $current_theme === 'dark' ? 'light' : 'dark';
                $themeToggleParams = http_build_query(array_filter([
                    'lang' => $current_lang,
                    'theme' => $toggleTheme,
                    'track' => $selectedTrack !== 'all' ? $selectedTrack : null,
                    'class' => $selectedClass !== 'all' ? $selectedClass : null,
                    'car1' => $selectedCar1 !== 'all' ? $selectedCar1 : null,
                    'session_type' => $selectedSessionType !== 'all' ? $selectedSessionType : null,
                    'version' => $selectedVersion,
                ], fn($v) => $v !== null));
            ?>
            <div id="theme-switcher">
                <a href="index.php?<?php echo $themeToggleParams; ?>" id="theme-toggle-btn"
                   title="<?php echo $current_theme === 'dark' ? ($lang['theme_light'] ?? 'Thème clair') : ($lang['theme_dark'] ?? 'Thème sombre'); ?>">
                <?php if ($current_theme === 'dark'): ?>
                    <!-- Soleil -->
                    <svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <circle cx="12" cy="12" r="4"/>
                        <line x1="12" y1="2"  x2="12" y2="5"/>
                        <line x1="12" y1="19" x2="12" y2="22"/>
                        <line x1="4.22" y1="4.22"  x2="6.34" y2="6.34"/>
                        <line x1="17.66" y1="17.66" x2="19.78" y2="19.78"/>
                        <line x1="2"  y1="12" x2="5"  y2="12"/>
                        <line x1="19" y1="12" x2="22" y2="12"/>
                        <line x1="4.22" y1="19.78" x2="6.34" y2="17.66"/>
                        <line x1="17.66" y1="6.34"  x2="19.78" y2="4.22"/>
                    </svg>
                <?php else: ?>
                    <!-- Lune -->
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                        <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/>
                    </svg>
                <?php endif; ?>
                </a>
            </div>
        </div>
        
        <div class="stat"><h3><?php echo $lang['stat_driving_time']; ?></h3><p><?php echo htmlspecialchars($stats['totalDrivingTime'] ?? '0'); ?> h</p></div>
        <div class="stat"><h3><?php echo $lang['stat_total_laps']; ?></h3><p><?php echo number_format($stats['totalLaps'] ?? 0); ?></p></div>
        <div class="stat"><h3><?php echo $lang['stat_favorite_track']; ?></h3><p><?php echo htmlspecialchars($stats['favoriteTrack'] ?? $lang['not_available']); ?></p></div>
        <div class="stat"><h3><?php echo $lang['stat_favorite_car']; ?></h3><p><?php echo htmlspecialchars($stats['favoriteCar'] ?? $lang['not_available']); ?></p></div>
        <div class="stat"><h3><?php echo $lang['stat_best_progression']; ?></h3><p class="prog-gain">+<?php echo htmlspecialchars($stats['bestProgression'] ?? '0'); ?></p></div>
        <div class="stat"><h3><?php echo $lang['stat_best_result_online']; ?></h3><p class="best-finish">P<?php echo htmlspecialchars($stats['bestFinish'] ?? $lang['not_available']); ?></p></div>
    </div>
    <?php endif; ?>

    <div class="filter-section">
        <form action="index.php" method="get" id="filter-form">
            <input type="hidden" name="lang" value="<?php echo htmlspecialchars($current_lang); ?>">
            <input type="hidden" name="filter_version_submitted" value="1">
            <a href="index.php?lang=<?php echo $current_lang; ?>" class="reset-filter-btn" title="<?php echo $lang['filter_reset']; ?>">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                    <path d="M3 3v5h5"/>
                </svg>
            </a>
            <a href="config.php?lang=<?php echo $current_lang; ?>" class="reset-filter-btn" title="<?php echo $lang['config_link_title']; ?>">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <line x1="4" y1="6"  x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
                    <circle cx="8"  cy="6"  r="2" fill="currentColor" stroke="none"/>
                    <circle cx="16" cy="12" r="2" fill="currentColor" stroke="none"/>
                    <circle cx="10" cy="18" r="2" fill="currentColor" stroke="none"/>
                </svg>
            </a>
            <a href="live.php?lang=<?php echo $current_lang; ?>" class="reset-filter-btn" title="<?php echo $lang['live_timing_title'] ?? 'Live Timing'; ?>">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="12" cy="12" r="10"/>
                    <circle cx="12" cy="12" r="3" fill="currentColor" stroke="none"/>
                    <line x1="12" y1="2"  x2="12" y2="6"/>
                    <line x1="12" y1="18" x2="12" y2="22"/>
                    <line x1="2"  y1="12" x2="6"  y2="12"/>
                    <line x1="18" y1="12" x2="22" y2="12"/>
                </svg>
            </a>
            <div class="filter-group">
                <label for="track-select"><?php echo $lang['filter_track']; ?></label>
                <select id="track-select" name="track"><option value="all"><?php echo $lang['all']; ?></option><?php foreach ($uniqueTrackVenuesForFilter as $track): ?><option value="<?php echo htmlspecialchars($track); ?>" <?php echo ($selectedTrack === $track) ? 'selected' : ''; ?>><?php echo htmlspecialchars($track); ?></option><?php endforeach; ?></select>
            </div>
            <div class="filter-group">
                <label for="track-course-select"><?php echo $lang['filter_layout'] ?? 'Layout'; ?></label>
                <select id="track-course-select" name="track_course"><option value="all"><?php echo $lang['all']; ?></option><?php foreach ($uniqueTrackCoursesForFilter as $trackCourse): ?><option value="<?php echo htmlspecialchars($trackCourse); ?>" <?php echo ($selectedTrackCourse === $trackCourse) ? 'selected' : ''; ?>><?php echo htmlspecialchars($trackCourse); ?></option><?php endforeach; ?></select>
            </div>
            <div class="filter-group">
                <label for="car1-select"><?php echo $lang['filter_car_1']; ?></label>
                <select id="car1-select" name="car1"><option value="all"><?php echo $lang['all_fem']; ?></option><?php foreach ($uniqueCarTypesForFilter as $car): ?><option value="<?php echo htmlspecialchars($car); ?>" <?php echo ($selectedCar1 === $car) ? 'selected' : ''; ?>><?php echo htmlspecialchars($car); ?></option><?php endforeach; ?></select>
            </div>
            <div class="filter-group">
                <label for="class-select"><?php echo $lang['filter_class']; ?></label>
                <select id="class-select" name="class"><option value="all"><?php echo $lang['all_fem']; ?></option><?php foreach ($uniqueCarClassesForFilter as $class): ?><option value="<?php echo htmlspecialchars($class); ?>" <?php echo ($selectedClass === $class) ? 'selected' : ''; ?>><?php echo htmlspecialchars($class); ?></option><?php endforeach; ?></select>
            </div>
            <div class="filter-group">
                <label for="session-type-select"><?php echo $lang['th_session']; ?></label>
                <select id="session-type-select" name="session_type">
                    <option value="all"><?php echo $lang['all_fem']; ?></option>
                    <?php foreach ($uniqueSessionTypesForFilter as $sessionType): ?>
                    <option value="<?php echo htmlspecialchars($sessionType); ?>" <?php echo ($selectedSessionType === $sessionType) ? 'selected' : ''; ?>><?php echo translateTerm($sessionType, $lang); ?></option>
                    <?php endforeach; ?>
                </select>
            </div>
            <div class="filter-group">
                <label for="setting-select"><?php echo $lang['filter_type']; ?></label>
                <select id="setting-select" name="setting">
                    <option value="all"><?php echo $lang['all']; ?></option>
                    <?php foreach ($uniqueSettingsForFilter as $setting): ?>
                        <option value="<?php echo htmlspecialchars($setting); ?>" <?php echo ($selectedSetting === $setting) ? 'selected' : ''; ?>>
                            <?php echo translateTerm($setting, $lang); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
            </div>
             <div class="filter-group">
                <label for="version-select"><?php echo $lang['filter_since_version_label'] ?? 'Since version'; ?></label>
                <select id="version-select" name="version">
                    <option value="all"><?php echo $lang['all_fem']; ?></option>
                    <?php foreach ($uniqueVersionsForFilter as $version): ?>
                        <option value="<?php echo htmlspecialchars($version); ?>" <?php echo ($selectedVersion === $version) ? 'selected' : ''; ?>>
                            ≥ <?php echo htmlspecialchars($version); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <input type="checkbox" id="filter_only_version" name="filter_only_version" value="1" <?php if ($filterOnlyVersion) echo 'checked'; ?> title="<?php echo $lang['filter_only_version_tooltip'] ?? 'Only this version'; ?>">
            </div>
        </form>
    </div>

    <?php if (empty($filteredResults)): ?>
        <p class="message"><?php echo $lang['no_data_for_filter']; ?></p>
    <?php else: ?>
        <div class="table-wrapper">
            <h2 class="table-title-heading">
                <div class="title-toggle-container">
                    <input type="checkbox" id="toggle-all-checkbox" checked>
                    <label for="toggle-all-checkbox"><?php echo $lang['toggle_all']; ?></label>
                </div>
                <span><?php echo $lang['table_title_best_laps']; ?></span>
            </h2>
            <div style="overflow-x: auto;">
                <table id="best-laps-table">
                <?php
                $columnHeadersHtml = '<thead><tr><th>'.$lang['th_details'].'</th><th class="text-center">'.($lang['th_records'] ?? 'Records').'</th><th class="text-center">'.$lang['th_layout'].'</th><th class="text-center">'.$lang['th_type'].'</th><th class="text-center">'.$lang['th_session'].'</th><th class="text-center">'.$lang['th_class'].'</th><th class="text-center">'.$lang['th_car'].'</th><th class="text-center">'.$lang['th_livery'].'</th><th class="text-center">'.$lang['th_best_lap'].'</th><th class="text-center">S1</th><th class="text-center">S2</th><th class="text-center">S3</th><th class="text-center">'.$lang['th_optimal'].'</th><th class="text-center">'.$lang['th_vmax'].'</th><th class="text-center">'.$lang['th_finish_pos'].'</th><th class="text-center">'.$lang['th_progression'].'</th><th class="text-center">'.$lang['th_date'].'</th><th class="text-center">'.$lang['th_version'].'</th></tr></thead>';
                $currentTrack = null;
                $currentCourse = null;
                $isFirstHeader = true;
                foreach ($filteredResults as $row):
                    if ($row['Track Venue'] !== $currentTrack || (isset($row['Track Course']) && $row['Track Course'] !== $currentCourse)) {
                        $currentTrack = $row['Track Venue'];
                        $currentCourse = isset($row['Track Course']) ? $row['Track Course'] : null;
                        $trackTitle = htmlspecialchars($currentTrack);
                        if ($currentCourse && $currentTrack !== $currentCourse) {
                            $trackTitle .= ' - ' . htmlspecialchars($currentCourse);
                        }
                        $trackGroupId = 'track-group-' . preg_replace('/[^a-zA-Z0-9-]/', '', str_replace(' ', '-', $currentTrack . '-' . $currentCourse));
                        $headerClass = 'circuit-group-header' . ($isFirstHeader ? ' first-header' : '');
                        echo '<thead class="' . $headerClass . '" data-group-id="' . $trackGroupId . '"><tr><th colspan="18" class="group-header">';
                        
                        echo '<span class="collapsible-trigger">';
                        $flagUrl = getCircuitFlagUrl($currentTrack);
                        if ($flagUrl) echo '<img src="' . htmlspecialchars($flagUrl) . '" alt="" class="logo flag-icon">';
                        echo '<span class="arrow-indicator">▼</span></span>';
                        
                        echo ' <span class="clickable-filter" data-filter-type="track" data-filter-value="' . htmlspecialchars($currentTrack) . '" title="' . htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ' . $currentTrack) . '">' . $trackTitle . '</span>';
                        
                        echo '</th></tr></thead>';
                        echo $columnHeadersHtml;
                        $isFirstHeader = false;
                    }
                    $carClassCss = 'class-' . strtolower(str_replace([' ', '-', '#'], '', $row['Car Class']));
                    $currentRowTrackGroupId = 'track-group-' . preg_replace('/[^a-zA-Z0-9-]/', '', str_replace(' ', '-', $row['Track Venue'] . '-' . ($row['Track Course'] ?? '')));
                ?>
                    <tr data-track-group="<?php echo $currentRowTrackGroupId; ?>">
                        <td class="text-center">
                            <a href="race_details.php?session_id=<?php echo urlencode($row['SessionTimestamp']); ?>&lang=<?php echo $current_lang; ?>&session_view=<?php echo $row['SessionType']; ?>&from=best-laps-table" title="Voir les détails de la session"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg></a>
                        </td>
                        <td class="text-center">
                            <a href="records.php?track=<?php echo urlencode($row['Track Venue']); ?>&class=<?php echo urlencode($row['Car Class']); ?>&car=<?php echo urlencode($row['Car Type']); ?>&lang=<?php echo $current_lang; ?>" title="<?php echo htmlspecialchars(sprintf($lang['records_link_title'] ?? 'Records — %s · %s', $row['Track Venue'], $row['Car Type'])); ?>"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></a>
                        </td>
                        <td class="clickable-filter" data-filter-type="track_course" data-filter-value="<?php echo htmlspecialchars($row['Track Course'] ?? ''); ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ' . ($row['Track Course'] ?? '')); ?>">
							<?php echo isset($row['Track Course']) ? htmlspecialchars($row['Track Course']) : ''; ?>
						</td>
                        <td class="text-center clickable-filter" data-filter-type="setting" data-filter-value="<?php echo htmlspecialchars($row['Setting']); ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ') . translateTerm($row['Setting'], $lang); ?>"><?php echo translateTerm($row['Setting'], $lang); ?></td>
                        <td class="text-center clickable-filter" data-filter-type="session_type" data-filter-value="<?php echo htmlspecialchars($row['SessionType']); ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ') . translateTerm($row['SessionType'], $lang); ?>">
                            <?php
                                $sessionType = $row['SessionType'];
                                $sessionClass = 'session-' . strtolower($sessionType);
                                $sessionDisplay = translateTerm($sessionType, $lang);
                            ?>
                            <span class="badge <?php echo $sessionClass; ?>"><?php echo htmlspecialchars($sessionDisplay); ?></span>
                        </td>
                        <td class="text-center">
                            <a href="index.php?class=<?php echo urlencode($row['Car Class']); ?>&lang=<?php echo $current_lang; ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ' . $row['Car Class']); ?>" style="text-decoration: none;">
                                <span class="badge <?php echo $carClassCss; ?>"><?php echo htmlspecialchars($row['Car Class']); ?></span>
                            </a>
                        </td>
                        <td class="clickable-filter" data-filter-type="car1" data-filter-value="<?php echo htmlspecialchars($row['Car Type']); ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ' . $row['Car Type']); ?>">
                            <?php $logoUrl = getCarLogoUrl($row['Car Type']); if ($logoUrl):?><img src="<?php echo htmlspecialchars($logoUrl); ?>" alt="" class="logo"><?php endif; ?>
                            <?php echo htmlspecialchars($row['Car Type']); ?>
                        </td>
                        <td><?php echo htmlspecialchars($row['Car Name']); ?></td>
						<td class="is-pb <?php echo $carClassCss; ?> text-center clickable-cell" data-session-id="<?php echo $row['DateRaw']; ?>" data-track="<?php echo htmlspecialchars($row['Track Venue']); ?>" data-best-lap-text="<?php echo formatSecondsToMmSsMs($row['BestLapRaw']); ?>">
							<?php echo formatSecondsToMmSsMs($row['BestLapRaw']); ?>
						</td>
						<?php
							$s1_is_overall_best = (abs($row['BestLapS1'] - $row['AbsoluteBestS1Raw']) < 0.001);
							$s1_class = $s1_is_overall_best ? 'is-overall-best' : 'slower-sector';
							$s1_title = 'title="Optimal S1: ' . formatSecondsToMmSsMs($row['AbsoluteBestS1Raw'], false) . 's (le ' . $row['AbsoluteBestS1_Date'] . ')"';
						?>
						<td class="text-center <?php echo $s1_class; ?>" <?php echo $s1_title; ?>>
							<?php echo formatSecondsToMmSsMs($row['BestLapS1'], false); ?>s
						</td>
						<?php
							$s2_is_overall_best = (abs($row['BestLapS2'] - $row['AbsoluteBestS2Raw']) < 0.001);
							$s2_class = $s2_is_overall_best ? 'is-overall-best' : 'slower-sector';
							$s2_title = 'title="Optimal S2: ' . formatSecondsToMmSsMs($row['AbsoluteBestS2Raw'], false) . 's (le ' . $row['AbsoluteBestS2_Date'] . ')"';
						?>
						<td class="text-center <?php echo $s2_class; ?>" <?php echo $s2_title; ?>>
							<?php echo formatSecondsToMmSsMs($row['BestLapS2'], false); ?>s
						</td>
						<?php
							$s3_is_overall_best = (abs($row['BestLapS3'] - $row['AbsoluteBestS3Raw']) < 0.001);
							$s3_class = $s3_is_overall_best ? 'is-overall-best' : 'slower-sector';
							$s3_title = 'title="Optimal S3: ' . formatSecondsToMmSsMs($row['AbsoluteBestS3Raw'], false) . 's (le ' . $row['AbsoluteBestS3_Date'] . ')"';
						?>
						<td class="text-center <?php echo $s3_class; ?>" <?php echo $s3_title; ?>>
							<?php echo formatSecondsToMmSsMs($row['BestLapS3'], false); ?>s
						</td>
						<td class="is-optimal text-center">
							<?php echo formatSecondsToMmSsMs($row['OptimalLapRaw']); ?>
							<?php $delta = $row['BestLapRaw'] - $row['OptimalLapRaw'];
							if ($delta > 0.001) echo '<br><span style="font-size:0.8em; color: #28a745;">(-' . formatSecondsToMmSsMs($delta, false) . 's)</span>'; ?>
						</td>                        <td class="text-center"><?php echo round($row['BestVmaxRaw']); ?> km/h</td>
                                                <td class="text-center">
                            <?php
                                if ($row['SessionType'] === 'Race') {
                                    // If 'Status' isn't set (old cache), assume it's a normal finish.
                                    // Otherwise, check if it's explicitly 'Finished Normally'.
                                    if (!isset($row['Status']) || $row['Status'] === 'Finished Normally') {
                                        echo 'P' . htmlspecialchars($row['FinishPos']);
                                    } else {
                                        // For 'DNF', 'DQ', etc.
                                        echo '<span class="status-dnf">' . translateTerm($row['Status'], $lang) . '</span>';
                                    }
                                } else {
                                    echo '<span style="color: grey;">' . $lang['not_available'] . '</span>';
                                }
                            ?>
                        </td>
                        <td class="text-center">
                            <?php
                                if ($row['SessionType'] === 'Race') {
                                    echo renderProgression($row['Progression']);
                                } else {
                                    echo '<span style="color: grey;">' . $lang['not_available'] . '</span>';
                                }
                            ?>
                        </td>
                        <td class="text-center"><?php echo htmlspecialchars($row['Date']); ?></td>
                        <td class="text-center"><?php echo htmlspecialchars($row['GameVersion']); ?></td>
                    </tr>
                <?php endforeach; ?>
                </table>
            </div>
    <?php endif; ?>

    <?php if (!empty($paginatedSessions)): ?>
        <h2 class="table-title-heading"><?php echo $lang['table_title_race_results']; ?> (<?php echo $totalSessions; ?>)</h2>
        <div style="overflow-x: auto;">
            <table id="race-results-table">
            <?php
            $sortableHeaderParams = $_GET;
            unset($sortableHeaderParams['sort_by'], $sortableHeaderParams['sort_dir']);
            ?>
            <thead>
                <tr>
                    <th style="width: 40px;"><?php echo $lang['th_details']; ?></th>
                    <th class="text-center" style="width: 40px;"><?php echo $lang['th_records'] ?? 'Records'; ?></th>
                    <?php printSortableHeader($lang['th_track'], 'Track', 'th_track', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_layout'] ?? 'Layout', 'TrackCourse', 'th_layout', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_type'], 'Setting', 'th_type', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_session'], 'SessionType', 'th_session', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_class'], 'Class', 'th_class', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_car'], 'Car', 'th_car', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_livery'], 'Livery', 'th_livery', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_best_lap'], 'BestLap', 'th_best_lap', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_start'], 'GridPos', 'th_start', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_finish'], 'Position', 'th_finish', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_progression'], 'Progression', 'th_progression', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_stops'], 'Pitstops', 'th_stops', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_date'], 'Date', 'th_date', $sortBy, $sortDir, $sortableHeaderParams); ?>
                    <?php printSortableHeader($lang['th_version'], 'GameVersion', 'th_version', $sortBy, $sortDir, $sortableHeaderParams); ?>
                </tr>
            </thead>
            <tbody>
                <?php
                $prevEventId = null;
                $groupIndex  = -1;
                foreach ($paginatedSessions as $race):
                    if ($race['SessionID'] !== $prevEventId) {
                        $groupIndex++;
                        $prevEventId = $race['SessionID'];
                    }
                    $groupClass  = ($groupIndex % 2 === 0) ? 'event-group-a' : 'event-group-b';
                    $carClassCss = 'class-' . strtolower(str_replace([' ', '-', '#'], '', $race['Class']));
                ?>
                <tr class="<?php echo $groupClass; ?>">
                    <td class="text-center">
                        <a href="race_details.php?session_id=<?php echo urlencode($race['SessionID']); ?>&lang=<?php echo $current_lang; ?>&session_view=<?php echo $race['SessionType']; ?>&from=race-results-table" title="Voir les détails de la session"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg></a>
                    </td>
                    <td class="text-center">
                        <?php if (!empty($race['Car']) && !empty($race['Track'])): ?>
                        <a href="records.php?track=<?php echo urlencode($race['Track']); ?>&class=<?php echo urlencode($race['Class']); ?>&car=<?php echo urlencode($race['Car']); ?>&lang=<?php echo $current_lang; ?>" title="<?php echo htmlspecialchars(sprintf($lang['records_link_title'] ?? 'Records — %s · %s', $race['Track'], $race['Car'])); ?>"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 7 13.5 15.5 8.5 10.5 2 17"/><polyline points="16 7 22 7 22 13"/></svg></a>
                        <?php else: ?>
                        <span style="color:grey;">—</span>
                        <?php endif; ?>
                    </td>
                    <td class="clickable-filter" data-filter-type="track" data-filter-value="<?php echo htmlspecialchars($race['Track']); ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ' . $race['Track']); ?>">
                        <?php $flagUrl = getCircuitFlagUrl($race['Track']); if ($flagUrl):?><img src="<?php echo htmlspecialchars($flagUrl); ?>" alt="" class="logo flag-icon"><?php endif; ?><?php echo htmlspecialchars($race['Track']); ?>
                    </td>
                    <td class="clickable-filter" data-filter-type="track_course" data-filter-value="<?php echo htmlspecialchars($race['TrackCourse'] ?? ''); ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ' . ($race['TrackCourse'] ?? '')); ?>">
						<?php echo isset($race['TrackCourse']) ? htmlspecialchars($race['TrackCourse']) : ''; ?>
					</td>
                    <td class="text-center clickable-filter" data-filter-type="setting" data-filter-value="<?php echo htmlspecialchars($race['Setting']); ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ') . translateTerm($race['Setting'], $lang); ?>"><?php echo translateTerm($race['Setting'], $lang); ?></td>
                    <td class="text-center clickable-filter" data-filter-type="session_type" data-filter-value="<?php echo htmlspecialchars($race['SessionType']); ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ') . translateTerm($race['SessionType'], $lang); ?>">
                        <?php
                            $sessionType = $race['SessionType'];
                            $sessionClass = 'session-' . strtolower($sessionType);
                            echo '<span class="badge ' . $sessionClass . '">' . translateTerm($sessionType, $lang) . '</span>';
                        ?>
                    </td>
                        <td class="text-center">
                            <a href="index.php?class=<?php echo urlencode($race['Class']); ?>&lang=<?php echo $current_lang; ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ' . $race['Class']); ?>" style="text-decoration: none;">
                                <span class="badge <?php echo $carClassCss; ?>"><?php echo str_replace(' ELMS', '', htmlspecialchars($race['Class'])); ?></span>
                            </a>
                        </td>
                    <td class="clickable-filter" data-filter-type="car1" data-filter-value="<?php echo htmlspecialchars($race['Car']); ?>" title="<?php echo htmlspecialchars(($lang['filter_by'] ?? 'Filter by') . ' ' . $race['Car']); ?>">
                        <?php $logoUrl = getCarLogoUrl($race['Car']); if ($logoUrl):?><img src="<?php echo htmlspecialchars($logoUrl); ?>" alt="" class="logo"><?php endif; ?><?php echo htmlspecialchars($race['Car']); ?>
                    </td>
                    <td><?php echo htmlspecialchars($race['Livery']); ?></td>
                    <td class="is-pb clickable-cell text-center" data-session-id="<?php echo htmlspecialchars($race['Date']); ?>" data-track="<?php echo htmlspecialchars($race['Track']); ?>" data-best-lap-text="<?php echo isset($race['BestLap']) ? htmlspecialchars(formatSecondsToMmSsMs($race['BestLap'])) : ''; ?>">
                        <?php echo isset($race['BestLap']) ? formatSecondsToMmSsMs($race['BestLap']) : $lang['not_available']; ?>
                    </td>
                    <td class="text-center"><?php echo ($race['SessionType'] === 'Race' && $race['GridPos'] > 0) ? 'P' . $race['GridPos'] : '<span style="color: grey;">' . $lang['not_available'] . '</span>'; ?></td>
                    <td class="text-center">
                        <?php if ($race['SessionType'] === 'Race'): ?>
                            <?php if ($race['Status'] === 'Finished Normally'): ?>
                                <strong>P<?php echo $race['Position']; ?></strong> / <?php echo $race['Participants']; ?>
                            <?php else: ?>
                                <span class="status-dnf"><?php echo translateTerm($race['Status'], $lang); ?></span>
                            <?php endif; ?>
                        <?php else: ?>
                            <span style="color: grey;"><?php echo $lang['not_available']; ?></span>
                        <?php endif; ?>
                    </td>
                    <td class="text-center">
                        <?php
                            if ($race['SessionType'] === 'Race') {
                                echo renderProgression($race['Progression']);
                            } else {
                                echo '<span style="color: grey;">' . $lang['not_available'] . '</span>';
                            }
                        ?>
                    </td>
                    <td class="text-center"><?php echo $race['Pitstops']; ?></td>
                    <td class="text-center"><?php echo date('d/m/Y H:i', $race['Date']); ?></td>
                    <td class="text-center"><?php echo htmlspecialchars($race['GameVersion']); ?></td>
                </tr>
                <?php endforeach; ?>
            </tbody>
        </table>
    </div>

    <?php if ($totalSessions > 0): ?>
    <div class="pagination">
        <div class="per-page-selector">
            <form action="index.php#race-results-table" method="get" id="per-page-form">
                <label for="per_page"><?php echo $lang['races_per_page']; ?>:</label>
                <select name="per_page" id="per_page" onchange="this.form.submit();">
                    <?php foreach ($racesPerPageOptions as $option): ?>
                        <option value="<?php echo $option; ?>" <?php if ($option == $racesPerPage) echo 'selected'; ?>><?php echo $option; ?></option>
                    <?php endforeach; ?>
                </select>
                <input type="hidden" name="lang" value="<?php echo htmlspecialchars($current_lang); ?>">
                <input type="hidden" name="track" value="<?php echo htmlspecialchars($selectedTrack); ?>">
                <input type="hidden" name="class" value="<?php echo htmlspecialchars($selectedClass); ?>">
                <input type="hidden" name="car1" value="<?php echo htmlspecialchars($selectedCar1); ?>">
                <input type="hidden" name="session_type" value="<?php echo htmlspecialchars($selectedSessionType); ?>">
                <input type="hidden" name="version" value="<?php echo htmlspecialchars($selectedVersion); ?>">
                <?php if ($filterOnlyVersion): ?><input type="hidden" name="filter_only_version" value="1"><?php endif; ?>
            </form>
        </div>

        <?php if ($totalPages > 1): ?>
        <div class="page-links">
        <?php
            $queryParams = $_GET;
            unset($queryParams['page']);
            $anchor = '#race-results-table';
            $baseLink = 'index.php?' . http_build_query($queryParams) . '&page=';

            if ($currentPage > 1) {
                echo '<a href="' . $baseLink . ($currentPage - 1) . $anchor . '">&laquo; '.(isset($lang['pagination_prev']) ? $lang['pagination_prev'] : 'Previous').'</a>';
            } else {
                echo '<span class="disabled">&laquo; '.(isset($lang['pagination_prev']) ? $lang['pagination_prev'] : 'Previous').'</span>';
            }

            $showEllipsis = true;
            for ($i = 1; $i <= $totalPages; $i++) {
                if ($i == 1 || $i == $totalPages || ($i >= $currentPage - 2 && $i <= $currentPage + 2)) {
                    if ($i == $currentPage) {
                        echo '<span class="active">' . $i . '</span>';
                    } else {
                        echo '<a href="' . $baseLink . $i . $anchor . '">' . $i . '</a>';
                    }
                    $showEllipsis = true;
                } elseif ($showEllipsis) {
                    echo '<span class="ellipsis">...</span>';
                    $showEllipsis = false;
                }
            }

            if ($currentPage < $totalPages) {
                echo '<a href="' . $baseLink . ($currentPage + 1) . $anchor . '">'.(isset($lang['pagination_next']) ? $lang['pagination_next'] : 'Next').' &raquo;</a>';
            } else {
                echo '<span class="disabled">'.(isset($lang['pagination_next']) ? $lang['pagination_next'] : 'Next').' &raquo;</span>';
            }
        ?>
        </div>
        <?php endif; ?>
    </div>
    <?php endif; ?>
    <?php endif; ?>

    <div id="lapChartModal" class="modal">
        <div class="modal-content">
            <div class="modal-header">
                <h2 id="chartTitle"></h2><span id="chartBestLap"></span>
                <span class="close-button">&times;</span>
            </div>
            <canvas id="lapChart"></canvas>
        </div>
    </div>
<button onclick="topFunction()" id="back-to-top-btn" title="Go to top">↑</button>
<?php require 'includes/footer.php'; ?>
<script>
const trackLayoutsMap = <?php echo json_encode($trackLayoutsMap); ?>;
// --- Bouton Retour en Haut ---
var mybutton = document.getElementById("back-to-top-btn");
window.addEventListener('scroll', scrollFunction);

function scrollFunction() {
  if (document.body.scrollTop > 20 || document.documentElement.scrollTop > 20) {
    mybutton.style.display = "block";
  } else {
    mybutton.style.display = "none";
  }
}

function topFunction() {
  document.body.scrollTop = 0;
  document.documentElement.scrollTop = 0;
}

document.addEventListener('DOMContentLoaded', function() {
    // --- En-têtes de circuit dépliables ---
    document.querySelectorAll('.collapsible-trigger').forEach(trigger => {
        trigger.addEventListener('click', function() {
            const header = this.closest('.circuit-group-header');
            header.classList.toggle('collapsed');
            const targetGroup = header.dataset.groupId;
            
            document.querySelectorAll(`tr[data-track-group="${targetGroup}"]`).forEach(row => {
                row.classList.toggle('collapsed-row');
            });

            let nextSibling = header.nextElementSibling;
            if (nextSibling && nextSibling.tagName === 'THEAD') {
                nextSibling.classList.toggle('collapsed-row');
            }
        });
    });

    // --- Case à cocher Tout Déployer/Replier ---
    const toggleCheckbox = document.getElementById('toggle-all-checkbox');
    if (toggleCheckbox) {
        toggleCheckbox.addEventListener('change', function() {
            const isChecked = this.checked;
            document.querySelectorAll('.circuit-group-header').forEach(header => {
                const targetGroup = header.dataset.groupId;
                const shouldBeCollapsed = !isChecked;

                if (header.classList.contains('collapsed') !== shouldBeCollapsed) {
                    header.classList.toggle('collapsed', shouldBeCollapsed);
                    document.querySelectorAll(`tr[data-track-group="${targetGroup}"]`).forEach(row => {
                        row.classList.toggle('collapsed-row', shouldBeCollapsed);
                    });
                    let nextSibling = header.nextElementSibling;
                    if (nextSibling && nextSibling.tagName === 'THEAD') {
                        nextSibling.classList.toggle('collapsed-row', shouldBeCollapsed);
                    }
                }
            });
        });
    }
    const translations = {
        chartTitle: "<?php echo $lang['js_laps_chart_title']; ?>",
        bestLapPrefix: "<?php echo $lang['js_laps_chart_best_lap']; ?>",
        lapTimeLabel: "<?php echo $lang['js_laps_chart_label']; ?>",
        lapPrefix: "<?php echo $lang['js_laps_chart_lap']; ?>",
        noLapData: "<?php echo addslashes($lang['js_no_lap_data']); ?>"
    };
    
	// --- Logique de Soumission de Filtre Globale (remplace tous les onchange) ---
    const filterForm = document.getElementById('filter-form');
    const trackSelect = document.getElementById('track-select');
    const courseSelect = document.getElementById('track-course-select');

    // Fonction pour mettre à jour la liste des tracés (utilisée uniquement par trackSelect)
    function updateTrackCourseSelect(selectedVenue) {
        const layouts = trackLayoutsMap[selectedVenue] || [];
        // On récupère la valeur actuelle pour tenter de la conserver si elle reste valide
        const previouslySelectedCourse = courseSelect.value;
        
        // On vide le menu des tracés
        courseSelect.innerHTML = '';

        // On ajoute l'option "Tous" / "All"
        const allOption = document.createElement('option');
        allOption.value = 'all';
        allOption.textContent = "<?php echo $lang['all']; ?>";
        courseSelect.appendChild(allOption);

        // On ajoute les nouveaux tracés
        if (layouts.length > 0) {
            layouts.forEach(layout => {
                const option = document.createElement('option');
                option.value = layout;
                option.textContent = layout;
                courseSelect.appendChild(option);
            });
            // Si le tracé précédent existe dans le nouveau circuit, on le garde sélectionné.
            if (layouts.includes(previouslySelectedCourse)) {
                courseSelect.value = previouslySelectedCourse;
            } else if (selectedVenue === 'all' && previouslySelectedCourse !== 'all') {
                // Si on revient à "Tous" les circuits, on conserve l'ancien tracé s'il est dans la liste globale.
                // Attention : si le tracé n'est plus pertinent, il est préférable de réinitialiser.
                // Ici, on laisse la logique PHP gérer la reconstruction complète de la liste si 'all' est sélectionné
                // mais pour la dépendance de l'UI, si on change de circuit, on réinitialise le tracé s'il est invalide.
                if (!layouts.includes(previouslySelectedCourse)) {
                    courseSelect.value = 'all';
                } else {
                    courseSelect.value = previouslySelectedCourse;
                }
            } else {
                // Sinon, on sélectionne "Tous" les tracés
                courseSelect.value = 'all';
            }
        } else {
             courseSelect.value = 'all';
        }
    }

    if (filterForm) {
        // Liste de tous les éléments interactifs du formulaire à surveiller
        const filterElements = filterForm.querySelectorAll('select, input[type="checkbox"]');

        filterElements.forEach(element => {
            element.addEventListener('change', function() {
                // Traitement spécial pour le changement de circuit AVANT la soumission
                if (element.id === 'track-select') {
                    // Met à jour la liste des tracés
                    updateTrackCourseSelect(this.value);
                }
                
                // Soumet le formulaire pour que tous les filtres soient pris en compte (y compris la checkbox)
                filterForm.submit();
            });
        });
    }
	
    
    let lapChart = null;
    const modal = document.getElementById('lapChartModal');
    if (!modal) return;
    const closeButton = modal.querySelector('.close-button');
    closeButton.onclick = () => { modal.style.display = 'none'; };
    modal.addEventListener('click', (event) => { if (event.target === modal) modal.style.display = 'none'; });

    async function openLapChart(sessionId, track, bestLapText) {
        let lapData;
        try {
            const res = await fetch('fetch_laps.php?session_id=' + encodeURIComponent(sessionId));
            lapData = await res.json();
        } catch(e) {
            alert(translations.noLapData);
            return;
        }

        // Le premier tour est souvent un tour de sortie, on le saute pour une meilleure échelle.
        const slicedLapData = (lapData || []).slice(1);

        if (slicedLapData.length < 2) {
            alert(translations.noLapData);
            return;
        }

        document.getElementById('chartTitle').innerText = `${translations.chartTitle} - ${track}`;
        document.getElementById('chartBestLap').innerText = `(${translations.bestLapPrefix}: ${bestLapText})`;

        const minLapTimeInSession = Math.min(...slicedLapData);
        const maxLapTimeInSession = Math.max(...slicedLapData);
        // Labels commencent au tour 2 car le tour 1 est retiré
        const labels = slicedLapData.map((_, i) => `${translations.lapPrefix} ${i + 2}`);

        if (lapChart) { lapChart.destroy(); }

        const ctx = document.getElementById('lapChart').getContext('2d');
        const gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(0, 86, 179, 0.5)');
        gradient.addColorStop(1, 'rgba(0, 86, 179, 0)');

        const pointColors = slicedLapData.map(lap => lap === minLapTimeInSession ? '#28a745' : 'rgba(0, 86, 179, 0.9)');
        const pointRadii  = slicedLapData.map(lap => lap === minLapTimeInSession ? 7 : 4);

        lapChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: translations.lapTimeLabel,
                    data: slicedLapData,
                    fill: true,
                    backgroundColor: gradient,
                    borderColor: 'rgba(0, 86, 179, 1)',
                    borderWidth: 2,
                    pointBackgroundColor: pointColors,
                    pointRadius: pointRadii,
                    pointHoverRadius: 8,
                    tension: 0.1
                }]
            },
            options: {
                interaction: { intersect: false, mode: 'index' },
                scales: {
                    y: {
                        min: Math.floor(minLapTimeInSession) - 1,
                        max: Math.ceil(maxLapTimeInSession) + 1,
                        ticks: {
                            callback: (value) => {
                                const min = Math.floor(value / 60);
                                const sec = value % 60;
                                return `${min}:${String(sec.toFixed(3)).padStart(6, '0')}`;
                            }
                        }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (context) => {
                                const value = context.parsed.y;
                                if (value === null) return null;
                                const min = Math.floor(value / 60);
                                const sec = value % 60;
                                let label = `${context.dataset.label || ''}: ${min}:${String(sec.toFixed(3)).padStart(6, '0')}`;
                                const delta = value - minLapTimeInSession;
                                const sign = delta >= 0 ? '+' : '';
                                if (Math.abs(delta) > 0.001) label += ` (${sign}${delta.toFixed(3)}s)`;
                                return label;
                            }
                        }
                    }
                }
            }
        });
        modal.style.display = 'block';
    }

    function initializeChartClick(selector) {
        document.querySelectorAll(selector).forEach(element => {
            element.addEventListener('click', function() {
                openLapChart(
                    this.dataset.sessionId,
                    this.dataset.track,
                    this.dataset.bestLapText
                );
            });
        });
    }

    initializeChartClick('#best-laps-table .clickable-cell');
    initializeChartClick('#race-results-table .clickable-cell');

    if (window.location.hash) {
        const tableElement = document.querySelector(window.location.hash);
        if (tableElement) {
            setTimeout(() => {
                tableElement.scrollIntoView({ behavior: 'smooth', block: 'start' });
            }, 100);
        }
    }
    
    document.querySelectorAll('.clickable-filter').forEach(cell => {
        cell.addEventListener('click', function(event) {
            event.preventDefault();
            const filterType = this.dataset.filterType;
            const filterValue = this.dataset.filterValue;
            
            const parentTable = this.closest('table');
            const anchor = parentTable ? '#' + parentTable.id : '#best-laps-table';

            if (filterType && filterValue) {
                const currentParams = new URLSearchParams(window.location.search);
                currentParams.set(filterType, filterValue);
                if (filterType === 'car1') {
                    currentParams.set('car2', 'all');
                }
                currentParams.set('page', '1');
                window.location.href = window.location.pathname + '?' + currentParams.toString() + anchor;
            }
        });
    });
});
</script>

</body>
</html>