<?php
require_once 'includes/init.php';

// Premier lancement : redirection vers la config si le dossier de résultats n'est pas défini
if (empty($config['results_dir'])) {
    header('Location: config.php?first_launch=1');
    exit;
}

// --- FONCTIONS UTILITAIRES (désormais dans includes/functions.php) ---

// --- GESTION DU CACHE ---
$appDataPath = getenv('APPDATA');
if ($appDataPath) {
    $cacheDir = $appDataPath . DIRECTORY_SEPARATOR . 'LMU_Stats_Viewer';
    if (!is_dir($cacheDir)) {
        @mkdir($cacheDir, 0777, true);
    }
    define('CACHE_FILE', $cacheDir . DIRECTORY_SEPARATOR . 'lm_ultimate_cache.json');
} else {
    define('CACHE_FILE', __DIR__ . '/lm_ultimate_cache.json');
}

$results = [];
$stats = [];
$cacheUsedSuccessfully = false;

// --- GESTION DU CACHE (AMÉLIORÉE) ---
$cache_key = '';
if (defined('RESULTS_DIR') && is_dir(RESULTS_DIR)) {
    $files = glob(RESULTS_DIR . '*.xml');
    if ($files) {
        $file_info = '';
        foreach ($files as $file) {
            $file_info .= $file . filemtime($file);
        }
        $cache_key = md5($file_info);
    }
}

if (defined('CACHE_FILE') && file_exists(CACHE_FILE)) {
    $cachedJson = @file_get_contents(CACHE_FILE);
    if ($cachedJson) {
        $cachedData = json_decode($cachedJson, true);
        if (is_array($cachedData) && isset($cachedData['cache_key']) && $cachedData['cache_key'] === $cache_key && isset($cachedData['results']) && isset($cachedData['stats'])) {
            $results = $cachedData['results'];
            $stats = $cachedData['stats'];
            $cacheUsedSuccessfully = true;
        }
    }
}

$events = get_race_events();

// --- NOUVEAU : Pré-scan pour les options de filtre ---
$allAvailableClasses = [];
$allAvailableCars = [];
$allAvailableTracks = [];
$allAvailableSessionTypes = [];
$allAvailableSettings = [];
$allAvailableVersions = [];
$trackLayoutsMap = []; // Rebuild this here

foreach ($events as $event_files) {
    foreach ($event_files as $file_data) {
        $xml = $file_data['xml'];
        $trackVenue = trim((string)$xml->RaceResults->TrackVenue);
        $trackCourse = trim((string)$xml->RaceResults->TrackCourse);
        $setting = trim((string)$xml->RaceResults->Setting);
        
        $rawVersion = (string)($xml->RaceResults->GameVersion ?? '0.0');
        $parts = explode('.', $rawVersion);
        if (count($parts) > 1) {
            $major = array_shift($parts);
            $minor_parts = implode('', $parts);
            $formatted_minor = str_pad(substr($minor_parts, 0, 4), 4, '0', STR_PAD_RIGHT);
            $gameVersion = $major . '.' . $formatted_minor;
        } else {
            $gameVersion = $rawVersion . '.0000';
        }

        if ($gameVersion !== '0.0') {
            $allAvailableVersions[$gameVersion] = true;
        }

        if (!empty($trackVenue)) $allAvailableTracks[$trackVenue] = true;
        if (!empty($setting)) $allAvailableSettings[$setting] = true;

        // Build trackLayoutsMap
        if ($trackVenue !== $trackCourse && !empty($trackCourse)) {
            if (!isset($trackLayoutsMap[$trackVenue])) {
                $trackLayoutsMap[$trackVenue] = [];
            }
            if (!in_array($trackCourse, $trackLayoutsMap[$trackVenue])) {
                $trackLayoutsMap[$trackVenue][] = $trackCourse;
            }
        }

        foreach (['Practice1', 'Qualify', 'Race'] as $section) {
            if (isset($xml->RaceResults->{$section})) {
                $allAvailableSessionTypes[$section] = true;
                foreach ($xml->RaceResults->{$section}->Driver as $driverElem) {
                        $carClass = trim((string)$driverElem->CarClass);
                        if (strcasecmp($carClass, 'Hyper') == 0) {
                            $carClass = 'Hyper';
                        }
                        if (str_replace('_', ' ', $carClass) === 'LMP2 ELMS' || strcasecmp($carClass, 'LMP2 Elms') == 0) {
                            $carClass = 'LMP2 ELMS';
                        }
                    if (!empty($carClass)) $allAvailableClasses[$carClass] = true;
                    
                    $carType = trim((string)$driverElem->CarType);
                    if (!empty($carType) && trim((string)$driverElem->Name) === PLAYER_NAME) {
                        $allAvailableCars[$carType] = true;
                    }
                }
            }
        }
    }
}
foreach ($trackLayoutsMap as &$courses) {
    sort($courses);
}
unset($courses);

