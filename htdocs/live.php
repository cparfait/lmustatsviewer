<?php
// live.php (Version AJAX)
require_once 'includes/init.php';
require_once 'includes/functions.php';

// Les termes du langage nécessaires au JavaScript
// Note : Le terme 'Live Timing' est ici le fallback pour être cohérent avec le PHP
$js_lang = [
    'live_timing_title' => $lang['live_timing_title'] ?? 'Live Timing',
    'back_to_stats' => $lang['btn_return'] ?? 'Retour aux Stats',
    'no_live_session' => $lang['no_live_session'] ?? 'Aucune session live trouvée.',
    'status_dnf' => $lang['status_dnf'] ?? 'Abandon',
    'status_dq' => $lang['status_dq'] ?? 'Disqualifié',
    'status_none' => $lang['status_none'] ?? 'Non Classé',
    'status_finished' => $lang['status_finished'] ?? 'Terminé Normalement',
    'laps_behind' => $lang['laps_behind'] ?? 'Tour',
    'in_pits' => $lang['in_pits'] ?? 'Aux Stands',
    'name_driver_ahead' => $lang['driver_ahead'] ?? 'Pilote Devant',
    'name_driver_behind' => $lang['driver_behind'] ?? 'Pilote Derrière',
    'last_lap' => $lang['last_lap'] ?? 'Dernier Tour',
    'pos' => $lang['pos_header'] ?? 'Pos',
    'class_pos' => $lang['th_class'] ?? 'Class Pos',
    'name' => $lang['driver_header'] ?? 'Name',
    'car' => $lang['car_header'] ?? 'Car',
    'best_lap' => $lang['th_best_lap'] ?? 'Best Lap',
    'last_lap' => $lang['last_lap'] ?? 'Last Lap',
    's1' => $lang['sector_1_header'] ?? 'S1',
    's2' => $lang['sector_2_header'] ?? 'S2',
    's3' => $lang['sector_3_header'] ?? 'S3',
    'gap' => $lang['th_total_time'] ?? 'Gap',
    'laps_header' => $lang['laps_header'] ?? 'Laps',
    'status_header' => $lang['status_header'] ?? 'Status',
];
?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>" data-theme="<?php echo $current_theme; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $lang['live_timing_title'] ?? 'Live Timing'; ?> - <?php echo htmlspecialchars(PLAYER_NAME); ?></title>
    <link rel="icon" href="logos/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="css/style.css?v=<?php echo filemtime('css/style.css'); ?>"> 
    <style>
        /* Styles spécifiques pour le Live Timing */
        .live-timing-table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        .live-timing-table th, .live-timing-table td { padding: 8px 12px; border: 1px solid var(--border-color); font-size: 0.85em; text-align: center; vertical-align: middle;}
        .live-timing-table thead th { background-color: var(--header-bg-color); color: var(--header-text-color); }
        
        .player-row-live { background-color: var(--player-row-bg-color) !important; color: var(--player-row-text-color) !important; font-weight: bold; }
        .player-row-live:hover { background-color: var(--player-row-bg-color) !important; color: var(--player-row-text-color) !important; }
        
        .overall-best-lap { color: var(--overall-best-color); font-weight: bold; }
        .overall-best-sector { color: var(--overall-best-color); font-weight: bold; }

        .summary-table-wrapper { margin-bottom: 20px; text-align: center; }
        .summary-table { width: 100%; border-collapse: collapse; margin: 0 auto; max-width: 900px; }
        .summary-table th, .summary-table td { padding: 10px; border: 1px solid var(--border-color); font-size: 0.9em; }
        .summary-table thead th { background-color: var(--primary-color-dark); color: white; }
        .summary-table .player-summary { font-size: 1.1em; font-weight: bold; background-color: var(--player-row-bg-color); color: var(--player-row-text-color); }
        .gap-plus { color: #28a745; }
        .gap-minus { color: #dc3545; }
        .pit-status { color: #ffc107; font-weight: bold; }
        .car-logo-table { height: 1.2em; vertical-align: middle; margin-right: 5px; }

        /* Correction pour les titres (pour assurer la cohérence) */
        .stats-panel h1 {
            font-size: 1.8em;
            letter-spacing: normal;
            text-align: center;
            margin: 0;
            padding: 0;
            flex-grow: 1;
        }
        .filter-section h2 {
            text-align: center;
            color: var(--primary-color);
            margin: 10px 0 0 0;
            font-size: 1.2em;
        }
        .text-left { text-align: left; }
    </style>
</head>
<body class="<?php if ($current_theme === 'dark') echo 'dark-mode'; ?>">
    <div class="stats-panel">
        <div class="panel-header">
			<a href="index.php?lang=<?php echo $current_lang; ?>"><img src="logos/lmu.png" alt="Le Mans Ultimate Logo" id="page-logo"></a>
            <h1>🔴 <?php echo $lang['live_timing_title'] ?? 'Live Timing'; ?></h1> 
            <div id="theme-switcher">
                <a href="index.php?lang=<?php echo $current_lang; ?>" class="btn-action btn">
                    &laquo; <?php echo $lang['btn_return'] ?? 'Retour aux Stats'; ?>
                </a>
            </div>
        </div>
    </div>

    <div class="filter-section">
        <h2 id="session-header-title">Chargement des données...</h2>
    </div>

    <div class="table-wrapper" id="live-timing-container">
        <p id="loading-message" class="no-session-message"><?php echo $js_lang['no_live_session']; ?></p>
    </div>

    <?php require 'includes/footer.php'; ?>

    <script>
    const playerName = '<?php echo addslashes(PLAYER_NAME); ?>';
    // Utiliser un chemin relatif standard pour le fichier de données
    const fetchUrl = 'includes/fetch_live_data.php?lang=<?php echo $current_lang; ?>'; 
    const lang = <?php echo json_encode($js_lang); ?>;
    
    // Fonction pour convertir les secondes en format m:ss.ms (identique à formatSecondsToMmSsMs en PHP)
    function formatSeconds(seconds, showMinutes = true) {
        if (seconds === null || isNaN(seconds) || seconds <= 0 || seconds === Infinity) return 'N/A';
        
        const sign = seconds < 0 ? '-' : '';
        seconds = Math.abs(seconds);
        const minutes = Math.floor(seconds / 60);
        const remainingSeconds = seconds - (minutes * 60);
        const formattedSeconds = String(Math.floor(remainingSeconds)).padStart(2, '0');
        const formattedMilliseconds = String(Math.floor((remainingSeconds - Math.floor(remainingSeconds)) * 1000)).padStart(3, '0');

        if (showMinutes || minutes > 0) {
            return sign + minutes + ':' + formattedSeconds + '.' + formattedMilliseconds;
        }
        return sign + Math.floor(remainingSeconds) + '.' + formattedMilliseconds + 's';
    }

    // Fonction pour déterminer le statut traduit
    function translateStatus(status) {
        if (status === 'DNF') return lang.status_dnf;
        if (status === 'DQ') return lang.status_dq;
        if (status === 'None') return lang.status_none;
        if (status === 'Finished Normally') return lang.status_finished;
        return status;
    }

    // Fonction principale de mise à jour
    function updateLiveTiming() {
        const container = document.getElementById('live-timing-container');
        const sessionHeader = document.getElementById('session-header-title');
        
        fetch(fetchUrl)
            .then(response => {
                if (!response.ok) {
                    throw new Error('Network response was not ok.');
                }
                return response.json();
            })
            .then(data => {
                if (data.status === 'success' && data.drivers && data.drivers.length > 0) {
                    
                    // --- 1. Mise à jour de l'en-tête de session ---
                    sessionHeader.innerHTML = `${data.trackVenue} - ${data.trackCourse} - ${data.sessionType}`;

                    // --- 2. Construction du Tableau Principal (HTML) ---
                    let tableHtml = `
                        <table class="live-timing-table">
                            <thead>
                                <tr>
                                    <th>${lang.pos}</th>
                                    <th>${lang.class_pos}</th>
                                    <th class="text-left">${lang.name}</th>
                                    <th>${lang.car}</th>
                                    <th>${lang.best_lap}</th>
                                    <th>${lang.last_lap}</th>
                                    <th>${lang.s1}</th>
                                    <th>${lang.s2}</th>
                                    <th>${lang.s3}</th>
                                    <th>${lang.gap}</th>
                                    <th>${lang.laps_header}</th>
                                    <th>${lang.status_header}</th>
                                </tr>
                            </thead>
                            <tbody>
                    `;

                    let playerData = null;
                    
                    data.drivers.forEach((driver, index) => {
                        const isPlayer = driver.Name === playerName;
                        if (isPlayer) playerData = driver;

                        const rowClass = isPlayer ? 'player-row-live' : '';
                        
                        const bestLapCell = `<td class="${driver.IsOverallBest ? 'overall-best-lap' : ''}">
                            ${driver.IsOverallBest ? '🏆 ' : ''}
                            ${formatSeconds(driver.BestLapTime)}
                        </td>`;
                        
                        const lastLapCell = `<td>${formatSeconds(driver.LastLapTime)}</td>`;
                        
                        const s1Cell = `<td class="${driver.IsBestS1 ? 'overall-best-sector' : ''}">
                            ${driver.LastLapS1 ? driver.LastLapS1.toFixed(3) + 's' : 'N/A'}
                        </td>`;
                         const s2Cell = `<td class="${driver.IsBestS2 ? 'overall-best-sector' : ''}">
                            ${driver.LastLapS2 ? driver.LastLapS2.toFixed(3) + 's' : 'N/A'}
                        </td>`;
                        const s3Cell = `<td class="${driver.IsBestS3 ? 'overall-best-sector' : ''}">
                            ${driver.LastLapS3 ? driver.LastLapS3.toFixed(3) + 's' : 'N/A'}
                        </td>`;
                        
                        let statusText = translateStatus(driver.FinishStatus);
                        if (driver.IsPitting) {
                            statusText = `<span class="pit-status">${lang.in_pits}</span>`;
                        }
                        
                        // Utilisation d'une classe CSS pour le type de voiture pour une meilleure flexibilité
                        const carClassClean = driver.CarClass.toLowerCase().replace(/ /g, '').replace(/_/g, '');

                        tableHtml += `
                            <tr class="${rowClass}">
                                <td>${driver.Position}</td>
                                <td>${driver.ClassPosition}</td>
                                <td class="text-left">${driver.Name}</td>
                                <td><span class="badge class-${carClassClean}">${driver.CarClass}</span></td>
                                ${bestLapCell}
                                ${lastLapCell}
                                ${s1Cell}${s2Cell}${s3Cell}
                                <td>${driver.Gap}</td>
                                <td>${driver.Laps}</td>
                                <td>${statusText}</td>
                            </tr>
                        `;
                    });

                    tableHtml += `</tbody></table>`;
                    
                    let summaryHtml = '';
                    
                    // --- 3. Construction du Tableau de Résumé du Joueur ---
                    if (playerData) {
                        const playerIndex = data.drivers.findIndex(d => d.Name === playerName);
                        const driverAhead = data.drivers[playerIndex - 1] || null;
                        const driverBehind = data.drivers[playerIndex + 1] || null;
                        
                        const getGapText = (target, isAhead) => {
                            if (!target || target.Laps === 0) return 'N/A';
                            
                            // Si en tours différents
                            if (target.Laps !== playerData.Laps) {
                                const diff = Math.abs(target.Laps - playerData.Laps);
                                return `${diff} ${lang.laps_behind}${diff > 1 ? 's' : ''}`;
                            } 
                            
                            // Si sur le même tour, calculer l'écart relatif
                            const targetDriver = data.drivers.find(d => d.Name === target.Name);
                            
                            if (targetDriver && targetDriver.Gap.includes('s') && playerData.Gap.includes('s')) {
                                const targetGapToLeader = parseFloat(targetDriver.Gap.replace(/[+s]/g, ''));
                                const playerGapToLeader = parseFloat(playerData.Gap.replace(/[+s]/g, ''));
                                
                                let gapSeconds;
                                if (isAhead) { // Pilote Devant : (Temps du Joueur) - (Temps du Pilote Devant)
                                    gapSeconds = playerGapToLeader - targetGapToLeader; 
                                } else { // Pilote Derrière : (Temps du Pilote Derrière) - (Temps du Joueur)
                                    gapSeconds = targetGapToLeader - playerGapToLeader;
                                }
                                
                                const className = gapSeconds >= 0 ? 'gap-plus' : 'gap-minus';
                                
                                // On affiche l'écart relatif (l'affichage du signe est inversé pour 'isAhead' si on interprète la perte/gain de temps)
                                return `<span class="${className}">${gapSeconds.toFixed(3)}s</span>`;
                            }
                            return 'N/A';
                        };
                        
                        summaryHtml = `
                            <div class="summary-table-wrapper">
                                <table class="summary-table">
                                    <thead>
                                        <tr>
                                            <th>${lang.name_driver_ahead}</th>
                                            <th>${playerName}</th>
                                            <th>${lang.name_driver_behind}</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        <tr>
                                            <td>
                                                ${driverAhead ? `
                                                    <div>${driverAhead.Name}</div>
                                                    <div>${getGapText(driverAhead, true)}</div>
                                                ` : 'N/A'}
                                            </td>
                                            <td class="player-summary">
                                                <div>${lang.last_lap}: ${formatSeconds(playerData.LastLapTime)}</div>
                                                <div>
                                                    S1: ${playerData.LastLapS1 ? playerData.LastLapS1.toFixed(3) + 's' : 'N/A'} |
                                                    S2: ${playerData.LastLapS2 ? playerData.LastLapS2.toFixed(3) + 's' : 'N/A'} |
                                                    S3: ${playerData.LastLapS3 ? playerData.LastLapS3.toFixed(3) + 's' : 'N/A'}
                                                </div>
                                            </td>
                                            <td>
                                                ${driverBehind ? `
                                                    <div>${driverBehind.Name}</div>
                                                    <div>${getGapText(driverBehind, false)}</div>
                                                ` : 'N/A'}
                                            </td>
                                        </tr>
                                    </tbody>
                                </table>
                            </div>
                        `;
                    }
                    
                    // --- 4. Injection finale ---
                    container.innerHTML = summaryHtml + tableHtml;

                } else {
                    sessionHeader.innerHTML = '';
                    container.innerHTML = `<p id="loading-message" class="no-session-message">${lang.no_live_session}</p>`;
                }
            })
            .catch(error => {
                console.error('Erreur lors du rafraîchissement des données live:', error);
                // Si la page est déjà vide, n'affichons rien. Sinon, laissons le dernier tableau.
                if (container.querySelector('#loading-message')) {
                    sessionHeader.innerHTML = '';
                    container.innerHTML = `<p id="loading-message" class="no-session-message">${lang.no_live_session}</p>`;
                }
            })
            .finally(() => {
                // Répéter la requête après 3 secondes
                setTimeout(updateLiveTiming, 3000);
            });
    }

    // Lancer la première mise à jour après le chargement du DOM
    document.addEventListener('DOMContentLoaded', updateLiveTiming);
    </script>
</body>
</html>