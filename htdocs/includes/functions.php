<?php
// Fichier central pour les fonctions utilitaires

const CLASS_ORDER = ['Hyper' => 1, 'LMP2 ELMS' => 2, 'LMP2' => 3, 'LMP3' => 4, 'GT3' => 5, 'GTE' => 6];

function sort_versions_desc(array $versions): array {
    usort($versions, 'version_compare');
    return array_reverse($versions);
}

function compute_optimal_lap(float $s1, float $s2, float $s3, bool $null_on_fail = false): float|null {
    if ($s1 !== INF && $s2 !== INF && $s3 !== INF) return $s1 + $s2 + $s3;
    return $null_on_fail ? null : INF;
}

function formatSecondsToMmSsMs(mixed $seconds, bool $showMinutes = true): string {
    if ($seconds === null || !is_numeric($seconds) || $seconds <= 0 || $seconds === INF) return 'N/A';
    $sign = $seconds < 0 ? '-' : '';
    $seconds = abs($seconds);
    $minutes = floor($seconds / 60);
    $remainingSeconds = $seconds - ($minutes * 60);
    $milliseconds = floor(($remainingSeconds - floor($remainingSeconds)) * 1000);
    $formattedSeconds = sprintf('%02d', floor($remainingSeconds));
    $formattedMilliseconds = sprintf('%03d', $milliseconds);

    if ($showMinutes || $minutes > 0) {
        return $sign . $minutes . ':' . $formattedSeconds . '.' . $formattedMilliseconds;
    }
    return $sign . floor($remainingSeconds) . '.' . $formattedMilliseconds . 's';
}

function cleanAndParseXmlFile(string $filepath): ?SimpleXMLElement {
    if (!is_readable($filepath)) {
        return null;
    }
    $xml_string_raw = file_get_contents($filepath);
    if (empty($xml_string_raw)) {
        return null;
    }
    libxml_use_internal_errors(true);
    $xml = simplexml_load_string($xml_string_raw);
    libxml_clear_errors();
    return $xml ?: null;
}

function getCarLogoUrl(string $carType): ?string {
    $basePath = 'logos/';
    $carTypeLower = strtolower($carType);
    
    $specificMap = [
        'peugeot9x82024' => 'peugeot.png'
    ];

    $searchableCarType = str_replace([' ', '_', '-'], '', $carTypeLower);
    foreach ($specificMap as $specificKey => $logoFile) {
        if ($searchableCarType === $specificKey) {
            return $basePath . $logoFile;
        }
    }

    $brandMap = [
        'acura' => 'acura.png', 'astonmartin' => 'astonmartin.png', 'audi' => 'audi.png',
        'bentley' => 'bentley.png', 'bmw' => 'bmw.png', 'cadillac' => 'cadillac.png',
        'corvette' => 'corvette.png', 'dallara' => 'dallara.png', 'duqueine' => 'duqueine.png',
        'ferrari' => 'ferrari.png', 'ginetta' => 'ginetta.png', 'glickenhaus' => 'glickenhaus.png',
        'honda' => 'honda.png', 'isottafraschini' => 'isottafraschini.png',
        'lamborghini' => 'lamborghini.png', 'ligier' => 'ligier.png',
        'mclaren' => 'mclaren.png', 'mercedesamg' => 'mercedes.png', 'oreca' => 'oreca.png',
        'peugeot' => 'peugeot.png', 'porsche' => 'porsche.png', 'toyota' => 'toyota.png',
        'vanwall' => 'vanwall.png', 'alpine' => 'alpine.png', 'chevrolet' => 'chevrolet.png',
        'ford' => 'ford.png', 'lexus' => 'lexus.png', 'genesis' => 'genesis.png'
    ];
    foreach ($brandMap as $brandKey => $logoFile) {
        if (str_contains($searchableCarType, $brandKey) && file_exists($basePath . $logoFile)) {
            return $basePath . $logoFile;
        }
    }
    return null;
}

function getCircuitFlagUrl(string $trackVenue): ?string {
    static $flags = null;
    if ($flags === null) {
        $json  = @file_get_contents(__DIR__ . '/circuits.json');
        $flags = $json ? (json_decode($json, true)['flags'] ?? []) : [];
    }
    $basePath = 'flags/';
    foreach ($flags as $keyword => $code) {
        if (stripos($trackVenue, $keyword) !== false) {
            $file = $basePath . $code . '.png';
            if (file_exists($file)) return $file;
        }
    }
    return null;
}

