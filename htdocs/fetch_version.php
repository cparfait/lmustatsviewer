<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

function is_valid_version_payload(mixed $data): bool {
    if (!is_array($data)) return false;
    // latest_version : requis, format x.y ou x.y.z
    if (empty($data['latest_version']) || !is_string($data['latest_version'])) return false;
    if (!preg_match('/^\d+\.\d+(\.\d+)?$/', trim($data['latest_version']))) return false;
    // release_url : requis, URL valide
    if (empty($data['release_url']) || !filter_var($data['release_url'], FILTER_VALIDATE_URL)) return false;
    // download_url : optionnel, mais doit être une URL valide si présent
    if (isset($data['download_url']) && !filter_var($data['download_url'], FILTER_VALIDATE_URL)) return false;
    return true;
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = file_get_contents('php://input');
    $decoded_data = json_decode($data, true);

    if (json_last_error() !== JSON_ERROR_NONE || !is_valid_version_payload($decoded_data)) {
        header('Content-Type: application/json', true, 400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid payload']);
        exit;
    }

    // Ne stocker que les champs attendus (pas de pollution de session)
    $_SESSION['update_info'] = [
        'latest_version' => trim($decoded_data['latest_version']),
        'release_url'    => $decoded_data['release_url'],
        'download_url'   => $decoded_data['download_url'] ?? null,
        'changelog'      => is_array($decoded_data['changelog'] ?? null) ? $decoded_data['changelog'] : [],
    ];
    header('Content-Type: application/json');
    echo json_encode(['status' => 'success']);
} else {
    header('Content-Type: application/json', true, 405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
}
?>
