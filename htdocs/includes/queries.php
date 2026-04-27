<?php
/**
 * Couche de requêtes SQL réutilisables.
 * Centralise les accès à la base pour records.php et index.php.
 * Les requêtes à WHERE dynamique (pagination index.php) restent dans leurs fichiers respectifs.
 */

// ============================================================
// Pour records.php
// ============================================================

/**
 * Toutes les combos (circuit / layout / classe / voiture) ayant au moins un best_lap.
 * Utilisé pour construire les cascades de filtres de records.php.
 */
function get_records_track_car_combos(PDO $pdo): array {
    return $pdo->query("
        SELECT DISTINCT track, track_course, car_class, unique_car_name
        FROM player_sessions
        WHERE best_lap IS NOT NULL
        ORDER BY track, track_course, unique_car_name
    ")->fetchAll();
}

/**
 * Options de filtre supplémentaires pour records.php.
 * Retourne ['classes' => [...], 'session_types' => [...], 'settings' => [...], 'versions' => [...]].
 */
function get_records_filter_options(PDO $pdo): array {
    $classes = [];
    foreach ($pdo->query("SELECT DISTINCT car_class FROM player_sessions WHERE best_lap IS NOT NULL AND car_class != '' ORDER BY car_class") as $r) {
        $classes[] = $r['car_class'];
    }
    $classOrder = ['Hyper' => 1, 'LMP2 ELMS' => 2, 'LMP2' => 3, 'LMP3' => 4, 'GT3' => 5, 'GTE' => 6];
    usort($classes, fn($a, $b) => ($classOrder[$a] ?? 99) <=> ($classOrder[$b] ?? 99));

    $sessionTypes = [];
    foreach ($pdo->query("SELECT DISTINCT session_type FROM player_sessions WHERE best_lap IS NOT NULL ORDER BY session_type") as $r) {
        $sessionTypes[] = $r['session_type'];
    }

    $settings = [];
    foreach ($pdo->query("SELECT DISTINCT setting FROM player_sessions WHERE best_lap IS NOT NULL AND setting != '' ORDER BY setting") as $r) {
        $settings[] = $r['setting'];
    }

    $versions = [];
    foreach ($pdo->query("SELECT DISTINCT game_version FROM player_sessions WHERE best_lap IS NOT NULL AND game_version NOT IN ('0.0','0.0000','') ORDER BY game_version") as $r) {
        $versions[] = $r['game_version'];
    }
    if (!empty($versions)) {
        usort($versions, 'version_compare');
        $versions = array_reverse($versions);
    }

    return [
        'classes'       => $classes,
        'session_types' => $sessionTypes,
        'settings'      => $settings,
        'versions'      => $versions,
    ];
}

/**
 * Sessions du joueur pour un combo circuit/voiture donné, avec filtres optionnels.
 *
 * $filters accepte : track (requis), car (requis), course, class, session_type,
 *                    setting, version ('all' = sans filtre), version_exact (bool).
 */
function get_records_sessions(PDO $pdo, array $filters): array {
    $conditions = ['ps.best_lap IS NOT NULL', 'ps.track = :track', 'ps.unique_car_name = :car'];
    $params     = [':track' => $filters['track'], ':car' => $filters['car']];

    if (!empty($filters['course']))       { $conditions[] = 'ps.track_course = :course';       $params[':course']       = $filters['course']; }
    if (!empty($filters['class']))        { $conditions[] = 'ps.car_class = :class';            $params[':class']        = $filters['class']; }
    if (!empty($filters['session_type'])) { $conditions[] = 'ps.session_type = :session_type';  $params[':session_type'] = $filters['session_type']; }
    if (!empty($filters['setting']))      { $conditions[] = 'ps.setting = :setting';             $params[':setting']      = $filters['setting']; }
    if (($filters['version'] ?? 'all') !== 'all') {
        $conditions[] = empty($filters['version_exact']) ? 'ps.game_version >= :version' : 'ps.game_version = :version';
        $params[':version'] = $filters['version'];
    }

    $stmt = $pdo->prepare('SELECT ps.* FROM player_sessions ps WHERE ' . implode(' AND ', $conditions) . ' ORDER BY ps.timestamp ASC');
    $stmt->execute($params);
    return $stmt->fetchAll();
}

/**
 * Meilleur tour par timestamp pour la ligne de référence de classe sur le graphique records.
 * $filters accepte : track (requis), class (requis), course, version, version_exact.
 */
function get_class_best_laps(PDO $pdo, array $filters): array {
    $conditions = ['ps.best_lap IS NOT NULL', 'ps.track = :track', 'ps.car_class = :class'];
    $params     = [':track' => $filters['track'], ':class' => $filters['class']];

    if (!empty($filters['course'])) { $conditions[] = 'ps.track_course = :course'; $params[':course'] = $filters['course']; }
    if (($filters['version'] ?? 'all') !== 'all') {
        $conditions[] = empty($filters['version_exact']) ? 'ps.game_version >= :version' : 'ps.game_version = :version';
        $params[':version'] = $filters['version'];
    }

    $stmt = $pdo->prepare('SELECT timestamp, best_lap FROM player_sessions ps WHERE ' . implode(' AND ', $conditions) . ' ORDER BY timestamp ASC');
    $stmt->execute($params);
    return $stmt->fetchAll();
}

// ============================================================
// Pour index.php
// ============================================================

/**
 * Toutes les options de filtre pour index.php en un seul appel.
 * Retourne un tableau associatif avec clés :
 *   tracks, layouts_map, classes, cars, car_class_map, cars_by_class,
 *   session_types, settings, versions (triées desc).
 */
function get_index_filter_options(PDO $pdo): array {
    $tracks = [];
    foreach ($pdo->query("SELECT DISTINCT track FROM xml_index WHERE track != '' ORDER BY track") as $r) {
        $tracks[$r['track']] = true;
    }

    $layoutsMap = [];
    foreach ($pdo->query("SELECT DISTINCT track, track_course FROM xml_index WHERE track_course != '' AND track_course != track ORDER BY track, track_course") as $r) {
        $layoutsMap[$r['track']][] = $r['track_course'];
    }

    $classes = [];
    foreach ($pdo->query("SELECT DISTINCT car_class FROM session_classes WHERE car_class != '' ORDER BY car_class") as $r) {
        $classes[$r['car_class']] = true;
    }

    $cars = [];
    foreach ($pdo->query("SELECT DISTINCT unique_car_name FROM player_sessions WHERE unique_car_name IS NOT NULL ORDER BY unique_car_name") as $r) {
        $cars[$r['unique_car_name']] = true;
    }

    $carClassMap    = [];
    $carsByClassMap = [];
    foreach ($pdo->query("SELECT DISTINCT unique_car_name, car_class FROM player_sessions WHERE unique_car_name IS NOT NULL AND car_class != '' ORDER BY unique_car_name") as $r) {
        $carClassMap[$r['unique_car_name']]                         = $r['car_class'];
        $carsByClassMap[$r['car_class']][$r['unique_car_name']]     = true;
    }

    $sessionTypes = [];
    foreach ($pdo->query("SELECT DISTINCT session_type FROM player_sessions ORDER BY session_type") as $r) {
        $sessionTypes[$r['session_type']] = true;
    }

    $settings = [];
    foreach ($pdo->query("SELECT DISTINCT setting FROM xml_index WHERE setting != '' ORDER BY setting") as $r) {
        $settings[$r['setting']] = true;
    }

    $versions = [];
    foreach ($pdo->query("SELECT DISTINCT game_version FROM xml_index WHERE game_version NOT IN ('0.0', '0.0000', '') ORDER BY game_version") as $r) {
        $versions[$r['game_version']] = true;
    }

    return [
        'tracks'         => $tracks,
        'layouts_map'    => $layoutsMap,
        'classes'        => $classes,
        'cars'           => $cars,
        'car_class_map'  => $carClassMap,
        'cars_by_class'  => $carsByClassMap,
        'session_types'  => $sessionTypes,
        'settings'       => $settings,
        'versions'       => $versions,
    ];
}

/**
 * Statistiques globales du joueur : total laps, temps de conduite, meilleur finish,
 * meilleure progression, circuit favori, voiture favorite.
 */
function get_player_overview_stats(PDO $pdo): array {
    $row = $pdo->query("
        SELECT
            COALESCE(SUM(total_laps_valid), 0) AS total_laps,
            COALESCE(SUM(total_lap_time),   0) AS total_lap_time,
            COALESCE(MIN(CASE WHEN session_type = 'Race' AND setting = 'Multiplayer'
                              AND finish_status = 'Finished Normally' THEN class_position END), 99) AS best_finish,
            COALESCE(MAX(progression), -99)    AS best_progression
        FROM player_sessions
    ")->fetch();

    $favTrack = $pdo->query("
        SELECT track, SUM(total_laps_valid) AS cnt
        FROM player_sessions GROUP BY track ORDER BY cnt DESC LIMIT 1
    ")->fetch();

    $favCar = $pdo->query("
        SELECT unique_car_name, SUM(total_laps_valid) AS cnt
        FROM player_sessions GROUP BY unique_car_name ORDER BY cnt DESC LIMIT 1
    ")->fetch();

    return [
        'totalLaps'        => (int)$row['total_laps'],
        'totalDrivingTime' => round($row['total_lap_time'] / 3600, 1),
        'bestFinish'       => $row['best_finish']      == 99  ? 'N/A' : (int)$row['best_finish'],
        'bestProgression'  => $row['best_progression'] == -99 ? 'N/A' : (int)$row['best_progression'],
        'favoriteTrack'    => $favTrack ? $favTrack['track']         : 'N/A',
        'favoriteCar'      => $favCar   ? $favCar['unique_car_name'] : 'N/A',
    ];
}

/**
 * Toutes les sessions joueur avec un best_lap, triées pour le calcul des meilleurs agrégats
 * (meilleur tour, secteurs, vmax) dans index.php.
 */
function get_sessions_with_best_laps(PDO $pdo): array {
    return $pdo->query("
        SELECT * FROM player_sessions
        WHERE best_lap IS NOT NULL
        ORDER BY track, track_course, car_class, unique_car_name, best_lap ASC
    ")->fetchAll();
}
