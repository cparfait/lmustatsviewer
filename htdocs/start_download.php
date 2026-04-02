<?php
require_once 'includes/init.php';

header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

// URL depuis version.json côté serveur uniquement (jamais depuis l'utilisateur)
$versionData = get_remote_version_data(VERSION_CHECK_URL);
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

$ch = curl_init($downloadUrl);
curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_FOLLOWLOCATION => true,
    CURLOPT_MAXREDIRS      => 10,
    CURLOPT_TIMEOUT        => 120,
    CURLOPT_USERAGENT      => 'LMU-Stats-Viewer-Updater',
]);

$data     = curl_exec($ch);
$httpCode = curl_getinfo($ch, CURLINFO_HTTP_CODE);
$error    = curl_error($ch);
curl_close($ch);

if ($data === false || $httpCode !== 200) {
    echo json_encode(['status' => 'error', 'message' => 'Download failed (HTTP ' . $httpCode . ') ' . $error]);
    exit;
}

if (file_put_contents($destFile, $data) === false) {
    echo json_encode(['status' => 'error', 'message' => 'Cannot write to temp directory']);
    exit;
}

echo json_encode(['status' => 'complete', 'size' => strlen($data)]);
