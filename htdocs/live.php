<?php
require_once 'includes/init.php';

$back_url  = 'index.php?lang=' . $current_lang;
$is_dark   = ($current_theme === 'dark');
$demo_mode = isset($_GET['demo']);

$cars_registry     = json_decode(@file_get_contents(__DIR__ . '/includes/cars.json'),     true) ?: [];
$circuits_registry = json_decode(@file_get_contents(__DIR__ . '/includes/circuits.json'), true) ?: [];

$labels = [
    'back'          => $lang['btn_return']     ?? 'Retour aux Stats',
    'waiting'       => $lang['live_loading']   ?? 'En attente du jeu…',
    'no_data'       => $lang['no_live_session'] ?? 'Lancez Le Mans Ultimate pour voir les données.',
    'tab_live'      => 'Live',
    'tab_standings' => $lang['tab_standings']  ?? 'Classement',
    'tab_map'       => $lang['tab_map']        ?? 'Carte',
    'tab_3d'        => '3D',
    'speed'         => $lang['lbl_speed']      ?? 'Vitesse',
    'gear'          => $lang['lbl_gear']       ?? 'Rapport',
    'engine'        => $lang['lbl_engine']     ?? 'Régime Moteur',
    'water'         => $lang['lbl_water']      ?? 'Eau',
    'oil'           => $lang['lbl_oil']        ?? 'Huile',
    'fuel'          => $lang['lbl_fuel']       ?? 'Carburant',
    'conso'         => $lang['lbl_conso']      ?? 'Conso./Tour',
    'autonomy'      => $lang['lbl_autonomy']   ?? 'Autonomie',
    'laps'          => $lang['laps_header']    ?? 'tours',
    'damage'        => $lang['lbl_damage']     ?? 'Dégâts',
    'weather'       => $lang['lbl_weather']    ?? 'Météo & Piste',
    'air'           => $lang['lbl_air']        ?? 'Air',
    'track_t'       => $lang['lbl_track_temp'] ?? 'Piste',
    'wind'          => $lang['lbl_wind']       ?? 'Vent',
    'condition'     => $lang['lbl_condition']  ?? 'État',
    'dry'           => $lang['cond_dry']       ?? 'Sèche',
    'wet'           => $lang['cond_wet']       ?? 'Humide',
    'rain'          => $lang['cond_rain']      ?? 'Mouillée',
    'driver'        => $lang['driver_header']  ?? 'Pilote',
    'name'          => $lang['driver_header']  ?? 'Nom',
    'car'           => $lang['car_header']     ?? 'Voiture',
    'chrono'        => $lang['lbl_chrono']     ?? 'Chrono',
    'current_lap'   => $lang['lbl_cur_lap']   ?? 'Tour Actuel',
    'last_lap'      => $lang['last_lap']       ?? 'Dernier Tour',
    'best_lap'      => $lang['th_best_lap']    ?? 'Meilleur Tour',
    'lap_num'       => $lang['laps_header']    ?? 'Tour',
    'session'       => $lang['lbl_session']    ?? 'Session',
    'circuit'       => $lang['lbl_circuit']    ?? 'Circuit',
    'elapsed'       => $lang['lbl_elapsed']    ?? 'Temps écoulé',
    'last_upd'      => $lang['lbl_last_upd']  ?? 'Dernière MàJ',
    'sectors'       => $lang['lbl_sectors']    ?? 'Secteurs',
    'tires'         => $lang['lbl_tires']      ?? 'Pneus',
    'tire_temp'     => $lang['lbl_tire_temp']  ?? 'Pneu',
    'brake'         => $lang['lbl_brake']      ?? 'Frein',
    'pressure'      => $lang['lbl_pressure']   ?? 'Pression',
    'pedals'        => $lang['lbl_pedals']     ?? 'Pédales',
    'accel'         => $lang['lbl_accel']      ?? 'Accel',
    'history'       => $lang['lbl_history']    ?? 'Historique (5s)',
    'standings_h'   => $lang['tab_standings']  ?? 'Classement',
    'map_h'         => $lang['tab_map']        ?? 'Carte du Circuit',
    'pos'           => $lang['pos_header']     ?? 'Pos',
    'cl'            => $lang['th_class']       ?? 'Cl.',
    'gap'           => $lang['th_total_time']  ?? 'Écart',
    'pits'          => $lang['in_pits']        ?? 'PITS',
    'formation'     => $lang['formation_lap']  ?? 'Tour de Formation',
    'fcy'           => $lang['fcy']            ?? 'Full Course Yellow',
    'race_resume'   => $lang['race_resume']    ?? 'Reprise de la course',
    'red_flag'      => $lang['red_flag']       ?? 'Drapeau Rouge',
    'steering'      => $lang['lbl_steering']   ?? 'Direction',
    'stint_strategy'=> $lang['lbl_stint_strategy'] ?? 'Stint Strategy',
    'stint_lap'     => $lang['lbl_stint_lap']  ?? 'Stint Tour',
    'remaining'     => $lang['lbl_remaining']  ?? 'Tours Restants',
    'pit_window'    => $lang['lbl_pit_window'] ?? 'Pit Window',
    'view_3d'       => $lang['lbl_view_3d']    ?? 'Vue 3D du Circuit',
    'loading_3d'    => $lang['lbl_loading_3d'] ?? 'Chargement de Three.js…',
    'unavail_3d'    => $lang['lbl_3d_unavail'] ?? 'Impossible de charger Three.js',
    'elevation'     => $lang['lbl_elevation']  ?? 'Élévation',
    'reset_cam'     => $lang['lbl_reset_cam']  ?? 'Reset caméra',
    'throttle_input'=> $lang['lbl_throttle_input'] ?? 'Accélérateur',
    'brake_input'   => $lang['lbl_brake_input']    ?? 'Frein',
    'vs_leader'     => $lang['lbl_vs_leader']     ?? 'vs P1',
    'gap_ahead'     => $lang['lbl_gap_ahead']     ?? 'Δ devant',
    'max'           => $lang['lbl_max']           ?? 'Max',
    'coasting'      => $lang['lbl_coasting']      ?? 'Point mort',
    'you'           => $lang['lbl_you']           ?? 'Vous',
    'live_telemetry'=> $lang['lbl_live_telemetry'] ?? 'Live Télémétrie',
];
?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $labels['live_telemetry']; ?> — <?php echo htmlspecialchars(PLAYER_NAME); ?></title>
    <link rel="icon" href="logos/favicon.ico" type="image/x-icon">
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
        :root {
            --theme-bg-page:   <?php echo $is_dark ? '#111827' : '#f1f5f9'; ?>;
            --theme-bg-card:   <?php echo $is_dark ? '#1f2937' : '#ffffff'; ?>;
            --theme-bg-card2:  <?php echo $is_dark ? '#374151' : '#f8fafc'; ?>;
            --theme-border:    <?php echo $is_dark ? '#374151' : '#e2e8f0'; ?>;
            --theme-text-pri:  <?php echo $is_dark ? '#f3f4f6' : '#1e293b'; ?>;
            --theme-text-sec:  <?php echo $is_dark ? '#9ca3af' : '#64748b'; ?>;
            --theme-text-muted:<?php echo $is_dark ? '#6b7280' : '#94a3b8'; ?>;
            --theme-nav-bg:    <?php echo $is_dark ? '#1f2937' : '#ffffff'; ?>;
            --theme-tab-line:  <?php echo $is_dark ? '#374151' : '#e2e8f0'; ?>;
        }
    </style>
    <link rel="stylesheet" href="live/live_styles.css">
