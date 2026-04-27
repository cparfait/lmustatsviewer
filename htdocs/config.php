<?php
require_once 'includes/init.php';
require_once 'includes/db.php';
require_once 'includes/indexer.php';

$selfScript = basename($_SERVER['PHP_SELF']); // test.php ou config.php après remplacement

if (isset($_GET['suggest_name'])) {
    header('Content-Type: application/json');
    $dir = $_GET['dir'] ?? null;
    echo json_encode(['name' => suggestPlayerName($dir)]);
    exit;
}

$configFileJson  = USER_CONFIG_PATH;
$is_first_launch = isset($_GET['first_launch']);
$message         = $_SESSION['message']     ?? '';
$messageType     = $_SESSION['messageType'] ?? '';

if ($is_first_launch && empty($message)) {
    $message     = $lang['first_launch_message'] ?? 'Bienvenue ! Commencez par configurer le dossier de résultats LMU.';
    $messageType = 'info';
}
if (isset($_SESSION['message'])) { unset($_SESSION['message'], $_SESSION['messageType']); }

if (empty($_SESSION['csrf_token'])) {
    $_SESSION['csrf_token'] = bin2hex(random_bytes(32));
}
$csrf_token = $_SESSION['csrf_token'];

$purge_type = $_POST['purge_type'] ?? 'global';

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    if (!isset($_POST['csrf_token']) || !hash_equals($csrf_token, $_POST['csrf_token'])) {
        http_response_code(403);
        exit('Requête invalide.');
    }

    if (isset($_POST['clear_cache_manual'])) {
        if (clearCache()) { $message = $lang['clear_cache_success_message']; $messageType = 'success'; }

    } elseif (isset($_POST['reindex_db'])) {
        $result  = reindex_all();
        $total   = $result['added'] + $result['updated'];
        $message = sprintf('Base de données réindexée : %d fichiers traités, %d supprimés.', $total, $result['removed']);
        $messageType = 'success';

    } elseif (isset($_POST['purge_empty_sessions'])) {
        $purge_type   = $_POST['purge_type'] ?? 'global';
        $deleted_count = purgeEmptySessions($purge_type);
        if ($deleted_count > 0) {
            $message = sprintf($lang['purge_success_message'], $deleted_count);
            $messageType = 'success';
            clearCache(); reindex_all();
        } else { $message = $lang['purge_none_message']; $messageType = 'info'; }

    } elseif (isset($_POST['save_config'])) {
        if (empty(trim($_POST['player_name'])) || empty(trim($_POST['results_dir']))) {
            $message = $lang['message_error_empty_fields']; $messageType = 'error';
        } else {
            $newConfig = [
                'player_name'           => trim($_POST['player_name']           ?? $config['player_name']),
                'results_dir'           => trim($_POST['results_dir']           ?? $config['results_dir']),
                'timezone'              => $_POST['timezone']                   ?? $config['timezone'],
                'language'              => $_POST['lang']                       ?? $config['language'],
                'theme'                 => $config['theme'],
                'default_since_version' => $_POST['default_since_version']     ?? $config['default_since_version'],
            ];
            if (!empty($newConfig['results_dir']) && !is_dir($newConfig['results_dir'])) {
                $message = $lang['message_warning_dir'] . "\n" . htmlspecialchars($newConfig['results_dir']) . "\n\n" . ($lang['message_check_path'] ?? '');
                $messageType = 'error';
            } elseif ($newConfig !== $config) {
                $configFileDir = dirname($configFileJson);
                if (!is_dir($configFileDir)) @mkdir($configFileDir, 0777, true);
                if (!is_writable($configFileDir)) {
                    $message = $lang['error_write_permission'] . htmlspecialchars($configFileDir) . ($lang['check_permissions'] ?? '');
                    $messageType = 'error';
                } else {
                    if (@file_put_contents($configFileJson, json_encode($newConfig, JSON_PRETTY_PRINT | JSON_UNESCAPED_SLASHES))) {
                        clearCache(); $message = $lang['message_success']; $messageType = 'success'; $config = $newConfig;
                    } else {
                        $err     = error_get_last();
                        $message = $lang['error_saving_json'] . ($lang['error_detail'] ?? '') . ($err['message'] ?? ($lang['unknown_error'] ?? ''));
                        $messageType = 'error';
                    }
                }
            } else { $message = $lang['message_no_changes']; $messageType = 'info'; }
        }
    }
}

