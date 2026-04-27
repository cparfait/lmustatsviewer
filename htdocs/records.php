<?php
/**
 * records.php — Progression historique des records personnels
 * Paramètres GET : track, course, class, car, lang
 */
require_once 'includes/init.php';
require_once 'includes/db.php';

if (empty($config['results_dir'])) {
    header('Location: config.php?first_launch=1');
    exit;
}

$db = get_db();

// --- Toutes les combos ayant un best_lap (pour les filtres) ---
$combos = get_records_track_car_combos($db);

$allTracks      = [];
$carsByTrack    = [];
$tracksByCar    = [];
$layoutsByTrack = [];
$allCars        = [];
$carsByClass    = [];   // class  → [car => true]
$classByCar     = [];   // car    → class

foreach ($combos as $c) {
    $t  = $c['track'];
    $r  = $c['track_course'];
    $v  = $c['unique_car_name'];
    $cl = $c['car_class'];

    $allTracks[$t]          = true;
    $allCars[$v]            = true;
    $carsByTrack[$t][$v]    = true;
    $tracksByCar[$v][$t]    = true;
    $layoutsByTrack[$t][$r] = true;
    $carsByClass[$cl][$v]   = true;
    $classByCar[$v]         = $cl;
}

$allTrackList = array_keys($allTracks); sort($allTrackList);
$allCarList   = array_keys($allCars);   sort($allCarList);

// Listes complémentaires pour les filtres supplémentaires
$filterOptions      = get_records_filter_options($db);
$allClassList       = $filterOptions['classes'];
$allSessionTypeList = $filterOptions['session_types'];
$allSettingList     = $filterOptions['settings'];
$allVersionList     = $filterOptions['versions'];

// --- Paramètres ---
$paramTrack        = trim($_GET['track']         ?? '');
$paramCourse       = trim($_GET['course']        ?? '');
$paramClass        = trim($_GET['class']         ?? '');
$paramCar          = trim($_GET['car']           ?? '');
$paramCar2         = trim($_GET['car2']          ?? '');
$paramSessionType  = trim($_GET['session_type']  ?? '');
$paramSetting      = trim($_GET['setting']       ?? '');
$defaultVersion    = $config['default_since_version'] ?? '1.0000';
if ($defaultVersion !== 'all' && !empty($allVersionList) && !in_array($defaultVersion, $allVersionList)) {
    $defaultVersion = $allVersionList[0] ?? 'all';
}
$paramVersion      = $_GET['version'] ?? $defaultVersion;
$filterOnlyVersion = !empty($_GET['filter_only_version']);

// Cascade : voiture → circuits
$availableTrackList = ($paramCar !== '' && isset($tracksByCar[$paramCar]))
    ? array_keys($tracksByCar[$paramCar]) : $allTrackList;
sort($availableTrackList);

// Auto-sélection de la classe quand une voiture est choisie sans classe explicite
if ($paramCar !== '' && $paramClass === '' && isset($classByCar[$paramCar])) {
    $paramClass = $classByCar[$paramCar];
}

// Cascade : circuit → voitures (puis filtrage par classe si sélectionnée)
$availableCarList = ($paramTrack !== '' && isset($carsByTrack[$paramTrack]))
    ? array_keys($carsByTrack[$paramTrack]) : $allCarList;
if ($paramClass !== '' && isset($carsByClass[$paramClass])) {
    $availableCarList = array_values(array_filter($availableCarList, fn($car) => isset($carsByClass[$paramClass][$car])));
}
sort($availableCarList);

// Voitures disponibles pour la comparaison (même classe + même circuit, sauf la voiture principale)
$compareCarList = array_values(array_filter($availableCarList, fn($c) => $c !== $paramCar));
// Si car2 n'existe plus dans les filtres actuels, le réinitialiser silencieusement
if ($paramCar2 !== '' && !in_array($paramCar2, $compareCarList)) {
    $paramCar2 = '';
}

// Layouts du circuit (toujours affichés si circuit sélectionné)
$availableLayouts = [];
if ($paramTrack !== '' && isset($layoutsByTrack[$paramTrack])) {
    $availableLayouts = array_keys($layoutsByTrack[$paramTrack]);
    sort($availableLayouts);
}

// Retour index — sans track_course pour éviter les conflits de filtre
$backUrl = 'index.php?lang=' . urlencode($current_lang)
    . ($paramTrack ? '&track=' . urlencode($paramTrack) : '')
    . ($paramClass ? '&class=' . urlencode($paramClass) : '')
    . ($paramCar   ? '&car1='  . urlencode($paramCar)   : '');

// --- Données de progression ---
$rowsAsc       = [];   // ordre chrono ASC → pour le graphique
$totalSessions = 0;
$allTimePB     = null;
$totalGain     = null;
$nbPB          = 0;

$hasSelection = ($paramTrack !== '' && $paramCar !== '');

if ($hasSelection) {
    $baseFilters = [
        'track'         => $paramTrack,
        'car'           => $paramCar,
        'course'        => $paramCourse,
        'class'         => $paramClass,
        'session_type'  => $paramSessionType,
        'setting'       => $paramSetting,
        'version'       => $paramVersion,
        'version_exact' => $filterOnlyVersion,
    ];
    $sessions = get_records_sessions($db, $baseFilters);

    $runningBest = INF;
    $firstLap    = null;
    foreach ($sessions as $s) {
        $lap     = (float)$s['best_lap'];
        $isNewPB = ($lap < $runningBest);
        $prevBest = $runningBest !== INF ? $runningBest : null; // meilleur AVANT cette session
        $gain    = null;
        if ($firstLap === null) $firstLap = $lap;
        if ($isNewPB && $runningBest !== INF) $gain = $runningBest - $lap;
        if ($isNewPB) $runningBest = $lap;

        $rowsAsc[] = array_merge($s, [
            'is_pb'        => $isNewPB,
            'pb_gain'      => $gain,
            'pb_at_point'  => $runningBest,    // meilleur APRÈS cette session
            'prev_best'    => $prevBest,        // meilleur AVANT cette session
        ]);
    }

    $totalSessions = count($rowsAsc);
    $allTimePB     = $runningBest !== INF ? $runningBest : null;
    $totalGain     = ($allTimePB && $firstLap && $firstLap > $allTimePB) ? ($firstLap - $allTimePB) : null;
    $nbPB          = count(array_filter($rowsAsc, fn($r) => $r['is_pb']));
}

// Données graphique + stats supplémentaires (un seul passage en ordre chrono ASC)
$chartLabels    = [];
$chartAllLaps   = [];
$chartPbLine    = [];
$chartCarNames  = [];
$chartS1        = [];
$chartS2        = [];
$chartS3        = [];

$totalCumulatedTime = 0.0;
$statVmax           = 0.0;
$optimalS1g         = INF; $optimalS2g = INF; $optimalS3g = INF;
$lastPBTimestamp    = null;

foreach ($rowsAsc as $r) {
    $chartLabels[]   = date('d/m/Y', $r['timestamp']);
    $chartAllLaps[]  = round((float)$r['best_lap'], 3);
    $chartPbLine[]   = round((float)$r['pb_at_point'], 3);
    $chartCarNames[] = $r['car_name'] ?? '';
    $chartS1[]       = $r['best_lap_s1'] ? round((float)$r['best_lap_s1'], 3) : null;
    $chartS2[]       = $r['best_lap_s2'] ? round((float)$r['best_lap_s2'], 3) : null;
    $chartS3[]       = $r['best_lap_s3'] ? round((float)$r['best_lap_s3'], 3) : null;

    $totalCumulatedTime += (float)$r['best_lap'];
    if (!empty($r['vmax']) && (float)$r['vmax'] > $statVmax) $statVmax = (float)$r['vmax'];
    if (!empty($r['best_lap_s1']) && (float)$r['best_lap_s1'] < $optimalS1g) $optimalS1g = (float)$r['best_lap_s1'];
    if (!empty($r['best_lap_s2']) && (float)$r['best_lap_s2'] < $optimalS2g) $optimalS2g = (float)$r['best_lap_s2'];
    if (!empty($r['best_lap_s3']) && (float)$r['best_lap_s3'] < $optimalS3g) $optimalS3g = (float)$r['best_lap_s3'];
    if ($r['is_pb']) $lastPBTimestamp = $r['timestamp'];
}