$uniqueVersionsForFilter = array_keys($allAvailableVersions);
if (!empty($uniqueVersionsForFilter)) {
    usort($uniqueVersionsForFilter, 'version_compare');
    $uniqueVersionsForFilter = array_reverse($uniqueVersionsForFilter);
}
// --- FIN DU NOUVEAU BLOC ---

if (!$cacheUsedSuccessfully) {
    $allLapsData = [];
    $rawStats = ['totalLaps' => 0, 'totalDrivingTime' => 0, 'lapsPerTrack' => [], 'lapsPerCar' => [], 'bestFinish' => 99, 'raceResults' => [], 'allSessionsLaps' => [], 'bestProgression' => -99];

    foreach ($events as $event_files) {
        $eventSessionID = $event_files[0]['timestamp'];

        foreach ($event_files as $file_data) {
            $xml = $file_data['xml'];
            $filename = $file_data['filename'];
            
            $settings = $xml->RaceResults;
            $sessionSetting = trim((string)$settings->Setting);
            $trackVenue = trim((string)$settings->TrackVenue);
            $trackCourse = trim((string)$settings->TrackCourse);
            
            $rawVersion = (string)($settings->GameVersion ?? '0.0');
            $parts = explode('.', $rawVersion);
            if (count($parts) > 1) {
                $major = array_shift($parts);
                $minor_parts = implode('', $parts);
                $formatted_minor = str_pad(substr($minor_parts, 0, 4), 4, '0', STR_PAD_RIGHT);
                $gameVersion = $major . '.' . $formatted_minor;
            } else {
                $gameVersion = $rawVersion . '.0000';
            }

            foreach (['Practice1', 'Qualify', 'Race'] as $section) {
                if (isset($settings->{$section})) {
                    $sessionData = $settings->{$section};
                    $sessionType = $section;

                    foreach ($sessionData->Driver as $driverElem) {
                        if (trim((string)$driverElem->Name) === PLAYER_NAME) {
                            $carType = trim((string)$driverElem->CarType);
                            $carClass = trim((string)$driverElem->CarClass);
                            if (strcasecmp($carClass, 'Hyper') == 0) {
                                $carClass = 'Hyper';
                            }
                            if (str_replace('_', ' ', $carClass) === 'LMP2 ELMS' || strcasecmp($carClass, 'LMP2 Elms') == 0) {
                                $carClass = 'LMP2 ELMS';
                            }
                            $carCategory = trim((string)$driverElem->Category);

                            $uniqueCarName = $carType;
                            if (str_contains($carType, 'Peugeot 9x8')) {
                                if (preg_match('/WEC (\d{4})/', $carCategory, $matches)) {
                                    $year = $matches[1];
                                    $displayYear = ($year === '2024' || $year === '2025') ? '2024/25' : $year;
                                    $uniqueCarName = $carType . " ($displayYear)";
                                }
                            }
                            
                            $finishPos = (int)($driverElem->ClassPosition ?? 0);
                            $fastestLapTime = INF;
                            $currentSessionLaps = [];
                            $sessionTimestampForLaps = (int)$settings->DateTime;

                            $status = (string)($driverElem->FinishStatus ?? 'N/A');
                            $position = (int)($driverElem->ClassPosition ?? 0);
                            $gridPos = (int)($driverElem->ClassGridPos ?? 0);
                            $progression = null;

                            if ($sessionType === 'Race' && $gridPos > 0 && $status === 'Finished Normally') {
                                $progression = $gridPos - $position;
                                if ($progression > $rawStats['bestProgression']) $rawStats['bestProgression'] = $progression;
                            }
                            if ($sessionType === 'Race' && $sessionSetting === 'Multiplayer' && $status === 'Finished Normally') {
                                if ($position < $rawStats['bestFinish']) $rawStats['bestFinish'] = $position;
                            }

if (isset($driverElem->Lap)) {
    foreach ($driverElem->Lap as $lapElem) {
        $lapTime = (float)$lapElem[0];
        $s1 = (float)($lapElem['s1'] ?? 0); $s2 = (float)($lapElem['s2'] ?? 0); $s3 = (float)($lapElem['s3'] ?? 0);
        $topspeed = (float)($lapElem['topspeed'] ?? 0);

        // On ajoute le tour au pool de données si au moins une information (temps total ou un secteur) est valide
        if ($lapTime > 0 || $s1 > 0 || $s2 > 0 || $s3 > 0) {
            $key = "$trackVenue|$trackCourse|$carClass|$uniqueCarName";
            $allLapsData[$key][] = [
                'lap' => $lapTime, 's1' => $s1, 's2' => $s2, 's3' => $s3, 'topspeed' => $topspeed, 
                'date' => $sessionTimestampForLaps, 'carName' => trim((string)$driverElem->VehName), 
                'sessionType' => $sessionType, 'finishPos' => $finishPos, 'filename' => $filename, 
                'Setting' => $sessionSetting, 'progression' => $progression, 
                'session_id_event' => $eventSessionID, 'GameVersion' => $gameVersion,
                'status' => $status
            ];
        }

        // Pour les statistiques générales (temps de conduite, etc.), on ne compte que les tours 100% valides.
        if ($lapTime > 0 && $s1 > 0 && $s2 > 0 && $s3 > 0) {
            $rawStats['totalLaps']++;
            $rawStats['totalDrivingTime'] += $lapTime;
            $rawStats['lapsPerTrack'][$trackVenue] = ($rawStats['lapsPerTrack'][$trackVenue] ?? 0) + 1;
            $rawStats['lapsPerCar'][$uniqueCarName] = ($rawStats['lapsPerCar'][$uniqueCarName] ?? 0) + 1;
            $fastestLapTime = min($fastestLapTime, $lapTime);
            $currentSessionLaps[] = $lapTime;
        }
    }
}

                          if (!empty($currentSessionLaps)) {
                                $rawStats['allSessionsLaps'][$sessionTimestampForLaps] = $currentSessionLaps;
                            }
                            
                            $rawStats['raceResults'][] = [
                                'Filename' => $filename, 'SessionID' => $eventSessionID, 'SessionType' => $sessionType,
                                'Date' => $sessionTimestampForLaps, 'Track' => $trackVenue, 'TrackCourse' => $trackCourse, 'Car' => $uniqueCarName,
                                'Livery' => trim((string)$driverElem->VehName), 'Class' => $carClass,
                                'GridPos' => $gridPos, 'Position' => $position, 'Progression' => $progression,
                                'Participants' => count($sessionData->Driver), 'Pitstops' => (int)($driverElem->Pitstops ?? 0),
                                'Status' => $status, 'BestLap' => ($fastestLapTime === INF ? null : $fastestLapTime),
                                'Setting' => $sessionSetting, 'GameVersion' => $gameVersion
                            ];
                            break; 
                        }
                    }
                }
            }
        }
    }
    
// NOUVEAU BLOC FINAL (remplace l'ancien à partir de la ligne 355)

$results = [];
foreach ($allLapsData as $key => $laps) {
    list($track, $trackCourse, $class, $type) = explode('|', $key);
    
    // Initialisation des variables pour ce groupe (piste/voiture)
    $bestLapObj = ['lap' => INF];
    $bestS1 = INF; $bestS1Date = 0;
    $bestS2 = INF; $bestS2Date = 0;
    $bestS3 = INF; $bestS3Date = 0;
    $bestVmax = 0;

    foreach ($laps as $lap) {
        // Recherche du meilleur tour global (doit être un tour 100% valide)
        if ($lap['lap'] > 0 && $lap['s1'] > 0 && $lap['s2'] > 0 && $lap['s3'] > 0) {
            if ($lap['lap'] < $bestLapObj['lap']) {
                $bestLapObj = $lap;
            }
        }
        
        // Recherche des meilleurs secteurs, indépendamment de la validité du tour complet
        if ($lap['s1'] > 0 && $lap['s1'] < $bestS1) {
            $bestS1 = $lap['s1'];
            $bestS1Date = $lap['date'];
        }
        if ($lap['s2'] > 0 && $lap['s2'] < $bestS2) {
            $bestS2 = $lap['s2'];
            $bestS2Date = $lap['date'];
        }
        if ($lap['s3'] > 0 && $lap['s3'] < $bestS3) {
            $bestS3 = $lap['s3'];
            $bestS3Date = $lap['date'];
        }
        
        $bestVmax = max($bestVmax, $lap['topspeed']);
    }

    // On ajoute la ligne au tableau uniquement si on a trouvé au moins un tour valide
    if ($bestLapObj['lap'] !== INF) {
        $optimalLapTime = ($bestS1 === INF || $bestS2 === INF || $bestS3 === INF) ? INF : ($bestS1 + $bestS2 + $bestS3);

        $results[] = [
            'Filename' => $bestLapObj['filename'],
            'Track Venue' => $track,
            'Track Course' => $trackCourse,
            'Car Class' => $class,
            'Car Type' => $type,
            'Car Name' => $bestLapObj['carName'],
            'Date' => date('d/m/Y H:i', $bestLapObj['date']),
            'DateRaw' => $bestLapObj['date'],
            'SessionTimestamp' => $bestLapObj['session_id_event'],
            'SessionType' => $bestLapObj['sessionType'],
            'FinishPos' => $bestLapObj['finishPos'],
            'Setting' => $bestLapObj['Setting'],
            'Progression' => $bestLapObj['progression'],
            'GameVersion' => $bestLapObj['GameVersion'],
            'Status' => $bestLapObj['status'],
            'BestLapRaw' => $bestLapObj['lap'],
            'BestLapS1' => $bestLapObj['s1'],
            'BestLapS2' => $bestLapObj['s2'],
            'BestLapS3' => $bestLapObj['s3'],
            'AbsoluteBestS1Raw' => $bestS1,
            'AbsoluteBestS2Raw' => $bestS2,
            'AbsoluteBestS3Raw' => $bestS3,
            'AbsoluteBestS1_Date' => date('d/m/Y H:i', $bestS1Date),
            'AbsoluteBestS2_Date' => date('d/m/Y H:i', $bestS2Date),
            'AbsoluteBestS3_Date' => date('d/m/Y H:i', $bestS3Date),
            'OptimalLapRaw' => $optimalLapTime,
            'BestVmaxRaw' => $bestVmax,
        ];
    }
}    
    $favoriteTrack = 'N/A';
    if (!empty($rawStats['lapsPerTrack'])) { arsort($rawStats['lapsPerTrack']); $favoriteTrack = key($rawStats['lapsPerTrack']); }
    $favoriteCar = 'N/A';
    if (!empty($rawStats['lapsPerCar'])) { arsort($rawStats['lapsPerCar']); $favoriteCar = key($rawStats['lapsPerCar']); }
    
    $stats = ['totalLaps' => $rawStats['totalLaps'], 'totalDrivingTime' => round($rawStats['totalDrivingTime'] / 3600, 1), 'favoriteTrack' => $favoriteTrack, 'favoriteCar' => $favoriteCar, 'bestFinish' => ($rawStats['bestFinish'] === 99) ? 'N/A' : $rawStats['bestFinish'], 'bestProgression' => ($rawStats['bestProgression'] === -99) ? 'N/A' : $rawStats['bestProgression'], 'raceResults' => $rawStats['raceResults'], 'allSessionsLaps' => $rawStats['allSessionsLaps']];

    if (defined('CACHE_FILE') && (!empty($results) || !empty($stats['totalLaps']))) {
        $cache_data = [
            'cache_key' => $cache_key,
            'results' => $results,
            'stats' => $stats
        ];
        @file_put_contents(CACHE_FILE, json_encode($cache_data));
    }
}