function translateTerm(string $term, array $langArray): string {
    // Fonction utilitaire interne pour récupérer un terme traduit ou une valeur par défaut.
    $getTranslated = function($key) use ($langArray, $term) {
        // Retourne la traduction si elle existe, sinon retourne le terme original.
        return htmlspecialchars($langArray[$key] ?? $term);
    };

    switch($term) {
        // Types de Session
        case 'Practice1': 
        case 'Qualify': 
        case 'Race': 
            $key = 'session_' . strtolower(str_replace('1', '', $term));
            return $getTranslated($key);

        // Statuts
        case 'Finished Normally': return $getTranslated('status_finished');
        case 'DNF': return $getTranslated('status_dnf');
        case 'DQ': return $getTranslated('status_dq');
        case 'None': return $getTranslated('status_none'); // Gère le nouveau statut XML

        // Settings / Autres
        case 'Multiplayer': return $getTranslated('online');
        case 'Race Weekend': return $getTranslated('race_weekend');

        // Retourne le terme tel quel s'il n'est pas reconnu (assuré d'être sécurisé)
        default: return htmlspecialchars($term);
    }
}


function getWearColorClass(mixed $wearPercentage): string {
    if ($wearPercentage === null) return '';
    if ($wearPercentage >= 30) return 'wear-high';
    if ($wearPercentage >= 15) return 'wear-medium';
    return 'wear-low';
}

function suggestPlayerName(?string $searchPath = null): ?string {
    if (empty($searchPath) || !is_dir($searchPath)) {
        if (!defined('RESULTS_DIR') || empty(RESULTS_DIR) || !is_dir(RESULTS_DIR)) {
            return null;
        }
        $searchPath = RESULTS_DIR;
    }
    $files = glob($searchPath . '/*.xml');
    if (empty($files)) {
        return null;
    }
    usort($files, function($a, $b) {
        return filemtime($b) - filemtime($a);
    });
    $latest_files = array_slice($files, 0, 10);
    $names = [];
    libxml_use_internal_errors(true);
    foreach ($latest_files as $filepath) {
        $xml = simplexml_load_file($filepath);
        if (!$xml) continue;
        $drivers = $xml->xpath('//Driver/Name');
        foreach ($drivers as $driver) {
            $name = trim((string)$driver);
            if (!empty($name)) {
                $names[] = $name;
            }
        }
    }
    libxml_clear_errors();
    if (empty($names)) {
        return null;
    }
    $counts = array_count_values($names);
    arsort($counts);
    return key($counts);
}

function clearCache(): bool {
    $cacheCleared = false;
    $appDataPath = getenv('APPDATA');
    if ($appDataPath) {
        $cacheDir = $appDataPath . DIRECTORY_SEPARATOR . 'LMU_Stats_Viewer';
        // Ancien cache JSON (legacy)
        $userCacheFile = $cacheDir . DIRECTORY_SEPARATOR . 'lm_ultimate_cache.json';
        if (file_exists($userCacheFile)) {
            if (@unlink($userCacheFile)) {
                $cacheCleared = true;
            }
        }
        // Nouveau cache SQLite : supprimer pour forcer un réindexage complet
        $dbFile = $cacheDir . DIRECTORY_SEPARATOR . 'lmu_cache.db';
        if (file_exists($dbFile)) {
            if (@unlink($dbFile)) {
                $cacheCleared = true;
            }
        }
    }
    $localCacheFile = __DIR__ . '/lm_ultimate_cache.json';
    if (file_exists($localCacheFile)) {
        if (@unlink($localCacheFile)) {
            $cacheCleared = true;
        }
    }
    return $cacheCleared;
}

/**
 * Retourne le HTML de la progression (+N / -N / -) pour une valeur entière ou null.
 */
function renderProgression(mixed $value): string {
    if ($value === null) return '';
    if ($value > 0) return '<span class="prog-gain">▲ +' . $value . '</span>';
    if ($value < 0) return '<span class="prog-loss">▼ ' . $value . '</span>';
    return '<span>-</span>';
}

/**
 * Compte (dry_run=true) ou supprime (dry_run=false) les sessions XML vides
 * via SQLite — O(1), sans scanner les fichiers sur le disque.
 *
 * 'global' : sessions où aucun pilote n'a de tour (has_any_laps = 0).
 * 'player' : sessions où le joueur indexé n'a aucun tour (laps_count = 0 ou absent).
 */
