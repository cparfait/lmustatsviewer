<?php
header('Content-Type: application/json');

if ($_SERVER['REQUEST_METHOD'] !== 'POST') {
    http_response_code(405);
    echo json_encode(['status' => 'error', 'message' => 'Method not allowed']);
    exit;
}

$destFile = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'lmu_stats_setup.exe';

if (!file_exists($destFile)) {
    echo json_encode(['status' => 'error', 'message' => 'Installer not found in temp folder']);
    exit;
}

// Lance l'installeur sans bloquer le serveur PHP
pclose(popen('start "" "' . $destFile . '"', 'r'));

echo json_encode(['status' => 'launched']);