// --- LOGIQUE DE TRI ET FILTRAGE ---

// ÉTAPE 1 : On récupère les filtres sélectionnés D'ABORD
$isFilterSubmitted = isset($_GET['track']) || isset($_GET['track_course']) || isset($_GET['class']) || isset($_GET['car1']) || isset($_GET['session_type']) || isset($_GET['setting']) || isset($_GET['filter_version_submitted']);
$selectedTrack = $_GET['track'] ?? 'all';
$selectedTrackCourse = $_GET['track_course'] ?? 'all';
$selectedClass = $_GET['class'] ?? 'all';
$selectedCar1 = $_GET['car1'] ?? 'all';
$selectedSessionType = $_GET['session_type'] ?? 'all';
$selectedSetting = $_GET['setting'] ?? 'all';

$defaultVersion = $config['default_since_version'] ?? '1.0000';
if ($defaultVersion !== 'all' && !empty($uniqueVersionsForFilter) && !in_array($defaultVersion, $uniqueVersionsForFilter)) {
    $defaultVersion = $uniqueVersionsForFilter[0] ?? 'all';
}
$selectedVersion = $_GET['version'] ?? $defaultVersion;
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
$uniqueSessionTypesForFilter = array_keys($allAvailableSessionTypes);
$uniqueSettingsForFilter = array_keys($allAvailableSettings);

