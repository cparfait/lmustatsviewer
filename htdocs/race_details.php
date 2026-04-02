<?php
require_once 'includes/init.php';

// Récupère l'ancre de la table d'origine pour le lien de retour
$from_anchor = htmlspecialchars($_GET['from'] ?? 'race-results-table');

// --- LOGIQUE DE LA PAGE DE DÉTAILS ---

$session_id = $_GET['session_id'] ?? '';
if (empty($session_id) || !is_numeric($session_id)) {
    die($lang['error_invalid_session_id']);
}

// --- LOGIQUE DE REGROUPEMENT ---
$session_files_data = [];
$first_xml = null;

$events = get_race_events();

$found_event = [];
foreach ($events as $event) {
    if ($event[0]['timestamp'] == $session_id) {
        $found_event = $event;
        break;
    }
}

if (empty($found_event)) {
    foreach ($events as $event) {
        foreach ($event as $file_in_event) {
            if ($file_in_event['timestamp'] == $session_id) {
                $found_event = $event;
                break 2;
            }
        }
    }
}

foreach($found_event as $file_data) {
    $xml = $file_data['xml'];
    $filename = $file_data['filename'];
    if (!$first_xml) $first_xml = $xml;

    foreach (['Practice1', 'Qualify', 'Race'] as $section) {
        if (isset($xml->RaceResults->{$section})) {
            $session_files_data[$section] = ['xml' => $xml, 'filename' => $filename];
        }
    }
}

if (empty($session_files_data)) {
    die($lang['error_no_results_found']);
}

$xml_info = $first_xml;
$raceResults_info = $xml_info->RaceResults;
$trackVenue = (string)$raceResults_info->TrackVenue;

$default_session_view = 'Race';
if (!isset($session_files_data[$default_session_view])) {
    $default_session_view = isset($session_files_data['Qualify']) ? 'Qualify' : (isset($session_files_data['Practice1']) ? 'Practice1' : array_key_first($session_files_data));
}
$current_session_view = $_GET['session_view'] ?? $default_session_view;
if (!isset($session_files_data[$current_session_view])) {
    $current_session_view = $default_session_view;
}

$session_key_suffix_for_title = strtolower(str_replace('1', '', $current_session_view));
$title_key = 'details_title_' . $session_key_suffix_for_title;
$page_title = isset($lang[$title_key]) ? $lang[$title_key] : $lang['details_title'];

?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>" data-theme="<?php echo $current_theme; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $page_title; ?> - <?php echo htmlspecialchars($trackVenue); ?></title>
    <link rel="icon" href="logos/lmu.ico" type="image/x-icon">
    <link rel="stylesheet" href="css/style.css?v=<?php echo filemtime('css/style.css'); ?>">
    <script src="js/chart.js"></script>
    <script src="js/chartjs-plugin-datalabels.js"></script>
    <style>
        body { margin: 0; }
        .container { padding-top: 15px; }
        .car-cell-content {
            display: flex;
            align-items: center;
        }
        .car-logo-container {
            width: 70px;
            flex-shrink: 0;
            text-align: left;
        }
        .car-logo-table {
            height: 20px;
            max-width: 100%;
            vertical-align: middle;
        }
        .clickable-sort {
            cursor: pointer;
        }
        .is-best-in-row {
            background-color: rgba(40, 167, 69, 0.2);
            font-weight: bold;
        }
        .controls-and-legend-wrapper {
            margin-bottom: 20px;
        }
        #comparison-table td:first-child {
            font-weight: bold;
            background-color: var(--bg-color);
            color: #000000;
            padding: 10px 15px;
        }
        [data-theme="dark"] #comparison-table td:first-child {
            color: #ffffff;
        }
        #comparison-table th:not(:first-child) {
            font-weight: bold;
        }
        [id^="view-best-laps-"] table:first-of-type td:first-child {
            font-weight: bold;
        }
        #comparison-table th {
            background-color: #fff;
        }
        [data-theme="dark"] #comparison-table th {
            background-color: #3A3A3A;
        }
        #comparison-table th:first-child {
            color: #004A7C;
        }
    </style>
