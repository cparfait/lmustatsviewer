<?php
require_once 'includes/init.php';
require_once 'includes/db.php';

$db = get_db();

$carsJson   = file_get_contents(__DIR__ . '/includes/cars.json');
$carsData   = json_decode($carsJson, true);
$carsList   = $carsData['cars'] ?? [];
$classes    = $carsData['classes'] ?? [];

$circuitsJson = file_get_contents(__DIR__ . '/includes/circuits.json');
$circuitsData = json_decode($circuitsJson, true);

$dbCircuits = $db->query("
    SELECT DISTINCT track FROM player_sessions WHERE track != '' ORDER BY track
")->fetchAll(PDO::FETCH_COLUMN);

$wecCircuits = $circuitsData['circuits'] ?? [];
$circuits = array_unique(array_merge($wecCircuits, $dbCircuits));
sort($circuits, SORT_STRING | SORT_FLAG_CASE);

$flagMap = $circuitsData['flags'] ?? [];

function circuitFlag(string $name, array $flagMap): string {
    $low = strtolower($name);
    foreach ($flagMap as $kw => $code) {
        if (str_contains($low, $kw)) {
            $cc = strtoupper($code);
            return chr(0xF0) . chr(0x9F) . chr(0x87) . chr(0xA6 + ord($cc[0]) - 65)
                 . chr(0xF0) . chr(0x9F) . chr(0x87) . chr(0xA6 + ord($cc[1]) - 65);
        }
    }
    return '';
}

$setupFields = [
    'engine_map','fuel_capacity',
    'diff_preload','diff_coast','diff_power',
    'tc','tc_power_cut','tc_slip_angle','abs',
    'pressure_fl','pressure_fr','pressure_rl','pressure_rr',
    'camber_fl','camber_fr','camber_rl','camber_rr',
    'toe_fl','toe_fr','toe_rl','toe_rr',
    'brake_bias','front_brake_pressure','rear_brake_pressure','max_pedal_force',
    'spring_rate_fl','spring_rate_fr','spring_rate_rl','spring_rate_rr',
    'ride_height_fl','ride_height_fr','ride_height_rl','ride_height_rr',
    'slow_bump_fl','slow_bump_fr','slow_bump_rl','slow_bump_rr',
    'fast_bump_fl','fast_bump_fr','fast_bump_rl','fast_bump_rr',
    'slow_rebound_fl','slow_rebound_fr','slow_rebound_rl','slow_rebound_rr',
    'fast_rebound_fl','fast_rebound_fr','fast_rebound_rl','fast_rebound_rr',
    'front_antiroll','rear_antiroll',
];

if ($_SERVER['REQUEST_METHOD'] === 'POST' && isset($_POST['action'])) {
    header('Content-Type: application/json');

    if ($_POST['action'] === 'save') {
        $id      = ($_POST['id'] ?? '') !== '' ? (int)$_POST['id'] : null;
        $car     = trim($_POST['car_model'] ?? '');
        $name    = trim($_POST['config_name'] ?? '') ?: 'Default';
        $circuit = trim($_POST['circuit'] ?? '');
        $comment = trim($_POST['comment'] ?? '');

        if ($car === '') { echo json_encode(['ok' => false, 'error' => 'no car']); exit; }

        if ($id) {
            $db->prepare("DELETE FROM car_configs WHERE id = ?")->execute([$id]);
        }

        $cols = ['car_model','config_name','circuit','comment','updated_at'];
        $vals = [':car' => $car, ':name' => $name, ':circuit' => $circuit, ':comment' => $comment, ':ts' => time()];

        foreach ($setupFields as $f) {
            $cols[] = $f;
            $raw = $_POST[$f] ?? '';
            if ($raw === '') {
                $vals[':' . $f] = null;
            } elseif (in_array($f, ['fuel_capacity','pressure_fl','pressure_fr','pressure_rl','pressure_rr',
                'camber_fl','camber_fr','camber_rl','camber_rr','toe_fl','toe_fr','toe_rl','toe_rr',
                'brake_bias','front_brake_pressure','rear_brake_pressure',
                'spring_rate_fl','spring_rate_fr','spring_rate_rl','spring_rate_rr',
                'ride_height_fl','ride_height_fr','ride_height_rl','ride_height_rr'])) {
                $vals[':' . $f] = (float)$raw;
            } else {
                $vals[':' . $f] = (int)$raw;
            }
        }

        $placeholders = implode(',', array_keys($vals));
        $sql = "INSERT INTO car_configs (" . implode(',', $cols) . ") VALUES (" . $placeholders . ")";
        $stmt = $db->prepare($sql);
        $stmt->execute($vals);
        echo json_encode(['ok' => true, 'id' => $db->lastInsertId()]);
        exit;
    }

    if ($_POST['action'] === 'delete') {
        $id = (int)($_POST['id'] ?? 0);
        if ($id > 0) {
            $db->prepare("DELETE FROM car_configs WHERE id = ?")->execute([$id]);
            echo json_encode(['ok' => true]);
        } else {
            echo json_encode(['ok' => false]);
        }
        exit;
    }

    if ($_POST['action'] === 'load_car') {
        $car = trim($_POST['car_model'] ?? '');
        $stmt = $db->prepare("SELECT * FROM car_configs WHERE car_model = ? ORDER BY config_name, circuit");
        $stmt->execute([$car]);
        echo json_encode($stmt->fetchAll());
        exit;
    }

    if ($_POST['action'] === 'load_one') {
        $id = (int)($_POST['id'] ?? 0);
        $stmt = $db->prepare("SELECT * FROM car_configs WHERE id = ?");
        $stmt->execute([$id]);
        echo json_encode($stmt->fetch() ?: ['ok' => false]);
        exit;
    }

    echo json_encode(['ok' => false]);
    exit;
}

$allConfigs = [];
foreach ($db->query("SELECT * FROM car_configs ORDER BY car_model, config_name, circuit")->fetchAll() as $row) {
    $allConfigs[$row['car_model']][] = $row;
}

$categoryOrder = ['hyper' => 1, 'lmp2' => 2, 'lmp3' => 3, 'gte' => 4, 'gt3' => 5];
$categoryLabels = [
    'hyper' => 'Hypercar',
    'lmp2'  => 'LMP2',
    'lmp3'  => 'LMP3',
    'gt3'   => 'LMGT3',
    'gte'   => 'GTE',
];
$categoryBadgeColors = [
    'hyper' => '#E20000',
    'lmp2'  => '#0066CC',
    'lmp3'  => '#800080',
    'gt3'   => '#009900',
    'gte'   => '#2bdb2b',
];

$carsByCategory = [];
foreach ($carsList as $car) {
    $cat = $car['category'] ?? 'unknown';
    $carsByCategory[$cat][] = $car;
}
uksort($carsByCategory, fn($a, $b) => ($categoryOrder[$a] ?? 99) <=> ($categoryOrder[$b] ?? 99));
?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>" data-theme="<?php echo $current_theme; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $lang['car_configs_title'] ?? 'Car Configs'; ?> — LMU Stats Viewer</title>
    <link rel="icon" href="logos/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="css/style.css?v=<?php echo @filemtime('css/style.css'); ?>">
    <style>
        .config-panel {
            --fs-title: 1.35em;
            --fs-label: 0.9em;
            --fs-body:  0.875em;
            --fs-small: 0.8em;
            max-width: 1100px;
            margin: 30px auto;
            padding: 32px 36px 36px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 1rem;
        }
        .cfg-header {
            position: relative;
            display: flex;
            align-items: center;
            justify-content: center;
            padding-bottom: 22px;
            margin-bottom: 24px;
        }
        .cfg-header > a { position: absolute; left: 0; display: flex; align-items: center; }
        .cfg-header-logo { height: 64px; width: auto; }
        .cfg-header-text { text-align: center; }
        .cfg-header-text h1 { margin: 0 0 3px; font-size: var(--fs-title); }
        .cfg-header-text .subtitle { margin: 0; font-size: var(--fs-small); color: var(--text-color-light); }
        .cfg-back-link { margin-bottom: 16px; }
        .cfg-back-link a { color: var(--primary-color); text-decoration: none; font-size: .9em; font-weight: 600; transition: color .2s; }
        .cfg-back-link a:hover { text-decoration: underline; }
        .cfg-block { margin-bottom: 24px; border: 1px solid var(--border-color); border-radius: 8px; overflow: hidden; }
        .cfg-block-header { background: #004A7C; padding: 10px 18px; display: flex; align-items: center; gap: 10px; }
        .cfg-block-header h2 { margin: 0; font-size: var(--fs-label); color: #fff; text-transform: uppercase; letter-spacing: .06em; }
        .cfg-block-body { padding: 16px 18px; background: var(--card-bg-color); }
        .cfg-input { padding: 12px 16px; display: flex; flex-direction: column; justify-content: center; gap: 8px; }
        .cfg-input input[type="text"] {
            width: 100%; padding: 7px 10px;
            border: 1px solid var(--border-color); border-radius: 6px;
            font-size: var(--fs-body); background: var(--card-bg-color); color: var(--text-color);
            box-sizing: border-box; transition: border-color .2s, box-shadow .2s;
        }
        .cfg-input input[type="text"]:focus { outline: none; border-color: var(--primary-color); box-shadow: 0 0 0 3px var(--shadow-color-focus); }
        .cfg-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 10px; margin-bottom: 26px; }
        .cfg-actions button, .cfg-actions .btn { padding: 9px 22px; font-size: var(--fs-body); font-weight: 600; border-radius: 7px; letter-spacing: .01em; transition: background .18s, box-shadow .18s, color .18s, border-color .18s; }
        .cfg-actions .btn-primary { background: linear-gradient(135deg, #004A7C 0%, var(--header-bg-color) 100%); color: #fff; border: 2px solid #004A7C; box-shadow: 0 2px 6px rgba(0,74,124,.35); }
        .cfg-actions .btn-primary:hover { background: linear-gradient(135deg, #003d66 0%, #0a75b8 100%); border-color: #003d66; box-shadow: 0 4px 14px rgba(0,74,124,.45); transform: none; }
        .btn-maint { padding: 5px 13px; font-size: var(--fs-small); font-weight: 600; border: 1px solid var(--border-color); border-radius: 5px; cursor: pointer; background: var(--card-bg-color); color: var(--text-color); transition: background .15s; white-space: nowrap; }
        .btn-maint:hover { background: var(--row-hover-bg-color); }
        .btn-maint.danger { border-color: #c0392b; color: #c0392b; }
        .btn-maint.danger:hover { background: #fdf0ee; }
        [data-theme="dark"] .btn-maint.danger:hover { background: #3a1210; }

        .cc-quick-values {
            display: flex;
            gap: 4px;
            flex-wrap: wrap;
            margin-top: 4px;
        }
        .cc-quick-val {
            font-size: .68em;
            font-weight: 700;
            border-radius: 3px;
            padding: 1px 6px;
            color: #fff;
            line-height: 1.5;
        }
        .cc-quick-val.tc { background: #6366f1; }
        .cc-quick-val.tcpc { background: #8b5cf6; }
        .cc-quick-val.tcsa { background: #a855f7; }
        .cc-quick-val.abs { background: #ef4444; }


        .setup-panel { display: none; }
        .setup-panel.active { display: block; }

        .setup-section-title {
            font-size: .82em;
            font-weight: 700;
            color: var(--primary-color);
            margin: 14px 0 8px;
            padding-bottom: 4px;
            border-bottom: 1px solid var(--border-color);
            text-transform: uppercase;
            letter-spacing: .04em;
        }
        .setup-section-title:first-child { margin-top: 0; }

        .setup-row {
            display: grid;
            grid-template-columns: 110px 1fr 110px 1fr;
            gap: 6px 12px;
            align-items: center;
            margin-bottom: 4px;
        }
        .setup-row.single {
            grid-template-columns: 110px 1fr;
        }
        .setup-label {
            font-size: .8em;
            font-weight: 600;
            color: var(--text-color);
            text-align: right;
        }
        .setup-input input {
            width: 100%;
            padding: 6px 8px;
            border: 1px solid var(--border-color);
            border-radius: 5px;
            font-size: .85em;
            background: var(--card-bg-color);
            color: var(--text-color);
            box-sizing: border-box;
            transition: border-color .2s;
        }
        .setup-input input:focus {
            outline: none;
            border-color: var(--primary-color);
            box-shadow: 0 0 0 2px var(--shadow-color-focus);
        }

        .setup-sub {
            font-size: .72em;
            font-weight: 600;
            color: var(--text-color-light);
            margin: 10px 0 4px;
            display: flex;
            gap: 16px;
        }
        .setup-sub span { min-width: 55px; text-align: center; }

        @media (max-width: 720px) {
            .config-panel { padding: 20px 16px 24px; margin: 12px; }
            .cfg-header { flex-direction: column; align-items: center; gap: 10px; padding-bottom: 16px; }
            .cfg-header > a { position: static; }
            .cfg-header-logo { height: 48px; }
            .setup-row { grid-template-columns: 90px 1fr; }
            .setup-row .setup-label:nth-child(3),
            .setup-row .setup-input:nth-child(4) { grid-column: 1 / -1; }
        }
    </style>
</head>
<body>

<div class="config-panel">

    <div class="cfg-header">
        <a href="index.php?lang=<?php echo $current_lang; ?>">
            <img src="logos/lmu.png" alt="LMU Stats Viewer" class="cfg-header-logo">
        </a>
        <div class="cfg-header-text">
            <h1><?php echo $lang['car_configs_title'] ?? 'Configurations par Voiture'; ?></h1>
            <p class="subtitle"><?php echo $lang['car_configs_subtitle'] ?? 'Gérez vos réglages par voiture'; ?></p>
        </div>
    </div>

    <div class="page-header">
        <a href="index.php?lang=<?php echo $current_lang; ?>" class="btn btn-action">&laquo; <?php echo $lang['back_to_stats'] ?? 'Retour aux Stats'; ?></a>
        <div class="header-spacer"></div>
    </div>

    <div class="cfg-block">
        <div class="cfg-block-header">
            <h2><?php echo $lang['car_configs_search'] ?? 'Rechercher'; ?></h2>
        </div>
        <div class="cfg-block-body">
            <div class="car-config-search-row">
                <input type="text" id="search-input" class="cfg-input"
                       placeholder="<?php echo $lang['car_configs_search_placeholder'] ?? 'Rechercher par voiture ou circuit…'; ?>"
                       oninput="filterCars()">
            </div>
        </div>
    </div>

    <?php foreach ($carsByCategory as $cat => $cars):
        $catStyle = $classes[$cat] ?? $classes['_default'];
        $catLabel = $categoryLabels[$cat] ?? strtoupper($cat);
    ?>
    <div class="cfg-block car-config-category" data-category="<?php echo htmlspecialchars($catLabel); ?>">
        <div class="cfg-block-header car-config-cat-header">
            <span class="badge" style="background:<?php echo $categoryBadgeColors[$cat] ?? '#004A7C'; ?>;"><?php echo htmlspecialchars($catLabel); ?></span>
            <span class="car-config-cat-count"><?php echo count($cars); ?></span>
        </div>
        <div class="cfg-block-body">
            <div class="car-config-grid">
                <?php foreach ($cars as $car):
                    $model = $car['modelName'];
                    $logoUrl = getCarLogoUrl($model);
                    $cfgs = $allConfigs[$model] ?? [];
                    $hasConfig = !empty($cfgs);
                    $searchStr = htmlspecialchars(strtolower($model . ' ' . implode(' ', array_column($cfgs, 'circuit'))));
                    $firstCfg = $hasConfig ? $cfgs[0] : null;
                ?>
                <div class="car-config-card<?php echo $hasConfig ? ' has-config' : ''; ?>"
                     data-car="<?php echo htmlspecialchars($model); ?>"
                     data-search="<?php echo $searchStr; ?>"
                     onclick="openCarDetail(this)">
                    <div class="car-config-card-header">
                        <?php if ($logoUrl): ?>
                        <img src="<?php echo htmlspecialchars($logoUrl); ?>" alt="" class="car-config-logo">
                        <?php endif; ?>
                        <span class="car-config-name"><?php echo htmlspecialchars($model); ?></span>
                        <?php if ($hasConfig): ?>
                        <span class="car-config-badge" title="<?php echo count($cfgs); ?> config(s)"><?php echo count($cfgs); ?></span>
                        <?php endif; ?>
                    </div>
                    <?php if ($firstCfg): ?>
                    <div class="cc-quick-values">
                        <?php if ($firstCfg['tc'] !== null): ?>
                        <span class="cc-quick-val tc" title="TC">TC <?php echo (int)$firstCfg['tc']; ?></span>
                        <?php endif; ?>
                        <?php if ($firstCfg['tc_power_cut'] !== null): ?>
                        <span class="cc-quick-val tcpc" title="TC Power Cut">PC <?php echo (int)$firstCfg['tc_power_cut']; ?></span>
                        <?php endif; ?>
                        <?php if ($firstCfg['tc_slip_angle'] !== null): ?>
                        <span class="cc-quick-val tcsa" title="TC Slip Angle">SA <?php echo (int)$firstCfg['tc_slip_angle']; ?></span>
                        <?php endif; ?>
                        <?php if ($firstCfg['abs'] !== null): ?>
                        <span class="cc-quick-val abs" title="ABS">ABS <?php echo (int)$firstCfg['abs']; ?></span>
                        <?php endif; ?>
                    </div>
                    <?php endif; ?>
                    <?php if ($hasConfig && count($cfgs) > 0): ?>
                    <div class="car-config-card-values">
                        <?php foreach (array_slice($cfgs, 0, 2) as $c): ?>
                        <span class="ccv-chip"><?php echo htmlspecialchars(($c['config_name'] ?: 'Default') . ($c['circuit'] ? ' · ' . $c['circuit'] : '')); ?></span>
                        <?php endforeach; ?>
                        <?php if (count($cfgs) > 2): ?>
                        <span class="ccv-chip">+<?php echo count($cfgs) - 2; ?></span>
                        <?php endif; ?>
                    </div>
                    <?php endif; ?>
                </div>
                <?php endforeach; ?>
            </div>
        </div>
    </div>
    <?php endforeach; ?>

</div>

<div id="car-detail-modal" class="modal" style="display:none;">
    <div class="modal-content" style="max-width:700px;">
        <div class="modal-header" style="display:flex;align-items:center;gap:14px;">
            <img id="detail-logo" src="" alt="" class="car-config-logo" style="height:36px;">
            <div style="flex:1;">
                <h2 id="detail-title" style="margin:0;"></h2>
            </div>
            <span class="close-button" onclick="closeCarDetail()" style="font-size:1.8em;cursor:pointer;">&times;</span>
        </div>

        <div id="detail-configs-list" style="margin:14px 0;"></div>

        <div style="margin:16px 0 8px;">
            <button type="button" class="btn-primary" onclick="openEditorNew()">
                + <?php echo $lang['car_configs_add'] ?? 'Nouvelle configuration'; ?>
            </button>
        </div>
    </div>
</div>

<div id="car-editor-modal" class="modal" style="display:none;">
    <div class="modal-content" style="max-width:720px;">
        <div class="modal-header" style="display:flex;align-items:center;gap:14px;">
            <img id="editor-logo" src="" alt="" class="car-config-logo" style="height:36px;">
            <div style="flex:1;">
                <h2 id="editor-title" style="margin:0;"></h2>
            </div>
            <span class="close-button" onclick="closeCarEditor()" style="font-size:1.8em;cursor:pointer;">&times;</span>
        </div>

        <form id="car-editor-form" onsubmit="saveCarConfig(event)">
            <input type="hidden" id="ed-id" name="id">
            <input type="hidden" id="ed-car_model" name="car_model">

            <div class="car-editor-grid" style="grid-template-columns:140px 1fr;gap:10px 14px;margin:12px 0;">
                <label class="car-editor-label">
                    <strong><?php echo $lang['car_configs_name'] ?? 'Nom'; ?></strong>
                    <span class="car-editor-hint"><?php echo $lang['car_configs_name_hint'] ?? 'ex: Base, Qualif, Course'; ?></span>
                </label>
                <div class="car-editor-input">
                    <input type="text" id="ed-config_name" name="config_name"
                           placeholder="Default" maxlength="50"
                           style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:.9em;background:var(--card-bg-color);color:var(--text-color);box-sizing:border-box;">
                </div>

                <label class="car-editor-label">
                    <strong><?php echo $lang['car_configs_circuit'] ?? 'Circuit'; ?></strong>
                    <span class="car-editor-hint"><?php echo $lang['car_configs_circuit_hint'] ?? 'Optionnel'; ?></span>
                </label>
                <div class="car-editor-input">
                    <select id="ed-circuit" name="circuit"
                            style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:.9em;background:var(--card-bg-color);color:var(--text-color);box-sizing:border-box;">
                        <option value="">— <?php echo $lang['all'] ?? 'Tous'; ?> —</option>
                        <?php foreach ($circuits as $c): ?>
                        <option value="<?php echo htmlspecialchars($c); ?>"><?php $f = circuitFlag($c, $flagMap); echo $f ? $f . ' ' : ''; echo htmlspecialchars($c); ?></option>
                        <?php endforeach; ?>
                    </select>
                </div>
            </div>

            <div class="view-menu" id="setup-tabs">
                <a href="#" class="view-tab active" data-tab="drivetrain" onclick="return switchSetupTab(this)"><?php echo $lang['car_configs_tab_drivetrain'] ?? 'Drivetrain'; ?></a>
                <a href="#" class="view-tab" data-tab="wheels" onclick="return switchSetupTab(this)"><?php echo $lang['car_configs_tab_wheels'] ?? 'Wheels & Brakes'; ?></a>
                <a href="#" class="view-tab" data-tab="suspension" onclick="return switchSetupTab(this)"><?php echo $lang['car_configs_tab_suspension'] ?? 'Suspension'; ?></a>
                <a href="#" class="view-tab" data-tab="dampers" onclick="return switchSetupTab(this)"><?php echo $lang['car_configs_tab_dampers'] ?? 'Dampers'; ?></a>
                <a href="#" class="view-tab" data-tab="chassis" onclick="return switchSetupTab(this)"><?php echo $lang['car_configs_tab_chassis'] ?? 'Chassis'; ?></a>
            </div>

            <div class="setup-panel active" id="panel-drivetrain">
                <div class="setup-section-title"><?php echo $lang['car_configs_sec_engine'] ?? 'Engine'; ?></div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_engine_map'] ?? 'Engine Map'; ?></span>
                    <div class="setup-input"><input type="number" name="engine_map" min="0" max="20" step="1" placeholder="—"></div>
                    <span class="setup-label"><?php echo $lang['car_configs_fuel_capacity'] ?? 'Fuel Capacity'; ?></span>
                    <div class="setup-input"><input type="number" name="fuel_capacity" min="0" step="0.1" placeholder="—"></div>
                </div>

                <div class="setup-section-title"><?php echo $lang['car_configs_sec_diff'] ?? 'Differential'; ?></div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_diff_preload'] ?? 'Preload'; ?></span>
                    <div class="setup-input"><input type="number" name="diff_preload" min="0" step="1" placeholder="—"></div>
                    <span class="setup-label"><?php echo $lang['car_configs_diff_coast'] ?? 'Coast'; ?></span>
                    <div class="setup-input"><input type="number" name="diff_coast" min="0" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_diff_power'] ?? 'Power'; ?></span>
                    <div class="setup-input"><input type="number" name="diff_power" min="0" step="1" placeholder="—"></div>
                </div>

                <div class="setup-section-title"><?php echo $lang['car_configs_sec_electronics'] ?? 'Electronics'; ?></div>
                <div class="setup-row">
                    <span class="setup-label">TC</span>
                    <div class="setup-input"><input type="number" name="tc" min="0" max="20" step="1" placeholder="—"></div>
                    <span class="setup-label">TC Power Cut</span>
                    <div class="setup-input"><input type="number" name="tc_power_cut" min="0" max="20" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label">TC Slip Angle</span>
                    <div class="setup-input"><input type="number" name="tc_slip_angle" min="0" max="20" step="1" placeholder="—"></div>
                </div>
            </div>

            <div class="setup-panel" id="panel-wheels">
                <div class="setup-section-title"><?php echo $lang['car_configs_sec_front_wheels'] ?? 'Front Wheels'; ?></div>
                <div class="setup-sub">
                    <span></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_left'] ?? 'Left'; ?></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_right'] ?? 'Right'; ?></span>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_pressure'] ?? 'Pressure'; ?></span>
                    <div class="setup-input"><input type="number" name="pressure_fl" min="0" step="0.01" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="pressure_fr" min="0" step="0.01" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_camber'] ?? 'Camber'; ?></span>
                    <div class="setup-input"><input type="number" name="camber_fl" step="0.1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="camber_fr" step="0.1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_toe'] ?? 'Toe'; ?></span>
                    <div class="setup-input"><input type="number" name="toe_fl" step="0.01" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="toe_fr" step="0.01" placeholder="—"></div>
                </div>

                <div class="setup-section-title"><?php echo $lang['car_configs_sec_rear_wheels'] ?? 'Rear Wheels'; ?></div>
                <div class="setup-sub">
                    <span></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_left'] ?? 'Left'; ?></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_right'] ?? 'Right'; ?></span>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_pressure'] ?? 'Pressure'; ?></span>
                    <div class="setup-input"><input type="number" name="pressure_rl" min="0" step="0.01" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="pressure_rr" min="0" step="0.01" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_camber'] ?? 'Camber'; ?></span>
                    <div class="setup-input"><input type="number" name="camber_rl" step="0.1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="camber_rr" step="0.1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_toe'] ?? 'Toe'; ?></span>
                    <div class="setup-input"><input type="number" name="toe_rl" step="0.01" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="toe_rr" step="0.01" placeholder="—"></div>
                </div>

                <div class="setup-section-title"><?php echo $lang['car_configs_sec_brakes'] ?? 'Brakes'; ?></div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_brake_bias'] ?? 'Brake Bias'; ?></span>
                    <div class="setup-input"><input type="number" name="brake_bias" step="0.1" placeholder="—"></div>
                    <span class="setup-label">ABS</span>
                    <div class="setup-input"><input type="number" name="abs" min="0" max="20" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_front_brake_pressure'] ?? 'Front Brake Press.'; ?></span>
                    <div class="setup-input"><input type="number" name="front_brake_pressure" step="0.1" placeholder="—"></div>
                    <span class="setup-label"><?php echo $lang['car_configs_rear_brake_pressure'] ?? 'Rear Brake Press.'; ?></span>
                    <div class="setup-input"><input type="number" name="rear_brake_pressure" step="0.1" placeholder="—"></div>
                </div>
                <div class="setup-row single">
                    <span class="setup-label"><?php echo $lang['car_configs_max_pedal_force'] ?? 'Max Pedal Force'; ?></span>
                    <div class="setup-input"><input type="number" name="max_pedal_force" min="0" step="1" placeholder="—"></div>
                </div>
            </div>

            <div class="setup-panel" id="panel-suspension">
                <div class="setup-section-title"><?php echo $lang['car_configs_sec_front_susp'] ?? 'Front Suspension'; ?></div>
                <div class="setup-sub">
                    <span></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_left'] ?? 'Left'; ?></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_right'] ?? 'Right'; ?></span>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_spring_rate'] ?? 'Spring Rate'; ?></span>
                    <div class="setup-input"><input type="number" name="spring_rate_fl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="spring_rate_fr" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_ride_height'] ?? 'Ride Height'; ?></span>
                    <div class="setup-input"><input type="number" name="ride_height_fl" step="0.1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="ride_height_fr" step="0.1" placeholder="—"></div>
                </div>

                <div class="setup-section-title"><?php echo $lang['car_configs_sec_rear_susp'] ?? 'Rear Suspension'; ?></div>
                <div class="setup-sub">
                    <span></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_left'] ?? 'Left'; ?></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_right'] ?? 'Right'; ?></span>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_spring_rate'] ?? 'Spring Rate'; ?></span>
                    <div class="setup-input"><input type="number" name="spring_rate_rl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="spring_rate_rr" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_ride_height'] ?? 'Ride Height'; ?></span>
                    <div class="setup-input"><input type="number" name="ride_height_rl" step="0.1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="ride_height_rr" step="0.1" placeholder="—"></div>
                </div>
            </div>

            <div class="setup-panel" id="panel-dampers">
                <div class="setup-section-title"><?php echo $lang['car_configs_sec_front_dampers'] ?? 'Front Dampers'; ?></div>
                <div class="setup-sub">
                    <span></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_left'] ?? 'Left'; ?></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_right'] ?? 'Right'; ?></span>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_slow_bump'] ?? 'Slow Bump'; ?></span>
                    <div class="setup-input"><input type="number" name="slow_bump_fl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="slow_bump_fr" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_fast_bump'] ?? 'Fast Bump'; ?></span>
                    <div class="setup-input"><input type="number" name="fast_bump_fl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="fast_bump_fr" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_slow_rebound'] ?? 'Slow Rebound'; ?></span>
                    <div class="setup-input"><input type="number" name="slow_rebound_fl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="slow_rebound_fr" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_fast_rebound'] ?? 'Fast Rebound'; ?></span>
                    <div class="setup-input"><input type="number" name="fast_rebound_fl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="fast_rebound_fr" step="1" placeholder="—"></div>
                </div>

                <div class="setup-section-title"><?php echo $lang['car_configs_sec_rear_dampers'] ?? 'Rear Dampers'; ?></div>
                <div class="setup-sub">
                    <span></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_left'] ?? 'Left'; ?></span><span style="min-width:55px;text-align:center;"><?php echo $lang['car_configs_right'] ?? 'Right'; ?></span>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_slow_bump'] ?? 'Slow Bump'; ?></span>
                    <div class="setup-input"><input type="number" name="slow_bump_rl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="slow_bump_rr" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_fast_bump'] ?? 'Fast Bump'; ?></span>
                    <div class="setup-input"><input type="number" name="fast_bump_rl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="fast_bump_rr" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_slow_rebound'] ?? 'Slow Rebound'; ?></span>
                    <div class="setup-input"><input type="number" name="slow_rebound_rl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="slow_rebound_rr" step="1" placeholder="—"></div>
                </div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_fast_rebound'] ?? 'Fast Rebound'; ?></span>
                    <div class="setup-input"><input type="number" name="fast_rebound_rl" step="1" placeholder="—"></div>
                    <span class="setup-label"></span>
                    <div class="setup-input"><input type="number" name="fast_rebound_rr" step="1" placeholder="—"></div>
                </div>
            </div>

            <div class="setup-panel" id="panel-chassis">
                <div class="setup-section-title"><?php echo $lang['car_configs_sec_antiroll'] ?? 'Anti-Roll Bars'; ?></div>
                <div class="setup-row">
                    <span class="setup-label"><?php echo $lang['car_configs_front_antiroll'] ?? 'Front'; ?></span>
                    <div class="setup-input"><input type="number" name="front_antiroll" step="1" placeholder="—"></div>
                    <span class="setup-label"><?php echo $lang['car_configs_rear_antiroll'] ?? 'Rear'; ?></span>
                    <div class="setup-input"><input type="number" name="rear_antiroll" step="1" placeholder="—"></div>
                </div>
            </div>

            <div style="margin:16px 0 8px;">
                <label class="car-editor-label" style="font-size:.88em;">
                    <strong><?php echo $lang['car_configs_comment'] ?? 'Commentaire'; ?></strong>
                </label>
                <textarea id="ed-comment" name="comment" rows="3"
                          placeholder="<?php echo $lang['car_configs_comment_placeholder'] ?? 'Notes, setup tips…'; ?>"
                          style="width:100%;padding:8px 10px;border:1px solid var(--border-color);border-radius:6px;font-size:.9em;background:var(--card-bg-color);color:var(--text-color);resize:vertical;box-sizing:border-box;margin-top:4px;"></textarea>
            </div>

            <div class="cfg-actions" style="margin-top:16px;">
                <button type="submit" class="btn-primary"><?php echo $lang['btn_save'] ?? 'Enregistrer'; ?></button>
                <button type="button" class="btn-maint" onclick="closeCarEditor()"><?php echo $lang['back_to_list'] ?? 'Annuler'; ?></button>
            </div>
        </form>
    </div>
</div>

<?php require 'includes/footer.php'; ?>

<script>
var currentCarModel = '';
var currentCarLogo = '';
var loadedConfigs = [];

var allFields = <?php echo json_encode(array_merge(['id','car_model','config_name','circuit','comment','updated_at'], $setupFields)); ?>;
var setupFieldsOnly = <?php echo json_encode($setupFields); ?>;

function switchSetupTab(el) {
    document.querySelectorAll('#setup-tabs .view-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.setup-panel').forEach(function(p) { p.classList.remove('active'); });
    el.classList.add('active');
    document.getElementById('panel-' + el.dataset.tab).classList.add('active');
    return false;
}

function filterCars() {
    var q = document.getElementById('search-input').value.toLowerCase().trim();
    var cards = document.querySelectorAll('.car-config-card');
    var visiblePerCat = {};
    cards.forEach(function(card) {
        var search = (card.dataset.search || '').toLowerCase();
        var match = !q || search.indexOf(q) !== -1;
        card.style.display = match ? '' : 'none';
        if (match) {
            var cat = card.closest('.car-config-category');
            visiblePerCat[cat.dataset.category] = (visiblePerCat[cat.dataset.category] || 0) + 1;
        }
    });
    document.querySelectorAll('.car-config-category').forEach(function(cat) {
        cat.style.display = (visiblePerCat[cat.dataset.category] || 0) > 0 ? '' : 'none';
    });
}

function openCarDetail(card) {
    currentCarModel = card.dataset.car;
    currentCarLogo = card.querySelector('.car-config-logo');
    document.getElementById('detail-title').textContent = currentCarModel;
    document.getElementById('detail-logo').src = currentCarLogo ? currentCarLogo.src : '';
    renderConfigsList([]);
    document.getElementById('car-detail-modal').style.display = 'block';

    var fd = new FormData();
    fd.append('action', 'load_car');
    fd.append('car_model', currentCarModel);
    fetch('car_configs.php', { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            loadedConfigs = data;
            renderConfigsList(data);
        });
}

function renderConfigsList(configs) {
    var container = document.getElementById('detail-configs-list');
    if (!configs || configs.length === 0) {
        container.innerHTML = '<p style="color:var(--text-color-light);font-style:italic;"><?php echo addslashes($lang['car_configs_no_configs'] ?? 'Aucune configuration enregistrée.'); ?></p>';
        return;
    }
    var html = '<table class="sortable-table" style="font-size:.85em;"><thead><tr>' +
        '<th><?php echo addslashes($lang['car_configs_name'] ?? 'Nom'); ?></th>' +
        '<th><?php echo addslashes($lang['car_configs_circuit'] ?? 'Circuit'); ?></th>' +
        '<th>TC</th><th>TC PC</th><th>TC SA</th><th>ABS</th>' +
        '<th><?php echo addslashes($lang['car_configs_comment'] ?? 'Commentaire'); ?></th>' +
        '<th></th></tr></thead><tbody>';
    configs.forEach(function(c) {
        html += '<tr>';
        html += '<td><strong>' + esc(c.config_name || 'Default') + '</strong></td>';
        html += '<td>' + esc(c.circuit || '—') + '</td>';
        html += '<td>' + (c.tc !== null ? c.tc : '—') + '</td>';
        html += '<td>' + (c.tc_power_cut !== null ? c.tc_power_cut : '—') + '</td>';
        html += '<td>' + (c.tc_slip_angle !== null ? c.tc_slip_angle : '—') + '</td>';
        html += '<td>' + (c.abs !== null ? c.abs : '—') + '</td>';
        html += '<td style="max-width:180px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + esc(c.comment || '') + '">' + esc(c.comment || '—') + '</td>';
        html += '<td style="white-space:nowrap;">';
        html += '<button type="button" class="btn-maint" style="margin-right:4px;" onclick="openEditorEdit(' + c.id + ')"><?php echo addslashes($lang['th_details'] ?? 'Éditer'); ?></button>';
        html += '<button type="button" class="btn-maint danger" onclick="deleteConfig(' + c.id + ')">✕</button>';
        html += '</td></tr>';
    });
    html += '</tbody></table>';
    container.innerHTML = html;
}

function esc(s) { var d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

function closeCarDetail() {
    document.getElementById('car-detail-modal').style.display = 'none';
}

function clearEditorForm() {
    document.getElementById('ed-id').value = '';
    document.getElementById('ed-car_model').value = currentCarModel;
    document.getElementById('ed-config_name').value = '';
    document.getElementById('ed-circuit').value = '';
    document.getElementById('ed-comment').value = '';
    var form = document.getElementById('car-editor-form');
    setupFieldsOnly.forEach(function(f) {
        var el = form.elements[f];
        if (el) el.value = '';
    });
    document.querySelectorAll('#setup-tabs .view-tab').forEach(function(t) { t.classList.remove('active'); });
    document.querySelectorAll('.setup-panel').forEach(function(p) { p.classList.remove('active'); });
    document.querySelector('#setup-tabs .view-tab[data-tab="drivetrain"]').classList.add('active');
    document.getElementById('panel-drivetrain').classList.add('active');
}

function openEditorNew() {
    clearEditorForm();
    document.getElementById('editor-title').textContent = currentCarModel + ' — ' + '<?php echo addslashes($lang['car_configs_new'] ?? 'Nouvelle config'); ?>';
    document.getElementById('editor-logo').src = currentCarLogo ? currentCarLogo.src : '';
    document.getElementById('car-editor-modal').style.display = 'block';
}

function openEditorEdit(configId) {
    var fd = new FormData();
    fd.append('action', 'load_one');
    fd.append('id', configId);
    fetch('car_configs.php', { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function(c) {
            clearEditorForm();
            document.getElementById('ed-id').value = c.id || '';
            document.getElementById('ed-car_model').value = currentCarModel;
            document.getElementById('ed-config_name').value = c.config_name || '';
            document.getElementById('ed-circuit').value = c.circuit || '';
            document.getElementById('ed-comment').value = c.comment || '';
            var form = document.getElementById('car-editor-form');
            setupFieldsOnly.forEach(function(f) {
                var el = form.elements[f];
                if (el && c[f] !== null && c[f] !== undefined) el.value = c[f];
            });
            document.getElementById('editor-title').textContent = currentCarModel + ' — ' + (c.config_name || 'Default');
            document.getElementById('editor-logo').src = currentCarLogo ? currentCarLogo.src : '';
            document.getElementById('car-editor-modal').style.display = 'block';
        });
}

function closeCarEditor() {
    document.getElementById('car-editor-modal').style.display = 'none';
}

function saveCarConfig(e) {
    e.preventDefault();
    var fd = new FormData(document.getElementById('car-editor-form'));
    fd.append('action', 'save');
    fetch('car_configs.php', { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            if (data.ok) {
                closeCarEditor();
                var fd2 = new FormData();
                fd2.append('action', 'load_car');
                fd2.append('car_model', currentCarModel);
                return fetch('car_configs.php', { method: 'POST', body: fd2 });
            }
        })
        .then(function(r) { return r ? r.json() : []; })
        .then(function(data) {
            loadedConfigs = data || [];
            renderConfigsList(loadedConfigs);
        });
}

function deleteConfig(id) {
    if (!confirm('<?php echo addslashes($lang['car_configs_delete_confirm'] ?? 'Supprimer cette configuration ?'); ?>')) return;
    var fd = new FormData();
    fd.append('action', 'delete');
    fd.append('id', id);
    fetch('car_configs.php', { method: 'POST', body: fd })
        .then(function(r) { return r.json(); })
        .then(function() {
            var fd2 = new FormData();
            fd2.append('action', 'load_car');
            fd2.append('car_model', currentCarModel);
            return fetch('car_configs.php', { method: 'POST', body: fd2 });
        })
        .then(function(r) { return r.json(); })
        .then(function(data) {
            loadedConfigs = data || [];
            renderConfigsList(loadedConfigs);
        });
}

document.getElementById('car-detail-modal').addEventListener('click', function(e) {
    if (e.target === this) closeCarDetail();
});
document.getElementById('car-editor-modal').addEventListener('click', function(e) {
    if (e.target === this) closeCarEditor();
});
</script>
</body>
</html>