$daysSinceLastPB = $lastPBTimestamp !== null ? (int)floor((time() - $lastPBTimestamp) / 86400) : null;
$statOptimalLap  = ($optimalS1g !== INF && $optimalS2g !== INF && $optimalS3g !== INF)
                   ? ($optimalS1g + $optimalS2g + $optimalS3g) : null;
$statVmax        = $statVmax > 0 ? (int)round($statVmax) : null;
// Formatage du temps total cumulé (h min ou min s)
$_tcMin = (int)floor($totalCumulatedTime / 60);
$_tcSec = (int)round($totalCumulatedTime % 60);
$totalCumulatedDisplay = $_tcMin >= 60
    ? sprintf('%dh %02dmin', (int)floor($_tcMin / 60), $_tcMin % 60)
    : sprintf('%dmin %02ds', $_tcMin, $_tcSec);

// --- Données voiture 2 (comparaison) ---
$car2 = null;
if ($hasSelection && $paramCar2 !== '') {
    $c2sessions = get_records_sessions($db, $baseFilters + ['car' => $paramCar2]);

    if (!empty($c2sessions)) {
        $c2rowsAsc = []; $c2run = INF; $c2first = null;
        foreach ($c2sessions as $s) {
            $lap   = (float)$s['best_lap'];
            $isNew = ($lap < $c2run);
            $g2    = ($isNew && $c2run !== INF) ? ($c2run - $lap) : null;
            if ($c2first === null) $c2first = $lap;
            if ($isNew) $c2run = $lap;
            $c2rowsAsc[] = array_merge($s, ['is_pb' => $isNew, 'pb_gain' => $g2, 'pb_at_point' => $c2run]);
        }
        $c2pb     = $c2run !== INF ? $c2run : null;
        $c2gain   = ($c2pb && $c2first && $c2first > $c2pb) ? ($c2first - $c2pb) : null;
        $c2nbPB   = count(array_filter($c2rowsAsc, fn($r) => $r['is_pb']));

        $c2cum = 0.0; $c2vmx = 0.0; $c2s1 = INF; $c2s2 = INF; $c2s3 = INF; $c2lpb = null;
        foreach ($c2rowsAsc as $r) {
            $c2cum += (float)$r['best_lap'];
            if (!empty($r['vmax'])        && (float)$r['vmax']        > $c2vmx) $c2vmx = (float)$r['vmax'];
            if (!empty($r['best_lap_s1']) && (float)$r['best_lap_s1'] < $c2s1)  $c2s1  = (float)$r['best_lap_s1'];
            if (!empty($r['best_lap_s2']) && (float)$r['best_lap_s2'] < $c2s2)  $c2s2  = (float)$r['best_lap_s2'];
            if (!empty($r['best_lap_s3']) && (float)$r['best_lap_s3'] < $c2s3)  $c2s3  = (float)$r['best_lap_s3'];
            if ($r['is_pb']) $c2lpb = $r['timestamp'];
        }
        $c2opt  = ($c2s1 !== INF && $c2s2 !== INF && $c2s3 !== INF) ? ($c2s1 + $c2s2 + $c2s3) : null;
        $c2vmx  = $c2vmx > 0 ? (int)round($c2vmx) : null;
        $c2days = $c2lpb !== null ? (int)floor((time() - $c2lpb) / 86400) : null;
        $_c2m   = (int)floor($c2cum / 60); $_c2s = (int)round($c2cum % 60);
        $c2cumDisp = $_c2m >= 60 ? sprintf('%dh %02dmin', (int)floor($_c2m/60), $_c2m%60) : sprintf('%dmin %02ds', $_c2m, $_c2s);

        // Timeline fusionnée (union des timestamps des 2 voitures, ordre chrono)
        $ts1map = []; foreach ($rowsAsc   as $r) $ts1map[$r['timestamp']] = $r;
        $ts2map = []; foreach ($c2rowsAsc as $r) $ts2map[$r['timestamp']] = $r;
        $allTs  = array_unique(array_merge(array_keys($ts1map), array_keys($ts2map)));
        sort($allTs);

        $mLabels = []; $mLaps1 = []; $mPb1 = []; $mLaps2 = []; $mPb2 = [];
        $pb1run = null; $pb2run = null;
        foreach ($allTs as $ts) {
            $mLabels[] = date('d/m/Y', $ts);
            if (isset($ts1map[$ts])) { $mLaps1[] = round((float)$ts1map[$ts]['best_lap'], 3); $pb1run = round((float)$ts1map[$ts]['pb_at_point'], 3); }
            else                      { $mLaps1[] = null; }
            $mPb1[] = $pb1run;
            if (isset($ts2map[$ts])) { $mLaps2[] = round((float)$ts2map[$ts]['best_lap'], 3); $pb2run = round((float)$ts2map[$ts]['pb_at_point'], 3); }
            else                      { $mLaps2[] = null; }
            $mPb2[] = $pb2run;
        }

        $car2 = [
            'name'    => $paramCar2,
            'pb'      => $c2pb,      'gain'    => $c2gain,  'nbPB'    => $c2nbPB,
            'sessions'=> count($c2rowsAsc),
            'opt'     => $c2opt,     'vmax'    => $c2vmx,   'days'    => $c2days,
            'cumDisp' => $c2cumDisp,
            'mLabels' => $mLabels,   'mLaps1'  => $mLaps1,  'mPb1'    => $mPb1,
            'mLaps2'  => $mLaps2,    'mPb2'    => $mPb2,
        ];

        // En mode comparaison, le graphique utilise la timeline fusionnée (S1/S2/S3 désactivés)
        $chartLabels  = $mLabels;
        $chartAllLaps = $mLaps1;
        $chartPbLine  = $mPb1;
        $chartS1 = []; $chartS2 = []; $chartS3 = [];

        // ── PBs cumulés des deux voitures sur la timeline combinée ──────────
        // Fusionner + trier par timestamp ASC
        $cmbMerged = array_merge(
            array_map(fn($r) => $r + ['_is_car2' => false], $rowsAsc),
            array_map(fn($r) => $r + ['_is_car2' => true],  $c2rowsAsc)
        );
        usort($cmbMerged, fn($a, $b) => $a['timestamp'] <=> $b['timestamp']);
        // Recalculer is_pb / pb_gain / pb_at_point sur le combiné
        $cmbBest = INF;
        foreach ($cmbMerged as &$cmbR) {
            $lap = (float)$cmbR['best_lap'];
            $isNew = ($lap < $cmbBest);
            $cmbR['pb_gain']    = ($isNew && $cmbBest !== INF) ? ($cmbBest - $lap) : null;
            if ($isNew) $cmbBest = $lap;
            $cmbR['is_pb']       = $isNew;
            $cmbR['pb_at_point'] = $cmbBest;
        }
        unset($cmbR);
        $combinedRowsAsc   = $cmbMerged;
        $combinedAllTimePB = $cmbBest !== INF ? $cmbBest : null;
    }
}

