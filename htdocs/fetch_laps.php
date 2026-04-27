<?php
/**
 * Endpoint AJAX : retourne les temps de tours valides d'une session joueur.
 * Paramètre GET : session_id (timestamp Unix de la session).
 * Réponse : JSON array de floats [lapTime, ...] dans l'ordre des tours.
 */
require_once 'includes/init.php';
require_once 'includes/db.php';

header('Content-Type: application/json');

$session_ts = isset($_GET['session_id']) ? (int)$_GET['session_id'] : 0;
if ($session_ts <= 0) {
    echo json_encode([]);
    exit;
}

$db = get_db();

$stmt = $db->prepare("
    SELECT pl.lap_time
    FROM player_laps pl
    JOIN player_sessions ps ON pl.session_id = ps.id
    WHERE ps.timestamp = :ts
      AND pl.lap_time > 0
      AND pl.s1 > 0
      AND pl.s2 > 0
      AND pl.s3 > 0
    ORDER BY pl.lap_num ASC
");
$stmt->execute([':ts' => $session_ts]);
$laps = array_map('floatval', array_column($stmt->fetchAll(PDO::FETCH_ASSOC), 'lap_time'));

echo json_encode($laps);
