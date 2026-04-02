<?php
require_once 'includes/init.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

// Utilise les données déjà en session (récupérées par le JS via fetch_version.php)
// pour éviter un second appel GitHub potentiellement mis en cache
$versionData = $_SESSION['update_info'] ?? get_remote_version_data(VERSION_CHECK_URL);
if (!$versionData || empty($versionData['download_url'])) {
    echo json_encode(['status' => 'error', 'message' => 'Download URL unavailable']);
    exit;
}

$downloadUrl = $versionData['download_url'];
$destFile    = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'lmu_stats_setup.exe';

if (!function_exists('curl_init')) {
    echo json_encode(['status' => 'error', 'message' => 'cURL non disponible']);
    exit;
}

if (function_exists('curl_init')) {
    $ch = curl_init($downloadUrl);
    curl_setopt_array($ch, [
        CURLOPT_RETURNTRANSFER => true,
        CURLOPT_FOLLOWLOCATION => true,
        CURLOPT_MAXREDIRS      => 10,
        CURLOPT_TIMEOUT        => 120,
        CURLOPT_USERAGENT      => 'LMU-Stats-Viewer-Updater',
    ]);
    $data  = curl_exec($ch);
    $error = curl_error($ch);
    $code  = curl_getinfo($ch, CURLINFO_HTTP_CODE);
    curl_close($ch);
    if ($data === false || $code !== 200) {
        echo json_encode(['status' => 'error', 'message' => 'Download failed (HTTP ' . $code . ') ' . $error]);
        exit;
    }
} else {
    $ctx = stream_context_create([
        'http' => [
            'follow_location' => 1,
            'max_redirects'   => 10,
            'timeout'         => 120,
            'user_agent'      => 'LMU-Stats-Viewer-Updater',
        ],
        'ssl' => ['verify_peer' => false],
    ]);
    $data = @file_get_contents($downloadUrl, false, $ctx);
    if ($data === false) {
        echo json_encode(['status' => 'error', 'message' => 'Download failed (curl indisponible, file_get_contents aussi)']);
        exit;
    }
}

if (file_put_contents($destFile, $data) === false) {
    echo json_encode(['status' => 'error', 'message' => 'Cannot write to temp directory']);
    exit;
}

echo json_encode(['status' => 'complete', 'size' => strlen($data)]);