// Meilleur temps de la classe sur ce circuit (running min aligné sur les dates du graphique)
$chartClassBest = [];
if ($hasSelection && $paramClass !== '' && !empty($rowsAsc)) {
    $classSessions = get_class_best_laps($db, [
        'track'         => $paramTrack,
        'class'         => $paramClass,
        'course'        => $paramCourse,
        'version'       => $paramVersion,
        'version_exact' => $filterOnlyVersion,
    ]);

    $classRunning = INF;
    $classIdx     = 0;
    $classCount   = count($classSessions);
    foreach ($rowsAsc as $r) {
        // Avancer le curseur de la classe jusqu'au timestamp courant (inclus)
        while ($classIdx < $classCount && (int)$classSessions[$classIdx]['timestamp'] <= (int)$r['timestamp']) {
            $lap = (float)$classSessions[$classIdx]['best_lap'];
            if ($lap < $classRunning) $classRunning = $lap;
            $classIdx++;
        }
        $chartClassBest[] = $classRunning !== INF ? round($classRunning, 3) : null;
    }
}

// --- Tri du tableau (le graphique reste toujours en ASC) ---
$sortBy  = $_GET['sort_by']  ?? 'Date';
$sortDir = (isset($_GET['sort_dir']) && strtolower($_GET['sort_dir']) === 'asc') ? 'asc' : 'desc';

// En mode comparaison : utiliser la timeline combinée avec PBs recalculés
if (!empty($combinedRowsAsc ?? [])) {
    $rowsDesc          = array_reverse($combinedRowsAsc);
    $combinedAllTimePB = $combinedAllTimePB ?? $allTimePB;
} else {
    $rowsDesc          = array_reverse($rowsAsc); // défaut : plus récent → plus ancien
    $combinedAllTimePB = $allTimePB;
}

$sortFunctions = [
    'Date'     => fn($a, $b) => $a['timestamp']   <=> $b['timestamp'],
    'Session'  => fn($a, $b) => strcmp($a['session_type'], $b['session_type']),
    'Type'     => fn($a, $b) => strcmp($a['setting'] ?? '', $b['setting'] ?? ''),
    'BestLap'  => fn($a, $b) => ($a['best_lap'] ?? PHP_INT_MAX) <=> ($b['best_lap'] ?? PHP_INT_MAX),
    'S1'       => fn($a, $b) => ($a['best_lap_s1'] ?? PHP_INT_MAX) <=> ($b['best_lap_s1'] ?? PHP_INT_MAX),
    'S2'       => fn($a, $b) => ($a['best_lap_s2'] ?? PHP_INT_MAX) <=> ($b['best_lap_s2'] ?? PHP_INT_MAX),
    'S3'       => fn($a, $b) => ($a['best_lap_s3'] ?? PHP_INT_MAX) <=> ($b['best_lap_s3'] ?? PHP_INT_MAX),
    'Optimal'  => function($a, $b) {
        $oa = ($a['best_lap_s1'] && $a['best_lap_s2'] && $a['best_lap_s3']) ? ((float)$a['best_lap_s1'] + (float)$a['best_lap_s2'] + (float)$a['best_lap_s3']) : PHP_INT_MAX;
        $ob = ($b['best_lap_s1'] && $b['best_lap_s2'] && $b['best_lap_s3']) ? ((float)$b['best_lap_s1'] + (float)$b['best_lap_s2'] + (float)$b['best_lap_s3']) : PHP_INT_MAX;
        return $oa <=> $ob;
    },
    'PB'       => fn($a, $b) => ($b['is_pb'] ? 1 : 0) <=> ($a['is_pb'] ? 1 : 0),
    'Record'   => fn($a, $b) => ($a['pb_at_point'] ?? PHP_INT_MAX) <=> ($b['pb_at_point'] ?? PHP_INT_MAX),
    'Gain'     => fn($a, $b) => ($b['pb_gain'] ?? -PHP_INT_MAX) <=> ($a['pb_gain'] ?? -PHP_INT_MAX),
    'Version'  => fn($a, $b) => version_compare($a['game_version'] ?? '0', $b['game_version'] ?? '0'),
];

if (isset($sortFunctions[$sortBy])) {
    usort($rowsDesc, function($a, $b) use ($sortFunctions, $sortBy, $sortDir) {
        $cmp = ($sortFunctions[$sortBy])($a, $b);
        return $sortDir === 'asc' ? $cmp : -$cmp;
    });
}

// --- Navigation inter-combos ---
$prevCombo    = null;
$nextCombo    = null;
$navTotal     = 0;
$navCurrent   = 0;
if ($hasSelection) {
    // Filtrer les combos selon la classe active (si sélectionnée)
    $navCombos = array_values(array_filter($combos, function($c) use ($paramClass) {
        return $paramClass === '' || $c['car_class'] === $paramClass;
    }));
    // Dédoublonner par (track, unique_car_name) — un circuit peut avoir plusieurs layouts
    $navSeen   = [];
    $navCombos = array_values(array_filter($navCombos, function($c) use (&$navSeen) {
        $k = $c['track'] . '|' . $c['unique_car_name'];
        if (isset($navSeen[$k])) return false;
        $navSeen[$k] = true;
        return true;
    }));
    // Tri : circuit puis voiture
    usort($navCombos, fn($a, $b) => strcmp($a['track'], $b['track']) ?: strcmp($a['unique_car_name'], $b['unique_car_name']));
    $navTotal = count($navCombos);

    $currentIdx = -1;
    foreach ($navCombos as $i => $c) {
        if ($c['track'] === $paramTrack && $c['unique_car_name'] === $paramCar) {
            $currentIdx = $i;
            break;
        }
    }
    $navCurrent = $currentIdx >= 0 ? $currentIdx + 1 : 0;

    // Paramètres de base à conserver (filtres contextuels, sans les params du combo courant)
    $navBase = $_GET;
    unset($navBase['track'], $navBase['car'], $navBase['course'], $navBase['class'], $navBase['sort_by'], $navBase['sort_dir']);

    if ($currentIdx > 0) {
        $pc = $navCombos[$currentIdx - 1];
        $prevCombo = array_merge($navBase, ['track' => $pc['track'], 'car' => $pc['unique_car_name'], 'class' => $pc['car_class'], 'lang' => $current_lang]);
    }
    if ($currentIdx >= 0 && $currentIdx < $navTotal - 1) {
        $nc = $navCombos[$currentIdx + 1];
        $nextCombo = array_merge($navBase, ['track' => $nc['track'], 'car' => $nc['unique_car_name'], 'class' => $nc['car_class'], 'lang' => $current_lang]);
    }
}

$pageTitle = ($lang['records_title'] ?? 'Records Personnels')
    . ($paramCar   ? ' — ' . $paramCar   : '')
    . ($paramTrack ? ' · '  . $paramTrack : '');
?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>" data-theme="<?php echo $current_theme; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($pageTitle); ?></title>
    <link rel="icon" href="logos/favicon.ico" type="image/x-icon">
    <script src="js/chart.js"></script>
    <link rel="stylesheet" href="css/style.css?v=<?php echo filemtime('css/style.css'); ?>">
</head>
<body>

