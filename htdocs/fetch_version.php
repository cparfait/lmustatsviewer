<?php
if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

if ($_SERVER['REQUEST_METHOD'] === 'POST') {
    $data = file_get_contents('php://input');
    $decoded_data = json_decode($data, true);

    if (json_last_error() === JSON_ERROR_NONE && is_array($decoded_data)) {
        $_SESSION['update_info'] = $decoded_data;
        header('Content-Type: application/json');
        echo json_encode(['status' => 'success']);
    } else {
        header('Content-Type: application/json', true, 400);
        echo json_encode(['status' => 'error', 'message' => 'Invalid JSON']);
    }
} else {
    header('Content-Type: application/json', true, 405);
    echo json_encode(['status' => 'error', 'message' => 'Method Not Allowed']);
}
?>