// On trie les listes pour un affichage alphabétique
sort($uniqueTrackVenuesForFilter);

// Tri personnalisé pour les classes
$classOrder = ['Hyper' => 1, 'LMP2 ELMS' => 2, 'LMP2' => 3, 'LMP3' => 4, 'GT3' => 5, 'GTE' => 6];
usort($uniqueCarClassesForFilter, function($a, $b) use ($classOrder) {
    $a_prio = $classOrder[$a] ?? 99;
    $b_prio = $classOrder[$b] ?? 99;
    return $a_prio <=> $b_prio;
});

sort($uniqueCarTypesForFilter);
sort($uniqueSessionTypesForFilter);
sort($uniqueSettingsForFilter);


// ÉTAPE 4 : On applique les filtres sur les résultats
$isComparison = false; // Comparison logic removed for now

$selectedCar = ($selectedCar1 !== 'all') ? $selectedCar1 : 'all';
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
$classOrder = ['Hyper' => 1, 'LMP2 ELMS' => 2, 'LMP2' => 3, 'LMP3' => 4, 'GT3' => 5, 'GTE' => 6];
usort($filteredResults, function($a, $b) use ($classOrder) {
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
    $a_prio = $classOrder[$a['Car Class']] ?? 99;
    $b_prio = $classOrder[$b['Car Class']] ?? 99;
    if ($a_prio !== $b_prio) {
        return $a_prio <=> $b_prio;
    }

    // 4. Si la classe est la même, tri par meilleur temps
    return $a['BestLapRaw'] <=> $b['BestLapRaw'];
});