</head>
<body class="race-details-page">
    <div class="container">
        <div class="page-header">
            <a href="index.php?lang=<?php echo $current_lang; ?>#<?php echo $from_anchor; ?>" class="btn btn-action">&laquo; <?php echo $lang['back_to_list']; ?></a>
            <h1 id="main-title"><?php echo htmlspecialchars($trackVenue); ?></h1>
            <div class="header-spacer"></div>
        </div>
        
        <?php
            // Ne traiter que la session actuellement visible pour éviter les conflits de données
            $sessionType = $current_session_view;
            $sessionDataBundle = $session_files_data[$sessionType];
            
            $sessionXml = $sessionDataBundle['xml'];
            $sessionFilename = $sessionDataBundle['filename'];

            $session_key_suffix = strtolower(str_replace('1', '', $sessionType));
            $tab_results_key = 'view_results_' . $session_key_suffix;
            $tab_laps_key = 'view_laps_' . $session_key_suffix;

            $raceResults = $sessionXml->RaceResults;
            $sessionData = $raceResults->{$sessionType};

            // On utilise la fonction centralisée pour traiter les données
            $processed_data = process_session_data($sessionData, $sessionType, $lang);
            extract($processed_data);

            $winner = isset($drivers[0]) ? (string)$drivers[0]->Name : 'N/A';
            $bestLapStringForHeader = ($bestLapDriverOverall !== 'N/A') ? $bestLapDriverOverall . ' (' . formatSecondsToMmSsMs($bestLapTimeOverall) . ')' : 'N/A';
            $otherSettings = 'MechFailRate=' . (string)$raceResults->MechFailRate . ' | DamageMult=' . (string)$raceResults->DamageMult . ' | FuelMult=' . (string)$raceResults->FuelMult . ' | TireMult=' . (string)$raceResults->TireMult;
            $maxLaps = (int)($raceResults->{$sessionType}->MostLapsCompleted ?? 0);

            $vehicles_display = 'N/A';
            if (!empty($unique_classes)) {
                $badges_html = '';
                foreach ($unique_classes as $class_name) {
                    $carClassCss = 'class-' . strtolower(str_replace([' ', '-', '#'], '', $class_name));
                    $anchor_id = 'table-' . strtolower($class_name);
                    $title_text = isset($lang['scroll_to_class']) ? sprintf($lang['scroll_to_class'], htmlspecialchars($class_name)) : 'Go to ' . htmlspecialchars($class_name);
                    $badges_html .= '<a href="#' . $anchor_id . '" onclick="scrollToClassTable(\'' . strtolower($class_name) . '\')" title="' . $title_text . '" style="text-decoration: none;"><span class="badge ' . $carClassCss . '">' . htmlspecialchars($class_name) . '</span></a> ';
                }
                $vehicles_display = $badges_html;
            }
        ?>
        <div class="session-view-container" id="session-<?php echo $sessionType; ?>">

            <div class="header-grid">
                <table>
                    <tr><th><?php echo $lang['th_session']; ?></th><td><?php echo translateTerm($sessionType, $lang); ?></td></tr>
                    <tr class="header-date" data-timestamp="<?php echo (int)$raceResults->DateTime; ?>"><th><?php echo $lang['th_date']; ?></th><td><?php echo date('d/m/Y H:i', (int)$raceResults->DateTime); ?></td></tr>
                    <tr><th><?php echo $lang['th_track']; ?></th><td><?php echo htmlspecialchars((string)$raceResults->TrackCourse); ?></td></tr>
                    <tr><th><?php echo $lang['th_winner']; ?></th><td><?php echo htmlspecialchars($winner); ?></td></tr>
                    <tr><th><?php echo $lang['th_best_lap']; ?></th><td><?php echo $bestLapStringForHeader; ?></td></tr>
                </table>
                <table>
                    <tr><th><?php echo $lang['th_max_minutes']; ?></th><td><?php echo htmlspecialchars((string)$sessionData->Minutes); ?></td></tr>
                    <tr><th><?php echo $lang['th_laps_completed']; ?></th><td><?php echo $maxLaps; ?></td></tr>
                    <tr><th><?php echo $lang['filename_header']; ?></th><td><?php echo htmlspecialchars($sessionFilename); ?></td></tr>
                    <tr><th><?php echo $lang['th_allowed_vehicles']; ?></th><td><?php echo $vehicles_display; ?></td></tr>
                    <tr><th><?php echo $lang['th_other_settings']; ?></th><td style="font-size: 0.9em;"><?php echo htmlspecialchars($otherSettings); ?></td></tr>
                </table>
            </div>


            <?php
                $is_comparison_view = isset($_GET['driver1']);
            ?>
            <div class="view-menu">
                <a href="#" class="view-tab <?php if (!$is_comparison_view) echo 'active'; ?>" data-view="race-result"><?php echo isset($lang[$tab_results_key]) ? $lang[$tab_results_key] : $lang['view_race_result']; ?></a>
                <a href="#" class="view-tab" data-view="race-laps"><?php echo isset($lang[$tab_laps_key]) ? $lang[$tab_laps_key] : $lang['view_race_laps']; ?></a>
                <a href="#" class="view-tab" data-view="best-laps"><?php echo $lang['view_best_laps']; ?></a>
                <a href="#" class="view-tab" data-view="strategy"><?php echo $lang['view_strategy']; ?></a>
                <a href="#" class="view-tab" data-view="incidents"><?php echo $lang['view_incidents']; ?></a>
                <a href="#" class="view-tab" data-view="penalties"><?php echo $lang['view_penalties']; ?></a>
                <a href="#" class="view-tab" data-view="chat"><?php echo $lang['view_chat']; ?></a>
                <a href="#" class="view-tab <?php if ($is_comparison_view) echo 'active'; ?>" data-view="compare"><?php echo $lang['view_compare'] ?? 'Compare'; ?></a>
            </div>
            
            <div class="controls-and-legend-wrapper">
                <div id="session-switcher">
                    <label for="session-selector-<?php echo $sessionType; ?>"><?php echo $lang['select_session']; ?></label>
                    <select id="session-selector-<?php echo $sessionType; ?>" class="session-selector" onchange="switchSessionView(this)">
                        <?php
                        $session_order = ['Practice1', 'Qualify', 'Race'];
                        $sorted_sessions = array_intersect_key(array_flip($session_order), $session_files_data);
                        $remaining_sessions = array_diff_key($session_files_data, $sorted_sessions);
                        $final_sessions = array_merge($sorted_sessions, $remaining_sessions);
                        
                        foreach (array_keys($final_sessions) as $session_key):
                            $title_key_option = 'details_title_' . strtolower(str_replace('1', '', $session_key));
                        ?>
                            <option value="<?php echo $session_key; ?>" 
                                    data-title-key="<?php echo $title_key_option; ?>"
                                    data-translated-name="<?php echo translateTerm($session_key, $lang); ?>"
                                    <?php if($session_key === $current_session_view) echo 'selected'; ?>>
                                <?php echo translateTerm($session_key, $lang); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
                <div class="legend">
                    <div class="legend-title"><?= $lang['legend'] ?></div>
                    <div class="legend-item"><span class="legend-color-box player-row";"></span><?= $lang['legend_player'] ?></div>
                    <div class="legend-item"><span class="legend-color-box" style="color: #28a745;">PB</span><?= $lang['legend_personal_best'] ?></div>
                    <div class="legend-item"><span class="legend-color-box" style="color: #e5a00d;">🏆</span><?= $lang['legend_overall_best'] ?></div>
                    <div class="legend-item"><span class="legend-color-box lap-invalid"></span><?= $lang['legend_invalid'] ?></div>
                </div>
            </div>

            <div id="view-race-result-<?php echo $sessionType; ?>" class="view-content" style="<?php if ($is_comparison_view) echo 'display: none;'; ?>">
                <?php
                    render_classification_table($drivers, $lang['general_classification'], $lang, $strategyDataByDriver, $lapsLedByDriver, false, $drivers, $bestLapsByDriver, $vmaxByDriver, $bestVmaxOverall, $bestLapTimeOverall, $incident_summary, $penalty_summary, $aidsByDriver);
                    
                    if (!empty($drivers)) {
                        $carCounts = [];
                        foreach ($drivers as $driver) {
                            $carType = (string)$driver->CarType;
                            if (!isset($carCounts[$carType])) {
                                $carCounts[$carType] = 0;
                            }
                            $carCounts[$carType]++;
                        }
                        arsort($carCounts);
                        ?>
                        <h2 class="table-title-secondary"><?php echo htmlspecialchars($lang['car_summary_title']); ?></h2>
                        <table class="sortable-table">
                            <thead>
                                <tr>
                                    <th class="text-center"><?php echo $lang['logo_header']; ?></th>
                                    <th><?php echo $lang['car_header']; ?></th>
                                    <th class="text-center"><?php echo $lang['count_header']; ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach ($carCounts as $carType => $count): ?>
                                    <tr>
                                        <td class="text-center">
                                            <?php 
                                            $logoUrl = getCarLogoUrl($carType); 
                                            if ($logoUrl): ?>
                                                <img src="<?php echo htmlspecialchars($logoUrl); ?>" alt="<?php echo htmlspecialchars($carType); ?>" class="car-logo-table">
                                            <?php endif; ?>
                                        </td>
                                        <td><?php echo htmlspecialchars($carType); ?></td>
                                        <td class="text-center"><?php echo $count; ?></td>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php
                    }

                    if (count($unique_classes) > 1) {
                        if (!empty($hypercar_drivers)) {
                            echo '<h2 id="table-hyper" class="table-title-secondary">' . htmlspecialchars($lang['hypercar_classification']) . '</h2>';
                            render_classification_table($hypercar_drivers, '', $lang, $strategyDataByDriver, $lapsLedByDriver, true, $drivers, $bestLapsByDriver, $vmaxByDriver, $bestVmaxOverall, $bestLapTimeOverall, $incident_summary, $penalty_summary, $aidsByDriver);
                        }
                        if (!empty($lmp2_drivers)) {
                            echo '<h2 id="table-lmp2" class="table-title-secondary">' . htmlspecialchars($lang['lmp2_classification']) . '</h2>';
                            render_classification_table($lmp2_drivers, '', $lang, $strategyDataByDriver, $lapsLedByDriver, true, $drivers, $bestLapsByDriver, $vmaxByDriver, $bestVmaxOverall, $bestLapTimeOverall, $incident_summary, $penalty_summary, $aidsByDriver);
                        }
                        if (!empty($lmp2elms_drivers)) {
                            echo '<h2 id="table-lmp2elms" class="table-title-secondary">' . htmlspecialchars($lang['lmp2elms_classification']) . '</h2>';
                            render_classification_table($lmp2elms_drivers, '', $lang, $strategyDataByDriver, $lapsLedByDriver, true, $drivers, $bestLapsByDriver, $vmaxByDriver, $bestVmaxOverall, $bestLapTimeOverall, $incident_summary, $penalty_summary, $aidsByDriver);
                        }
                        if (!empty($lmp3_drivers)) {
                            echo '<h2 id="table-lmp3" class="table-title-secondary">' . htmlspecialchars($lang['lmp3_classification']) . '</h2>';
                            render_classification_table($lmp3_drivers, '', $lang, $strategyDataByDriver, $lapsLedByDriver, true, $drivers, $bestLapsByDriver, $vmaxByDriver, $bestVmaxOverall, $bestLapTimeOverall, $incident_summary, $penalty_summary, $aidsByDriver);
                        }
                        if (!empty($gt3_drivers)) {
                            echo '<h2 id="table-gt3" class="table-title-secondary">' . htmlspecialchars($lang['gt3_classification']) . '</h2>';
                            render_classification_table($gt3_drivers, '', $lang, $strategyDataByDriver, $lapsLedByDriver, true, $drivers, $bestLapsByDriver, $vmaxByDriver, $bestVmaxOverall, $bestLapTimeOverall, $incident_summary, $penalty_summary, $aidsByDriver);
                        }
                        if (!empty($gte_drivers)) {
                            echo '<h2 id="table-gte" class="table-title-secondary">' . htmlspecialchars($lang['gte_classification']) . '</h2>';
                            render_classification_table($gte_drivers, '', $lang, $strategyDataByDriver, $lapsLedByDriver, true, $drivers, $bestLapsByDriver, $vmaxByDriver, $bestVmaxOverall, $bestLapTimeOverall, $incident_summary, $penalty_summary, $aidsByDriver);
                        }
                    }
                ?>
            </div>

            <div id="view-race-laps-<?php echo $sessionType; ?>" class="view-content" style="display: none;">
                <div class="driver-jump-menu">
                    <label for="driver-selector-laps-<?php echo $sessionType; ?>"><?php echo $lang['select_driver']; ?></label>
                    <select id="driver-selector-laps-<?php echo $sessionType; ?>" onchange="scrollToDriver(this, '<?php echo $sessionType; ?>', 'laps')">
                        <option value=""><?php echo $lang['select_driver_placeholder']; ?></option>
                        <?php
                        $sorted_drivers_for_menu = $drivers;
                        usort($sorted_drivers_for_menu, function($a, $b) {
                            return strcasecmp((string)$a->Name, (string)$b->Name);
                        });
                        foreach ($sorted_drivers_for_menu as $driver):
                            $driverName = (string)$driver->Name;
                            $anchorId = 'laps-driver-' . preg_replace('/[^a-zA-Z0-9\-]/', '', str_replace(' ', '-', $driverName));
                        ?>
                            <option value="<?php echo $anchorId; ?>"><?php echo htmlspecialchars($driverName); ?></option>
                        <?php endforeach; ?>
                    </select>
                    <button class="btn btn-action" onclick="scrollToPlayer(event, '<?php echo $sessionType; ?>', 'laps')"><?php echo $lang['my_laps_button']; ?></button>
                </div>
                
                <?php foreach ($drivers as $driver): 
                    $driverName = (string)$driver->Name;
                    $anchorId = 'laps-driver-' . preg_replace('/[^a-zA-Z0-9\-]/', '', str_replace(' ', '-', $driverName));
                ?>
                    <h2 id="<?php echo $anchorId; ?>-<?php echo $sessionType; ?>" class="driver-laps-title"><?php echo (int)$driver->Position . '. ' . htmlspecialchars($driverName); ?></h2>
                    <?php if (empty($lapsByDriver[$driverName])): ?>
                        <p class="no-data-message"><?php echo $lang['no_laps_recorded']; ?></p>
                    <?php else: ?>
                        <table class="sortable-table">
                            <thead>
                                <tr>
                                    <th data-sortable="true" data-sort-type="number"><?php echo $lang['lap_header']; ?></th>
                                    <th data-sortable="true" data-sort-type="number"><?php echo $lang['pos_header']; ?></th>
                                    <th class="text-right" data-sortable="true" data-sort-type="number"><?php echo $lang['time_header']; ?></th>
                                    <th class="text-right" data-sortable="true" data-sort-type="number"><?php echo $lang['sector_1_header']; ?></th>
                                    <th class="text-right" data-sortable="true" data-sort-type="number"><?php echo $lang['sector_2_header']; ?></th>
                                    <th class="text-right" data-sortable="true" data-sort-type="number"><?php echo $lang['sector_3_header']; ?></th>
                                </tr>
                            </thead>
                            <tbody>
								<?php foreach($lapsByDriver[$driverName] as $lap): 
									$lapTime = (float)(string)($lap[0] ?? '0');
									$s1 = (float)(string)($lap['s1'] ?? '0');
									$s2 = (float)(string)($lap['s2'] ?? '0');
									$s3 = (float)(string)($lap['s3'] ?? '0');
									$isValid = ($lapTime > 0 && $s1 > 0 && $s2 > 0 && $s3 > 0);
								?>
									<tr class="<?php if (!$isValid) echo 'lap-invalid'; ?>">
                                    <td class="text-center"><?php echo (int)$lap['num']; ?></td>
                                    <td class="text-center"><?php echo isset($lap['p']) ? (int)$lap['p'] : 'N/A'; ?></td>
                                    <td class="text-center <?php if($isValid && abs($lapTime - $bestLapTimeOverall) < 0.0001) echo 'is-overall-best'; elseif($isValid && isset($bestLapsByDriver[$driverName]) && abs($lapTime - ($bestLapsByDriver[$driverName]['lap'] ?? INF)) < 0.0001) echo 'is-pb'; ?>"><?php if($isValid && abs($lapTime - $bestLapTimeOverall) < 0.0001) echo '🏆 '; echo formatSecondsToMmSsMs($lapTime); ?></td>
                                    <td class="text-center <?php if($isValid && abs($s1 - $bestS1Overall) < 0.0001) echo 'is-overall-best'; elseif($isValid && isset($bestLapsByDriver[$driverName]) && abs($s1 - ($bestLapsByDriver[$driverName]['s1'] ?? INF)) < 0.0001) echo 'is-pb'; ?>"><?php if($isValid && abs($s1 - $bestS1Overall) < 0.0001) echo '🏆 '; echo formatSecondsToMmSsMs($s1, false); ?></td>
                                    <td class="text-center <?php if($isValid && abs($s2 - $bestS2Overall) < 0.0001) echo 'is-overall-best'; elseif($isValid && isset($bestLapsByDriver[$driverName]) && abs($s2 - ($bestLapsByDriver[$driverName]['s2'] ?? INF)) < 0.0001) echo 'is-pb'; ?>"><?php if($isValid && abs($s2 - $bestS2Overall) < 0.0001) echo '🏆 '; echo formatSecondsToMmSsMs($s2, false); ?></td>
                                    <td class="text-center <?php if($isValid && abs($s3 - $bestS3Overall) < 0.0001) echo 'is-overall-best'; elseif($isValid && isset($bestLapsByDriver[$driverName]) && abs($s3 - ($bestLapsByDriver[$driverName]['s3'] ?? INF)) < 0.0001) echo 'is-pb'; ?>"><?php if($isValid && abs($s3 - $bestS3Overall) < 0.0001) echo '🏆 '; echo formatSecondsToMmSsMs($s3, false); ?></td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    <?php endif; ?>
                <?php endforeach; ?>
            </div>

            <div id="view-best-laps-<?php echo $sessionType; ?>" class="view-content" style="display: none;">
                <table style="margin-bottom: 30px;">
                    <thead>
                        <tr>
                            <th data-sortable="false"><?php echo $lang['th_type']; ?></th>
                            <th data-sortable="false"><?php echo $lang['driver_header']; ?></th>
                            <th class="text-right" data-sortable="false"><?php echo $lang['time_header']; ?></th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><?php echo $lang['th_best_lap']; ?></td>
                            <td><?php echo htmlspecialchars($bestLapDriverOverall); ?></td>
                            <td class="text-center is-overall-best">🏆 <?php echo formatSecondsToMmSsMs($bestLapTimeOverall); ?></td>
                        </tr>
                        <tr>
                            <td><?php echo $lang['best_sector1']; ?></td>
                            <td><?php echo htmlspecialchars($bestS1Driver); ?></td>
                            <td class="text-center is-overall-best">🏆 <?php echo formatSecondsToMmSsMs($bestS1Overall, false); ?>s</td>
                        </tr>
                        <tr>
                            <td><?php echo $lang['best_sector2']; ?></td>
                            <td><?php echo htmlspecialchars($bestS2Driver); ?></td>
                            <td class="text-center is-overall-best">🏆 <?php echo formatSecondsToMmSsMs($bestS2Overall, false); ?>s</td>
                        </tr>
                        <tr>
                            <td><?php echo $lang['best_sector3']; ?></td>
                            <td><?php echo htmlspecialchars($bestS3Driver); ?></td>
                            <td class="text-center is-overall-best">🏆 <?php echo formatSecondsToMmSsMs($bestS3Overall, false); ?>s</td>
                        </tr>
                    </tbody>
                </table>
                <table class="sortable-table">
                    <thead>
                        <tr>
                            <th data-sortable="true" data-sort-type="number"><?php echo $lang['th_pos']; ?></th>
                            <th data-sortable="true" data-sort-type="text"><?php echo $lang['driver_header']; ?></th>
                            <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['best_lap_header']; ?></th>
                            <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['optimal_header']; ?></th>
                            <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['sector_1_header']; ?></th>
                            <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['sector_2_header']; ?></th>
                            <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['sector_3_header']; ?></th>
                        </tr>
                    </thead>
				<tbody>
					<?php
					$sortedBestLaps = $bestLapsByDriver;
					uasort($sortedBestLaps, fn($a, $b) => ($a['lap'] ?? INF) <=> ($b['lap'] ?? INF));
					
					$driverPositions = [];
					foreach($drivers as $d) {
						$driverPositions[(string)$d->Name] = (int)$d->Position;
					}
					?>
					<?php foreach($sortedBestLaps as $driverName => $lap): ?>
					<tr class="<?php echo ($driverName === PLAYER_NAME) ? 'player-row' : ''; ?>">
						<td class="text-center"><?php echo $driverPositions[$driverName] ?? 'N/A'; ?></td>
						<td><?php echo htmlspecialchars($driverName); ?></td>
						<?php 
							$isBestLapOverall = abs(($lap['lap'] ?? INF) - $bestLapTimeOverall) < 0.0001;
							$isPlayer = $driverName === PLAYER_NAME;
							$lapClass = '';
							if($isBestLapOverall && $isPlayer) $lapClass = 'is-overall-and-pb';
							elseif($isBestLapOverall) $lapClass = 'is-overall-best';
							elseif($isPlayer) $lapClass = 'is-pb';
						?>
						<td class="text-center <?php echo $lapClass; ?>"><?php if($isBestLapOverall) echo '🏆 '; echo formatSecondsToMmSsMs($lap['lap'] ?? INF); ?></td>
						<td class="text-center"><?php echo formatSecondsToMmSsMs($lap['optimal'] ?? INF); ?></td>
						<?php 
							$isBestS1Overall = abs(($lap['s1'] ?? INF) - $bestS1Overall) < 0.0001;
							$s1Class = '';
							if($isBestS1Overall && $isPlayer) $s1Class = 'is-overall-and-pb';
							elseif($isBestS1Overall) $s1Class = 'is-overall-best';
							elseif($isPlayer) $s1Class = 'is-pb';
						?>
						<td class="text-center <?php echo $s1Class; ?>"><?php if($isBestS1Overall) echo '🏆 '; echo formatSecondsToMmSsMs($lap['s1'] ?? INF, false); ?>s</td>

						<?php 
							$isBestS2Overall = abs(($lap['s2'] ?? INF) - $bestS2Overall) < 0.0001;
							$s2Class = '';
							if($isBestS2Overall && $isPlayer) $s2Class = 'is-overall-and-pb';
							elseif($isBestS2Overall) $s2Class = 'is-overall-best';
							elseif($isPlayer) $s2Class = 'is-pb';
						?>
						<td class="text-center <?php echo $s2Class; ?>"><?php if($isBestS2Overall) echo '🏆 '; echo formatSecondsToMmSsMs($lap['s2'] ?? INF, false); ?>s</td>

						<?php 
							$isBestS3Overall = abs(($lap['s3'] ?? INF) - $bestS3Overall) < 0.0001;
							$s3Class = '';
							if($isBestS3Overall && $isPlayer) $s3Class = 'is-overall-and-pb';
							elseif($isBestS3Overall) $s3Class = 'is-overall-best';
							elseif($isPlayer) $s3Class = 'is-pb';
						?>
						<td class="text-center <?php echo $s3Class; ?>"><?php if($isBestS3Overall) echo '🏆 '; echo formatSecondsToMmSsMs($lap['s3'] ?? INF, false); ?>s</td>
					</tr>
					<?php endforeach; ?>
				</tbody>
                </table>
            </div>
            
            <div id="view-strategy-<?php echo $sessionType; ?>" class="view-content" style="display: none;">
                <div class="driver-jump-menu">
                    <label for="driver-selector-strategy-<?php echo $sessionType; ?>"><?php echo $lang['select_driver']; ?></label>
                    <select id="driver-selector-strategy-<?php echo $sessionType; ?>" onchange="scrollToDriver(this, '<?php echo $sessionType; ?>', 'strategy')">
                        <option value=""><?php echo $lang['select_driver_placeholder']; ?></option>
                        <?php
                        if (!isset($sorted_drivers_for_menu)) {
                            $sorted_drivers_for_menu = $drivers;
                            usort($sorted_drivers_for_menu, function($a, $b) {
                                return strcasecmp((string)$a->Name, (string)$b->Name);
                            });
                        }
                        foreach ($sorted_drivers_for_menu as $driver):
                            $driverName = (string)$driver->Name;
                            $anchorId = 'strategy-driver-' . preg_replace('/[^a-zA-Z0-9\-]/', '', str_replace(' ', '-', $driverName));
                        ?>
                            <option value="<?php echo $anchorId; ?>"><?php echo htmlspecialchars($driverName); ?></option>
                        <?php endforeach; ?>
                    </select>
                    <button class="btn btn-action" onclick="scrollToPlayer(event, '<?php echo $sessionType; ?>', 'strategy')"><?php echo $lang['my_strategy_button']; ?></button>
                </div>
                <?php foreach ($drivers as $driver): 
                    $driverName = (string)$driver->Name;
                    $strategyData = $strategyDataByDriver[$driverName] ?? null;
                    if (!$strategyData || empty($strategyData['stints'])) continue;
                    $anchorId = 'strategy-driver-' . preg_replace('/[^a-zA-Z0-9\-]/', '', str_replace(' ', '-', $driverName));
                ?>
                    <h2 id="<?php echo $anchorId; ?>-<?php echo $sessionType; ?>" class="driver-laps-title"><?php echo (int)$driver->Position . '. ' . htmlspecialchars($driverName); ?></h2>
                    <div class="strategy-container">
                        <div class="strategy-summary">
                            <div class="summary-box">
                                <h4><?php echo $lang['fuel_analysis_title']; ?></h4>
                                <p><strong><?php echo $lang['fuel_start_fuel']; ?></strong> <?php echo ($strategyData['startFuel'] !== null) ? round($strategyData['startFuel'], 1) . '%' : 'N/A'; ?></p>
                                <p><strong><?php echo $lang['fuel_end_fuel']; ?></strong> <?php echo ($strategyData['finishFuel'] !== null) ? round($strategyData['finishFuel'], 1) . '%' : 'N/A'; ?></p>
                            </div>
                            <div class="summary-box">
                                <h4><?php echo $lang['tyre_compound_title']; ?></h4>
                                <table class="sortable-table">
                                    <thead>
                                        <tr>
                                            <th data-sortable="true" data-sort-type="text"><?php echo $lang['tyre_compound_type']; ?></th>
                                            <th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['tyre_compound_stints']; ?></th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                    <?php 
                                        $allCompounds = array_keys($strategyData['compoundUsage']['Front']);
                                        if (empty($allCompounds) || (count($allCompounds) == 1 && ($allCompounds[0] === 'Unknown' || $allCompounds[0] === 'N/A'))) {
                                            echo '<tr><td colspan="2">' . $lang['no_data_available'] . '</td></tr>';
                                        } else {
                                            foreach($allCompounds as $compound): 
                                    ?>
                                        <tr>
                                            <td><?php echo htmlspecialchars($compound); ?></td>
                                            <td class="text-center"><?php echo $strategyData['compoundUsage']['Front'][$compound] ?? 0; ?></td>
                                        </tr>
                                    <?php 
                                            endforeach; 
                                        }
                                    ?>
                                    </tbody>
                                </table>
                            </div>
                        </div>

                        <?php if(!empty($strategyData['pitStopSummary'])): ?>
                        <h4 class="strategy-subtitle"><?php echo $lang['pit_stop_summary_title']; ?></h4>
                        <table class="pit-stop-summary-table">
                             <thead>
                                <tr>
                                    <th class="text-center"><?php echo $lang['pit_stop_stint_number']; ?></th>
                                    <th class="text-center"><?php echo $lang['pit_stop_lap']; ?></th>
                                    <th class="text-center"><?php echo $lang['pit_stop_fuel_added']; ?></th>
                                    <th class="text-center"><?php echo $lang['pit_stop_old_tyres']; ?></th>
                                    <th class="text-center"><?php echo $lang['pit_stop_tyres']; ?></th>
                                </tr>
                            </thead>
                            <tbody>
                                <?php foreach($strategyData['pitStopSummary'] as $stop): ?>
                                <tr>
                                    <td class="text-center"><?php echo $stop['stint_num']; ?></td>
                                    <td class="text-center"><?php echo $stop['lap']; ?></td>
                                    <td class="text-center"><?php echo $stop['fuel_added'] > 0 ? '+ ' . round($stop['fuel_added'], 1) . '%' : '--'; ?></td>
                                    <td class="text-center"><?php echo htmlspecialchars($stop['old_tyres'] ?? '--'); ?></td>
                                    <td class="text-center"><?php echo htmlspecialchars($stop['new_tyres'] ?? '--'); ?></td>
                                </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                        <?php endif; ?>

                        <h4 class="strategy-subtitle"><?php echo $lang['tyre_wear_per_stint']; ?></h4>
                        <table>
                            <thead>
                                <tr>
                                    <th class="text-center"><?php echo $lang['table_stint']; ?></th>
                                    <th class="text-center"><?php echo $lang['table_lap']; ?></th>
                                    <th class="text-center"><?php echo $lang['table_compound']; ?></th>
                                    <th class="text-center"><?php echo $lang['tyre_wear_fl']; ?></th>
                                    <th class="text-center"><?php echo $lang['tyre_wear_fr']; ?></th>
                                    <th class="text-center"><?php echo $lang['tyre_wear_rl']; ?></th>
                                    <th class="text-center"><?php echo $lang['tyre_wear_rr']; ?></th>
                                </tr>
                            </thead>
                            <tbody>
                            <?php foreach($strategyData['stints'] as $stintNum => $stintData): 
                                if(empty($stintData['laps']) || empty($stintData['wear_data'])) continue;
                                $rowCount = count($stintData['laps']);
                                foreach($stintData['laps'] as $index => $lapNum):
                                    $wear = $stintData['wear_data'][$index];
                            ?>
                                <tr>
                                    <?php if($index === 0): ?>
                                        <td class="text-center" rowspan="<?php echo $rowCount; ?>" style="vertical-align: middle;">
                                            <strong><?php echo $stintNum; ?></strong><br>
                                            <small><?php echo sprintf($lang['stint_lap_count'], $rowCount); ?></small>
                                        </td>
                                    <?php endif; ?>
                                    <td class="text-center"><?php echo $lapNum; ?></td>
                                    <td class="text-center">
                                        <?php if($index === 0) echo htmlspecialchars($stintData['compounds']['front'] ?? 'N/A'); ?>
                                    </td>
                                    <td class="text-center <?php echo getWearColorClass($wear['fl']); ?>"><?php echo $wear['fl']; ?>%</td>
                                    <td class="text-center <?php echo getWearColorClass($wear['fr']); ?>"><?php echo $wear['fr']; ?>%</td>
                                    <td class="text-center <?php echo getWearColorClass($wear['rl']); ?>"><?php echo $wear['rl']; ?>%</td>
                                    <td class="text-center <?php echo getWearColorClass($wear['rr']); ?>"><?php echo $wear['rr']; ?>%</td>
                                </tr>
                            <?php 
                                endforeach; 
                            endforeach; 
                            ?>
                            </tbody>
                        </table>
                    </div>
                <?php endforeach; ?>
            </div>
            
            <?php
            $pilots_with_incidents = array_filter($incident_summary, function($summary) {
                return $summary['Total'] > 0;
            });
            ?>
			<div id="view-incidents-<?php echo $sessionType; ?>" class="view-content" style="display: none;">
                <h2 class="classification-title"><?php echo $lang['incidents_summary']; ?></h2>
                <?php if (empty($pilots_with_incidents)): ?>
					<p class="no-data-message"><?php echo $lang['no_incidents_session']; ?></p>
				<?php else: ?>
                    <table class="sortable-table">
						<thead>
							<tr>
								<th data-sortable="true" data-sort-type="number"><?php echo $lang['pos_header']; ?></th>
								<th data-sortable="true" data-sort-type="text"><?php echo $lang['driver_header']; ?></th>
								<th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['vehicle_contacts']; ?></th>
								<th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['other_contacts']; ?></th>
								<th class="text-center" data-sortable="true" data-sort-type="number"><?php echo $lang['overall_contacts']; ?></th>
							</tr>
						</thead>
						<tbody>
						<?php foreach ($pilots_with_incidents as $driverName => $summary): ?>
							<tr class="<?php echo ($driverName === PLAYER_NAME) ? 'player-row' : ''; ?>">
								<td class="text-center"><?php echo $summary['Position']; ?></td>
								<td><?php echo htmlspecialchars($driverName); ?></td>
								<td class="text-center"><?php echo $summary['Vehicle']; ?></td>
								<td class="text-center"><?php echo $summary['Other']; ?></td>
								<td class="text-center"><strong><?php echo $summary['Total']; ?></strong></td>
							</tr>
						<?php endforeach; ?>
						</tbody>
					</table>
				<?php endif; ?>

				<h2 class="classification-title" style="margin-top: 30px;"><?php echo $lang['incident_header']; ?></h2>
				<table>
					<thead><tr><th><?php echo $lang['incident_details']; ?></th></tr></thead>
					<tbody>
						<?php if(empty($incidents)): ?>
							<tr><td><?php echo $lang['no_incidents_session']; ?></td></tr>
						<?php else: ?>
							<?php foreach($incidents as $incident): ?>
							<tr class="<?php if(str_contains($incident, PLAYER_NAME)) echo 'player-row'; ?>">
								<td><?php echo htmlspecialchars($incident); ?></td>
							</tr>
							<?php endforeach; ?>
						<?php endif; ?>
					</tbody>
				</table>
			</div>
            
            <div id="view-penalties-<?php echo $sessionType; ?>" class="view-content" style="display: none;">
                <table>
                    <thead><tr><th><?php echo $lang['penalty_header']; ?></th></tr></thead>
                    <tbody>
                        <?php if(empty($penalties)): ?>
                        <tr><td><?php echo $lang['no_penalties_session']; ?></td></tr>
                        <?php else: ?>
                            <?php foreach($penalties as $penalty): ?>
                            <tr class="<?php if(str_contains($penalty, PLAYER_NAME)) echo 'player-row'; ?>">
                                <td><?php echo htmlspecialchars($penalty); ?></td>
                            </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>
            
            <div id="view-chat-<?php echo $sessionType; ?>" class="view-content" style="display: none;">
                <table>
                    <thead><tr><th><?php echo $lang['chat_header']; ?></th></tr></tbody>
                    <tbody>
                        <?php if(empty($chatLog)): ?>
                            <tr><td><?php echo $lang['no_chat_messages']; ?></td></tr>
                        <?php else: ?>
                            <?php foreach($chatLog as $logEntry): ?>
                            <tr class="<?php if(str_contains($logEntry, PLAYER_NAME)) echo 'player-row'; ?>">
                                <td><?php echo htmlspecialchars($logEntry); ?></td>
                            </tr>
                            <?php endforeach; ?>
                        <?php endif; ?>
                    </tbody>
                </table>
            </div>

            <div id="view-compare-<?php echo $sessionType; ?>" class="view-content" style="<?php if (!$is_comparison_view) echo 'display: none;'; ?>">
                <?php if ($sessionType === 'Practice1'): ?>
                    <p class="no-data-message"><?php echo $lang['compare_prompt_practice']; ?></p>
                <?php else: ?>
                    <?php
                    $sorted_drivers_for_compare = $drivers;
                    usort($sorted_drivers_for_compare, function($a, $b) {
                        return strcasecmp((string)$a->Name, (string)$b->Name);
                    });
                    ?>
                    <div class="driver-jump-menu">
                        <form action="race_details.php" method="get" class="compare-form">
                            <input type="hidden" name="session_id" value="<?php echo $session_id; ?>">
                            <input type="hidden" name="lang" value="<?php echo htmlspecialchars($current_lang); ?>">
                            <input type="hidden" name="session_view" value="<?php echo $current_session_view; ?>">
                            
                            <label for="driver1-select-<?php echo $sessionType; ?>"><?php echo $lang['compare_driver1'] ?? 'Driver 1'; ?></label>
                            <select id="driver1-select-<?php echo $sessionType; ?>" name="driver1">
                                <option value=""><?php echo $lang['compare_select_driver'] ?? 'Select a driver'; ?></option>
                                <?php 
                                $driver1_selected = $_GET['driver1'] ?? PLAYER_NAME;
                                foreach ($sorted_drivers_for_compare as $driver): ?>
                                    <option value="<?php echo htmlspecialchars((string)$driver->Name); ?>" <?php if ((string)$driver->Name === $driver1_selected) echo 'selected'; ?>>
                                        <?php echo htmlspecialchars((string)$driver->Name); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>

                            <label for="driver2-select-<?php echo $sessionType; ?>"><?php echo $lang['compare_driver2'] ?? 'Driver 2'; ?></label>
                            <select id="driver2-select-<?php echo $sessionType; ?>" name="driver2">
                                <option value=""><?php echo $lang['compare_select_driver'] ?? 'Select a driver'; ?></option>
                                <?php foreach ($sorted_drivers_for_compare as $driver): ?>
                                    <option value="<?php echo htmlspecialchars((string)$driver->Name); ?>" <?php if ((string)$driver->Name === ($_GET['driver2'] ?? '')) echo 'selected'; ?>>
                                        <?php echo htmlspecialchars((string)$driver->Name); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>

                            <label for="driver3-select-<?php echo $sessionType; ?>"><?php echo $lang['compare_driver3'] ?? 'Driver 3'; ?></label>
                            <select id="driver3-select-<?php echo $sessionType; ?>" name="driver3">
                                <option value=""><?php echo $lang['compare_select_driver'] ?? 'Select a driver'; ?></option>
                                <?php foreach ($sorted_drivers_for_compare as $driver): ?>
                                    <option value="<?php echo htmlspecialchars((string)$driver->Name); ?>" <?php if ((string)$driver->Name === ($_GET['driver3'] ?? '')) echo 'selected'; ?>>
                                        <?php echo htmlspecialchars((string)$driver->Name); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>

                            <label for="driver4-select-<?php echo $sessionType; ?>"><?php echo $lang['compare_driver4'] ?? 'Driver 4'; ?></label>
                            <select id="driver4-select-<?php echo $sessionType; ?>" name="driver4">
                                <option value=""><?php echo $lang['compare_select_driver'] ?? 'Select a driver'; ?></option>
                                <?php foreach ($sorted_drivers_for_compare as $driver): ?>
                                    <option value="<?php echo htmlspecialchars((string)$driver->Name); ?>" <?php if ((string)$driver->Name === ($_GET['driver4'] ?? '')) echo 'selected'; ?>>
                                        <?php echo htmlspecialchars((string)$driver->Name); ?>
                                    </option>
                                <?php endforeach; ?>
                            </select>

                            <button type="submit" class="btn btn-action"><?php echo $lang['compare_button'] ?? 'Compare'; ?></button>
                        </form>
                    </div>

                    <?php
                    $selected_drivers = [];
                    if (!empty($_GET['driver1'])) $selected_drivers[] = $_GET['driver1'];
                    if (!empty($_GET['driver2'])) $selected_drivers[] = $_GET['driver2'];
                    if (!empty($_GET['driver3'])) $selected_drivers[] = $_GET['driver3'];
                    if (!empty($_GET['driver4'])) $selected_drivers[] = $_GET['driver4'];
                    $selected_drivers = array_unique($selected_drivers);

                    if (count($selected_drivers) >= 2):
                        // Les statistiques sont maintenant pré-calculées dans process_session_data
                        $all_stats = [];
                        foreach ($selected_drivers as $driver_name) {
                            $driver_details = null;
                            foreach($drivers as $d) {
                                if((string)$d->Name === $driver_name) {
                                    $driver_details = $d;
                                    break;
                                }
                            }

                            $all_stats[$driver_name] = [
                                'finish_pos' => $driver_details ? (int)$driver_details->Position : null,
                                'start_pos' => $driver_details ? (int)$driver_details->GridPos : null,
                                'best_lap' => $bestLapsByDriver[$driver_name]['lap'] ?? INF,
                                'avg_best_5' => $statsByDriver[$driver_name]['avg_best_5'] ?? INF,
                                'median_lap' => $statsByDriver[$driver_name]['median_lap'] ?? INF,
                                'std_dev' => $statsByDriver[$driver_name]['std_dev'] ?? INF,
                                'best_s1' => $bestLapsByDriver[$driver_name]['s1'] ?? INF,
                                'best_s2' => $bestLapsByDriver[$driver_name]['s2'] ?? INF,
                                'best_s3' => $bestLapsByDriver[$driver_name]['s3'] ?? INF,
                                'vmax' => $vmaxByDriver[$driver_name] ?? 0,
                                'pitstops' => $driver_details ? (int)($driver_details->Pitstops ?? 0) : 0,
                                'incidents' => $incident_summary[$driver_name]['Total'] ?? 0,
                                'penalties' => $penalty_summary[$driver_name]['Count'] ?? 0,
                            ];
                        }

                        // Vérification des pilotes avec données insuffisantes
                        $invalid_drivers = [];
                        foreach($selected_drivers as $driver_name) {
                            if (!isset($all_stats[$driver_name]) || $all_stats[$driver_name]['best_lap'] === INF) {
                                $invalid_drivers[] = $driver_name;
                            }
                        }

                        if (!empty($invalid_drivers)) {
                            echo '<p class="no-data-message">' . ($lang['compare_insufficient_data'] ?? 'Données insuffisantes pour les pilotes suivants qui n\'ont pas de tour valide dans cette session :') . ' ' . htmlspecialchars(implode(', ', $invalid_drivers)) . '</p>';
                        }

                        // Filtrer les pilotes invalides avant de continuer
                        $selected_drivers = array_diff($selected_drivers, $invalid_drivers);

                        if (count($selected_drivers) < 2) {
                             echo '<p class="no-data-message">' . ($lang['compare_not_enough_drivers'] ?? 'Pas assez de pilotes avec des données valides pour une comparaison.') . '</p>';
                        } else {

                    $stat_mapping = [
                        'finish_pos' => $lang['compare_finish_pos'] ?? 'Finish Position',
                        'start_pos' => $lang['compare_start_pos'] ?? 'Start Position',
                        'best_lap' => $lang['compare_best_lap'] ?? 'Best Lap',
                        'avg_best_5' => $lang['compare_avg_best_5'] ?? 'Avg Best 5 Laps',
                        'median_lap' => $lang['compare_median_lap'] ?? 'Median Lap Time',
                        'std_dev' => $lang['compare_std_dev'] ?? 'Standard Deviation',
                        'best_s1' => $lang['compare_best_s1'] ?? 'Best Sector 1',
                        'best_s2' => $lang['compare_best_s2'] ?? 'Best Sector 2',
                        'best_s3' => $lang['compare_best_s3'] ?? 'Best Sector 3',
                        'vmax' => $lang['compare_vmax'] ?? 'Max Speed',
                        'pitstops' => $lang['compare_pitstops'] ?? 'Pit Stops',
                        'incidents' => $lang['compare_incidents'] ?? 'Incidents',
                        'penalties' => $lang['compare_penalties'] ?? 'Penalties',
                    ];

                    // Pré-calculer les valeurs et trouver les meilleures
                    $best_values = [];
                    $stats_lower_is_better = ['best_lap', 'best_s1', 'best_s2', 'best_s3', 'avg_lap', 'finish_pos', 'start_pos'];

                    foreach (array_keys($stat_mapping) as $key) {
                        if (!in_array($key, $stats_lower_is_better)) continue;
                        
                        $best_values[$key] = INF;
                        foreach ($selected_drivers as $driver_name) {
                            $current_val = $all_stats[$driver_name][$key] ?? INF;
                            if ($current_val < $best_values[$key]) {
                                $best_values[$key] = $current_val;
                            }
                        }
                    }
                ?>
                    <div class="table-wrapper">
                        <h2 class="table-title-heading"><?php echo $lang['comparison_title_multi'] ?? 'Driver Comparison'; ?></h2>
                        <div class="chart-container" style="margin-bottom: 20px;">
                            <canvas id="positionChart-<?php echo $sessionType; ?>" data-max-laps="<?php echo $maxLaps; ?>"></canvas>
                        </div>
                        <table id="comparison-table">
                            <thead>
                                <tr>
                                    <th><?php echo $lang['stat_header'] ?? 'Statistic'; ?></th>
                                    <?php
                                    $colors = $current_theme === 'dark'
                                        ? ['#5c9ce6', '#48c774', '#e57373', '#ffd700']
                                        : ['#0056b3', '#28a745', '#dc3545', '#ffc107'];
                                    $driver_index = 0;
                                    foreach ($selected_drivers as $driver_name):
                                        $color = $colors[$driver_index % count($colors)];
                                    ?>
                                        <th style="color: <?php echo $color; ?>;"><?php echo htmlspecialchars($driver_name); ?></th>
                                    <?php
                                        $driver_index++;
                                    endforeach;
                                    ?>
                                </tr>
                            </thead>
                            <tbody>
                                <?php
                                foreach ($stat_mapping as $key => $label):
                                ?>
                                    <tr>
                                        <td><?php echo $label; ?></td>
                                        <?php foreach ($selected_drivers as $driver_name): 
                                            $stats = $all_stats[$driver_name];
                                            $cell_class = '';
                                            $cell_content = '';
                                            $stats = $all_stats[$driver_name];
                                            $cell_class = '';
                                            $cell_content = '';

                                            switch ($key) {
                                                case 'best_lap':
                                                    $lapTime = $stats[$key];
                                                    $cell_content = formatSecondsToMmSsMs($lapTime);
                                                    if ($lapTime !== INF && abs($lapTime - $bestLapTimeOverall) < 0.0001) {
                                                        $cell_class .= ' is-overall-best';
                                                        $cell_content = '🏆 ' . $cell_content;
                                                    }
                                                    break;
                                                case 'best_s1':
                                                case 'best_s2':
                                                case 'best_s3':
                                                    $sectorTime = $stats[$key];
                                                    $bestOverall = ($key === 'best_s1') ? $bestS1Overall : (($key === 'best_s2') ? $bestS2Overall : $bestS3Overall);
                                                    $cell_content = formatSecondsToMmSsMs($sectorTime, false);
                                                    if ($sectorTime !== INF) {
                                                        $cell_content .= 's';
                                                        if (abs($sectorTime - $bestOverall) < 0.0001) {
                                                            $cell_class .= ' is-overall-best';
                                                            $cell_content = '🏆 ' . $cell_content;
                                                        }
                                                    }
                                                    break;
                                                case 'avg_lap':
                                                case 'median_lap':
                                                case 'avg_best_5':
                                                    $cell_content = formatSecondsToMmSsMs($stats[$key]);
                                                    break;
                                                case 'std_dev':
                                                    $cell_content = ($stats[$key] !== INF) ? number_format($stats[$key], 3) . 's' : 'N/A';
                                                    break;
                                                case 'vmax':
                                                    $cell_content = round($stats[$key]) . ' km/h';
                                                    break;
                                                case 'avg_fuel':
                                                    $cell_content = count($stats['fuel']) > 0 ? round(array_sum($stats['fuel']) / count($stats['fuel']), 2) . '%' : 'N/A';
                                                    break;
                                                case 'tires':
                                                    $cell_content = implode(', ', array_unique($stats['tires']));
                                                    break;
                                                case 'positions':
                                                    $cell_content = implode(', ', $stats['positions']);
                                                    break;
                                                case 'start_pos':
                                                case 'finish_pos':
                                                case 'pitstops':
                                                case 'incidents':
                                                case 'penalties':
                                                    $cell_content = $stats[$key] ?? 'N/A';
                                                    break;
                                                default:
                                                    $cell_content = $stats[$key] === INF ? 'N/A' : $stats[$key];
                                            }

                                            $current_val = $stats[$key] ?? INF;
                                            if (isset($best_values[$key]) && abs($current_val - $best_values[$key]) < 0.0001) {
                                                $cell_class .= ' is-best-in-row';
                                            }
                                        ?>
                                            <td class="text-center <?php echo trim($cell_class); ?>"><?php echo $cell_content; ?></td>
                                        <?php endforeach; ?>
                                    </tr>
                                <?php endforeach; ?>
                            </tbody>
                        </table>
                    </div>
                <?php 
                    } // Fin du else pour if (count($selected_drivers) < 2)
                else: ?>
                    <p class="no-data-message"><?php echo $lang['compare_prompt'] ?? 'Select the drivers you want to compare'; ?></p>
                <?php endif; ?>
                <?php endif; ?>
            </div>

        </div>
        <?php require 'includes/footer.php'; ?>

        <div id="lapChartModal" class="modal">
            <div class="modal-content">
                <div class="modal-header">
                    <h2 id="chartTitle"></h2><span id="chartBestLap"></span>
                    <span class="close-button">×</span>
                </div>
                <canvas id="lapChart"></canvas>
            </div>
        </div>

    <script>
    // Enregistrement du plugin Chart.js Datalabels pour afficher les étiquettes de données
    Chart.register(ChartDataLabels);

    const translations = <?php
        $js_translations = [
            'js_optimal_lap' => $lang['js_optimal_lap'] ?? 'Tour Optimal',
            'js_overall_best_lap' => $lang['js_overall_best_lap'] ?? 'Meilleur Tour (Session)',
        ];
        foreach($lang as $key => $value) {
            if(str_starts_with($key, 'js_')) {
                $js_translations[$key] = $value;
            }
        }
        echo json_encode(array_merge($lang, $js_translations));
    ?>;
    const allLapsData = <?php echo json_encode($allLapsForChart); ?>;
    const allLapsDetails = <?php echo json_encode($lapsByDriver); ?>;
    const allStatsDataForChart = <?php
        // Recréer les données pour le graphique de position, car la nouvelle méthode ne les remplit pas
        $chart_data = [];
        // On utilise la variable $selected_drivers qui a été filtrée en PHP
        if (isset($selected_drivers) && count($selected_drivers) >= 2) {
            foreach($selected_drivers as $driver_name) {
                $positions = [];
                if(isset($lapsByDriver[$driver_name])) {
                    foreach($lapsByDriver[$driver_name] as $lap) {
                        if(isset($lap['p'])) {
                            $positions[] = (int)$lap['p'];
                        }
                    }
                }
                $chart_data[$driver_name]['positions'] = $positions;
            }
        }
        echo json_encode($chart_data);
    ?>;
    const finalSelectedDrivers = <?php echo json_encode(array_values($selected_drivers ?? [])); ?>;
    const trackVenue = <?php echo json_encode($trackVenue); ?>;
    const localeForDate = '<?php echo str_replace('_', '-', $current_lang); ?>';
    const playerName = <?php echo json_encode(PLAYER_NAME); ?>;

    let positionCharts = {};
    function renderPositionChart(sessionType, selectedDrivers) {
        if (Object.keys(allStatsDataForChart).length === 0) return;

        const chartElement = document.getElementById('positionChart-' + sessionType);
        if (!chartElement) return;
        
        const isDarkTheme = document.documentElement.dataset.theme === 'dark';
        const gridColor = isDarkTheme ? '#555' : '#ddd';
        const textColor = isDarkTheme ? '#e0e0e0' : '#333';

        const ctx = chartElement.getContext('2d');
        const maxLaps = parseInt(chartElement.dataset.maxLaps, 10) || 0;

        if (positionCharts[chartElement.id]) {
            positionCharts[chartElement.id].destroy();
        }

        const datasets = [];
        const colors = ['#0056b3', '#28a745', '#dc3545', '#ffc107'];

        selectedDrivers.forEach((driverName, index) => {
            if (allStatsDataForChart[driverName] && allStatsDataForChart[driverName].positions) {
                datasets.push({
                    label: driverName,
                    data: allStatsDataForChart[driverName].positions,
                    borderColor: colors[index % colors.length],
                    borderWidth: 2,
                    fill: false,
                    tension: 0.1
                });
            }
        });

        const labels = Array.from({ length: maxLaps }, (_, i) => `${translations.lap_header || 'Lap'} ${i + 1}`);

        positionCharts[chartElement.id] = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: datasets
            },
            options: {
                responsive: true,
                plugins: {
                    title: {
                        display: true,
                        text: '<?php echo $lang['position_evolution_chart_title'] ?? 'Position Evolution'; ?>',
                        padding: {
                            bottom: 20
                        },
                        color: textColor
                    },
                    legend: {
                        position: 'top',
                        labels: {
                            color: textColor
                        }
                    },
                    tooltip: {
                        callbacks: {
                            footer: function(tooltipItems) {
                                let footerText = [];
                                tooltipItems.forEach(function(tooltipItem) {
                                    const datasetLabel = tooltipItem.dataset.label;
                                    const dataIndex = tooltipItem.dataIndex;
                                    
                                    if (allLapsDetails[datasetLabel] && allLapsDetails[datasetLabel][dataIndex]) {
                                        const lapData = allLapsDetails[datasetLabel][dataIndex];
                                        const lapTimeString = lapData[0] || '0';
                                        const lapTime = /^-?\d+(\.\d+)?$/.test(lapTimeString) ? parseFloat(lapTimeString) : 0;
                                        const attributes = lapData['@attributes'] || {};
                                        const s1 = parseFloat(attributes.s1 || 0);
                                        const s2 = parseFloat(attributes.s2 || 0);
                                        const s3 = parseFloat(attributes.s3 || 0);

                                        if (lapTime > 0) {
                                            footerText.push('');
                                            footerText.push(`Lap ${dataIndex + 1}: ${formatSecondsToMmSsMs(lapTime)}`);
                                            footerText.push(` S1: ${formatSecondsToMmSsMs(s1, false)}s`);
                                            footerText.push(` S2: ${formatSecondsToMmSsMs(s2, false)}s`);
                                            footerText.push(` S3: ${formatSecondsToMmSsMs(s3, false)}s`);
                                        }
                                    }
                                });
                                return footerText;
                            }
                        }
                    },
                    datalabels: {
                        align: 'top',
                        backgroundColor: function(context) {
                            return context.dataset.borderColor;
                        },
                        borderRadius: 4,
                        color: 'white',
                        font: {
                            weight: 'bold'
                        },
                        formatter: function(value, context) {
                            return value;
                        }
                    }
                },
                scales: {
                    y: {
                        title: {
                            display: true,
                            text: '<?php echo $lang['position_chart_y_axis'] ?? 'Position'; ?>',
                            color: textColor
                        },
                        grid: {
                            color: gridColor
                        },
                        reverse: true, // Position 1 en haut
                        beginAtZero: false,
                        ticks: {
                            stepSize: 1,
                            color: textColor
                        }
                    },
                    x: {
                         title: {
                            display: true,
                            text: '<?php echo $lang['lap_header'] ?? 'Lap'; ?>',
                            color: textColor
                        },
                        grid: {
                            color: gridColor
                        },
                        ticks: {
                            color: textColor
                        }
                    }
                }
            }
        });
    }

    function getCellValue(th, cell) {
        if (!cell) return null;

        const sortType = th.dataset.sortType || 'text';
        let text = cell.textContent.trim();
        
        if (text === 'N/A' || text === '') return null;

        if (text === '🥇') return 1;
        if (text === '🥈') return 2;
        if (text === '🥉') return 3;

        if (sortType === 'number') {
            if (text.includes(':')) {
                const timeMatch = text.match(/(\d+:)?\d{2}\.\d{3}/);
                if (timeMatch) {
                    const timeStr = timeMatch[0];
                    const parts = timeStr.split(':');
                    if (parts.length > 1) {
                        const secondsParts = parts[1].split('.');
                        return (parseInt(parts[0], 10) * 60) + parseInt(secondsParts[0], 10) + (secondsParts[1] ? parseFloat('0.' + secondsParts[1]) : 0);
                    } else {
                        return parseFloat(timeStr);
                    }
                }
            }
            const numMatch = text.match(/-?[\d.]+/);
            if (numMatch) {
                return parseFloat(numMatch[0]);
            }
            return null;
        }
        
        return text;
    }

    function sortTableByColumn(table, column, asc = true, priorityCar = null) {
        const dirModifier = asc ? 1 : -1;
        const tBody = table.tBodies[0];
        const rows = Array.from(tBody.querySelectorAll("tr"));
        const header = table.tHead.rows[0].cells[column];

        rows.sort((a, b) => {
            const carNameA = a.cells[column].textContent.trim();
            const carNameB = b.cells[column].textContent.trim();
            const brandA = carNameA.split(' ')[0];
            const brandB = carNameB.split(' ')[0];
            const posHeader = table.tHead.rows[0].cells[0];
            const posA = getCellValue(posHeader, a.cells[0]);
            const posB = getCellValue(posHeader, b.cells[0]);

            // Priority sorting logic when a cell is clicked
            if (column === 4 && priorityCar) {
                const priorityBrand = priorityCar.split(' ')[0];

                const isACarPriority = carNameA === priorityCar;
                const isBCarPriority = carNameB === priorityCar;
                const isABrandPriority = brandA === priorityBrand;
                const isBBrandPriority = brandB === priorityBrand;

                // 1. Exact car model match
                if (isACarPriority && !isBCarPriority) return -1;
                if (!isACarPriority && isBCarPriority) return 1;
                if (isACarPriority && isBCarPriority) return posA - posB;

                // 2. Same brand match
                if (isABrandPriority && !isBBrandPriority) return -1;
                if (!isABrandPriority && isBBrandPriority) return 1;
                if (isABrandPriority && isBBrandPriority) {
                    // if same brand, sort by position
                    return posA - posB;
                }

                // 3. Other brands, sort alphabetically
                const brandCompare = brandA.localeCompare(brandB);
                if (brandCompare !== 0) return brandCompare;
                
                // if somehow same brand but not caught above, sort by position
                return posA - posB;
            }

            // Generic sorting for header clicks
            const aVal = getCellValue(header, a.cells[column]);
            const bVal = getCellValue(header, b.cells[column]);

            const aIsNull = aVal === null;
            const bIsNull = bVal === null;

            if (aIsNull && bIsNull) return 0;
            if (aIsNull) return 1;
            if (bIsNull) return -1;

            if (typeof aVal === 'number' && typeof bVal === 'number') {
                return (aVal - bVal) * dirModifier;
            }

            return aVal.toString().localeCompare(bVal.toString(), undefined, { numeric: true, sensitivity: 'base' }) * dirModifier;
        });

        while (tBody.firstChild) {
            tBody.removeChild(tBody.firstChild);
        }

        tBody.append(...rows);

        table.querySelectorAll("th").forEach(th => {
            th.classList.remove("sort-asc", "sort-desc");
        });
        header.classList.toggle("sort-asc", asc);
        header.classList.toggle("sort-desc", !asc);
    }

    document.addEventListener('DOMContentLoaded', function() {
        // Activer le graphique si nous sommes en vue de comparaison
        if (finalSelectedDrivers.length >= 2) {
            const urlParams = new URLSearchParams(window.location.search);
            const sessionView = urlParams.get('session_view') || '<?php echo $default_session_view; ?>';
            renderPositionChart(sessionView, finalSelectedDrivers);
        }

        // Sortable tables
        document.querySelectorAll('.sortable-table th[data-sortable="true"]').forEach(headerCell => {
            headerCell.addEventListener("click", () => {
                const tableElement = headerCell.closest("table");
                const headerIndex = Array.prototype.indexOf.call(headerCell.parentElement.children, headerCell);
                const currentIsAsc = headerCell.classList.contains("sort-asc");
                sortTableByColumn(tableElement, headerIndex, !currentIsAsc);
            });
        });

        // Update titles on session change
        const initialSelect = document.querySelector('.session-selector');
        if(initialSelect) {
            updateTitles(initialSelect.options[initialSelect.selectedIndex]);
        }
        
        // Tab functionality
        document.querySelectorAll('.session-view-container').forEach(container => {
            const tabs = container.querySelectorAll('.view-tab');
            const contents = container.querySelectorAll('.view-content');

            tabs.forEach(tab => {
                tab.addEventListener('click', function(event) {
                    event.preventDefault();
                    tabs.forEach(t => t.classList.remove('active'));
                    this.classList.add('active');
                    const view = this.getAttribute('data-view');
                    const sessionType = container.id.replace('session-', '');
                    contents.forEach(content => { content.style.display = 'none'; });
                    container.querySelector('#view-' + view + '-' + sessionType).style.display = 'block';
                });
            });
        });

        // Lap chart modal
        let lapChart = null;
        const modal = document.getElementById('lapChartModal');
        const closeButton = modal.querySelector('.close-button');
        closeButton.onclick = () => { modal.style.display = 'none'; };
        window.onclick = (event) => { if (event.target == modal) { modal.style.display = 'none'; } };

        document.querySelectorAll('.clickable-cell').forEach(cell => {
            cell.addEventListener('click', function() {
                const driverName = this.dataset.driverName;
                const track = this.dataset.track;
                const bestLapText = this.dataset.bestLapText;
                const optimalLap = parseFloat(this.dataset.optimalLap);
                const overallBestLap = parseFloat(this.dataset.overallBestLap);
                const lapData = allLapsData[driverName];
                
                if (lapData && lapData.filter(lap => lap !== null).length > 1) {
                    document.getElementById('chartTitle').innerText = `${translations.js_laps_chart_title} - ${driverName}`;
                    document.getElementById('chartBestLap').innerText = `(${translations.js_laps_chart_best_lap}: ${bestLapText})`;
                    
                    const validLaps = lapData.filter(lap => lap !== null);
                    const minLapTimeInSession = Math.min(...validLaps);
                    const maxLapTimeInSession = Math.max(...validLaps);
                    const labels = lapData.map((_, i) => `${translations.js_laps_chart_lap} ${i + 1}`);
                    
                    if (lapChart) { lapChart.destroy(); }

                    const ctx = document.getElementById('lapChart').getContext('2d');
                    
                    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
                    gradient.addColorStop(0, 'rgba(0, 86, 179, 0.5)');
                    gradient.addColorStop(1, 'rgba(0, 86, 179, 0)');

                    const datasets = [{
                        label: translations.js_laps_chart_label,
                        data: lapData,
                        fill: true,
                        backgroundColor: gradient,
                        borderColor: 'rgba(0, 86, 179, 1)',
                        borderWidth: 2,
                        pointBackgroundColor: lapData.map(lap => lap === minLapTimeInSession ? '#28a745' : 'rgba(0, 86, 179, 0.9)'),
                        pointRadius: lapData.map(lap => lap === minLapTimeInSession ? 7 : 4),
                        pointHoverRadius: 8,
                        tension: 0.1,
                        spanGaps: true
                    }];

                    if (optimalLap > 0 && optimalLap < Infinity) {
                        datasets.push({
                            type: 'line',
                            label: translations.js_optimal_lap,
                            data: Array(lapData.length).fill(optimalLap),
                            borderColor: '#ffc107',
                            borderWidth: 2,
                            borderDash: [5, 5],
                            pointRadius: 0,
                            fill: false
                        });
                    }

                    if (overallBestLap > 0 && overallBestLap < Infinity) {
                         datasets.push({
                            type: 'line',
                            label: translations.js_overall_best_lap,
                            data: Array(lapData.length).fill(overallBestLap),
                            borderColor: '#dc3545',
                            borderWidth: 2,
                            borderDash: [10, 5],
                            pointRadius: 0,
                            fill: false
                        });
                    }
                    
                    const yMin = Math.min(minLapTimeInSession, optimalLap > 0 ? optimalLap : Infinity, overallBestLap > 0 ? overallBestLap : Infinity);

                    lapChart = new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: labels,
                            datasets: datasets
                        },
                        options: {
                            interaction: {
                                intersect: false,
                                mode: 'index',
                            },
                            scales: { 
                                y: { 
                                    min: Math.floor(yMin) - 1,
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
                                            if (context.datasetIndex === 0) {
                                                const delta = value - minLapTimeInSession;
                                                const sign = delta >= 0 ? '+' : '';
                                                if (Math.abs(delta) > 0.001) {
                                                    label += ` (${sign}${delta.toFixed(3)}s)`;
                                                }
                                            }
                                            return label;
                                        }
                                    } 
                                },
                                legend: {
                                    labels: {
                                        usePointStyle: true,
                                    }
                                },
                                datalabels: {
                                    display: false
                                }
                            }
                        }
                    });
                    modal.style.display = 'block';
                } else {
                     alert(translations.js_no_lap_data);
                }
            });
        });

        document.querySelectorAll('.clickable-sort').forEach(cell => {
            cell.addEventListener('click', function() {
                const tableElement = this.closest("table");
                const headerIndex = parseInt(this.dataset.sortColumnIndex, 10);
                const headerCell = tableElement.querySelector(`thead th:nth-child(${headerIndex + 1})`);
                
                if (headerCell && headerCell.dataset.sortable === 'true') {
                    const carName = this.querySelector('span:last-child').textContent.trim();
                    sortTableByColumn(tableElement, headerIndex, true, carName);
                }
            });
        });
    });

    function scrollToClassTable(className) {
        const anchorId = 'table-' + className.toLowerCase();
        const targetElement = document.getElementById(anchorId);
        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }

	function updateTitles(selectedOption) {
		const translatedName = selectedOption.dataset.translatedName;
		const mainTitle = document.getElementById('main-title');
		const activeContainer = document.getElementById('session-' + selectedOption.value);
		
		if (mainTitle && activeContainer) {
			const headerDateRow = activeContainer.querySelector('tr[data-timestamp]');
			if (headerDateRow) {
				const timestamp = parseInt(headerDateRow.dataset.timestamp, 10) * 1000;
				const date = new Date(timestamp);
				const options = { year: 'numeric', month: 'long', day: 'numeric' };
				
				let formattedDate = date.toLocaleDateString();
				try {
					 formattedDate = date.toLocaleDateString(localeForDate.replace('_', '-'), options);
				} catch(e) { /* Gérer l'erreur si Intl n'est pas disponible */ }

				mainTitle.innerHTML = `${trackVenue} - ${translatedName} <span class="header-date">${formattedDate}</span>`;
			} else {
				 mainTitle.innerHTML = `${trackVenue} - ${translatedName}`;
			}
		}

		const titleKey = selectedOption.dataset.titleKey;
		if (translations[titleKey]) {
			document.title = translations[titleKey] + ' - ' + trackVenue;
		}
	}

    function switchSessionView(selectElement) {
        const selectedSession = selectElement.value;
        const urlParams = new URLSearchParams(window.location.search);
        urlParams.set('session_view', selectedSession);
        
        // Supprimer les pilotes de comparaison lors du changement de session
        urlParams.delete('driver1');
        urlParams.delete('driver2');
        urlParams.delete('driver3');
        urlParams.delete('driver4');
        
        window.location.search = urlParams.toString();
    }

    function scrollToDriver(selectElement, sessionType, prefix) {
        const anchorId = selectElement.value;
        if (anchorId) {
            const targetElement = document.getElementById(anchorId + '-' + sessionType);
            if (targetElement) {
                targetElement.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        }
    }
    
    function scrollToPlayer(event, sessionType, prefix) {
        event.preventDefault();
        const cleanPlayerName = playerName.replace(/ /g, '-').replace(/[^a-zA-Z0-9\-]/g, '');
        const anchorId = prefix + '-driver-' + cleanPlayerName;
        const targetElement = document.getElementById(anchorId + '-' + sessionType);
        if (targetElement) {
            targetElement.scrollIntoView({
                behavior: 'smooth',
                block: 'start'
            });
        }
    }
    </script>
    <button onclick="topFunction()" id="back-to-top-btn" title="Go to top">↑</button>
    <script>
        var mybutton = document.getElementById("back-to-top-btn");
        window.onscroll = function() {scrollFunction()};
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
    </script>
</body>
</html>