$currentConfig = $config;
$timezones     = DateTimeZone::listIdentifiers();

$lmuSubPath   = 'steamapps\\common\\Le Mans Ultimate\\UserData\\Log\\Results';
$possiblePaths = [];
// Variables d'environnement Windows (couvrent les installs Steam dans Program Files)
foreach (['PROGRAMFILES', 'PROGRAMFILES(X86)'] as $envVar) {
    $dir = getenv($envVar);
    if ($dir) $possiblePaths[] = $dir . '\\Steam\\' . $lmuSubPath;
}
// Lettres de lecteur courantes pour les bibliothèques Steam déportées
foreach (['C', 'D', 'E', 'F', 'G', 'H'] as $drive) {
    foreach (['Steam', 'SteamLibrary', 'Games'] as $dir) {
        $possiblePaths[] = $drive . ':\\' . $dir . '\\' . $lmuSubPath;
    }
}
$possiblePaths = array_unique($possiblePaths);
$suggestedPath = '';
foreach ($possiblePaths as $path) { if (is_dir($path)) { $suggestedPath = $path; break; } }
$suggestedName = suggestPlayerName($suggestedPath);

$return_button_text = $lang['btn_launch'];
if (isset($_SERVER['HTTP_REFERER']) && str_contains($_SERVER['HTTP_REFERER'], 'index.php')) {
    $return_button_text = $lang['btn_return'];
}

