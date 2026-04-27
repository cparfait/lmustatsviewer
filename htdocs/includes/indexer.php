<?php
/**
 * Indexeur delta XML → SQLite.
 *
 * Principe :
 *   - Seuls les fichiers nouveaux ou modifiés sont parsés.
 *   - Les fichiers supprimés sont retirés de la DB (cascade).
 *   - Les event_id sont recalculés après chaque modification.
 *   - Si le nom du joueur change, toute la DB joueur est réindexée.
 */

require_once __DIR__ . '/db.php';

/**
 * Point d'entrée principal.
 * À appeler en tête de index.php à la place du système de cache JSON.
 *
 * @return array{added:int, updated:int, removed:int}
 */
function sync_xml_to_db(): array {
    if (!defined('RESULTS_DIR') || !is_dir(RESULTS_DIR) || !defined('PLAYER_NAME')) {
        return ['added' => 0, 'updated' => 0, 'removed' => 0];
    }

    $db = get_db();
    $stats = ['added' => 0, 'updated' => 0, 'removed' => 0];

    // --- Détection changement de joueur ---
    $indexedPlayer = $db->query("SELECT value FROM db_meta WHERE key = 'player_name'")->fetchColumn();
    if ($indexedPlayer !== false && $indexedPlayer !== PLAYER_NAME) {
        // Joueur différent → vider toutes les données joueur (les xml_index restent)
        $db->exec("DELETE FROM player_sessions");
        // Forcer le réindexage complet en réinitialisant les mtimes
        $db->exec("UPDATE xml_index SET mtime = 0");
    }
    $db->prepare("INSERT OR REPLACE INTO db_meta (key, value) VALUES ('player_name', ?)")
       ->execute([PLAYER_NAME]);

    // --- 1. Scanner le filesystem ---
    $fs_files = [];
    foreach (glob(RESULTS_DIR . '*.xml') ?: [] as $filepath) {
        $fs_files[basename($filepath)] = filemtime($filepath);
    }

    // --- 2. Récupérer l'index DB ---
    $indexed = [];
    foreach ($db->query("SELECT filename, mtime FROM xml_index") as $row) {
        $indexed[$row['filename']] = (int)$row['mtime'];
    }

    // --- 3. Identifier fichiers à traiter / supprimer ---
    $to_process = [];
    foreach ($fs_files as $filename => $mtime) {
        if (!isset($indexed[$filename]) || $indexed[$filename] !== $mtime) {
            $to_process[] = $filename;
        }
    }
    $to_remove = array_diff(array_keys($indexed), array_keys($fs_files));

    // --- 4. Supprimer les fichiers effacés du disque ---
    if (!empty($to_remove)) {
        $placeholders = implode(',', array_fill(0, count($to_remove), '?'));
        $db->prepare("DELETE FROM xml_index WHERE filename IN ($placeholders)")
           ->execute(array_values($to_remove));
        $stats['removed'] = count($to_remove);
    }

    // --- 5. Indexer les fichiers nouveaux/modifiés ---
    if (!empty($to_process)) {
        _index_xml_files($db, $to_process, $fs_files, $stats);
    }

    // --- 6. Recalculer les event_id si nécessaire ---
    if ($stats['added'] > 0 || $stats['updated'] > 0 || $stats['removed'] > 0) {
        _recompute_event_ids($db);
    } else {
        // Migration : si la colonne event_id vient d'être ajoutée, toutes les lignes
        // ont event_id = 0. On force un recalcul au premier chargement.
        $unset = (int)$db->query("SELECT COUNT(*) FROM xml_index WHERE event_id = 0")->fetchColumn();
        if ($unset > 0) {
            _recompute_event_ids($db);
        }
    }

    return $stats;
}

/**
 * Réindexe complètement la DB (à appeler depuis config.php si nécessaire).
 */
function reindex_all(): array {
    $db = get_db();
    $db->exec("DELETE FROM xml_index"); // cascade sur player_sessions et session_classes
    return sync_xml_to_db();
}

// ---------------------------------------------------------------------------
// Fonctions internes
// ---------------------------------------------------------------------------