// Filtre des sessions
$filteredSessions = array_filter($stats['raceResults'] ?? [], function ($race) use ($selectedTrack, $selectedTrackCourse, $selectedClass, $selectedCar, $selectedSessionType, $selectedSetting, $selectedVersion, $filterOnlyVersion) {
    $matchTrack = ($selectedTrack === 'all' || $race['Track'] === $selectedTrack);
    $matchTrackCourse = ($selectedTrackCourse === 'all' || (isset($race['TrackCourse']) && $race['TrackCourse'] === $selectedTrackCourse));
    $matchClass = ($selectedClass === 'all' || $race['Class'] === $selectedClass);
    $matchCar = ($selectedCar === 'all' || $race['Car'] === $selectedCar);
    $matchSessionType = ($selectedSessionType === 'all' || $race['SessionType'] === $selectedSessionType);
    $matchSetting = ($selectedSetting === 'all' || $race['Setting'] === $selectedSetting);

    // LOGIQUE DE FILTRE DE VERSION AJOUTÉE POUR LE TABLEAU DES SESSIONS
    $matchVersion = true;
    if ($selectedVersion !== 'all') {
        if ($filterOnlyVersion) {
            $matchVersion = $race['GameVersion'] === $selectedVersion;
        } else {
            $matchVersion = version_compare($race['GameVersion'], $selectedVersion, '>=');
        }
    }
    
    return $matchTrack && $matchTrackCourse && $matchClass && $matchCar && $matchSessionType && $matchSetting && $matchVersion;
});

// --- Logique de Tri Côté Serveur ---
$sortBy = $_GET['sort_by'] ?? 'Date';
$sortDir = $_GET['sort_dir'] ?? 'desc';

$classOrder = ['Hyper' => 1, 'LMP2 ELMS' => 2, 'LMP2' => 3, 'LMP3' => 4, 'GT3' => 5, 'GTE' => 6];

if (!empty($filteredSessions)) {
    // Définir l'ordre des sessions pour le tri (Course en premier)
    $sessionOrder = ['Race' => 1, 'Qualify' => 2, 'Practice1' => 3];

    usort($filteredSessions, function($a, $b) use ($sortBy, $sortDir, $sessionOrder, $classOrder) {
        // Comportement de tri spécial pour le tri par défaut (par date)
        if ($sortBy === 'Date') {
            // Tri principal par l'ID de l'événement (timestamp commun)
            $eventCmp = $b['SessionID'] <=> $a['SessionID'];
            if ($eventCmp !== 0) {
                return $sortDir === 'desc' ? $eventCmp : -$eventCmp;
            }

            // Tri secondaire par type de session (Course -> Qualif -> Essais)
            $aOrder = $sessionOrder[$a['SessionType']] ?? 99;
            $bOrder = $sessionOrder[$b['SessionType']] ?? 99;
            
            // On veut toujours cet ordre chronologique, quelle que soit la direction du tri principal
            return $aOrder <=> $bOrder;
        }

        // Tri spécial pour la colonne 'Class'
        if ($sortBy === 'Class') {
            $a_prio = $classOrder[$a['Class']] ?? 99;
            $b_prio = $classOrder[$b['Class']] ?? 99;
            $cmp = $a_prio <=> $b_prio;
            return ($sortDir === 'desc') ? -$cmp : $cmp;
        }

        // Logique de tri générique pour les autres colonnes
        if (!array_key_exists($sortBy, $a) || !array_key_exists($sortBy, $b)) {
            return 0;
        }
        $valA = $a[$sortBy];
        $valB = $b[$sortBy];

        // Spécialement pour 'BestLap', les valeurs nulles vont à la fin.
        if ($sortBy === 'BestLap') {
            $aIsNull = $valA === null;
            $bIsNull = $valB === null;

            if ($aIsNull && $bIsNull) return 0;
            if ($aIsNull) return 1;
            if ($bIsNull) return -1;
        }
        
        if ($valA === null) $valA = -9999;
        if ($valB === null) $valB = -9999;
        
        $cmp = 0;
        if (is_numeric($valA) && is_numeric($valB)) {
            $cmp = $valA <=> $valB;
        } else {
            $cmp = strcasecmp((string)$valA, (string)$valB);
        }
        return ($sortDir === 'desc') ? -$cmp : $cmp;
    });
}


