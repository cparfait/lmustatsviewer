<?php
/**
 * Tests unitaires — fonctions pures de LMU Stats Viewer.
 *
 * Usage : php htdocs/tests/run_tests.php
 *
 * Fonctions testées :
 *   - formatSecondsToMmSsMs()   (includes/functions.php)
 *   - compute_event_groups()    (includes/functions.php)
 *   - _normalize_car_class()    (includes/indexer.php)
 *
 * Aucune dépendance externe, aucune base de données requise.
 * Les includes qui auraient des effets de bord (init.php, db.php) sont évités —
 * on charge uniquement ce dont les fonctions testées ont besoin.
 */

// ────────────────────────────────────────────────────────────────────────────
// Bootstrap minimal : charger uniquement functions.php et les fonctions de
// indexer.php sans déclencher require_once db.php (qui ouvre la vraie DB).
// ────────────────────────────────────────────────────────────────────────────

// functions.php n'a aucun require_once → chargement direct.
require_once __DIR__ . '/../includes/functions.php';

// indexer.php charge db.php via require_once (chemin absolu résolu depuis __DIR__).
// On le laisse faire — les fonctions DB sont définies mais jamais appelées ici.
require_once __DIR__ . '/../includes/indexer.php';

// ────────────────────────────────────────────────────────────────────────────
// Micro-framework de test
// ────────────────────────────────────────────────────────────────────────────

$passed = 0;
$failed = 0;

function ok(bool $condition, string $label): void {
    global $passed, $failed;
    if ($condition) {
        echo "  [PASS] $label\n";
        $passed++;
    } else {
        echo "  [FAIL] $label\n";
        $failed++;
    }
}

function section(string $title): void {
    echo "\n--- $title ---\n";
}

// ────────────────────────────────────────────────────────────────────────────
// 1. formatSecondsToMmSsMs()
// ────────────────────────────────────────────────────────────────────────────

section('formatSecondsToMmSsMs()');

ok(formatSecondsToMmSsMs(0)          === 'N/A', 'zero → N/A');
ok(formatSecondsToMmSsMs(-1)         === 'N/A', 'negative → N/A');
ok(formatSecondsToMmSsMs(null)       === 'N/A', 'null → N/A');
ok(formatSecondsToMmSsMs(INF)        === 'N/A', 'INF → N/A');
ok(formatSecondsToMmSsMs('abc')      === 'N/A', 'non-numeric string → N/A');

// 1 min 23.456 s  → "1:23.456"
ok(formatSecondsToMmSsMs(83.456)     === '1:23.456', '83.456 s → 1:23.456');

// 0 min 05.001 s  → "0:05.001"
ok(formatSecondsToMmSsMs(5.001)      === '0:05.001', '5.001 s → 0:05.001');

// showMinutes = false, sub-minute → no minutes prefix
// Note: use float values that are exactly representable in binary (multiples of 0.125/0.25/0.5)
// to avoid floor() truncating milliseconds by 1 due to IEEE-754 imprecision.
ok(formatSecondsToMmSsMs(45.25, false) === '45.250s', '45.25 s, showMinutes=false → 45.250s');

// showMinutes = false but > 60 s → minutes still shown
ok(formatSecondsToMmSsMs(125.0, false) === '2:05.000', '125 s, showMinutes=false → still shows minutes');

// Milliseconds zero-padding (use binary-safe float: 60.125 = 60 + 1/8)
ok(formatSecondsToMmSsMs(60.125)     === '1:00.125', '60.125 s → 1:00.125 (ms zero-padded)');

// ────────────────────────────────────────────────────────────────────────────
// 2. compute_event_groups()
// ────────────────────────────────────────────────────────────────────────────

section('compute_event_groups()');

// Helper : construire une session fictive
function make_session(int $ts, string $track, string $setting): array {
    return ['timestamp' => $ts, 'track' => $track, 'setting' => $setting];
}