function _index_xml_files(PDO $db, array $filenames, array $fs_mtimes, array &$stats): void {
    $playerName = PLAYER_NAME;

    $stmtDelXml   = $db->prepare("DELETE FROM xml_index WHERE filename = ?");
    $stmtInsXml   = $db->prepare("
        INSERT INTO xml_index (filename, mtime, timestamp, track, track_course, setting, game_version, has_any_laps, indexed_at)
        VALUES (:filename, :mtime, :timestamp, :track, :track_course, :setting, :game_version, :has_any_laps, :indexed_at)
    ");
    $stmtClass    = $db->prepare("INSERT OR IGNORE INTO session_classes (xml_id, session_type, car_class) VALUES (?,?,?)");
    $stmtSession  = $db->prepare("
        INSERT INTO player_sessions (
            xml_id, event_id, session_type, timestamp, track, track_course,
            setting, game_version, car_type, car_class, car_name, unique_car_name,
            class_position, grid_pos, laps_count, finish_time, finish_status,
            pitstops, participants,
            best_lap, best_lap_s1, best_lap_s2, best_lap_s3,
            abs_best_s1, abs_best_s2, abs_best_s3,
            abs_best_s1_date, abs_best_s2_date, abs_best_s3_date,
            optimal_lap, vmax, progression, total_laps_valid, total_lap_time
        ) VALUES (
            :xml_id, :event_id, :session_type, :timestamp, :track, :track_course,
            :setting, :game_version, :car_type, :car_class, :car_name, :unique_car_name,
            :class_position, :grid_pos, :laps_count, :finish_time, :finish_status,
            :pitstops, :participants,
            :best_lap, :best_lap_s1, :best_lap_s2, :best_lap_s3,
            :abs_best_s1, :abs_best_s2, :abs_best_s3,
            :abs_best_s1_date, :abs_best_s2_date, :abs_best_s3_date,
            :optimal_lap, :vmax, :progression, :total_laps_valid, :total_lap_time
        )
    ");
    $stmtLap = $db->prepare("
        INSERT INTO player_laps (session_id, lap_num, lap_time, s1, s2, s3, top_speed, is_pit)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ");

    $db->beginTransaction();
    $batchCount = 0;

    foreach ($filenames as $filename) {
        $filepath = RESULTS_DIR . $filename;
        if (!file_exists($filepath)) continue;

        $xml = cleanAndParseXmlFile($filepath);
        if (!$xml || !isset($xml->RaceResults)) continue;

        $rr          = $xml->RaceResults;
        $timestamp   = (int)$rr->DateTime;
        $track       = trim((string)$rr->TrackVenue);
        $trackCourse = trim((string)$rr->TrackCourse);
        $setting     = trim((string)$rr->Setting);
        $gameVersion = _format_game_version((string)($rr->GameVersion ?? '0.0'));
        $mtime       = $fs_mtimes[$filename];

        // Pré-calcul has_any_laps : true si au moins un pilote dans n'importe quelle
        // section a ≥ 1 tour. On court-circuite dès le premier trouvé (break 2).
        $hasAnyLaps = 0;
        foreach (['Practice1', 'Qualify', 'Race'] as $sect) {
            if (!isset($rr->{$sect}->Driver)) continue;
            foreach ($rr->{$sect}->Driver as $d) {
                if (isset($d->Lap) && count($d->Lap) > 0) {
                    $hasAnyLaps = 1;
                    break 2;
                }
            }
        }

        // Supprimer l'ancienne entrée si existante (cascade)
        $stmtDelXml->execute([$filename]);
        $existed = $stmtDelXml->rowCount() > 0;
        if ($existed) { $stats['updated']++; } else { $stats['added']++; }

        // Insérer xml_index
        $stmtInsXml->execute([
            ':filename'     => $filename,
            ':mtime'        => $mtime,
            ':timestamp'    => $timestamp,
            ':track'        => $track,
            ':track_course' => $trackCourse,
            ':setting'      => $setting,
            ':game_version' => $gameVersion,
            ':has_any_laps' => $hasAnyLaps,
            ':indexed_at'   => time(),
        ]);
        $xmlId = (int)$db->lastInsertId();

        // Parser chaque section de session
        foreach (['Practice1', 'Qualify', 'Race'] as $section) {
            if (!isset($rr->{$section})) continue;
            $sessionData  = $rr->{$section};
            $participants = isset($sessionData->Driver) ? count($sessionData->Driver) : 0;

            // Classes présentes dans cette session
            if (isset($sessionData->Driver)) {
                foreach ($sessionData->Driver as $d) {
                    $cls = _normalize_car_class((string)$d->CarClass);
                    if ($cls !== '') {
                        $stmtClass->execute([$xmlId, $section, $cls]);
                    }
                }
            }

            // Données du joueur dans cette session
            $playerFound = false;
            if (isset($sessionData->Driver)) {
                foreach ($sessionData->Driver as $driverElem) {
                    if (trim((string)$driverElem->Name) !== $playerName) continue;
                    $playerFound = true;

                    $carType      = trim((string)$driverElem->CarType);
                    $carClass     = _normalize_car_class((string)$driverElem->CarClass);
                    $carCategory  = trim((string)$driverElem->Category);
                    $carName      = trim((string)$driverElem->VehName);
                    $uniqueCarName = _compute_unique_car_name($carType, $carCategory);

                    $classPosition = (int)($driverElem->ClassPosition ?? 0);
                    $classGridPos  = (int)($driverElem->ClassGridPos  ?? 0);
                    $lapsCount     = (int)($driverElem->Laps          ?? 0);
                    $finishTime    = (float)($driverElem->FinishTime  ?? 0);
                    $finishStatus  = (string)($driverElem->FinishStatus ?? '');
                    $pitstops      = (int)($driverElem->Pitstops      ?? 0);

                    $progression = null;
                    if ($section === 'Race' && $classGridPos > 0 && $finishStatus === 'Finished Normally') {
                        $progression = $classGridPos - $classPosition;
                    }

                    // --- Traitement des tours ---
                    $bestLap = INF; $bestLapS1 = 0.0; $bestLapS2 = 0.0; $bestLapS3 = 0.0;
                    $absBestS1 = INF; $absBestS2 = INF; $absBestS3 = INF;
                    $absBestS1Date = 0; $absBestS2Date = 0; $absBestS3Date = 0;
                    $vmax = 0.0;
                    $totalLapsValid = 0;
                    $totalLapTime   = 0.0;
                    $lapsToInsert   = [];

                    if (isset($driverElem->Lap)) {
                        foreach ($driverElem->Lap as $lapElem) {
                            $lapTime  = (float)(string)$lapElem[0];
                            $s1       = (float)($lapElem['s1']       ?? 0);
                            $s2       = (float)($lapElem['s2']       ?? 0);
                            $s3       = (float)($lapElem['s3']       ?? 0);
                            $speed    = (float)($lapElem['topspeed'] ?? 0);
                            $lapNum   = (int)($lapElem['num']        ?? 0);
                            $isPit    = (int)($lapElem['pit']        ?? 0);

                            // Meilleur tour (4 chronos valides)
                            if ($lapTime > 0 && $s1 > 0 && $s2 > 0 && $s3 > 0) {
                                $totalLapsValid++;
                                $totalLapTime += $lapTime;
                                if ($lapTime < $bestLap) {
                                    $bestLap   = $lapTime;
                                    $bestLapS1 = $s1;
                                    $bestLapS2 = $s2;
                                    $bestLapS3 = $s3;
                                }
                            }

                            // Meilleurs secteurs absolus
                            if ($s1 > 0 && $s1 < $absBestS1) { $absBestS1 = $s1; $absBestS1Date = $timestamp; }
                            if ($s2 > 0 && $s2 < $absBestS2) { $absBestS2 = $s2; $absBestS2Date = $timestamp; }
                            if ($s3 > 0 && $s3 < $absBestS3) { $absBestS3 = $s3; $absBestS3Date = $timestamp; }

                            if ($speed > $vmax) $vmax = $speed;

                            $lapsToInsert[] = [$lapNum, $lapTime, $s1, $s2, $s3, $speed, $isPit];
                        }
                    }

                    $optimalLap = compute_optimal_lap($absBestS1, $absBestS2, $absBestS3, true);

                    // Insérer player_sessions
                    $stmtSession->execute([
                        ':xml_id'         => $xmlId,
                        ':event_id'       => $timestamp, // recalculé après
                        ':session_type'   => $section,
                        ':timestamp'      => $timestamp,
                        ':track'          => $track,
                        ':track_course'   => $trackCourse,
                        ':setting'        => $setting,
                        ':game_version'   => $gameVersion,
                        ':car_type'       => $carType    ?: null,
                        ':car_class'      => $carClass   ?: null,
                        ':car_name'       => $carName    ?: null,
                        ':unique_car_name'=> $uniqueCarName ?: null,
                        ':class_position' => $classPosition ?: null,
                        ':grid_pos'       => $classGridPos  ?: null,
                        ':laps_count'     => $lapsCount  ?: null,
                        ':finish_time'    => $finishTime > 0 ? $finishTime : null,
                        ':finish_status'  => $finishStatus ?: null,
                        ':pitstops'       => $pitstops,
                        ':participants'   => $participants,
                        ':best_lap'       => $bestLap !== INF ? $bestLap : null,
                        ':best_lap_s1'    => $bestLap !== INF ? $bestLapS1 : null,
                        ':best_lap_s2'    => $bestLap !== INF ? $bestLapS2 : null,
                        ':best_lap_s3'    => $bestLap !== INF ? $bestLapS3 : null,
                        ':abs_best_s1'    => $absBestS1 !== INF ? $absBestS1 : null,
                        ':abs_best_s2'    => $absBestS2 !== INF ? $absBestS2 : null,
                        ':abs_best_s3'    => $absBestS3 !== INF ? $absBestS3 : null,
                        ':abs_best_s1_date' => $absBestS1Date ?: null,
                        ':abs_best_s2_date' => $absBestS2Date ?: null,
                        ':abs_best_s3_date' => $absBestS3Date ?: null,
                        ':optimal_lap'    => $optimalLap,
                        ':vmax'           => $vmax > 0 ? $vmax : null,
                        ':progression'    => $progression,
                        ':total_laps_valid' => $totalLapsValid,
                        ':total_lap_time'   => $totalLapTime,
                    ]);
                    $sessionId = (int)$db->lastInsertId();

                    // Insérer les tours
                    foreach ($lapsToInsert as [$num, $lt, $s1, $s2, $s3, $spd, $pit]) {
                        $stmtLap->execute([
                            $sessionId,
                            $num,
                            $lt  > 0 ? $lt  : null,
                            $s1  > 0 ? $s1  : null,
                            $s2  > 0 ? $s2  : null,
                            $s3  > 0 ? $s3  : null,
                            $spd > 0 ? $spd : null,
                            $pit,
                        ]);
                    }

                    break; // joueur trouvé dans cette section
                }
            }
        }

        // Commit par lots de 100 pour équilibrer mémoire et performance
        $batchCount++;
        if ($batchCount % 100 === 0) {
            $db->commit();
            $db->beginTransaction();
        }
    }

    if ($db->inTransaction()) {
        $db->commit();
    }
}

/**
 * Recalcule les event_id via compute_event_groups() (functions.php).
 * La logique de groupement est centralisée là-bas — ne pas la dupliquer ici.
 */
function _recompute_event_ids(PDO $db): void {
    $rows = $db->query("
        SELECT id, timestamp, track, setting
        FROM xml_index
        ORDER BY timestamp ASC
    ")->fetchAll();

    $grouped = compute_event_groups($rows);

    $stmtPs  = $db->prepare("UPDATE player_sessions SET event_id = ? WHERE xml_id = ?");
    $stmtXml = $db->prepare("UPDATE xml_index SET event_id = ? WHERE id = ?");
    $db->beginTransaction();
    foreach ($grouped as $row) {
        $stmtPs->execute([$row['event_id'], $row['id']]);
        $stmtXml->execute([$row['event_id'], $row['id']]);
    }
    $db->commit();
}

// ---------------------------------------------------------------------------
// Fonctions utilitaires (dupliquées ici pour être indépendantes de functions.php)
// ---------------------------------------------------------------------------

function _format_game_version(string $rawVersion): string {
    $parts = explode('.', $rawVersion);
    if (count($parts) > 1) {
        $major = array_shift($parts);
        $minorStr = str_pad(substr(implode('', $parts), 0, 4), 4, '0', STR_PAD_RIGHT);
        return $major . '.' . $minorStr;
    }
    return $rawVersion . '.0000';
}

function _normalize_car_class(string $carClass): string {
    if (strcasecmp($carClass, 'Hyper') === 0) return 'Hyper';
    if (str_replace('_', ' ', $carClass) === 'LMP2 ELMS' || strcasecmp($carClass, 'LMP2 Elms') === 0) return 'LMP2 ELMS';
    return trim($carClass);
}

function _compute_unique_car_name(string $carType, string $carCategory): string {
    if (str_contains($carType, 'Peugeot 9x8') && preg_match('/WEC (\d{4})/', $carCategory, $m)) {
        $displayYear = ($m[1] === '2024' || $m[1] === '2025') ? '2024/25' : $m[1];
        return $carType . " ($displayYear)";
    }
    return $carType;
}