// --- Logique de Pagination ---
$racesPerPageOptions = [15, 25, 50, 100, 200];
$racesPerPage = isset($_GET['per_page']) && in_array((int)$_GET['per_page'], $racesPerPageOptions) ? (int)$_GET['per_page'] : 15;
$currentPage = isset($_GET['page']) ? (int)$_GET['page'] : 1;
if ($currentPage < 1) { $currentPage = 1; }

$totalSessions = count($filteredSessions);
$totalPages = $racesPerPage > 0 ? ceil($totalSessions / $racesPerPage) : 1;
if ($currentPage > $totalPages && $totalPages > 0) {
    $currentPage = $totalPages;
}

$offset = ($currentPage - 1) * $racesPerPage;
$paginatedSessions = $racesPerPage > 0 ? array_slice($filteredSessions, $offset, $racesPerPage) : $filteredSessions;

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
    <?php if (!empty($stats)): ?>
    <div class="stats-panel">
        <div class="panel-header">
			<a href="index.php"><img src="logos/lmu.png" alt="Le Mans Ultimate Logo" id="page-logo"></a>            
			</a>
            <h1><?php echo $lang['title'] . ' ' . htmlspecialchars(PLAYER_NAME); ?></h1>
			<div id="theme-switcher">
				<form action="index.php" method="get">
					<label for="theme-select"><?php echo $lang['filter_theme'] ?? 'Thème'; ?></label>
					<select id="theme-select" name="theme" onchange="this.form.submit()">
						<option value="light" <?php echo ($current_theme === 'light') ? 'selected' : ''; ?>>
							<?php echo $lang['theme_light'] ?? 'Clair'; ?>
						</option>
						<option value="dark" <?php echo ($current_theme === 'dark') ? 'selected' : ''; ?>>
							<?php echo $lang['theme_dark'] ?? 'Sombre'; ?>
						</option>
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
            <a href="index.php?lang=<?php echo $current_lang; ?>" class="reset-filter-btn" title="<?php echo $lang['filter_reset']; ?>">🔄</a>
            <a href="config.php?lang=<?php echo $current_lang; ?>" class="reset-filter-btn" title="<?php echo $lang['config_link_title']; ?>">⚙️</a>
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

    <?php if ($isComparison): ?>
        <p class="message"><?php echo $lang['comparison_not_implemented']; ?></p>
    <?php elseif (empty($filteredResults)): ?>
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
                $columnHeadersHtml = '<thead><tr><th>'.$lang['th_details'].'</th><th class="text-center">'.$lang['th_layout'].'</th><th class="text-center">'.$lang['th_type'].'</th><th class="text-center">'.$lang['th_session'].'</th><th class="text-center">'.$lang['th_class'].'</th><th class="text-center">'.$lang['th_car'].'</th><th class="text-center">'.$lang['th_livery'].'</th><th class="text-center">'.$lang['th_best_lap'].'</th><th class="text-center">S1</th><th class="text-center">S2</th><th class="text-center">S3</th><th class="text-center">'.$lang['th_optimal'].'</th><th class="text-center">'.$lang['th_vmax'].'</th><th class="text-center">'.$lang['th_finish_pos'].'</th><th class="text-center">'.$lang['th_progression'].'</th><th class="text-center">'.$lang['th_date'].'</th><th class="text-center">'.$lang['th_version'].'</th></tr></thead>';
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
                        echo '<thead class="' . $headerClass . '" data-group-id="' . $trackGroupId . '"><tr><th colspan="17" class="group-header">';
                        
                        echo '<span class="collapsible-trigger">';
                        $flagUrl = getCircuitFlagUrl($currentTrack);
                        if ($flagUrl) echo '<img src="' . htmlspecialchars($flagUrl) . '" alt="" class="logo flag-icon">';
                        echo '<span class="arrow-indicator">▼</span></span>';
                        
                        echo ' <span class="clickable-filter" data-filter-type="track" data-filter-value="' . htmlspecialchars($currentTrack) . '" title="Filtrer par ' . htmlspecialchars($currentTrack) . '">' . $trackTitle . '</span>';
                        
                        echo '</th></tr></thead>';
                        echo $columnHeadersHtml;
                        $isFirstHeader = false;
                    }
                    $carClassCss = 'class-' . strtolower(str_replace([' ', '-', '#'], '', $row['Car Class']));
                    $currentRowTrackGroupId = 'track-group-' . preg_replace('/[^a-zA-Z0-9-]/', '', str_replace(' ', '-', $row['Track Venue'] . '-' . ($row['Track Course'] ?? '')));
                ?>
                    <tr data-track-group="<?php echo $currentRowTrackGroupId; ?>">
                        <td class="text-center">
                            <a href="race_details.php?session_id=<?php echo urlencode($row['SessionTimestamp']); ?>&lang=<?php echo $current_lang; ?>&session_view=<?php echo $row['SessionType']; ?>&from=best-laps-table" title="Voir les détails de la session">📊</a>
                        </td>
                        <td class="clickable-filter" data-filter-type="track_course" data-filter-value="<?php echo htmlspecialchars($row['Track Course'] ?? ''); ?>" title="Filtrer par <?php echo htmlspecialchars($row['Track Course'] ?? ''); ?>">
							<?php echo isset($row['Track Course']) ? htmlspecialchars($row['Track Course']) : ''; ?>
						</td>
                        <td class="clickable-filter" data-filter-type="setting" data-filter-value="<?php echo htmlspecialchars($row['Setting']); ?>" title="Filtrer par <?php echo translateTerm($row['Setting'], $lang); ?>"><?php echo translateTerm($row['Setting'], $lang); ?></td>
                        <td class="text-center clickable-filter" data-filter-type="session_type" data-filter-value="<?php echo htmlspecialchars($row['SessionType']); ?>" title="Filtrer par <?php echo translateTerm($row['SessionType'], $lang); ?>">
                            <?php
                                $sessionType = $row['SessionType'];
                                $sessionClass = 'session-' . strtolower($sessionType);
                                $sessionDisplay = translateTerm($sessionType, $lang);
                            ?>
                            <span class="badge <?php echo $sessionClass; ?>"><?php echo htmlspecialchars($sessionDisplay); ?></span>
                        </td>
                        <td class="text-center">
                            <a href="index.php?class=<?php echo urlencode($row['Car Class']); ?>&lang=<?php echo $current_lang; ?>" title="Filtrer par <?php echo htmlspecialchars($row['Car Class']); ?>" style="text-decoration: none;">
                                <span class="badge <?php echo $carClassCss; ?>"><?php echo htmlspecialchars($row['Car Class']); ?></span>
                            </a>
                        </td>
                        <td class="clickable-filter" data-filter-type="car1" data-filter-value="<?php echo htmlspecialchars($row['Car Type']); ?>" title="Filtrer par <?php echo htmlspecialchars($row['Car Type']); ?>">
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
                                if ($row['SessionType'] === 'Race' && $row['Progression'] !== null) {
                                    $progression = $row['Progression'];
                                    if ($progression > 0) {
                                        echo '<span class="prog-gain">▲ +' . $progression . '</span>';
                                    } elseif ($progression < 0) {
                                        echo '<span class="prog-loss">▼ ' . $progression . '</span>';
                                    } else {
                                        echo '<span>-</span>';
                                    }
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
                <?php foreach ($paginatedSessions as $race):
                    $carClassCss = 'class-' . strtolower(str_replace([' ', '-', '#'], '', $race['Class']));
                ?>
                <tr>
                    <td class="text-center">
                        <a href="race_details.php?session_id=<?php echo urlencode($race['SessionID']); ?>&lang=<?php echo $current_lang; ?>&session_view=<?php echo $race['SessionType']; ?>&from=race-results-table" title="Voir les détails de la session">📊</a>
                    </td>
                    <td class="clickable-filter" data-filter-type="track" data-filter-value="<?php echo htmlspecialchars($race['Track']); ?>" title="Filtrer par <?php echo htmlspecialchars($race['Track']); ?>">
                        <?php $flagUrl = getCircuitFlagUrl($race['Track']); if ($flagUrl):?><img src="<?php echo htmlspecialchars($flagUrl); ?>" alt="" class="logo flag-icon"><?php endif; ?><?php echo htmlspecialchars($race['Track']); ?>
                    </td>
                    <td class="clickable-filter" data-filter-type="track_course" data-filter-value="<?php echo htmlspecialchars($race['TrackCourse'] ?? ''); ?>" title="Filtrer par <?php echo htmlspecialchars($race['TrackCourse'] ?? ''); ?>">
						<?php echo isset($race['TrackCourse']) ? htmlspecialchars($race['TrackCourse']) : ''; ?>
					</td>
                    <td class="clickable-filter" data-filter-type="setting" data-filter-value="<?php echo htmlspecialchars($race['Setting']); ?>" title="Filtrer par <?php echo translateTerm($race['Setting'], $lang); ?>"><?php echo translateTerm($race['Setting'], $lang); ?></td>
                    <td class="text-center clickable-filter" data-filter-type="session_type" data-filter-value="<?php echo htmlspecialchars($race['SessionType']); ?>" title="Filtrer par <?php echo translateTerm($race['SessionType'], $lang); ?>">
                        <?php
                            $sessionType = $race['SessionType'];
                            $sessionClass = 'session-' . strtolower($sessionType);
                            echo '<span class="badge ' . $sessionClass . '">' . translateTerm($sessionType, $lang) . '</span>';
                        ?>
                    </td>
                        <td class="text-center">
                            <a href="index.php?class=<?php echo urlencode($race['Class']); ?>&lang=<?php echo $current_lang; ?>" title="Filtrer par <?php echo htmlspecialchars($race['Class']); ?>" style="text-decoration: none;">
                                <span class="badge <?php echo $carClassCss; ?>"><?php echo str_replace(' ELMS', '', htmlspecialchars($race['Class'])); ?></span>
                            </a>
                        </td>
                    <td class="clickable-filter" data-filter-type="car1" data-filter-value="<?php echo htmlspecialchars($race['Car']); ?>" title="Filtrer par <?php echo htmlspecialchars($race['Car']); ?>">
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
                            if ($race['SessionType'] === 'Race' && $race['Progression'] !== null) {
                                $progression = $race['Progression'];
                                if ($progression > 0) {
                                    echo '<span class="prog-gain">▲ +' . $progression . '</span>';
                                } elseif ($progression < 0) {
                                    echo '<span class="prog-loss">▼ ' . $progression . '</span>';
                                } else {
                                    echo '<span>-</span>';
                                }
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
	
    
    const allSessionsLapsData = <?php echo json_encode($stats['allSessionsLaps'] ?? []); ?>;
    let lapChart = null;
    const modal = document.getElementById('lapChartModal');
    if (!modal) return;
    const closeButton = modal.querySelector('.close-button');
    closeButton.onclick = () => { modal.style.display = 'none'; };
    window.onclick = (event) => { if (event.target == modal) { modal.style.display = 'none'; } };

    // MODIFIÉ : La fonction openLapChart a été entièrement remplacée
function openLapChart(sessionId, track, bestLapText) {
        const lapData = allSessionsLapsData[sessionId];
        
        // On vérifie qu'il y a au moins 2 tours au total (ex: 1 tour de sortie + 1 tour chronométré)
        if (lapData && lapData.length > 1) {
            document.getElementById('chartTitle').innerText = `${translations.chartTitle} - ${track}`;
            document.getElementById('chartBestLap').innerText = `(${translations.bestLapPrefix}: ${bestLapText})`;
            
            // Le premier tour est souvent un tour de sortie, on le saute pour une meilleure échelle.
            const slicedLapData = lapData.slice(1).filter(lap => lap !== null);
            
            // On vérifie maintenant s'il reste AU MOINS DEUX tours à afficher après le filtre pour dessiner une ligne.
            if (slicedLapData.length < 2) {
                alert(translations.noLapData);
                return;
            }

            const minLapTimeInSession = Math.min(...slicedLapData);
            const maxLapTimeInSession = Math.max(...slicedLapData);
            // On ajuste le label pour commencer au tour 2, car le tour 1 est retiré
            const labels = slicedLapData.map((_, i) => `${translations.lapPrefix} ${i + 2}`);
            
            if (lapChart) { lapChart.destroy(); }

            const ctx = document.getElementById('lapChart').getContext('2d');
            const gradient = ctx.createLinearGradient(0, 0, 0, 400);
            gradient.addColorStop(0, 'rgba(0, 86, 179, 0.5)');
            gradient.addColorStop(1, 'rgba(0, 86, 179, 0)');

            const pointColors = slicedLapData.map(lap => lap === minLapTimeInSession ? '#28a745' : 'rgba(0, 86, 179, 0.9)');
            const pointRadii = slicedLapData.map(lap => lap === minLapTimeInSession ? 7 : 4);

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
                    interaction: {
                        intersect: false,
                        mode: 'index',
                    },
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
                                    if (Math.abs(delta) > 0.001) {
                                        label += ` (${sign}${delta.toFixed(3)}s)`;
                                    }
                                    return label;
                                }
                            } 
                        }
                    }
                }
            });
            modal.style.display = 'block';
        } else {
            alert(translations.noLapData);
        }
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