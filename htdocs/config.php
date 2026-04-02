<?php
require_once 'includes/init.php';

if (isset($_GET['suggest_name'])) {
    header('Content-Type: application/json');
    $dir = $_GET['dir'] ?? null;
    $name = suggestPlayerName($dir);
    echo json_encode(['name' => $name]);
    exit;
}

$configFileJson = USER_CONFIG_PATH; // Le fichier cible est maintenant celui de l'utilisateur dans AppData
$message = $_SESSION['message'] ?? '';
$messageType = $_SESSION['messageType'] ?? '';

// On efface le message de la session pour qu'il n'apparaisse qu'une seule fois
if (isset($_SESSION['message'])) {
    unset($_SESSION['message']);
    unset($_SESSION['messageType']);
}

// --- INITIALISATION DE LA VARIABLE DE PURGE ---
$purge_type = $_POST['purge_type'] ?? 'global';


// --- TRAITEMENT DES FORMULAIRES ---
if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (isset($_POST['clear_cache_manual'])) {
        if (clearCache()) {
            $message = $lang['clear_cache_success_message'];
            $messageType = 'success';
        }
    }
    elseif (isset($_POST['purge_empty_sessions'])) {
        $purge_type = $_POST['purge_type'] ?? 'global';
        $deleted_count = purgeEmptySessions($purge_type);
        if ($deleted_count > 0) {
            $message = sprintf($lang['purge_success_message'], $deleted_count);
            $messageType = 'success';
            clearCache();
        } else {
            $message = $lang['purge_none_message'];
            $messageType = 'info';
        }
    }
    elseif (isset($_POST['save_config'])) {
        // Validation for empty fields
        if (empty(trim($_POST['player_name'])) || empty(trim($_POST['results_dir']))) {
            $message = $lang['message_error_empty_fields'];
            $messageType = 'error';
        } else {
            $newConfig = [
                'player_name' => trim($_POST['player_name'] ?? $config['player_name']),
                'results_dir' => trim($_POST['results_dir'] ?? $config['results_dir']),
                'timezone'    => $_POST['timezone'] ?? $config['timezone'],
                'language'    => $_POST['lang'] ?? $config['language'],
                'theme'       => $config['theme'], // On préserve la valeur déjà chargée
                'default_since_version' => $_POST['default_since_version'] ?? $config['default_since_version'],
            ];

            // Priorité 1: Vérifier si le dossier est valide
            if (!empty($newConfig['results_dir']) && !is_dir($newConfig['results_dir'])) {
                $message = $lang['message_warning_dir'] . "\n" . htmlspecialchars($newConfig['results_dir']) . "\n\n" . $lang['message_check_path'];
                $messageType = 'error';
            }
            // Si le dossier est valide, on continue
            else {
                // Priorité 2: Vérifier s'il y a des changements à sauvegarder
                if ($newConfig !== $config) {
                    $configFileDir = dirname($configFileJson);
                    if (!is_dir($configFileDir)) {
                        @mkdir($configFileDir, 0777, true);
                    }

                    if (!is_writable($configFileDir)) {
                        $message = $lang['error_write_permission'] . htmlspecialchars($configFileDir) . $lang['check_permissions'];
                        $messageType = 'error';
                    } else {
                        $json_to_write = json_encode($newConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES);
                        if (@file_put_contents($configFileJson, $json_to_write)) {
                            clearCache();
                            $message = $lang['message_success'];
                            $messageType = 'success';
                            $config = $newConfig; // Mettre à jour la config pour la page actuelle
                        } else {
                            $error = error_get_last();
                            $message = $lang['error_saving_json'] . $lang['error_detail'] . ($error['message'] ?? $lang['unknown_error']);
                            $messageType = 'error';
                        }
                    }
                } else {
                    // S'il n'y a pas de changements et que le dossier est valide
                    $message = $lang['message_no_changes'];
                    $messageType = 'info';
                }
            }
        }
    }
}

$currentConfig = $config;
$timezones = DateTimeZone::listIdentifiers();

$possiblePaths = [
    'C:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
    'D:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
    'E:\\Program Files (x86)\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
    'C:\\Program Files\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
    'D:\\Program Files\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
    'E:\\Program Files\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
	'C:\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
	'D:\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
    'E:\\Steam\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
	'C:\\Games\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
	'D:\\Games\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
	'E:\\Games\\steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results',
];
$suggestedPath = '';
foreach ($possiblePaths as $path) {
    if (is_dir($path)) {
        $suggestedPath = $path;
        break;
    }
}

$suggestedName = suggestPlayerName($suggestedPath);

$return_button_text = $lang['btn_launch'];
if (isset($_SERVER['HTTP_REFERER']) && str_contains($_SERVER['HTTP_REFERER'], 'index.php')) {
    $return_button_text = $lang['btn_return'];
}

