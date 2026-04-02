<?php
// includes/fetch_live_data.php
require_once 'init.php';
require_once 'functions.php';

// --- FONCTION POUR TROUVER LE FICHIER DE RÉSULTAT LE PLUS RÉCENT ---
function get_latest_result_file() {
    $latest_file = null;
    $latest_time = 0;
    // Utilise la constante RESULTS_DIR définie dans init.php
    $files = glob(RESULTS_DIR . '*.xml'); 
    if ($files === false) {
        return null;
    }
    // Cherche le fichier le plus récemment MODIFIÉ (le fichier en cours d'écriture)
    foreach ($files as $file) {
        $time = filemtime($file);
        if ($time > $latest_time) {
            $latest_time = $time;
            $latest_file = $file;
        }
    }
    return $latest_file;
}

header('Content-Type: application/json');

$latest_file = get_latest_result_file();
$data = ['status' => 'error', 'message' => $lang['no_live_session'] ?? 'No live session data found.'];

if ($latest_file) {
    clearstatcache();
    $file_content = @file_get_contents($latest_file);
    $xml = false;

    if ($file_content) {
        libxml_use_internal_errors(true);
        $xml = simplexml_load_string($file_content);

        // Tentative de correction du XML incomplet (très important pour le live)
        if ($xml === false) {
            $last_gt = strrpos($file_content, '>');
            if ($last_gt !== false) {
                $chopped_content = substr($file_content, 0, $last_gt + 1);
                // On essaie de fermer les balises principales si elles sont ouvertes
                $fixed_content = $chopped_content;
                if (!str_contains($fixed_content, '</RaceResults>')) $fixed_content .= '</RaceResults>';
                if (!str_contains($fixed_content, '</rFactorXML>')) $fixed_content .= '</rFactorXML>';
                $xml = simplexml_load_string($fixed_content);
            }
        }

        libxml_clear_errors();
        libxml_use_internal_errors(false);
    }

    if ($xml && isset($xml->RaceResults)) {
        $raceResults = $xml->RaceResults;
        $session_data = null;
        $session_type = '';

        // Détecte la session active (Practice, Qualify, Race)
        if (isset($raceResults->Race)) {
            $session_type = 'Race';
            $session_data = $raceResults->Race;
        } elseif (isset($raceResults->Qualify)) {
            $session_type = 'Qualify';
            $session_data = $raceResults->Qualify;
        } elseif (isset($raceResults->Practice1)) {
            $session_type = 'Practice1';
            $session_data = $raceResults->Practice1;
        } else {
             // Fallback pour les fichiers qui n'ont pas encore de balise de session <Race> mais des données <Driver> directement dans <RaceResults> (rare)
             // On utilise RaceResults comme conteneur s'il y a des drivers
             if (isset($raceResults->Driver)) {
                 $session_data = $raceResults;
                 // On déduit le type par le nom du fichier (moins fiable)
                 if (str_contains(basename($latest_file), 'R1')) $session_type = 'Race';
                 elseif (str_contains(basename($latest_file), 'Q1')) $session_type = 'Qualify';
                 else $session_type = 'Practice1'; // Par défaut
             }
        }

        if ($session_data && isset($session_data->Driver)) {
            $trackVenue = (string)$raceResults->TrackVenue;
            $trackCourse = (string)$raceResults->TrackCourse;
            
            $leader_last_lap_et = 0;
            $overall_best_lap = INF;
            $overall_best_s1 = INF; $overall_best_s2 = INF; $overall_best_s3 = INF;
            
            $raw_drivers = [];
            foreach ($session_data->Driver as $driver) {
                $raw_drivers[] = $driver;
                // Détermination des records de session
                if (isset($driver->BestLapTime)) {
                    $best_lap = (float)$driver->BestLapTime;
                    if ($best_lap > 0 && $best_lap < $overall_best_lap) {
                        $overall_best_lap = $best_lap;
                    }
                }
                if (isset($driver->Lap)) {
                    foreach ($driver->Lap as $lap) {
                        if (isset($lap['s1']) && (float)$lap['s1'] > 0 && (float)$lap['s1'] < $overall_best_s1) $overall_best_s1 = (float)$lap['s1'];
                        if (isset($lap['s2']) && (float)$lap['s2'] > 0 && (float)$lap['s2'] < $overall_best_s2) $overall_best_s2 = (float)$lap['s2'];
                        if (isset($lap['s3']) && (float)$lap['s3'] > 0 && (float)$lap['s3'] < $overall_best_s3) $overall_best_s3 = (float)$lap['s3'];
                    }
                }
            }

            $drivers_json = [];
            
            // Calcul du Leader pour l'écart
            $leader = null;
            foreach ($raw_drivers as $d) {
                // Le classement en direct est basé sur la POSITION (la première colonne du XML est la position globale)
                if ((int)$d->Position === 1) { 
                    $last_lap_et = 0;
                    if (isset($d->Lap)) {
                        $last_lap = end($d->Lap);
                        $last_lap_et = isset($last_lap['et']) ? (float)$last_lap['et'] : 0;
                    }
                    $leader = ['Laps' => (int)$d->Laps, 'LastLapET' => $last_lap_et];
                    $leader_last_lap_et = $leader['LastLapET'];
                    break;
                }
            }

            foreach ($raw_drivers as $driver) {
                $last_lap_sectors = ['s1' => null, 's2' => null, 's3' => null];
                $last_lap_time = null;
                $is_pitting = false;
                $last_lap_et = null;
                
                if (isset($driver->Lap) && count($driver->Lap) > 0) {
                    $last_lap_elem = end($driver->Lap);
                    $last_lap_time = (float)$last_lap_elem[0];
                    if ($last_lap_time <= 0) $last_lap_time = null;

                    $last_lap_sectors['s1'] = isset($last_lap_elem['s1']) ? (float)$last_lap_elem['s1'] : null;
                    $last_lap_sectors['s2'] = isset($last_lap_elem['s2']) ? (float)$last_lap_elem['s2'] : null;
                    $last_lap_sectors['s3'] = isset($last_lap_elem['s3']) ? (float)$last_lap_elem['s3'] : null;
                    $last_lap_et = isset($last_lap_elem['et']) ? (float)$last_lap_elem['et'] : null;
                    
                    if (isset($last_lap_elem['pit']) && (string)$last_lap_elem['pit'] === '1') {
                        $is_pitting = true;
                    }
                }
                
                $best_lap_time = isset($driver->BestLapTime) ? (float)$driver->BestLapTime : null;
                
                $gap = 'N/A';
                $position = (int)$driver->Position;

                if ($leader && $position > 0) {
                    if ($position === 1) {
                        $gap = '';
                    } elseif ((int)$driver->Laps < $leader['Laps']) {
                        $laps_down = $leader['Laps'] - (int)$driver->Laps;
                        $gap = $laps_down . ' ' . $lang['laps_behind'] ?? 'Laps';
                    } elseif ($last_lap_et !== null && $leader_last_lap_et !== 0) {
                        $diff = $last_lap_et - $leader_last_lap_et;
                        // Ne pas afficher d'écart tant que le premier tour n'est pas terminé
                        if ($leader['Laps'] > 0) {
                            $gap = ($diff >= 0 ? '+' : '') . number_format($diff, 3) . 's';
                        }
                    } else {
                        // Afficher l'écart à zéro si la session vient de commencer
                        $gap = '0.000s';
                    }
                }
                
                $drivers_json[] = [
                    'Position' => $position,
                    'ClassPosition' => (int)$driver->ClassPosition,
                    'Name' => (string)$driver->Name,
                    'CarClass' => (string)$driver->CarClass,
                    'CarType' => (string)$driver->CarType,
                    'BestLapTime' => $best_lap_time,
                    'LastLapTime' => $last_lap_time,
                    'Laps' => (int)$driver->Laps,
                    'FinishStatus' => (string)$driver->FinishStatus,
                    'IsPitting' => $is_pitting,
                    'IsOverallBest' => ($best_lap_time > 0 && abs($best_lap_time - $overall_best_lap) < 0.001),
                    'LastLapS1' => $last_lap_sectors['s1'],
                    'LastLapS2' => $last_lap_sectors['s2'],
                    'LastLapS3' => $last_lap_sectors['s3'],
                    'IsBestS1' => ($last_lap_sectors['s1'] > 0 && abs($last_lap_sectors['s1'] - $overall_best_s1) < 0.001),
                    'IsBestS2' => ($last_lap_sectors['s2'] > 0 && abs($last_lap_sectors['s2'] - $overall_best_s2) < 0.001),
                    'IsBestS3' => ($last_lap_sectors['s3'] > 0 && abs($last_lap_sectors['s3'] - $overall_best_s3) < 0.001),
                    'Gap' => $gap,
                ];
            }
            
            // TRIER PAR POSITION GLOBALE (ASC)
            usort($drivers_json, fn($a, $b) => $a['Position'] <=> $b['Position']);

            $data = [
                'status' => 'success',
                'trackVenue' => $trackVenue,
                'trackCourse' => $trackCourse,
                'sessionType' => translateTerm($session_type, $lang),
                'drivers' => $drivers_json,
                'overallBestLap' => $overall_best_lap === INF ? null : formatSecondsToMmSsMs($overall_best_lap),
            ];
        }
    }
}

echo json_encode($data);
?>