<div class="container">

    <!-- ── En-tête style race_details ── -->
    <div class="page-header">
        <a href="<?php echo $backUrl; ?>" class="btn btn-action"><?php echo $lang['records_back'] ?? '&laquo; Retour'; ?></a>
        <h1><?php echo $lang['records_title'] ?? 'Records Personnels'; ?>
            <?php if ($hasSelection): ?>
            <span class="header-date"><?php echo htmlspecialchars($paramTrack . ($paramCar ? ' · ' . $paramCar : '')); ?></span>
            <?php endif; ?>
        </h1>
        <div class="header-spacer"></div>
    </div>

    <?php if ($hasSelection): ?>
    <div class="record-header-card">
        <!-- Circuit -->
        <div class="rhc-block">
            <?php $flagUrl = getCircuitFlagUrl($paramTrack); ?>
            <?php if ($flagUrl): ?>
                <img src="<?php echo htmlspecialchars($flagUrl); ?>" alt="" class="rhc-flag">
            <?php else: ?>
                <span class="rhc-icon-fallback">🏁</span>
            <?php endif; ?>
            <div>
                <div class="rhc-label"><?php echo $lang['filter_track'] ?? 'Circuit'; ?></div>
                <div class="rhc-name"><?php echo htmlspecialchars($paramTrack); ?></div>
                <?php if ($paramCourse && $paramCourse !== $paramTrack): ?>
                    <div class="rhc-sublabel"><?php echo htmlspecialchars($paramCourse); ?></div>
                <?php endif; ?>
            </div>
        </div>
        <div class="rhc-divider"></div>
        <!-- Voiture -->
        <div class="rhc-block">
            <?php $logoUrl = getCarLogoUrl($paramCar); ?>
            <?php if ($logoUrl): ?>
                <img src="<?php echo htmlspecialchars($logoUrl); ?>" alt="" class="rhc-car-logo">
            <?php else: ?>
                <span class="rhc-icon-fallback">🚗</span>
            <?php endif; ?>
            <div>
                <div class="rhc-label"><?php echo $lang['records_filter_car'] ?? 'Voiture'; ?></div>
                <div class="rhc-name">
                    <?php echo htmlspecialchars($paramCar); ?>
                    <?php if ($paramClass): ?>
                        &nbsp;<span class="badge class-<?php echo strtolower(str_replace([' ','-','#'],'',$paramClass)); ?>" style="font-size:.7em;padding:2px 8px;">
                            <?php echo htmlspecialchars($paramClass); ?>
                        </span>
                    <?php endif; ?>
                </div>
            </div>
        </div>
    </div>
    <?php endif; ?>

<?php
// Capture le bloc filtre pour le réutiliser dans tous les cas (sélection, no data, data)
ob_start(); ?>
<div class="filter-section" style="margin: 0 0 20px 0; max-width: none; box-sizing: border-box;">
    <form method="get" action="records.php" id="records-filter-form">
        <input type="hidden" name="lang" value="<?php echo htmlspecialchars($current_lang); ?>">
        <a href="records.php?lang=<?php echo $current_lang; ?>" class="reset-filter-btn" title="<?php echo $lang['filter_reset'] ?? 'Réinitialiser'; ?>">
            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/>
                <path d="M3 3v5h5"/>
            </svg>
        </a>
        <div class="filter-group">
            <label for="rec-track"><?php echo $lang['filter_track'] ?? 'Circuit'; ?></label>
            <select id="rec-track" name="track" onchange="this.form.submit()">
                <option value=""><?php echo $lang['all'] ?? 'Tous'; ?></option>
                <?php foreach ($availableTrackList as $t): ?>
                    <option value="<?php echo htmlspecialchars($t); ?>" <?php if ($t === $paramTrack) echo 'selected'; ?>><?php echo htmlspecialchars($t); ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php if ($paramTrack !== '' && count($availableLayouts) > 1): ?>
        <div class="filter-group">
            <label for="rec-course"><?php echo $lang['filter_layout'] ?? 'Tracé'; ?></label>
            <select id="rec-course" name="course" onchange="this.form.submit()">
                <option value=""><?php echo $lang['all'] ?? 'Tous'; ?></option>
                <?php foreach ($availableLayouts as $lyt): ?>
                    <option value="<?php echo htmlspecialchars($lyt); ?>" <?php if ($lyt === $paramCourse) echo 'selected'; ?>><?php echo htmlspecialchars($lyt); ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php endif; ?>
        <div class="filter-group">
            <label for="rec-car"><?php echo $lang['filter_car_1'] ?? 'Voiture'; ?></label>
            <select id="rec-car" name="car" onchange="this.form.submit()">
                <option value=""><?php echo $lang['all_fem'] ?? 'Toutes'; ?></option>
                <?php foreach ($availableCarList as $car): ?>
                    <option value="<?php echo htmlspecialchars($car); ?>" <?php if ($car === $paramCar) echo 'selected'; ?>><?php echo htmlspecialchars($car); ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php if ($hasSelection && !empty($compareCarList)): ?>
        <div class="filter-group filter-group--compare">
            <label for="rec-car2"><?php echo $lang['records_compare_with'] ?? 'Comparer avec'; ?></label>
            <select id="rec-car2" name="car2" onchange="this.form.submit()">
                <option value="">—</option>
                <?php foreach ($compareCarList as $car): ?>
                    <option value="<?php echo htmlspecialchars($car); ?>" <?php if ($car === $paramCar2) echo 'selected'; ?>><?php echo htmlspecialchars($car); ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <?php endif; ?>
        <div class="filter-group">
            <label for="rec-class"><?php echo $lang['filter_class'] ?? 'Classe'; ?></label>
            <select id="rec-class" name="class" onchange="this.form.submit()">
                <option value=""><?php echo $lang['all_fem'] ?? 'Toutes'; ?></option>
                <?php foreach ($allClassList as $cls): ?>
                    <option value="<?php echo htmlspecialchars($cls); ?>" <?php if ($cls === $paramClass) echo 'selected'; ?>><?php echo htmlspecialchars($cls); ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="filter-group">
            <label for="rec-session"><?php echo $lang['th_session'] ?? 'Session'; ?></label>
            <select id="rec-session" name="session_type" onchange="this.form.submit()">
                <option value=""><?php echo $lang['all_fem'] ?? 'Toutes'; ?></option>
                <?php foreach ($allSessionTypeList as $st): ?>
                    <option value="<?php echo htmlspecialchars($st); ?>" <?php if ($st === $paramSessionType) echo 'selected'; ?>><?php echo translateTerm($st, $lang); ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="filter-group">
            <label for="rec-setting"><?php echo $lang['filter_type'] ?? 'Type'; ?></label>
            <select id="rec-setting" name="setting" onchange="this.form.submit()">
                <option value=""><?php echo $lang['all'] ?? 'Tous'; ?></option>
                <?php foreach ($allSettingList as $set): ?>
                    <option value="<?php echo htmlspecialchars($set); ?>" <?php if ($set === $paramSetting) echo 'selected'; ?>><?php echo translateTerm($set, $lang); ?></option>
                <?php endforeach; ?>
            </select>
        </div>
        <div class="filter-group">
            <label for="rec-version"><?php echo $lang['filter_since_version_label'] ?? 'Depuis version'; ?></label>
            <select id="rec-version" name="version" onchange="this.form.submit()">
                <option value="all"><?php echo $lang['all_fem'] ?? 'Toutes'; ?></option>
                <?php foreach ($allVersionList as $ver): ?>
                    <option value="<?php echo htmlspecialchars($ver); ?>" <?php if ($ver === $paramVersion) echo 'selected'; ?>>≥ <?php echo htmlspecialchars($ver); ?></option>
                <?php endforeach; ?>
            </select>
            <input type="checkbox" id="rec-filter-only" name="filter_only_version" value="1" <?php if ($filterOnlyVersion) echo 'checked'; ?> title="<?php echo $lang['filter_only_version_tooltip'] ?? 'Uniquement cette version'; ?>" onchange="this.form.submit()">
        </div>
    </form>