// --- Préparation des variables pour l'indicateur de mise à jour du footer ---

$update_available_footer = false;
$latest_version_footer = APP_VERSION;

if (defined('VERSION_CHECK_URL') && !empty(VERSION_CHECK_URL)) {
    $remote_version_data = get_remote_version_data(VERSION_CHECK_URL);
    if ($remote_version_data && isset($remote_version_data['latest_version']) && version_compare($remote_version_data['latest_version'], APP_VERSION, '>')) {
        $update_available_footer = true;
        $latest_version_footer = $remote_version_data['latest_version'];
    }
}
?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>" data-theme="<?php echo $current_theme; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $lang['config_title']; ?> - LMU Stats Viewer</title>
    <link rel="icon" href="logos/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="css/style.css?v=<?php echo @filemtime('css/style.css'); ?>">
</head>
<body>
    <div class="config-panel">
        <div class="config-logo-container">
            <a href="index.php?lang=<?php echo $current_lang; ?>"><img src="logos/lmu.png" alt="<?php echo $lang['player_avatar_alt']; ?>" id="page-logo"></a>
        </div>
        
        <h1>⚙️ <?php echo $lang['config_title']; ?></h1>
        <p class="subtitle"><?php echo $lang['subtitle']; ?></p>

		<div id="update-notification-container"></div>

        <?php if ($message): ?>
        <div class="message <?php echo $messageType; ?>">
            <?php echo nl2br(htmlspecialchars($message)); ?>
        </div>
        <?php endif; ?>
        <form method="post">
		    <div class="form-group">
                <label for="lang-select"><?php echo $lang['form_group_language']; ?></label>
                <div class="current-label"><?php echo $lang['current_label']; ?></div>
                <div class="current-value">
                     <?php 
                        $lang_map = [
                            'fr' => '<img src="flags/fr.png" alt="Français" style="height:1em; vertical-align:middle;"> ' . $lang['lang_fr'], 
                            'en' => '<img src="flags/gb.png" alt="English" style="height:1em; vertical-align:middle;"> ' . $lang['lang_en'], 
                            'es' => '<img src="flags/es.png" alt="Español" style="height:1em; vertical-align:middle;"> ' . $lang['lang_es'], 
                            'de' => '<img src="flags/de.png" alt="Deutsch" style="height:1em; vertical-align:middle;"> ' . $lang['lang_de']
                        ];
                        echo $lang_map[$current_lang] ?? $current_lang;
                     ?>
                </div>
                 <select id="lang-select" name="lang" onchange="this.form.submit()">
                    <option value="fr" <?php echo ($current_lang === 'fr') ? 'selected' : ''; ?>><?php echo $lang['lang_fr']; ?></option>
                    <option value="en" <?php echo ($current_lang === 'en') ? 'selected' : ''; ?>><?php echo $lang['lang_en']; ?></option>
                    <option value="es" <?php echo ($current_lang === 'es') ? 'selected' : ''; ?>><?php echo $lang['lang_es']; ?></option>
                    <option value="de" <?php echo ($current_lang === 'de') ? 'selected' : ''; ?>><?php echo $lang['lang_de']; ?></option>
                </select>
                 <div class="help-text"><?php echo $lang['help_text_language']; ?></div>
            </div>
            
            <div class="form-group">
                <label for="player_name"><?php echo $lang['form_group_player_name']; ?></label>
                <div class="current-label"><?php echo $lang['current_label']; ?></div>
                <div class="current-value">
                    <?php echo !empty($currentConfig['player_name']) ? htmlspecialchars($currentConfig['player_name']) : '<em>' . $lang['current_value'] . '</em>'; ?>
                </div>
					<?php if (!empty($suggestedName) && $suggestedName !== $currentConfig['player_name']): ?>
                <div class="suggested-path suggestion-bubble">
                    <strong><?php echo $lang['suggested_player_name'] ?? 'Suggested player name:'; ?></strong>
                    <span class="use-suggestion" data-target-id="player_name" data-suggestion="<?php echo htmlspecialchars($suggestedName); ?>" style="color: green;">➕</span>
                    <br>
                    <code><?php echo htmlspecialchars($suggestedName); ?></code>
                </div>
                <?php endif; ?>
                <input type="text" id="player_name" name="player_name"
                       value="<?php echo htmlspecialchars($currentConfig['player_name']); ?>">
                <div class="help-text"><?php echo $lang['help_text_player_name']; ?></div>
            </div>
            <div class="form-group">
                <label for="results_dir"><?php echo $lang['form_group_results_dir']; ?></label>
                <div class="current-label"><?php echo $lang['current_label']; ?></div>
                <div class="current-value">
                    <?php echo !empty($currentConfig['results_dir']) ? htmlspecialchars($currentConfig['results_dir']) : '<em>' . $lang['current_value'] . '</em>'; ?>
                </div>
                <?php if (!empty($suggestedPath) && $suggestedPath !== $currentConfig['results_dir']): ?>
                <div class="suggested-path suggestion-bubble">
                    <strong><?php echo $lang['suggested_path']; ?></strong>
                    <span class="use-suggestion" data-target-id="results_dir" data-suggestion="<?php echo htmlspecialchars($suggestedPath); ?>" style="color: green;">➕</span>
                    <br>
                    <code><?php echo htmlspecialchars($suggestedPath); ?></code>
                </div>
                <?php endif; ?>
                <input type="text" id="results_dir" name="results_dir"
                       value="<?php echo htmlspecialchars($currentConfig['results_dir']); ?>">
                <div class="help-text"><?php echo $lang['help_text_results_dir']; ?></div>
            </div>
            <div class="form-group">
                <label for="timezone"><?php echo $lang['form_group_timezone']; ?></label>
                <div class="current-label"><?php echo $lang['current_label']; ?></div>
                <div class="current-value">
                    <?php echo htmlspecialchars($currentConfig['timezone']); ?>
                </div>
                <select id="timezone" name="timezone">
                    <option value="">-- <?php echo $lang['select_timezone']; ?> --</option>
                    <?php foreach($timezones as $tz): ?>
                        <option value="<?php echo $tz; ?>" <?php if($tz === $currentConfig['timezone']) echo 'selected'; ?>><?php echo $tz; ?></option>
                    <?php endforeach; ?>
                </select>
                <div class="help-text"><?php echo $lang['help_text_timezone']; ?></div>
            </div>
            <div class="form-group">
                <label for="default_since_version"><?php echo $lang['form_group_default_version'] ?? 'Default "Since Version" Filter'; ?></label>
                <div class="current-label"><?php echo $lang['current_label']; ?></div>
                <div class="current-value">
                    <?php
                        $default_version_display = $currentConfig['default_since_version'] ?? '1.0000';
                        if ($default_version_display === 'all') {
                            echo htmlspecialchars($lang['all_fem']);
                        } else {
                            echo '≥ ' . htmlspecialchars($default_version_display);
                        }
                    ?>
                </div>
                <select id="default_since_version" name="default_since_version">
                    <option value="all" <?php if (($currentConfig['default_since_version'] ?? '') === 'all') echo 'selected'; ?>><?php echo $lang['all_fem']; ?></option>
                    <?php
                    // This assumes $uniqueVersionsForFilter is available from index.php logic.
                    // We need to get the versions here as well.
                    $all_versions = [];
                    $events_for_versions = get_race_events();
                    foreach ($events_for_versions as $event_files) {
                        foreach ($event_files as $file_data) {
                            $xml = $file_data['xml'];
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
                                $all_versions[$gameVersion] = true;
                            }
                        }
                    }
                    $uniqueVersions = array_keys($all_versions);
                    usort($uniqueVersions, 'version_compare');
                    $uniqueVersions = array_reverse($uniqueVersions);
                    foreach ($uniqueVersions as $version): ?>
                        <option value="<?php echo htmlspecialchars($version); ?>" <?php if (($currentConfig['default_since_version'] ?? '') === $version) echo 'selected'; ?>>
                            ≥ <?php echo htmlspecialchars($version); ?>
                        </option>
                    <?php endforeach; ?>
                </select>
                <div class="help-text"><?php echo $lang['help_text_default_version'] ?? 'Set the default value for the version filter on the main page.'; ?></div>
            </div>
            <div class="button-group">
                <button type="submit" name="save_config" class="btn-primary"><?php echo $lang['btn_save']; ?></button>
                <?php if (!empty($currentConfig['player_name']) && !empty($currentConfig['results_dir'])): ?>
                    <a href="index.php?lang=<?php echo $current_lang; ?>" class="btn btn-secondary"><?php echo $return_button_text; ?></a>
                <?php else: ?>
                    <a class="btn btn-secondary" disabled title="<?php echo $lang['message_error_empty_fields']; ?>"><?php echo $return_button_text; ?></a>
                <?php endif; ?>
            </div>
        </form>
        
        <div class="tips">
            <h3><?php echo $lang['tips_title']; ?></h3>
            <ul>
                <li><?php echo $lang['tip_player_name']; ?></li>
                <li><?php echo $lang['tip_results_dir']; ?></li>
                <li><?php echo $lang['tip_default_version'] ?? ''; ?></li>
                <li><?php echo $lang['tip_cache']; ?></li>
            </ul>
        </div>

        <hr class="config-separator">

        <form method="post">
             <div class="form-group">
                <label><?php echo $lang['clear_cache_button']; ?></label>
                <div class="help-text"><?php echo $lang['clear_cache_help']; ?></div>
                <div class="button-group" style="justify-content: flex-start; margin-top: 10px;">
                    <button type="submit" name="clear_cache_manual" class="btn-primary">🗑️ <?php echo $lang['clear_cache_button']; ?></button>
                </div>
            </div>
        </form>

        <form method="post">
             <div class="form-group">
                <label><?php echo $lang['purge_empty_sessions_button']; ?></label>
                 <div class="help-text"><?php echo $lang['purge_empty_sessions_help']; ?></div>
                 <div class="form-group" style="margin-top: 15px;">
                    <label for="purge_type"><?php echo $lang['purge_type_label'] ?? 'Type de purge'; ?></label>
                    <select id="purge_type" name="purge_type">
                        <option value="global" <?php echo ($purge_type === 'global') ? 'selected' : ''; ?>><?php echo $lang['purge_type_global'] ?? 'Globale'; ?></option>
                        <option value="player" <?php echo ($purge_type === 'player') ? 'selected' : ''; ?>><?php echo $lang['purge_type_player'] ?? 'Joueur'; ?></option>
                    </select>
                 </div>
                <div class="button-group" style="justify-content: flex-start; margin-top: 20px;">
                     <button type="submit" name="purge_empty_sessions" class="btn-primary" onclick="return confirm('<?php echo $lang['confirm_purge']; ?>');">
                        <span id="purge-button-text">🧹 <?php echo $lang['purge_empty_sessions_button']; ?></span>
                     </button>
                </div>
            </div>
        </form>

    </div>