// Versions depuis SQLite (rapide, sans parser les XML)
$all_versions = [];
foreach (get_db()->query("SELECT DISTINCT game_version FROM player_sessions
                          WHERE best_lap IS NOT NULL AND game_version NOT IN ('0.0','0.0000','')
                          ORDER BY game_version") as $r) {
    $all_versions[] = $r['game_version'];
}
$all_versions = sort_versions_desc($all_versions);
?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>" data-theme="<?php echo $current_theme; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $lang['config_title']; ?> — LMU Stats Viewer</title>
    <link rel="icon" href="logos/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="css/style.css?v=<?php echo @filemtime('css/style.css'); ?>">
    <style>
        /* ── Échelle typographique ───────────────────────────────────── */
        .config-panel {
            --fs-title:  1.35em;   /* Titre H1                          */
            --fs-label:  0.9em;    /* Labels grille, titres de section  */
            --fs-body:   0.875em;  /* Inputs, boutons, texte courant    */
            --fs-small:  0.8em;    /* Aide, tooltip, secondaire         */
        }

        /* ── Surcharge largeur / espacement du panel ─────────────────── */
        .config-panel {
            max-width: 920px;
            margin: 30px auto;
            padding: 32px 36px 36px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 1rem;
        }

        /* ── En-tête logo + titre ─────────────────────────────────────── */
        .cfg-header {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            padding-bottom: 22px;
            margin-bottom: 24px;
        }
        .cfg-header > a {
            position: absolute;
            left: 0;
            display: flex;
            align-items: center;
        }
        .cfg-header-logo {
            height: 64px;
            width: auto;
        }
        .cfg-header-text { text-align: center; }
        .cfg-header-text h1      { margin: 0 0 3px; font-size: var(--fs-title); }
        .cfg-header-text .subtitle { margin: 0; font-size: var(--fs-small); color: var(--text-color-light); }

        /* ── Titre de section ─────────────────────────────────────────── */
        .cfg-section-title {
            margin: 0 0 12px;
            font-size: var(--fs-small);
            font-weight: 700;
            text-transform: uppercase;
            letter-spacing: .08em;
            color: var(--text-color-light);
        }

        /* ── Grille paramètres (2 colonnes) ───────────────────────────── */
        .cfg-grid {
            display: grid;
            grid-template-columns: 240px 1fr;
            border: 1px solid #004A7C;
            border-radius: 8px;
            overflow: visible;          /* laisse les tooltips déborder */
            margin-bottom: 20px;
            box-shadow: 0 2px 8px var(--shadow-color-light);
        }
        /* Arrondir les cellules d'angle (overflow:visible ne clippe plus) */
        .cfg-row:first-child .cfg-label { border-top-left-radius: 7px; }
        .cfg-row:first-child .cfg-input { border-top-right-radius: 7px; }
        .cfg-row:last-child  .cfg-label { border-bottom-left-radius: 7px; }
        .cfg-row:last-child  .cfg-input { border-bottom-right-radius: 7px; }

        .cfg-row { display: contents; }
        .cfg-row:not(:last-child) .cfg-label { border-bottom: 1px solid rgba(255,255,255,0.45); }
        .cfg-row:not(:last-child) .cfg-input { border-bottom: 1px solid var(--border-color); }

        .cfg-label {
            position: relative;
            padding: 14px 18px;
            background: #004A7C;
            display: flex;
            align-items: center;
            gap: 8px;
            cursor: default;
        }
        .cfg-label strong {
            font-size: var(--fs-label);
            font-weight: 700;
            color: #fff;
            letter-spacing: .01em;
        }
        /* Icône ⓘ */
        .cfg-label::after {
            content: 'ⓘ';
            font-size: var(--fs-small);
            color: rgba(255,255,255,.45);
            flex-shrink: 0;
            transition: color .15s;
            margin-left: auto;
            padding-left: 4px;
        }
        .cfg-label:hover::after { color: rgba(255,255,255,.85); }

        /* Bulle tooltip */
        .cfg-label::before {
            content: attr(data-tip);
            position: absolute;
            left: calc(100% + 14px);
            top: 50%;
            transform: translateY(-50%);
            width: 230px;
            padding: 10px 13px;
            background: #1c2f42;
            color: rgba(255,255,255,.92);
            font-size: var(--fs-small);
            line-height: 1.55;
            border-radius: 8px;
            box-shadow: 0 4px 16px rgba(0,0,0,.30);
            white-space: normal;
            z-index: 200;
            pointer-events: none;
            opacity: 0;
            transition: opacity .18s ease;
        }
        /* Flèche gauche de la bulle */
        .cfg-label:hover::before { opacity: 1; }
        /* Triangle */
        .cfg-label .tip-arrow {
            position: absolute;
            left: 100%;
            top: 50%;
            transform: translateY(-50%);
            width: 0; height: 0;
            border: 7px solid transparent;
            border-right-color: #1c2f42;
            pointer-events: none;
            opacity: 0;
            transition: opacity .18s ease;
            z-index: 201;
        }
        .cfg-label:hover .tip-arrow { opacity: 1; }

        /* Masquer le texte <em> (contenu dans data-tip uniquement) */
        .cfg-label em { display: none; }

        /* Conteneurs de suggestion vides : pas de place occupée */
        [id^="bubble-"]:empty { display: none; }

        .cfg-input {
            padding: 12px 16px;
            display: flex;
            flex-direction: column;
            justify-content: center;
            gap: 8px;
        }
        .cfg-input input[type="text"],
        .cfg-input select {
            width: 100%;
            padding: 7px 10px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            font-size: var(--fs-body);
            background: var(--card-bg-color);
            color: var(--text-color);
            box-sizing: border-box;
            transition: border-color .2s, box-shadow .2s;
        }
        .cfg-input input[type="text"]:focus,
        .cfg-input select:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 3px var(--shadow-color-focus);
        }

        /* Suggestion bubble compacte (réutilise .suggestion-bubble de style.css) */
        .cfg-input .suggestion-bubble {
            padding: 7px 12px;
            margin: 0;
            font-size: var(--fs-small);
            display: flex;
            align-items: center;
            gap: 8px;
            flex-wrap: wrap;
        }
        .cfg-input .suggestion-bubble strong { white-space: nowrap; }
        .cfg-input .suggestion-bubble code   { word-break: break-all; }
        .use-suggestion { cursor: pointer; font-size: 1.1em; line-height: 1; }

        /* ── Champ avec bouton détecter ──────────────────────────────── */
        .cfg-input-row {
            display: flex;
            gap: 6px;
            align-items: stretch;
        }
        .cfg-input-row input[type="text"] { flex: 1; min-width: 0; }
        .btn-detect {
            flex-shrink: 0;
            width: auto !important;
            padding: 0 10px;
            border: 1px solid var(--border-color);
            border-radius: 6px;
            background: var(--bg-color);
            color: var(--text-color-light);
            cursor: pointer;
            font-size: var(--fs-body);
            transition: border-color .15s, color .15s, background .15s;
            white-space: nowrap;
        }
        .btn-detect:hover {
            border-color: var(--primary-color);
            color: var(--primary-color);
            background: var(--row-hover-bg-color);
        }

        /* ── Sélecteur de langue avec drapeaux ───────────────────────── */
        .cfg-lang-picker {
            display: flex;
            gap: 8px;
            flex-wrap: wrap;
        }
        .cfg-lang-btn {
            display: inline-flex;
            align-items: center;
            gap: 6px;
            padding: 6px 12px;
            border: 1.5px solid var(--border-color);
            border-radius: 6px;
            font-size: var(--fs-body);
            font-weight: 500;
            color: var(--text-color);
            background: var(--card-bg-color);
            cursor: pointer;
            text-decoration: none;
            transition: border-color .15s, background .15s;
        }
        .cfg-lang-btn:hover { border-color: var(--primary-color); background: var(--row-hover-bg-color); }
        .cfg-lang-btn.active {
            border-color: var(--primary-color);
            background: var(--primary-color);
            color: #fff;
            font-weight: 700;
        }
        .cfg-lang-btn img { height: 14px; border-radius: 2px; }

        /* ── Actions formulaire ───────────────────────────────────────── */
        .cfg-actions {
            display: flex;
            justify-content: flex-end;
            flex-wrap: wrap;
            gap: 10px;
            margin-bottom: 26px;
        }

        /* Surcharge locale des boutons pour coller au design bleu */
        .cfg-actions button,
        .cfg-actions .btn {
            padding: 9px 22px;
            font-size: var(--fs-body);
            font-weight: 600;
            border-radius: 7px;
            letter-spacing: .01em;
            transition: background .18s, box-shadow .18s, color .18s, border-color .18s;
        }
        .cfg-actions .btn-primary {
            background: linear-gradient(135deg, #004A7C 0%, var(--header-bg-color) 100%);
            color: #fff;
            border: 2px solid #004A7C;
            box-shadow: 0 2px 6px rgba(0, 74, 124, .35);
        }
        .cfg-actions .btn-primary:hover {
            background: linear-gradient(135deg, #003d66 0%, #0a75b8 100%);
            border-color: #003d66;
            box-shadow: 0 4px 14px rgba(0, 74, 124, .45);
            transform: none;
        }
        .cfg-actions .btn-secondary {
            background: linear-gradient(135deg, #28a745 0%, #218838 100%);
            color: #fff;
            border: 2px solid transparent;
            box-shadow: 0 2px 6px rgba(40, 167, 69, .25);
        }
        .cfg-actions .btn-secondary:hover {
            background: linear-gradient(135deg, #218838 0%, #1a7a2e 100%);
            color: #fff;
            box-shadow: 0 4px 12px rgba(40, 167, 69, .35);
            transform: none;
        }
        /* Bouton désactivé */
        .cfg-actions .btn-secondary[style*="opacity"] {
            background: var(--border-color);
            border-color: transparent;
            color: var(--text-color-light);
            box-shadow: none;
        }

        /* ── Conseils (accordéon) ─────────────────────────────────────── */
        .cfg-tips {
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
            margin-bottom: 28px;
        }
        .cfg-tips summary {
            padding: 10px 16px;
            background: var(--bg-color);
            cursor: pointer;
            font-weight: 700;
            font-size: var(--fs-small);
            color: var(--text-color-light);
            text-transform: uppercase;
            letter-spacing: .07em;
            list-style: none;
            display: flex;
            align-items: center;
            gap: 6px;
            user-select: none;
        }
        .cfg-tips summary::-webkit-details-marker { display: none; }
        .cfg-tips summary::after { content: '▸'; margin-left: auto; transition: transform .2s; }
        .cfg-tips[open] summary::after { transform: rotate(90deg); }
        .cfg-tips ul {
            margin: 0;
            padding: 12px 20px 12px 36px;
            font-size: var(--fs-body);
            color: var(--text-color-light);
            line-height: 1.75;
        }

        /* ── Séparateur maintenance ───────────────────────────────────── */
        .cfg-sep {
            border: none;
            border-top: 1px solid var(--border-color);
            margin: 0 0 24px;
        }

        /* ── Maintenance 3 blocs inline ───────────────────────────────── */
        .cfg-maintenance {
            display: flex;
            border: 1px solid var(--border-color);
            border-radius: 8px;
            overflow: hidden;
        }
        .cfg-maction {
            flex: 1;
            min-width: 190px;
            padding: 16px 18px;
            display: flex;
            flex-direction: column;
            gap: 8px;
            border-right: 1px solid var(--border-color);
        }
        .cfg-maction:last-child { border-right: none; }
        .cfg-maction > label {
            font-size: var(--fs-label);
            font-weight: 700;
            color: #fff;
            background: var(--header-bg-color);
            margin: -16px -18px 0;
            padding: 8px 18px;
            letter-spacing: .03em;
            text-transform: uppercase;
            text-align: center;
        }
        .cfg-maction .mhelp    { font-size: var(--fs-small); color: var(--text-color-light); line-height: 1.45; flex: 1; }
        .cfg-maction .mrow     { display: flex; align-items: center; justify-content: center; gap: 8px; flex-wrap: wrap; margin-top: 4px; }
        .cfg-maction select {
            padding: 4px 8px;
            font-size: var(--fs-small);
            border: 1px solid var(--border-color);
            border-radius: 4px;
            background: var(--card-bg-color);
            color: var(--text-color);
        }
        .btn-maint {
            padding: 5px 13px;
            font-size: var(--fs-small); font-weight: 600;
            border: 1px solid var(--border-color);
            border-radius: 5px;
            cursor: pointer;
            background: var(--card-bg-color);
            color: var(--text-color);
            transition: background .15s;
            white-space: nowrap;
        }
        .btn-maint:hover        { background: var(--row-hover-bg-color); }
        .btn-maint.danger       { border-color: #c0392b; color: #c0392b; }
        .btn-maint.danger:hover { background: #fdf0ee; }
        [data-theme="dark"] .btn-maint.danger:hover { background: #3a1210; }


        /* ── Responsive ──────────────────────────────────────────────── */
        @media (max-width: 720px) {
            .config-panel { padding: 20px 16px 24px; margin: 12px; }

            /* Header : logo + titre empilés verticalement */
            .cfg-header { flex-direction: column; align-items: center; gap: 10px; padding-bottom: 16px; }
            .cfg-header > a { position: static; }
            .cfg-header-logo { height: 48px; }
            .cfg-header-text { text-align: center; }

            /* Grille : 1 colonne, pleine largeur */
            .cfg-grid { grid-template-columns: 1fr; width: 100%; }
            .cfg-label {
                background: none;
                padding: 12px 14px 4px;
                border-bottom: none !important;
                cursor: default;
            }
            /* Texte visible sur fond clair */
            .cfg-label strong { color: var(--text-color); }
            /* Masquer l'icône ⓘ et la bulle tooltip */
            .cfg-label::after  { display: none; }
            .cfg-label::before { display: none; }
            .cfg-label .tip-arrow { display: none; }
            .cfg-input { padding-top: 0; width: 100%; box-sizing: border-box; }
            /* Annule le width:100% que style.css impose à tous les boutons en mobile */
            .btn-detect { width: auto; flex-shrink: 0; }
            .cfg-actions { flex-direction: column; }
            .cfg-actions .btn, .cfg-actions button { width: 100%; text-align: center; }
            .cfg-maintenance { flex-direction: column; }
            .cfg-maction { border-right: none; border-bottom: 1px solid var(--border-color); }
            .cfg-maction:last-child { border-bottom: none; }
        }
    </style>
</head>
<body>
<div class="config-panel">

    <!-- ── En-tête ──────────────────────────────────────────────── -->
    <div class="cfg-header">
        <a href="index.php?lang=<?php echo $current_lang; ?>">
            <img src="logos/lmu.png" alt="LMU Stats Viewer" class="cfg-header-logo">
        </a>
        <div class="cfg-header-text">
            <h1>⚙️ <?php echo $lang['config_title']; ?></h1>
            <p class="subtitle"><?php echo $lang['subtitle']; ?></p>
        </div>
    </div>

    <!-- ── Notification de mise à jour (remplie par update-checker.js) ── -->
    <div id="update-notification-container"></div>

    <!-- ── Message flash ────────────────────────────────────────── -->
    <?php if ($message): ?>
    <div class="message <?php echo htmlspecialchars($messageType); ?>">
        <?php echo nl2br(htmlspecialchars($message)); ?>
    </div>
    <?php endif; ?>

    <!-- ════════════════════ Formulaire principal ═══════════════ -->
    <p class="cfg-section-title">⚙ <?php echo $lang['config_title']; ?></p>
    <form method="post">
        <input type="hidden" name="csrf_token" value="<?php echo $csrf_token; ?>">
        <div class="cfg-grid">

            <!-- Langue -->
            <div class="cfg-row">
                <div class="cfg-label" data-tip="<?php echo htmlspecialchars(strip_tags($lang['help_text_language'])); ?>">
                    <strong><?php echo $lang['form_group_language']; ?></strong>
                    <span class="tip-arrow"></span>
                </div>
                <div class="cfg-input">
                    <?php
                    $langOptions = [
                        'fr' => ['flag' => 'flags/fr.png', 'label' => $lang['lang_fr']],
                        'en' => ['flag' => 'flags/gb.png', 'label' => $lang['lang_en']],
                        'es' => ['flag' => 'flags/es.png', 'label' => $lang['lang_es']],
                        'de' => ['flag' => 'flags/de.png', 'label' => $lang['lang_de']],
                    ];
                    ?>
                    <div class="cfg-lang-picker">
                        <?php foreach ($langOptions as $code => $opt): ?>
                        <a href="?lang=<?php echo $code; ?>"
                           class="cfg-lang-btn<?php echo ($current_lang === $code) ? ' active' : ''; ?>">
                            <img src="<?php echo $opt['flag']; ?>" alt="<?php echo $code; ?>">
                            <?php echo $opt['label']; ?>
                        </a>
                        <?php endforeach; ?>
                    </div>
                </div>
            </div>

            <!-- Nom du joueur -->
            <div class="cfg-row">
                <div class="cfg-label" data-tip="<?php echo htmlspecialchars(strip_tags($lang['help_text_player_name'])); ?>">
                    <strong><?php echo $lang['form_group_player_name']; ?></strong>
                    <span class="tip-arrow"></span>
                </div>
                <div class="cfg-input">
                    <div id="bubble-player_name"></div>
                    <div class="cfg-input-row">
                        <input type="text" id="player_name" name="player_name"
                               value="<?php echo htmlspecialchars($currentConfig['player_name']); ?>">
                        <button type="button" class="btn-detect" id="btn-detect-name"
                                title="<?php echo $lang['suggested_player_name'] ?? 'Détecter le nom du joueur'; ?>">
                            🔍
                        </button>
                    </div>
                </div>
            </div>

            <!-- Dossier résultats -->
            <div class="cfg-row">
                <div class="cfg-label" data-tip="<?php echo htmlspecialchars(strip_tags($lang['help_text_results_dir'])); ?>">
                    <strong><?php echo $lang['form_group_results_dir']; ?></strong>
                    <span class="tip-arrow"></span>
                </div>
                <div class="cfg-input">
                    <div id="bubble-results_dir"></div>
                    <div class="cfg-input-row">
                        <input type="text" id="results_dir" name="results_dir"
                               value="<?php echo htmlspecialchars($currentConfig['results_dir']); ?>">
                        <button type="button" class="btn-detect" id="btn-detect-dir"
                                title="<?php echo $lang['suggested_path'] ?? 'Détecter le dossier LMU'; ?>">
                            🔍
                        </button>
                    </div>
                </div>
            </div>

            <!-- Fuseau horaire -->
            <div class="cfg-row">
                <div class="cfg-label" data-tip="<?php echo htmlspecialchars(strip_tags($lang['help_text_timezone'])); ?>">
                    <strong><?php echo $lang['form_group_timezone']; ?></strong>
                    <span class="tip-arrow"></span>
                </div>
                <div class="cfg-input">
                    <select id="timezone" name="timezone">
                        <option value="">-- <?php echo $lang['select_timezone']; ?> --</option>
                        <?php foreach ($timezones as $tz): ?>
                            <option value="<?php echo $tz; ?>" <?php if ($tz === $currentConfig['timezone']) echo 'selected'; ?>>
                                <?php echo $tz; ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>

            <!-- Version par défaut -->
            <div class="cfg-row">
                <div class="cfg-label" data-tip="<?php echo htmlspecialchars(strip_tags($lang['help_text_default_version'] ?? 'Version LMU affichée par défaut sur la page principale.')); ?>">
                    <strong><?php echo $lang['form_group_default_version'] ?? 'Filtre version par défaut'; ?></strong>
                    <span class="tip-arrow"></span>
                </div>
                <div class="cfg-input">
                    <select id="default_since_version" name="default_since_version">
                        <option value="all" <?php if (($currentConfig['default_since_version'] ?? '') === 'all') echo 'selected'; ?>>
                            <?php echo $lang['all_fem']; ?>
                        </option>
                        <?php foreach ($all_versions as $version): ?>
                            <option value="<?php echo htmlspecialchars($version); ?>"
                                    <?php if (($currentConfig['default_since_version'] ?? '') === $version) echo 'selected'; ?>>
                                ≥ <?php echo htmlspecialchars($version); ?>
                            </option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>

        </div><!-- /.cfg-grid -->

        <div class="cfg-actions">
            <button type="submit" name="save_config" class="btn-primary"><?php echo $lang['btn_save']; ?></button>
            <?php if (!empty($currentConfig['player_name']) && !empty($currentConfig['results_dir'])): ?>
                <a href="index.php?lang=<?php echo $current_lang; ?>" class="btn btn-secondary"><?php echo $return_button_text; ?></a>
            <?php else: ?>
                <a class="btn btn-secondary" style="opacity:.45;pointer-events:none;"><?php echo $return_button_text; ?></a>
            <?php endif; ?>
        </div>
    </form>

    <!-- ── Conseils (accordéon fermé par défaut) ─────────────── -->
    <details class="cfg-tips" open>
        <summary><?php echo $lang['tips_title']; ?></summary>
        <ul>
            <li><?php echo $lang['tip_player_name']; ?></li>
            <li><?php echo $lang['tip_results_dir']; ?></li>
            <?php if (!empty($lang['tip_default_version'])): ?>
            <li><?php echo $lang['tip_default_version']; ?></li>
            <?php endif; ?>
            <li><?php echo $lang['tip_cache']; ?></li>
        </ul>
    </details>

    <hr class="cfg-sep">

    <!-- ════════════════════ Maintenance ════════════════════════ -->
    <p class="cfg-section-title">🛠 Maintenance</p>
    <div class="cfg-maintenance">

        <!-- Réindexer -->
        <form method="post" class="cfg-maction">
            <input type="hidden" name="csrf_token" value="<?php echo $csrf_token; ?>">
            <label><?php echo $lang['reindex_button']; ?></label>
            <div class="mhelp"><?php echo $lang['reindex_help']; ?></div>
            <div class="mrow">
                <button type="submit" name="reindex_db" class="btn-maint"
                        onclick="return confirm('<?php echo addslashes($lang['reindex_button']); ?> ?');">
                    🔄 <?php echo $lang['reindex_button']; ?>
                </button>
            </div>
        </form>

        <!-- Supprimer la base -->
        <form method="post" class="cfg-maction cfg-maction-danger">
            <input type="hidden" name="csrf_token" value="<?php echo $csrf_token; ?>">
            <label><?php echo $lang['reset_db_button']; ?></label>
            <div class="mhelp"><?php echo $lang['reset_db_help']; ?></div>
            <div class="mrow">
                <button type="submit" name="clear_cache_manual" class="btn-maint danger"
                        onclick="return confirm('<?php echo addslashes($lang['reset_db_confirm']); ?>');">
                    🗑️ <?php echo $lang['reset_db_button']; ?>
                </button>
            </div>
        </form>

        <!-- Purger sessions vides -->
        <form method="post" class="cfg-maction">
            <input type="hidden" name="csrf_token" value="<?php echo $csrf_token; ?>">
            <label><?php echo $lang['purge_empty_sessions_button']; ?></label>
            <div class="mhelp"><?php echo $lang['purge_empty_sessions_help']; ?></div>
            <div class="mrow">
                <select id="purge_type" name="purge_type">
                    <option value="global" <?php echo ($purge_type === 'global') ? 'selected' : ''; ?>>
                        <?php echo $lang['purge_type_global'] ?? 'Globale'; ?>
                    </option>
                    <option value="player" <?php echo ($purge_type === 'player') ? 'selected' : ''; ?>>
                        <?php echo $lang['purge_type_player'] ?? 'Joueur'; ?>
                    </option>
                </select>
                <button type="submit" name="purge_empty_sessions" class="btn-maint danger"
                        onclick="return confirm('<?php echo addslashes($lang['confirm_purge']); ?>');">
                    <span id="purge-button-text">🧹 <?php echo $lang['purge_empty_sessions_button']; ?></span>
                </button>
            </div>
        </form>

    </div><!-- /.cfg-maintenance -->

</div><!-- /.config-panel -->

<?php require 'includes/footer.php'; ?>

<script>
document.addEventListener('DOMContentLoaded', function () {
    const resultsDirInput  = document.getElementById('results_dir');
    const playerNameInput  = document.getElementById('player_name');
    const useSuggestionLbl = "<?php echo addslashes($lang['js_use_suggestion'] ?? 'Utiliser cette suggestion'); ?>";

    // Valeurs détectées par PHP au chargement
    const phpDetectedDir  = <?php echo json_encode($suggestedPath); ?>;
    const phpDetectedName = <?php echo json_encode($suggestedName); ?>;

    // Affiche une bulle de suggestion dans le conteneur donné
    function showBubble(containerId, targetId, value, label) {
        const container = document.getElementById(containerId);
        if (!container) return;
        if (!value) {
            container.innerHTML = '';   // rien trouvé → on efface silencieusement
            return;
        }
        container.innerHTML = `<div class="suggestion-bubble">
            <strong>${label}</strong>
            <span class="use-suggestion" data-target-id="${targetId}" data-suggestion="${value.replace(/"/g,'&quot;')}" title="${useSuggestionLbl}">➕</span>
            <code style="word-break:break-all;">${value}</code>
        </div>`;
        container.querySelector('.use-suggestion').addEventListener('click', function () {
            const target = document.getElementById(this.dataset.targetId);
            if (target) { target.value = this.dataset.suggestion; target.dispatchEvent(new Event('input')); }
            this.closest('.suggestion-bubble').style.display = 'none';
        });
    }

    // ── Bouton 🔍 dossier ─────────────────────────────────────
    const btnDetectDir = document.getElementById('btn-detect-dir');
    if (btnDetectDir) {
        btnDetectDir.addEventListener('click', function () {
            this.textContent = '⏳';
            showBubble('bubble-results_dir', 'results_dir', phpDetectedDir,
                       '<?php echo addslashes($lang['suggested_path'] ?? 'Dossier détecté :'); ?>');
            this.textContent = '🔍';
        });
    }

    // ── Bouton 🔍 nom joueur ──────────────────────────────────
    const btnDetectName = document.getElementById('btn-detect-name');
    function fetchAndShowName(dir) {
        if (!dir) { showBubble('bubble-player_name', 'player_name', null, ''); return; }
        btnDetectName && (btnDetectName.textContent = '⏳');
        fetch('<?php echo $selfScript; ?>?suggest_name=1&dir=' + encodeURIComponent(dir))
            .then(r => r.json())
            .then(data => {
                showBubble('bubble-player_name', 'player_name', data.name || null,
                           '<?php echo addslashes($lang['suggested_player_name'] ?? 'Nom détecté :'); ?>');
            })
            .catch(() => showBubble('bubble-player_name', 'player_name', null, ''))
            .finally(() => { btnDetectName && (btnDetectName.textContent = '🔍'); });
    }
    if (btnDetectName) {
        btnDetectName.addEventListener('click', function () {
            fetchAndShowName(resultsDirInput ? resultsDirInput.value.trim() : '');
        });
    }

    // ── Auto-détection du nom quand l'utilisateur modifie le dossier
    if (resultsDirInput) {
        resultsDirInput.addEventListener('input', function () {
            const dir = this.value.trim();
            if (dir.length > 5) fetchAndShowName(dir);
        });
    }

    // ── Affichage automatique au chargement si détection disponible ──
    if (phpDetectedDir && resultsDirInput && phpDetectedDir !== resultsDirInput.value) {
        showBubble('bubble-results_dir', 'results_dir', phpDetectedDir,
                   '<?php echo addslashes($lang['suggested_path'] ?? 'Dossier détecté :'); ?>');
    }
    if (phpDetectedName && playerNameInput && phpDetectedName !== playerNameInput.value) {
        showBubble('bubble-player_name', 'player_name', phpDetectedName,
                   '<?php echo addslashes($lang['suggested_player_name'] ?? 'Nom détecté :'); ?>');
    }

    // ── 3. Compteur de sessions à purger ───────────────────────
    // Les deux types passent désormais par SQLite via countSessionsToPurge() — O(1).
    const globalCount  = <?php echo (int)countSessionsToPurge('global'); ?>;
    const playerCount  = <?php echo (int)countSessionsToPurge('player'); ?>;
    const purgeBtn     = document.getElementById('purge-button-text');
    const purgeTypeSel = document.getElementById('purge_type');

    function updatePurge() {
        if (!purgeBtn || !purgeTypeSel) return;
        const n = purgeTypeSel.value === 'global' ? globalCount : playerCount;
        purgeBtn.textContent = `🧹 <?php echo addslashes($lang['purge_empty_sessions_button']); ?> (${n})`;
    }
    if (purgeTypeSel) purgeTypeSel.addEventListener('change', updatePurge);
    updatePurge();
});
</script>
</body>
</html>