function _scan_empty_sessions(string $purge_type, bool $dry_run): int {
    if (!defined('RESULTS_DIR') || !is_dir(RESULTS_DIR)) return 0;

    require_once __DIR__ . '/db.php';
    $db = get_db();

    if ($purge_type === 'global') {
        $filenames = $db->query(
            "SELECT filename FROM xml_index WHERE has_any_laps = 0"
        )->fetchAll(PDO::FETCH_COLUMN);
    } else {
        // Sessions sans aucun tour du joueur dans player_sessions
        $filenames = $db->query("
            SELECT xi.filename FROM xml_index xi
            WHERE NOT EXISTS (
                SELECT 1 FROM player_sessions ps
                WHERE ps.xml_id = xi.id AND ps.laps_count > 0
            )
        ")->fetchAll(PDO::FETCH_COLUMN);
    }

    if ($dry_run) {
        return count($filenames);
    }

    $count    = 0;
    $deleted  = [];
    foreach ($filenames as $filename) {
        $filepath = RESULTS_DIR . $filename;
        if (is_file($filepath) && unlink($filepath)) {
            $count++;
            $deleted[] = $filename;
        }
    }

    if (!empty($deleted)) {
        $placeholders = implode(',', array_fill(0, count($deleted), '?'));
        $db->prepare("DELETE FROM xml_index WHERE filename IN ($placeholders)")
           ->execute($deleted);
    }

    return $count;
}

function countSessionsToPurge(string $purge_type): int {
    return _scan_empty_sessions($purge_type, true);
}

function purgeEmptySessions(string $purge_type): int {
    return _scan_empty_sessions($purge_type, false);
}

function get_remote_version_data(string $url): ?array {
    if (!function_exists('curl_init')) {
        error_log("cURL non disponible.");
        return null;
    }
    
    $url_with_cache_bust = $url . '?t=' . time();

    $ch = curl_init();
    curl_setopt($ch, CURLOPT_URL, $url_with_cache_bust);
    curl_setopt($ch, CURLOPT_RETURNTRANSFER, 1);
    curl_setopt($ch, CURLOPT_CONNECTTIMEOUT, 10);
    curl_setopt($ch, CURLOPT_TIMEOUT, 10);
    // Utiliser un User-Agent plus standard pour éviter les blocages
    curl_setopt($ch, CURLOPT_USERAGENT, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/110.0.0.0 Safari/537.36');
    
    curl_setopt($ch, CURLOPT_FOLLOWLOCATION, true);
    curl_setopt($ch, CURLOPT_MAXREDIRS, 5);
    curl_setopt($ch, CURLOPT_SSL_VERIFYPEER, true);
    curl_setopt($ch, CURLOPT_SSL_VERIFYHOST, 2);

    curl_setopt($ch, CURLOPT_FRESH_CONNECT, TRUE);
    curl_setopt($ch, CURLOPT_FORBID_REUSE, TRUE);
    curl_setopt($ch, CURLOPT_HTTPHEADER, [
        'Cache-Control: no-cache',
        'Pragma: no-cache'
    ]);

    $json_data = curl_exec($ch);
    $http_code = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    $curl_error = curl_error($ch);
    curl_close($ch);

    if ($curl_error) {
        error_log("Erreur cURL: " . $curl_error);
        return null;
    }

    if ($http_code === 200 && $json_data) {
        $decoded = json_decode($json_data, true);
        if (json_last_error() !== JSON_ERROR_NONE) {
            error_log("Erreur de décodage JSON: " . json_last_error_msg());
            return null;
        }
        return $decoded;
    } else {
        error_log("Erreur HTTP: " . $http_code);
        return null;
    }
}

/**
 * Pure grouping logic shared with indexer.php::_recompute_event_ids().
 *
 * Rule: a Multiplayer session joins the last group when
 *   - same track AND
 *   - |timestamp - timestamp of the group's first session| < 7200 s
 * Any non-Multiplayer session always starts a new group.
 *
 * @param array $sessions Sorted by timestamp ASC. Each item must have
 *                        'timestamp' (int), 'track' (string), 'setting' (string).
 * @return array Same items with an added 'event_id' key (= timestamp of the
 *               first session in the group).
 */
function compute_event_groups(array $sessions): array {
    $threshold           = 7200;
    $groupFirstTimestamp = 0;
    $groupTrack          = '';
    $currentEventId      = 0;

    foreach ($sessions as &$session) {
        $isMultiplayer = ($session['setting'] === 'Multiplayer');
        $canJoin = $isMultiplayer
            && $currentEventId !== 0
            && $session['track'] === $groupTrack
            && abs($session['timestamp'] - $groupFirstTimestamp) < $threshold;

        if ($canJoin) {
            $session['event_id'] = $currentEventId;
        } else {
            $currentEventId      = $session['timestamp'];
            $groupFirstTimestamp = $session['timestamp'];
            $groupTrack          = $session['track'];
            $session['event_id'] = $currentEventId;
        }
    }
    unset($session);
    return $sessions;
}


function render_classification_table(array $driver_list, string $table_title, array $context): void {
    $lang                    = $context['lang']                    ?? [];
    $strategyDataByDriver    = $context['strategyDataByDriver']    ?? [];
    $lapsLedByDriver         = $context['lapsLedByDriver']         ?? [];
    $is_class_table          = $context['is_class_table']          ?? false;
    $all_drivers_for_context = $context['all_drivers_for_context'] ?? [];
    $bestLapsByDriver        = $context['bestLapsByDriver']        ?? [];
    $vmaxByDriver            = $context['vmaxByDriver']            ?? [];
    $bestVmaxOverall         = $context['bestVmaxOverall']         ?? 0;
    $bestLapTimeOverall      = $context['bestLapTimeOverall']      ?? 0;
    $incident_summary        = $context['incident_summary']        ?? [];
    $penalty_summary         = $context['penalty_summary']         ?? [];
    $aidsByDriver            = $context['aidsByDriver']            ?? [];
    $sessionType             = $context['sessionType']             ?? '';
    $trackVenue              = $context['trackVenue']              ?? '';

    if (empty($driver_list)) return;

    $maxLaps = 0;
    if (!empty($all_drivers_for_context)) {
        foreach($all_drivers_for_context as $d) {
            $maxLaps = max($maxLaps, (int)$d->Laps);
        }
    }

    $winner_finish_time = null;
    if ($is_class_table && !empty($driver_list)) {
       $winner_finish_time = isset($driver_list[0]->FinishTime) ? (float)$driver_list[0]->FinishTime : null;
    } elseif (!empty($all_drivers_for_context)) {
       $winner_finish_time = isset($all_drivers_for_context[0]->FinishTime) ? (float)$all_drivers_for_context[0]->FinishTime : null;
    }
    ?>
    <?php if (!empty($table_title)): ?>
    <h2 class="classification-title"><?php echo htmlspecialchars($table_title); ?></h2>
    <?php endif; ?>
    <table class="sortable-table">
        <thead>
            <tr>
                <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['pos_header']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['prog_header']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="text"><?php echo $lang['th_class']; ?></th>
                <th data-sortable="true" data-sort-type="text"><?php echo $lang['driver_header']; ?></th>
                <th data-sortable="true" data-sort-type="text"><?php echo $lang['car_header']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['laps_header']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['th_laps_led']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['th_total_time']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['best_lap_header']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['th_vmax']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['th_fuel_start']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['th_fuel_end']; ?></th>
                <th class="text-center" data-sortable="true" data-sort-type="number">Incidents</th>
                <th class="text-center" data-sortable="true" data-sort-type="number">Pénalités</th>
                <th data-sortable="true" data-sort-type="text"><?php echo $lang['status_header']; ?></th>
            </tr>
        </thead>
        <tbody>
            <?php foreach ($driver_list as $driver): 
                $driverName = (string)$driver->Name;
                $strategyData = $strategyDataByDriver[$driverName] ?? null;
            ?>
                <tr class="<?php echo ($driverName === PLAYER_NAME) ? 'player-row' : ''; ?>">
                    <td class="text-center">
                        <?php $position = $is_class_table ? (int)$driver->ClassPosition : (int)$driver->Position;
                        if ($position === 1) { echo '🥇'; } elseif ($position === 2) { echo '🥈'; } elseif ($position === 3) { echo '🥉'; } else { echo $position; } ?>
                    </td>
                    <td class="text-center">
                        <?php
                        $gridPos = $is_class_table ? (int)$driver->ClassGridPos : (int)$driver->GridPos;
                        if ($gridPos > 0 && (string)$driver->FinishStatus === 'Finished Normally') {
                            echo renderProgression($gridPos - $position);
                        } else { echo 'N/A'; }
                        ?>
                    </td>
                    <td class="text-center table-clickable-badge">
                        <?php 
                        $carClass = (string)$driver->CarClass;
                        // Correction pour générer la classe CSS 'class-lmp2elms'
                        $carClassCss = 'class-' . strtolower(str_replace([' ', '-', '#'], '', $carClass));
                        $anchor_id = 'table-' . strtolower($carClass) . '-' . $sessionType;
                        echo '<a href="#' . $anchor_id . '" onclick="event.preventDefault(); scrollToClassTable(\'' . strtolower($carClass) . '\', \'' . $sessionType . '\')">';
                        // Afficher "LMP2" au lieu de "LMP2 ELMS" pour la cohérence avec l'index
                        echo '<span class="badge ' . $carClassCss . '">' . str_replace(' ELMS', '', htmlspecialchars($carClass)) . '</span>';
                        echo '</a>';
                        ?>
                    </td>
                    <td><?php echo htmlspecialchars($driverName); ?></td>
                    <td class="clickable-sort" data-sort-column-index="4">
                        <div class="car-cell-content">
                            <?php 
                            $logoUrl = getCarLogoUrl((string)$driver->CarType);
                            if ($logoUrl): ?>
                                <div class="car-logo-container">
                                    <img src="<?php echo htmlspecialchars($logoUrl); ?>" alt="<?php echo htmlspecialchars((string)$driver->CarType); ?>" class="car-logo-table">
                                </div>
                            <?php endif; ?>
                            <span><?php echo htmlspecialchars((string)$driver->CarType); ?></span>
                        </div>
                    </td>
                    <td class="text-center"><?php echo (int)$driver->Laps; ?></td>
                    <td class="text-center"><?php echo $lapsLedByDriver[$driverName] ?? 0; ?></td>
                    <td class="text-center">
                        <?php
                        if ((string)$driver->FinishStatus === 'Finished Normally') {
                            if ($position === 1) { echo formatSecondsToMmSsMs((float)$driver->FinishTime); }
                            else {
                                $lapsBehind = $maxLaps - (int)$driver->Laps;
                                if ($lapsBehind > 0) { echo '+ ' . $lapsBehind . ' ' . $lang['laps_behind'] . ($lapsBehind > 1 ? 's' : ''); }
                                else if ($winner_finish_time !== null) { echo '+ ' . formatSecondsToMmSsMs((float)$driver->FinishTime - $winner_finish_time, false) . 's'; }
                            }
                        } else {
                            echo 'N/A';
                        }
                        ?>
                    </td>
                    <td class="text-center is-pb clickable-cell" 
                        data-driver-name="<?php echo htmlspecialchars($driverName); ?>" 
                        data-track="<?php echo htmlspecialchars($trackVenue); ?>" 
                        data-best-lap-text="<?php echo formatSecondsToMmSsMs($bestLapsByDriver[$driverName]['lap'] ?? 0); ?>"
                        data-optimal-lap="<?php echo $bestLapsByDriver[$driverName]['optimal'] ?? 0; ?>"
                        data-overall-best-lap="<?php echo $bestLapTimeOverall ?? 0; ?>">
                        <?php 
                        $bestLapTime = $bestLapsByDriver[$driverName]['lap'] ?? INF;
                        if (abs($bestLapTime - $bestLapTimeOverall) < 0.0001) echo '🏆 ';
                        echo formatSecondsToMmSsMs($bestLapTime); 
                        ?>
                    </td>
                    <td class="text-center">
                        <?php
                        $vmax = $vmaxByDriver[$driverName] ?? 0;
                        if(abs($vmax - $bestVmaxOverall) < 0.001 && $bestVmaxOverall > 0) echo '⚡️ ';
                        echo number_format($vmax, 2, ',', ' '); 
                        ?> km/h
                    </td>
                    <td class="text-center">
                        <?php echo ($strategyData && $strategyData['startFuel'] !== null) ? round($strategyData['startFuel'], 1) . '%' : 'N/A'; ?>
                    </td>
                    <td class="text-center">
                        <?php echo ($strategyData && $strategyData['finishFuel'] !== null) ? round($strategyData['finishFuel'], 1) . '%' : 'N/A'; ?>
                    </td>
                    <td class="text-center"><?php echo $incident_summary[$driverName]['Total'] ?? 0; ?></td>
                    <td class="text-center"><?php echo $penalty_summary[$driverName]['Count'] ?? 0; ?></td>
                    <td class="text-center">
                        <?php 
                        $status = (string)$driver->FinishStatus;
                        echo translateTerm($status, $lang);
                        if ($status === 'DNF' && isset($driver->DNFReason)) {
                            echo ' (' . htmlspecialchars((string)$driver->DNFReason) . ')';
                        }
                        ?>
                    </td>
                </tr>
            <?php endforeach; ?>
        </tbody>
    </table>
<?php }

/**
 * Processes all data for a given session from the XML.
 *
 * @param SimpleXMLElement $sessionData The XML node for the session (e.g., <Practice1>, <Race>).
 * @param string $sessionType The name of the session ('Practice1', 'Qualify', 'Race').
 * @param array $lang The language array for translations.
 * @return array A structured array containing all processed statistics for the session.
 */
function process_session_data(SimpleXMLElement $sessionData, string $sessionType, array $lang): array {
    // Normalisation des noms de classe directement sur l'objet XML pour la cohérence
    if (isset($sessionData->Driver)) {
        foreach ($sessionData->Driver as $driver) {
            $carClass = (string)$driver->CarClass;
            if (str_replace('_', ' ', $carClass) === 'LMP2 ELMS' || strcasecmp($carClass, 'LMP2 Elms') == 0) {
                $driver->CarClass = 'LMP2 ELMS';
            }
        }
    }

    $result = [
        'drivers' => [],
        'lapsByDriver' => [],
        'allLapsForChart' => [],
        'bestLapsByDriver' => [],
        'vmaxByDriver' => [],
        'aidsByDriver' => [],
        'lapsLedByDriver' => [],
        'chatLog' => [],
        'incidents' => [],
        'penalties' => [],
        'bestLapTimeOverall' => INF,
        'bestLapDriverOverall' => 'N/A',
        'bestS1Overall' => INF,
        'bestS1Driver' => 'N/A',
        'bestS2Overall' => INF,
        'bestS2Driver' => 'N/A',
        'bestS3Overall' => INF,
        'bestS3Driver' => 'N/A',
        'bestVmaxOverall' => 0,
        'unique_classes' => [],
        'statsByDriver' => [],
        'incident_summary' => [],
        'penalty_summary' => [],
        'strategyDataByDriver' => [],
        'hypercar_drivers' => [],
        'lmp2elms_drivers' => [],
        'lmp2_drivers' => [],
        'lmp3_drivers' => [],
        'gt3_drivers' => [],
        'gte_drivers' => [],
    ];

    if (isset($sessionData->Driver)) {
        foreach ($sessionData->Driver as $driver) {
            $driverName = (string)$driver->Name;
            $result['drivers'][] = $driver;
            $result['vmaxByDriver'][$driverName] = 0;
            $result['lapsByDriver'][$driverName] = [];
            $result['allLapsForChart'][$driverName] = [];
            $result['incident_summary'][$driverName] = ['Position' => (int)$driver->Position, 'Vehicle' => 0, 'Other' => 0, 'Total' => 0];
            $result['penalty_summary'][$driverName] = ['Count' => 0];

            $carClass = (string)$driver->CarClass;
            if (!in_array($carClass, $result['unique_classes'])) {
                $result['unique_classes'][] = $carClass;
            }

            // Strategy and Laps Led
            $stints = [];
            $startFuel = null;
            $finishFuel = null;
            $compoundUsage = ['Front' => [], 'Rear' => []];
            $currentStint = 1;
            $pitStopSummary = [];
            $lapsLed = 0;
            
            if (!isset($stints[$currentStint])) {
                $stints[$currentStint] = ['laps' => [], 'wear_data' => [], 'compounds' => []];
            }

            if (isset($driver->Lap)) {
                foreach ($driver->Lap as $lap) {
                    if(isset($lap['p']) && (int)$lap['p'] === 1) {
                        $lapsLed++;
                    }
                    $lapTime = (float)(string)$lap[0];
                    if ($lapTime > 0) {
                        if ($startFuel === null && isset($lap['fuel']) && isset($lap['fuelUsed'])) {
                            $startFuel = ((float)$lap['fuel'] + (float)$lap['fuelUsed']) * 100;
                        }
                        if (isset($lap['fuel'])) {
                            $finishFuel = (float)$lap['fuel'] * 100;
                        }
                        if (isset($lap['twfl'])) {
                            $stints[$currentStint]['laps'][] = (int)$lap['num'];
                            $stints[$currentStint]['wear_data'][] = [
                                'fl' => round((1 - (float)$lap['twfl']) * 100, 1),
                                'fr' => round((1 - (float)$lap['twfr']) * 100, 1),
                                'rl' => round((1 - (float)$lap['twrl']) * 100, 1),
                                'rr' => round((1 - (float)$lap['twrr']) * 100, 1)
                            ];
                        }
                        if (count($stints[$currentStint]['laps']) === 1) {
                             if(isset($lap['fcompound'])) {
                                $frontCompound = explode(',', (string)$lap['fcompound'])[1] ?? $lang['compound_unknown'];
                                $stints[$currentStint]['compounds']['front'] = $frontCompound;
                                if($frontCompound !== 'N/A' && $frontCompound !== 'Unknown') {
                                   $compoundUsage['Front'][$frontCompound] = ($compoundUsage['Front'][$frontCompound] ?? 0) + 1;
                                }
                             }
                        }
                    }
                    if (isset($lap['pit']) && (int)$lap['pit'] === 1) {
                        $pitData = [
                            'stint_num' => $currentStint,
                            'lap' => (int)$lap['num'],
                            'fuel_added' => (isset($lap['fuelUsed']) && (float)$lap['fuelUsed'] < 0) ? abs((float)$lap['fuelUsed']) * 100 : 0,
                            'old_tyres' => $stints[$currentStint]['compounds']['front'] ?? 'N/A',
                            'new_tyres' => null 
                        ];
                        $pitStopSummary[] = $pitData;
                        if ((int)$lap['num'] < (int)$driver->Laps) {
                            $currentStint++;
                            $stints[$currentStint] = ['laps' => [], 'wear_data' => [], 'compounds' => []];
                        }
                    }
                }
                foreach ($pitStopSummary as $i => &$stop) {
                    $nextStintNum = $stop['stint_num'] + 1;
                    if (isset($stints[$nextStintNum])) {
                        $stop['new_tyres'] = $stints[$nextStintNum]['compounds']['front'] ?? 'N/A';
                    }
                }
                unset($stop);
            }
            $result['strategyDataByDriver'][$driverName] = [
                'stints' => $stints, 'startFuel' => $startFuel, 'finishFuel' => $finishFuel,
                'compoundUsage' => $compoundUsage, 'pitStopSummary' => $pitStopSummary
            ];
            $result['lapsLedByDriver'][$driverName] = $lapsLed;
            
            $bestLap = ['lap' => INF, 's1' => INF, 's2' => INF, 's3' => INF];

            if (isset($driver->Lap)) {
                foreach ($driver->Lap as $lap) {
                    $lapTime = (float)(string)$lap[0];
                    $s1 = (float)(string)($lap['s1'] ?? '0');
                    $s2 = (float)(string)($lap['s2'] ?? '0');
                    $s3 = (float)(string)($lap['s3'] ?? '0');
                    
                    $result['allLapsForChart'][$driverName][] = $lapTime > 0 ? $lapTime : null;

                    // Logique de meilleur tour et secteurs plus robuste
                    if ($lapTime > 0 && $lapTime < $bestLap['lap']) {
                        $bestLap['lap'] = $lapTime;
                    }
                    if ($s1 > 0 && $s1 < $bestLap['s1']) $bestLap['s1'] = $s1;
                    if ($s2 > 0 && $s2 < $bestLap['s2']) $bestLap['s2'] = $s2;
                    if ($s3 > 0 && $s3 < $bestLap['s3']) $bestLap['s3'] = $s3;
                    
                    if ($lapTime > 0 && $lapTime < $result['bestLapTimeOverall']) {
                        $result['bestLapTimeOverall'] = $lapTime;
                        $result['bestLapDriverOverall'] = $driverName;
                    }
                    if ($s1 > 0 && $s1 < $result['bestS1Overall']) { $result['bestS1Overall'] = $s1; $result['bestS1Driver'] = $driverName; }
                    if ($s2 > 0 && $s2 < $result['bestS2Overall']) { $result['bestS2Overall'] = $s2; $result['bestS2Driver'] = $driverName; }
                    if ($s3 > 0 && $s3 < $result['bestS3Overall']) { $result['bestS3Overall'] = $s3; $result['bestS3Driver'] = $driverName; }
                    
                    $result['lapsByDriver'][$driverName][] = $lap;
                    if (isset($lap['topspeed'])) {
                        $result['vmaxByDriver'][$driverName] = max($result['vmaxByDriver'][$driverName], (float)$lap['topspeed']);
                    }
                }
            }
            
            $result['bestVmaxOverall'] = max($result['bestVmaxOverall'], $result['vmaxByDriver'][$driverName]);
            $bestLap['optimal'] = compute_optimal_lap($bestLap['s1'], $bestLap['s2'], $bestLap['s3']);
            $result['bestLapsByDriver'][$driverName] = $bestLap;
            $result['aidsByDriver'][$driverName] = (string)($driver->ControlAndAids ?? 'N/A');

            // Calculs statistiques pour le comparateur
            $valid_laps = array_filter($result['allLapsForChart'][$driverName], fn($lap) => $lap > 0);
            sort($valid_laps);
            $count = count($valid_laps);
            
            $median_lap = INF;
            if ($count > 0) {
                $mid = floor(($count - 1) / 2);
                $median_lap = ($count % 2) ? $valid_laps[$mid] : ($valid_laps[$mid] + $valid_laps[$mid + 1]) / 2.0;
            }

            $std_dev = INF;
            if ($count > 1) {
                $mean = array_sum($valid_laps) / $count;
                $variance = array_sum(array_map(fn($x) => pow($x - $mean, 2), $valid_laps)) / $count;
                $std_dev = sqrt($variance);
            }
            
            $avg_best_5 = INF;
            if ($count > 0) {
                $laps_to_avg = array_slice($valid_laps, 0, min($count, 5));
                $avg_best_5 = array_sum($laps_to_avg) / count($laps_to_avg);
            }
            $result['statsByDriver'][$driverName] = [
                'median_lap' => $median_lap,
                'std_dev' => $std_dev,
                'avg_best_5' => $avg_best_5
            ];
        }
        
        $result['hypercar_drivers'] = array_filter($result['drivers'], fn($d) => (string)$d->CarClass === 'Hyper');
        $result['lmp2elms_drivers'] = array_filter($result['drivers'], fn($d) => (string)$d->CarClass === 'LMP2 ELMS');
        $result['lmp2_drivers'] = array_filter($result['drivers'], fn($d) => (string)$d->CarClass === 'LMP2');
        $result['lmp3_drivers'] = array_filter($result['drivers'], fn($d) => (string)$d->CarClass === 'LMP3');
        $result['gt3_drivers'] = array_filter($result['drivers'], fn($d) => (string)$d->CarClass === 'GT3');
        $result['gte_drivers'] = array_filter($result['drivers'], fn($d) => (string)$d->CarClass === 'GTE');

        usort($result['drivers'], fn($a, $b) => (int)$a->Position <=> (int)$b->Position);
        usort($result['hypercar_drivers'], fn($a, $b) => (int)$a->ClassPosition <=> (int)$b->ClassPosition);
        usort($result['lmp2elms_drivers'], fn($a, $b) => (int)$a->ClassPosition <=> (int)$b->ClassPosition);
        usort($result['lmp2_drivers'], fn($a, $b) => (int)$a->ClassPosition <=> (int)$b->ClassPosition);
        usort($result['lmp3_drivers'], fn($a, $b) => (int)$a->ClassPosition <=> (int)$b->ClassPosition);
        usort($result['gt3_drivers'], fn($a, $b) => (int)$a->ClassPosition <=> (int)$b->ClassPosition);
        usort($result['gte_drivers'], fn($a, $b) => (int)$a->ClassPosition <=> (int)$b->ClassPosition);
    }
    
    if (isset($sessionData->Stream)) {
        foreach($sessionData->Stream->children() as $event) {
            $eventName = $event->getName();
            $eventString = (string)$event;
            if($eventName === 'ChatMessage') { $result['chatLog'][] = $eventString; }
            if($eventName === 'Penalty') { 
                $result['penalties'][] = $eventString;
                if (preg_match('/Penalty given to (.+?):/', $eventString, $matches)) {
                    $driver_name = trim($matches[1]);
                    if (isset($result['penalty_summary'][$driver_name])) {
                        $result['penalty_summary'][$driver_name]['Count']++;
                    }
                }
            }
            if($eventName === 'Incident') { 
                $result['incidents'][] = $eventString;
                preg_match_all('/([a-zA-Z0-9_ .#-]+)\(/', $eventString, $matches);
                $involved_drivers = array_map('trim', $matches[1]);
                if (count($involved_drivers) == 2) {
                    foreach($involved_drivers as $driver_name) {
                        if(isset($result['incident_summary'][$driver_name])) {
                            $result['incident_summary'][$driver_name]['Vehicle']++;
                            $result['incident_summary'][$driver_name]['Total']++;
                        }
                    }
                } elseif (count($involved_drivers) == 1) {
                    $driver_name = $involved_drivers[0];
                    if(isset($result['incident_summary'][$driver_name])) {
                        $result['incident_summary'][$driver_name]['Other']++;
                        $result['incident_summary'][$driver_name]['Total']++;
                    }
                }
            }
        }
        uasort($result['incident_summary'], function($a, $b) {
            if ($a['Total'] != $b['Total']) { return $b['Total'] <=> $a['Total']; }
            return $a['Position'] <=> $b['Position'];
        });
    }

    return $result;
}

function printSortableHeader(string $label, string $columnKey, string $langKey, string $currentSortBy, string $currentSortDir, array $queryParams, string $page = 'index.php', string $anchor = '#race-results-table'): void {
    $isSortingThisColumn = ($currentSortBy === $columnKey);
    $nextSortDir = ($isSortingThisColumn && $currentSortDir === 'asc') ? 'desc' : 'asc';

    $queryParams['sort_by']  = $columnKey;
    $queryParams['sort_dir'] = $nextSortDir;

    $link  = $page . '?' . http_build_query($queryParams) . $anchor;
    $class = 'sortable';
    if ($isSortingThisColumn) {
        $class .= ($currentSortDir === 'asc') ? ' sort-asc' : ' sort-desc';
    }

    echo '<th class="' . $class . '"><a href="' . $link . '">' . $label . '</a></th>';
}

?>