</head>
<body>
<div id="flag-overlay"></div>

<div style="max-width:1400px;margin:0 auto;">
    <?php include 'live/live_header.php'; ?>

    <div class="main-content">
        <?php include 'live/live_tab_live.php'; ?>
        <?php include 'live/live_tab_standings.php'; ?>
        <?php include 'live/live_tab_map.php'; ?>
        <?php include 'live/live_tab_3d.php'; ?>
    </div>

    <div id="status-overlay">
        <div class="status-icon">🏁</div>
        <div class="status-msg" id="status-msg"><?php echo $labels['waiting']; ?></div>
    </div>

    <div class="w-full clear-both flex justify-center mt-8 mb-4">
        <div class="w-full flex flex-col items-center">
            <?php require 'includes/footer.php'; ?>
        </div>
    </div>
</div>

<script>
const CFG = {
    isDark: <?php echo $is_dark ? 'true' : 'false'; ?>,
    demoMode: <?php echo $demo_mode ? 'true' : 'false'; ?>,
    lang: <?php echo json_encode([
        'waiting'    => $labels['waiting'],
        'no_data'    => $labels['no_data'],
        'dry'        => $labels['dry'],
        'wet'        => $labels['wet'],
        'rain'       => $labels['rain'],
        'pits'       => $labels['pits'],
        'formation'  => $labels['formation'],
        'fcy'        => $labels['fcy'],
        'race_resume'=> $labels['race_resume'],
        'red_flag'   => $labels['red_flag'],
        'unavail_3d' => $labels['unavail_3d'],
        'throttle'   => $labels['throttle_input'],
        'brake'      => $labels['brake_input'],
        'coasting'   => $labels['coasting'],
        'you'        => $labels['you'],
    ]); ?>,
    cars:     <?php echo json_encode($cars_registry,     JSON_UNESCAPED_UNICODE); ?>,
    circuits: <?php echo json_encode($circuits_registry, JSON_UNESCAPED_UNICODE); ?>,
};
</script>
<script src="live/live_js_core.js"></script>
<script src="live/live_js_gauges.js"></script>
<script src="live/live_js_stint.js"></script>
<script src="live/live_js_map.js"></script>
<script src="live/live_js_3d.js"></script>
</body>
</html>