</div>
<?php $filterHtml = ob_get_clean(); ?>

    <?php if (!$hasSelection): ?>
        <?php echo $filterHtml; ?>
        <p class="message" style="padding:32px 24px;">
            <?php echo $lang['records_pick_combo'] ?? 'Sélectionnez un circuit et une voiture pour afficher la progression de vos records.'; ?>
        </p>

    <?php elseif (empty($rowsAsc)): ?>
        <?php echo $filterHtml; ?>
        <p class="message"><?php echo $lang['records_no_data'] ?? 'Aucune session trouvée.'; ?></p>

    <?php else: ?>

        <!-- ── Résumé chiffré ── -->
        <div class="records-summary">
            <div class="records-stat">
                <h3><?php echo $lang['records_sessions_count'] ?? 'Sessions'; ?></h3>
                <p><?php echo $totalSessions; ?></p>
            </div>
            <div class="records-stat">
                <h3><?php echo $lang['records_th_best_lap'] ?? 'Meilleur Tour'; ?></h3>
                <p><?php echo formatSecondsToMmSsMs($allTimePB); ?></p>
            </div>
            <?php if ($totalGain !== null && $totalGain > 0.001): ?>
            <div class="records-stat">
                <h3><?php echo $lang['records_gain'] ?? 'Gain'; ?></h3>
                <p class="gain-positive">-<?php echo formatSecondsToMmSsMs($totalGain, false); ?></p>
            </div>
            <?php endif; ?>
            <div class="records-stat">
                <h3><?php echo $lang['records_new_pb'] ?? 'Records battus'; ?></h3>
                <p><?php echo $nbPB; ?></p>
            </div>
            <?php if ($statOptimalLap !== null): ?>
            <div class="records-stat">
                <h3><?php echo $lang['th_optimal'] ?? 'Tour Optimal'; ?></h3>
                <p><?php echo formatSecondsToMmSsMs($statOptimalLap); ?></p>
            </div>
            <?php endif; ?>
            <?php if ($statVmax): ?>
            <div class="records-stat">
                <h3>Vmax</h3>
                <p><?php echo $statVmax; ?> km/h</p>
            </div>
            <?php endif; ?>
            <?php if ($daysSinceLastPB !== null): ?>
            <div class="records-stat">
                <h3><?php echo $lang['records_days_since_pb'] ?? 'Dernier PB'; ?></h3>
                <p><?php
                    if ($daysSinceLastPB === 0)      echo $lang['records_days_today']     ?? "Aujourd'hui";
                    elseif ($daysSinceLastPB === 1)  echo $lang['records_days_yesterday'] ?? 'Hier';
                    else                             echo $daysSinceLastPB . '&thinsp;' . ($lang['records_days_unit'] ?? 'j');
                ?></p>
            </div>
            <?php endif; ?>
            <div class="records-stat">
                <h3><?php echo $lang['records_total_time'] ?? 'Temps cumulé'; ?></h3>
                <p><?php echo $totalCumulatedDisplay; ?></p>
            </div>
        </div>

        <!-- ── Filtres (avant le tableau comparatif) ── -->
        <?php echo $filterHtml; ?>

        <?php if ($car2 !== null): ?>
        <!-- ── Tableau comparatif ── -->
        <?php
        // Helper : retourne 'cmp-win' pour la meilleure valeur (lower ou higher wins)
        function cmpClass($v1, $v2, $mode) {
            if ($v1 === null || $v2 === null || $v1 === $v2) return ['', ''];
            $wins1 = ($mode === 'lower') ? ($v1 < $v2) : ($v1 > $v2);
            return $wins1 ? ['cmp-win', ''] : ['', 'cmp-win'];
        }
        ?>
        <h2 class="table-title-heading"><?php echo $lang['records_compare_title'] ?? 'Comparaison'; ?></h2>
        <div class="view-content">
            <table>
                <thead>
                    <tr>
                        <th style="text-align:left;width:22%;"><?php echo $lang['records_th_metric'] ?? 'Métrique'; ?></th>
                        <th class="cmp-car1">
                            <?php $l1 = getCarLogoUrl($paramCar); if ($l1): ?>
                                <img src="<?php echo htmlspecialchars($l1); ?>" style="height:18px;vertical-align:middle;margin-right:6px;object-fit:contain;">
                            <?php endif; ?>
                            <?php echo htmlspecialchars($paramCar); ?>
                        </th>
                        <th style="width:12%;">Écart</th>
                        <th class="cmp-car2">
                            <?php $l2 = getCarLogoUrl($car2['name']); if ($l2): ?>
                                <img src="<?php echo htmlspecialchars($l2); ?>" style="height:18px;vertical-align:middle;margin-right:6px;object-fit:contain;">
                            <?php endif; ?>
                            <?php echo htmlspecialchars($car2['name']); ?>
                        </th>
                    </tr>
                </thead>
                <tbody>
                <?php
                // Helper : calcule l'écart formaté + classe CSS
                // mode 'time_lower' : delta en secondes, moins = meilleur
                // mode 'num_higher' : delta numérique, plus = meilleur
                // mode 'none'       : pas de delta
                function cmpDelta($v1, $v2, $mode) {
                    if ($v1 === null || $v2 === null) return ['—', ''];
                    if ($mode === 'none') return ['—', ''];
                    if ($mode === 'time_lower') {
                        $d = $v2 - $v1;   // positif = car1 est plus rapide
                        if (abs($d) < 0.001) return ['=', ''];
                        $sign = $d > 0 ? '−' : '+';
                        return [$sign . number_format(abs($d), 3) . 's', $d > 0 ? 'better' : 'worse'];
                    }
                    if ($mode === 'num_higher') {
                        $d = $v1 - $v2;   // positif = car1 est plus grand
                        if ($d == 0) return ['=', ''];
                        $sign = $d > 0 ? '+' : '−';
                        return [$sign . abs($d), $d > 0 ? 'better' : 'worse'];
                    }
                    return ['—', ''];
                }

                $metrics = [
                // [label, v1_display, v2_display, c1_class, c2_class, delta_display, delta_class]
                    (function() use ($allTimePB, $car2, $lang) {
                        [$c1,$c2] = cmpClass($allTimePB, $car2['pb'], 'lower');
                        [$dv,$dc] = cmpDelta($allTimePB, $car2['pb'], 'time_lower');
                        return [$lang['records_th_best_lap'] ?? 'Meilleur Tour',
                            formatSecondsToMmSsMs($allTimePB), formatSecondsToMmSsMs($car2['pb']),
                            $c1, $c2, $dv, $dc];
                    })(),
                    (function() use ($statOptimalLap, $car2, $lang) {
                        [$c1,$c2] = cmpClass($statOptimalLap, $car2['opt'], 'lower');
                        [$dv,$dc] = cmpDelta($statOptimalLap, $car2['opt'], 'time_lower');
                        return [$lang['th_optimal'] ?? 'Tour Optimal',
                            $statOptimalLap ? formatSecondsToMmSsMs($statOptimalLap) : '—',
                            $car2['opt']    ? formatSecondsToMmSsMs($car2['opt'])    : '—',
                            $c1, $c2, $dv, $dc];
                    })(),
                    (function() use ($statVmax, $car2) {
                        [$c1,$c2] = cmpClass($statVmax, $car2['vmax'], 'higher');
                        [$dv,$dc] = cmpDelta($statVmax, $car2['vmax'], 'num_higher');
                        $dv = ($dv !== '—' && $dv !== '=') ? $dv . ' km/h' : $dv;
                        return ['Vmax',
                            $statVmax     ? $statVmax     . ' km/h' : '—',
                            $car2['vmax'] ? $car2['vmax'] . ' km/h' : '—',
                            $c1, $c2, $dv, $dc];
                    })(),
                    (function() use ($totalSessions, $car2, $lang) {
                        [$c1,$c2] = cmpClass($totalSessions, $car2['sessions'], 'higher');
                        [$dv,$dc] = cmpDelta($totalSessions, $car2['sessions'], 'num_higher');
                        return [$lang['records_sessions_count'] ?? 'Sessions',
                            $totalSessions, $car2['sessions'], $c1, $c2, $dv, $dc];
                    })(),
                    (function() use ($nbPB, $car2, $lang) {
                        [$c1,$c2] = cmpClass($nbPB, $car2['nbPB'], 'higher');
                        [$dv,$dc] = cmpDelta($nbPB, $car2['nbPB'], 'num_higher');
                        return [$lang['records_new_pb'] ?? 'Records battus',
                            $nbPB, $car2['nbPB'], $c1, $c2, $dv, $dc];
                    })(),
                    (function() use ($totalGain, $car2, $lang) {
                        [$c1,$c2] = cmpClass($totalGain, $car2['gain'], 'higher');
                        [$dv,$dc] = cmpDelta($totalGain, $car2['gain'], 'time_lower');
                        // Gain : lower delta means car2 gained more → invert class
                        if ($dc === 'better') $dc = 'worse'; elseif ($dc === 'worse') $dc = 'better';
                        return [$lang['records_gain'] ?? 'Gain total',
                            $totalGain    ? '−'.formatSecondsToMmSsMs($totalGain,    false) : '—',
                            $car2['gain'] ? '−'.formatSecondsToMmSsMs($car2['gain'], false) : '—',
                            $c1, $c2, $dv, $dc];
                    })(),
                    (function() use ($daysSinceLastPB, $car2, $lang) {
                        [$c1,$c2] = cmpClass($daysSinceLastPB, $car2['days'], 'lower');
                        [$dv,$dc] = cmpDelta($daysSinceLastPB, $car2['days'], 'num_higher');
                        if ($dc === 'better') $dc = 'worse'; elseif ($dc === 'worse') $dc = 'better';
                        $dv = ($dv !== '—' && $dv !== '=') ? $dv . ' j' : $dv;
                        return [$lang['records_days_since_pb'] ?? 'Dernier PB',
                            $daysSinceLastPB !== null ? $daysSinceLastPB . ' j' : '—',
                            $car2['days']    !== null ? $car2['days']    . ' j' : '—',
                            $c1, $c2, $dv, $dc];
                    })(),
                    [$lang['records_total_time'] ?? 'Temps cumulé',
                        $totalCumulatedDisplay, $car2['cumDisp'], '', '', '—', ''],
                ];
                foreach ($metrics as [$label, $v1, $v2, $c1, $c2c, $dv, $dc]):
                ?>
                    <tr>
                        <td><?php echo htmlspecialchars($label); ?></td>
                        <td class="text-center <?php echo $c1; ?>"><?php echo $v1; ?></td>
                        <td class="text-center cmp-delta <?php echo $dc; ?>"><?php echo $dv; ?></td>
                        <td class="text-center <?php echo $c2c; ?>"><?php echo $v2; ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>
        <?php endif; ?>


        <!-- ── Graphique (ordre chrono ASC) — masqué si une seule session ── -->
        <?php if ($totalSessions > 1): ?>
        <div class="records-chart-wrapper">
            <canvas id="recordsChart" height="90"></canvas>
        </div>
        <?php else: ?>
        <p class="message" style="margin-bottom:20px;">
            <?php echo $lang['records_single_session'] ?? 'Une seule session enregistrée — le graphique de progression nécessite au moins 2 sessions.'; ?>
        </p>
        <?php endif; ?>

        <!-- ── Tableau triable ── -->
        <?php
        $sortParams = $_GET;
        unset($sortParams['sort_by'], $sortParams['sort_dir']);
        ?>
        <div class="view-content">
            <table id="records-table">
                <thead>
                    <tr>
                        <th><?php echo $lang['records_th_details']  ?? 'Détails'; ?></th>
                        <?php printSortableHeader($lang['records_th_date']     ?? 'Date',          'Date',    '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['records_th_session']  ?? 'Session',       'Session', '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php if ($paramCar === '' || $paramCar2 !== ''): ?>
                        <th><?php echo $lang['records_th_car'] ?? 'Voiture'; ?></th>
                        <?php endif; ?>
                        <?php printSortableHeader($lang['records_th_type']     ?? 'Type',          'Type',    '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['records_th_best_lap'] ?? 'Meilleur Tour', 'BestLap', '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['records_th_s1']       ?? 'S1',            'S1',      '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['records_th_s2']       ?? 'S2',            'S2',      '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['records_th_s3']       ?? 'S3',            'S3',      '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['th_optimal']          ?? 'Optimal',       'Optimal', '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['records_new_pb']      ?? 'Nouveau Record','PB',      '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['records_th_pb']       ?? 'Record',        'Record',  '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['records_gain']        ?? 'Gain',          'Gain',    '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                        <?php printSortableHeader($lang['records_th_version']  ?? 'Version',       'Version', '', $sortBy, $sortDir, $sortParams, 'records.php', '#records-table'); ?>
                    </tr>
                </thead>
                <tbody>
                <?php
                // Index de chaque session dans $rowsAsc (pour la liaison tableau ↔ graphique)
                $chartIndexByEvent = [];
                foreach ($rowsAsc as $ci => $cr) {
                    $chartIndexByEvent[$cr['event_id']] = $ci;
                }
                ?>
                <?php foreach ($rowsDesc as $r):
                    $sessionType    = $r['session_type'];
                    $sessionClass   = 'session-' . strtolower($sessionType);
                    $isPB           = $r['is_pb'];
                    $isCar2Row      = !empty($r['_is_car2']);
                    $isAllTimeBest  = ($combinedAllTimePB !== null && abs((float)$r['best_lap'] - $combinedAllTimePB) < 0.001);
                    $rowClass       = $isAllTimeBest ? 'row-all-time-best' : ($isPB ? 'pb-row' : ($isCar2Row ? 'row-car2' : ''));
                    $chartIdx       = $isCar2Row ? -1 : ($chartIndexByEvent[$r['event_id']] ?? -1);
                ?>
                    <tr<?php echo $rowClass ? ' class="' . $rowClass . '"' : ''; ?> data-chart-index="<?php echo $chartIdx; ?>">
                        <!-- Détails -->
                        <td class="text-center">
                            <a href="race_details.php?session_id=<?php echo urlencode($r['event_id']); ?>&lang=<?php echo $current_lang; ?>&session_view=<?php echo urlencode($sessionType); ?>&from=records"
                               title="<?php echo htmlspecialchars($lang['th_details'] ?? 'Détails'); ?>"><svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="12" width="4" height="9"/><rect x="10" y="7" width="4" height="14"/><rect x="17" y="3" width="4" height="18"/></svg></a>
                        </td>
                        <!-- Date -->
                        <td><?php echo date('d/m/Y H:i', $r['timestamp']); ?></td>
                        <!-- Session (cliquable → filtre) -->
                        <td class="text-center">
                            <?php
                            $sessionFilterParams = array_merge($_GET, ['session_type' => $sessionType, 'sort_by' => $sortBy, 'sort_dir' => $sortDir]);
                            $sessionFilterUrl = 'records.php?' . http_build_query($sessionFilterParams) . '#records-table';
                            ?>
                            <a href="<?php echo $sessionFilterUrl; ?>" style="text-decoration:none;">
                                <span class="badge <?php echo $sessionClass; ?>">
                                    <?php echo htmlspecialchars(translateTerm($sessionType, $lang)); ?>
                                </span>
                            </a>
                        </td>
                        <!-- Voiture (mode sans filtre car ou comparaison) -->
                        <?php if ($paramCar === '' || $paramCar2 !== ''): ?>
                        <td><?php echo htmlspecialchars($r['unique_car_name'] ?? $r['car_type'] ?? ''); ?></td>
                        <?php endif; ?>
                        <!-- Type (cliquable → filtre) -->
                        <td class="text-center">
                            <?php
                            $setting = $r['setting'] ?? '';
                            $typeFilterParams = array_merge($_GET, ['setting' => $setting, 'sort_by' => $sortBy, 'sort_dir' => $sortDir]);
                            $typeFilterUrl = 'records.php?' . http_build_query($typeFilterParams) . '#records-table';
                            ?>
                            <a href="<?php echo $typeFilterUrl; ?>" style="text-decoration:none; color: inherit;">
                                <?php echo htmlspecialchars(translateTerm($setting, $lang)); ?>
                            </a>
                        </td>
                        <!-- Meilleur Tour de la session -->
                        <td class="text-center <?php echo $isAllTimeBest ? 'lap-all-time-best' : ($isPB ? 'lap-is-pb' : ''); ?>">
                            <?php echo formatSecondsToMmSsMs($r['best_lap']); ?>
                        </td>
                        <!-- Secteurs -->
                        <td class="text-center <?php echo $r['best_lap_s1'] ? '' : 'text-muted-cell'; ?>">
                            <?php echo $r['best_lap_s1'] ? formatSecondsToMmSsMs($r['best_lap_s1'], false) : 'N/A'; ?>
                        </td>
                        <td class="text-center <?php echo $r['best_lap_s2'] ? '' : 'text-muted-cell'; ?>">
                            <?php echo $r['best_lap_s2'] ? formatSecondsToMmSsMs($r['best_lap_s2'], false) : 'N/A'; ?>
                        </td>
                        <td class="text-center <?php echo $r['best_lap_s3'] ? '' : 'text-muted-cell'; ?>">
                            <?php echo $r['best_lap_s3'] ? formatSecondsToMmSsMs($r['best_lap_s3'], false) : 'N/A'; ?>
                        </td>
                        <!-- Optimal (S1+S2+S3 de la session) -->
                        <?php
                        $optS1 = $r['best_lap_s1'] ? (float)$r['best_lap_s1'] : null;
                        $optS2 = $r['best_lap_s2'] ? (float)$r['best_lap_s2'] : null;
                        $optS3 = $r['best_lap_s3'] ? (float)$r['best_lap_s3'] : null;
                        $optSess = ($optS1 && $optS2 && $optS3) ? ($optS1 + $optS2 + $optS3) : null;
                        $isGlobalOpt = ($optSess !== null && $statOptimalLap !== null && abs($optSess - $statOptimalLap) < 0.002);
                        ?>
                        <td class="text-center <?php echo $isGlobalOpt ? 'is-overall-best' : ''; ?>">
                            <?php if ($optSess): ?>
                                <?php echo formatSecondsToMmSsMs($optSess); ?>
                                <?php $delta = (float)$r['best_lap'] - $optSess;
                                if ($delta > 0.001): ?>
                                    <br><small style="color:#28a745">(-<?php echo number_format($delta, 3); ?>s)</small>
                                <?php endif; ?>
                            <?php else: ?>
                                <span class="text-muted-cell">N/A</span>
                            <?php endif; ?>
                        </td>
                        <!-- Nouveau Record ? -->
                        <td class="text-center">
                            <?php if ($isAllTimeBest): ?>
                                <span class="pb-badge-gold">🏆 <?php echo $lang['records_new_pb'] ?? 'Record !'; ?></span>
                            <?php elseif ($isPB): ?>
                                <span class="pb-badge">⭐ <?php echo $lang['records_new_pb'] ?? 'Record !'; ?></span>
                            <?php else: ?>
                                <span class="text-muted-cell">—</span>
                            <?php endif; ?>
                        </td>
                        <!-- Record du moment (running best APRÈS cette session) -->
                        <td class="text-center">
                            <?php if ($isAllTimeBest): ?>
                                <span class="lap-all-time-best"><?php echo formatSecondsToMmSsMs($r['pb_at_point']); ?></span>
                            <?php elseif ($isPB): ?>
                                <span class="lap-is-pb"><?php echo formatSecondsToMmSsMs($r['pb_at_point']); ?></span>
                            <?php else: ?>
                                <span class="record-current"><?php echo formatSecondsToMmSsMs($r['pb_at_point']); ?></span>
                            <?php endif; ?>
                        </td>
                        <!-- Gain -->
                        <td class="text-center">
                            <?php if ($isPB && $r['pb_gain'] !== null): ?>
                                <span class="gain-positive">-<?php echo formatSecondsToMmSsMs($r['pb_gain'], false); ?></span>
                            <?php else: ?>
                                <span class="text-muted-cell">—</span>
                            <?php endif; ?>
                        </td>
                        <!-- Version -->
                        <td class="text-center text-muted-cell"><?php echo htmlspecialchars($r['game_version'] ?? ''); ?></td>
                    </tr>
                <?php endforeach; ?>
                </tbody>
            </table>
        </div>

    <?php endif; ?>

</div><!-- /container results -->

<?php require 'includes/footer.php'; ?>

<script>
document.addEventListener('DOMContentLoaded', function () {
    <?php if ($hasSelection && count($rowsAsc) > 1): ?>
    const labels     = <?php echo json_encode($chartLabels); ?>;
    const allLaps    = <?php echo json_encode($chartAllLaps); ?>;
    const pbLine     = <?php echo json_encode($chartPbLine); ?>;
    const carNames   = <?php echo json_encode($chartCarNames); ?>;
    const classBest  = <?php echo json_encode($chartClassBest); ?>;
    const s1Data     = <?php echo json_encode($chartS1); ?>;
    const s2Data     = <?php echo json_encode($chartS2); ?>;
    const s3Data     = <?php echo json_encode($chartS3); ?>;
    const hasClass   = classBest.length > 0 && classBest.some(v => v !== null);
    const hasSectors = s1Data.some(v => v !== null);

    const car2Laps = <?php echo json_encode($car2 ? $car2['mLaps2'] : []); ?>;
    const car2Pb   = <?php echo json_encode($car2 ? $car2['mPb2']  : []); ?>;
    const car2Name = <?php echo json_encode($paramCar2); ?>;
    const car1Name = <?php echo json_encode($paramCar); ?>;
    const hasCar2  = car2Laps.some(v => v !== null);

    const isDark    = document.documentElement.getAttribute('data-theme') === 'dark'
                   || document.body.classList.contains('dark-mode');
    const gridColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';
    const textColor = isDark ? '#ccc' : '#444';

    function fmtLap(sec) {
        if (!sec || sec <= 0) return 'N/A';
        const m  = Math.floor(sec / 60);
        const s  = sec - m * 60;
        const ms = Math.round((s % 1) * 1000);
        return m + ':' + String(Math.floor(s)).padStart(2,'0') + '.' + String(ms).padStart(3,'0');
    }

    // Régression linéaire (sur les indices, pas les timestamps)
    function linearRegression(data) {
        const pts = data.map((y, x) => ({x, y})).filter(p => p.y !== null && p.y !== undefined);
        if (pts.length < 2) return data.map(() => null);
        const n   = pts.length;
        const sx  = pts.reduce((a, p) => a + p.x, 0);
        const sy  = pts.reduce((a, p) => a + p.y, 0);
        const sxy = pts.reduce((a, p) => a + p.x * p.y, 0);
        const sxx = pts.reduce((a, p) => a + p.x * p.x, 0);
        const slope     = (n * sxy - sx * sy) / (n * sxx - sx * sx);
        const intercept = (sy - slope * sx) / n;
        return data.map((_, i) => parseFloat((slope * i + intercept).toFixed(3)));
    }
    const trendData = linearRegression(allLaps);

    // Construction des datasets selon le mode (simple ou comparaison)
    const datasets = [];

    // Car1 sessions
    datasets.push({
        label: hasCar2
            ? car1Name + ' — sessions'
            : <?php echo json_encode($lang['records_all_sessions'] ?? 'Meilleur tour par session'); ?>,
        data: allLaps,
        borderColor: 'rgba(54,162,235,0.9)',
        backgroundColor: 'rgba(54,162,235,0.12)',
        pointRadius: 5, pointHoverRadius: 8,
        fill: false, tension: 0.25, yAxisID: 'y', order: 2,
    });

    // Tendance — mode simple uniquement
    if (!hasCar2) {
        datasets.push({
            label: <?php echo json_encode($lang['records_trend'] ?? 'Tendance'); ?>,
            data: trendData,
            borderColor: 'rgba(220,80,80,0.55)',
            backgroundColor: 'transparent',
            pointRadius: 0, borderWidth: 1.5, borderDash: [4, 4],
            fill: false, tension: 0, yAxisID: 'y', order: 4,
        });
    }

    // Car1 record personnel
    datasets.push({
        label: hasCar2
            ? car1Name + ' — Record'
            : <?php echo json_encode($lang['records_pb_line'] ?? 'Record personnel'); ?>,
        data: pbLine,
        borderColor: 'rgba(40,167,69,1)',
        backgroundColor: 'transparent',
        pointRadius: 0, borderWidth: 2.5,
        fill: false, stepped: 'before', yAxisID: 'y', order: 1,
    });

    // Meilleur de la classe — mode simple uniquement
    if (!hasCar2 && hasClass) {
        datasets.push({
            label: <?php echo json_encode($lang['records_class_best'] ?? 'Meilleur de la classe'); ?>,
            data: classBest,
            borderColor: 'rgba(255,159,64,0.9)',
            backgroundColor: 'transparent',
            pointRadius: 0, borderWidth: 2, borderDash: [6, 3],
            fill: false, stepped: 'before', yAxisID: 'y', order: 3,
        });
    }

    // S1/S2/S3 — mode simple uniquement
    if (!hasCar2 && hasSectors) {
        datasets.push({
            label: 'S1', data: s1Data,
            borderColor: 'rgba(130,80,220,0.85)', backgroundColor: 'transparent',
            pointRadius: 3, pointHoverRadius: 6, borderWidth: 1.5,
            fill: false, tension: 0.2, hidden: true, yAxisID: 'ySectors', order: 5,
        });
        datasets.push({
            label: 'S2', data: s2Data,
            borderColor: 'rgba(0,180,180,0.85)', backgroundColor: 'transparent',
            pointRadius: 3, pointHoverRadius: 6, borderWidth: 1.5,
            fill: false, tension: 0.2, hidden: true, yAxisID: 'ySectors', order: 6,
        });
        datasets.push({
            label: 'S3', data: s3Data,
            borderColor: 'rgba(230,140,0,0.85)', backgroundColor: 'transparent',
            pointRadius: 3, pointHoverRadius: 6, borderWidth: 1.5,
            fill: false, tension: 0.2, hidden: true, yAxisID: 'ySectors', order: 7,
        });
    }

    // Car2 — mode comparaison uniquement
    if (hasCar2) {
        datasets.push({
            label: car2Name + ' — sessions',
            data: car2Laps,
            borderColor: 'rgba(220,80,20,0.9)',
            backgroundColor: 'rgba(220,80,20,0.08)',
            pointRadius: 5, pointHoverRadius: 8,
            fill: false, tension: 0.25, yAxisID: 'y', order: 8,
        });
        datasets.push({
            label: car2Name + ' — Record',
            data: car2Pb,
            borderColor: 'rgba(180,50,10,1)',
            backgroundColor: 'transparent',
            pointRadius: 0, borderWidth: 2.5,
            fill: false, stepped: 'before', yAxisID: 'y', order: 7,
        });
    }

    const recordsChart = new Chart(document.getElementById('recordsChart'), {
        type: 'line',
        data: { labels, datasets },
        options: {
            responsive: true,
            interaction: { mode: 'index', intersect: false },
            onClick: (event, elements) => {
                if (!elements.length) return;
                const idx = elements[0].index;
                highlightRow(idx);
            },
            plugins: {
                title: {
                    display: true,
                    text: <?php echo json_encode($lang['records_chart_title'] ?? 'Évolution du meilleur tour'); ?>,
                    color: textColor,
                    font: { size: 14, weight: 'bold' },
                    padding: { bottom: 12 }
                },
                tooltip: {
                    callbacks: {
                        label: ctx => {
                            if (ctx.parsed.y === null) return null;
                            let line = ctx.dataset.label + ' : ' + fmtLap(ctx.parsed.y);
                            // En mode simple (pas de comparaison), ajouter la livery sur le dataset sessions
                            if (!hasCar2 && ctx.datasetIndex === 0 && carNames[ctx.dataIndex]) {
                                line += '  —  ' + carNames[ctx.dataIndex];
                            }
                            return line;
                        }
                    }
                },
                legend: { labels: { color: textColor } }
            },
            scales: {
                x: {
                    ticks: { color: textColor, maxTicksLimit: 14 },
                    grid:  { color: gridColor }
                },
                y: {
                    position: 'left',
                    ticks: { color: textColor, callback: v => fmtLap(v) },
                    grid:  { color: gridColor }
                },
                ySectors: {
                    display: 'auto',
                    position: 'right',
                    ticks: { color: textColor, callback: v => fmtLap(v) },
                    grid:  { drawOnChartArea: false }
                }
            }
        }
    });

    // --- Liaison bidirectionnelle tableau ↔ graphique ---

    function highlightRow(chartIdx) {
        // Trouver la ligne correspondante dans le tableau
        const target = document.querySelector(`#records-table tbody tr[data-chart-index="${chartIdx}"]`);
        if (!target) return;

        // Réinitialiser toutes les lignes puis mettre en évidence
        document.querySelectorAll('#records-table tbody tr[data-chart-index]').forEach(r => {
            r.classList.remove('row-highlighted');
        });
        target.classList.add('row-highlighted');

        // Scroll vers la ligne (centré dans la vue)
        target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    function highlightPoint(chartIdx) {
        // Activer le tooltip du point correspondant
        recordsChart.tooltip.setActiveElements(
            datasets.map((_, dsIdx) => ({ datasetIndex: dsIdx, index: chartIdx })),
            { x: 0, y: 0 }
        );
        recordsChart.update();
    }

    // Clic sur une ligne du tableau → scroll vers le graphique + mise en évidence du point
    document.querySelectorAll('#records-table tbody tr[data-chart-index]').forEach(row => {
        row.addEventListener('click', function () {
            const idx = parseInt(this.dataset.chartIndex);
            if (isNaN(idx) || idx < 0) return;

            // Mettre en évidence la ligne
            document.querySelectorAll('#records-table tbody tr[data-chart-index]').forEach(r => r.classList.remove('row-highlighted'));
            this.classList.add('row-highlighted');

            // Scroll vers le graphique puis activer le tooltip
            document.querySelector('.records-chart-wrapper').scrollIntoView({ behavior: 'smooth', block: 'center' });
            setTimeout(() => highlightPoint(idx), 350);
        });
    });
    <?php endif; ?>
});
</script>
</body>
</html>