// 2.1 — Séquence simple : Practice → Qualify → Race sur le même circuit, moins de 2 h
$t = 1_700_000_000;
$sessions = [
    make_session($t,        'Spa', 'Multiplayer'),
    make_session($t + 1800, 'Spa', 'Multiplayer'),
    make_session($t + 3600, 'Spa', 'Multiplayer'),
];
$result = compute_event_groups($sessions);
ok($result[0]['event_id'] === $t, 'group 1 : practice rejoint group (event_id = ts practice)');
ok($result[1]['event_id'] === $t, 'group 1 : qualify rejoint même groupe');
ok($result[2]['event_id'] === $t, 'group 1 : race rejoint même groupe');

// 2.2 — Deux événements séparés par > 2 h → deux groupes distincts
$sessions2 = [
    make_session($t,        'Spa', 'Multiplayer'),
    make_session($t + 7201, 'Spa', 'Multiplayer'), // > 7200 s d'écart
];
$result2 = compute_event_groups($sessions2);
ok($result2[0]['event_id'] !== $result2[1]['event_id'], 'gap > 2h → deux groupes distincts');

// 2.3 — Circuit différent → nouveau groupe même si < 2 h
$sessions3 = [
    make_session($t,        'Spa',     'Multiplayer'),
    make_session($t + 100,  'Monza',   'Multiplayer'),
];
$result3 = compute_event_groups($sessions3);
ok($result3[0]['event_id'] !== $result3[1]['event_id'], 'circuit différent → nouveau groupe');

// 2.4 — Session solo (setting != Multiplayer) → toujours nouveau groupe
$sessions4 = [
    make_session($t,        'Spa', 'Multiplayer'),
    make_session($t + 100,  'Spa', 'Offline'),
    make_session($t + 200,  'Spa', 'Multiplayer'),
];
$result4 = compute_event_groups($sessions4);
ok($result4[1]['event_id'] !== $result4[0]['event_id'], 'session Offline → nouveau groupe');
// session[2] est Multiplayer, même track, < 2h après session[1] (Offline) → rejoint le groupe Offline
ok($result4[2]['event_id'] === $result4[1]['event_id'], 'session Multiplayer après Offline (même track, < 2h) → rejoint le groupe précédent');

// 2.5 — Liste vide
ok(compute_event_groups([]) === [], 'liste vide → tableau vide');

// 2.6 — Session unique
$single = compute_event_groups([make_session($t, 'Spa', 'Multiplayer')]);
ok(count($single) === 1 && $single[0]['event_id'] === $t, 'session unique → event_id = son propre timestamp');

// ────────────────────────────────────────────────────────────────────────────
// 3. _normalize_car_class()
// ────────────────────────────────────────────────────────────────────────────

section('_normalize_car_class()');

ok(_normalize_car_class('Hyper')     === 'Hyper',     '"Hyper" → "Hyper"');
ok(_normalize_car_class('hyper')     === 'Hyper',     '"hyper" (lowercase) → "Hyper"');
ok(_normalize_car_class('HYPER')     === 'Hyper',     '"HYPER" (uppercase) → "Hyper"');
ok(_normalize_car_class('LMP2 ELMS') === 'LMP2 ELMS', '"LMP2 ELMS" → "LMP2 ELMS"');
ok(_normalize_car_class('LMP2_ELMS') === 'LMP2 ELMS', '"LMP2_ELMS" (underscore) → "LMP2 ELMS"');
ok(_normalize_car_class('LMP2 Elms') === 'LMP2 ELMS', '"LMP2 Elms" (mixed case) → "LMP2 ELMS"');
ok(_normalize_car_class('GT3')       === 'GT3',        '"GT3" → "GT3" (trimmed, unchanged)');
ok(_normalize_car_class('  GTE  ')   === 'GTE',        '"  GTE  " → "GTE" (whitespace trimmed)');
ok(_normalize_car_class('LMP3')      === 'LMP3',       '"LMP3" → "LMP3"');

// ────────────────────────────────────────────────────────────────────────────
// Résumé
// ────────────────────────────────────────────────────────────────────────────

$total = $passed + $failed;
echo "\n════════════════════════════════\n";
echo "Résultat : $passed/$total tests passés";
if ($failed > 0) {
    echo " ($failed ÉCHEC(S))";
}
echo "\n════════════════════════════════\n";
exit($failed > 0 ? 1 : 0);