<?php require 'includes/footer.php'; ?>
<script>
document.addEventListener('DOMContentLoaded', function() {
    const resultsDirInput = document.getElementById('results_dir');
    const playerNameInput = document.getElementById('player_name');
    const suggestionContainer = document.querySelector('.suggested-path.suggestion-bubble');

    resultsDirInput.addEventListener('input', function() {
        const dir = this.value;
        fetch(`config.php?suggest_name=1&dir=${encodeURIComponent(dir)}`)
            .then(response => response.json())
            .then(data => {
                if (data.name) {
                    const suggestionBubble = document.createElement('div');
                    suggestionBubble.className = 'suggested-path suggestion-bubble';
                    suggestionBubble.innerHTML = `
                        <strong><?php echo $lang['suggested_player_name'] ?? 'Suggested player name:'; ?></strong>
                        <span class="use-suggestion" data-target-id="player_name" data-suggestion="${data.name}" style="color: green;">➕</span>
                        <br>
                        <code>${data.name}</code>
                    `;
                    
                    const existingBubble = document.querySelector('.suggested-path.suggestion-bubble');
                    if (existingBubble) {
                        existingBubble.replaceWith(suggestionBubble);
                    } else {
                        playerNameInput.parentElement.insertBefore(suggestionBubble, playerNameInput);
                    }

                    suggestionBubble.querySelector('.use-suggestion').addEventListener('click', function() {
                        playerNameInput.value = this.dataset.suggestion;
                        suggestionBubble.remove();
                    });
                }
            });
    });

    // --- 1. Logique pour les suggestions (le "petit plus") ---
    const useSuggestionTitle = "<?php echo addslashes($lang['js_use_suggestion'] ?? 'Use this suggestion'); ?>";
    document.querySelectorAll('.use-suggestion').forEach(function(button) {
        button.style.cursor = 'pointer';
        button.style.marginLeft = '5px';
        button.title = useSuggestionTitle;

        button.addEventListener('click', function() {
            const targetId = this.dataset.targetId;
            const suggestion = this.dataset.suggestion;
            const targetInput = document.getElementById(targetId);

            if (targetInput) {
                targetInput.value = suggestion;
            }
            
            this.closest('.suggested-path').style.display = 'none';
        });
    });

    // --- 2. Logique pour le compteur de la purge ---
    const globalCount = <?php echo countSessionsToPurge('global'); ?>;
    const playerCount = <?php echo countSessionsToPurge('player'); ?>;
    const purgeButtonText = document.getElementById('purge-button-text');
    const purgeTypeSelect = document.getElementById('purge_type');

    function updatePurgeCount() {
        if (!purgeButtonText || !purgeTypeSelect) return;
        const selectedType = purgeTypeSelect.value;
        let count = (selectedType === 'global') ? globalCount : playerCount;
        purgeButtonText.innerHTML = `🧹 <?php echo addslashes($lang['purge_empty_sessions_button']); ?> (${count})`;
    }

    if (purgeTypeSelect) {
        purgeTypeSelect.addEventListener('change', updatePurgeCount);
    }
    // Mettre à jour le compteur au chargement initial
    updatePurgeCount();
});
</script>

</body>
</html>
