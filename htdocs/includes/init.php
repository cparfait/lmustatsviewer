<?php
// Fichier d'initialisation global

if (session_status() === PHP_SESSION_NONE) {
    session_start();
}

clearstatcache();

define('APP_VERSION', trim(file_get_contents(__DIR__ . '/../../version.txt'))); // Version lue depuis version.txt
// URL vers le contenu BRUT (RAW) du fichier version.json sur GitHub
define('VERSION_CHECK_URL', 'https://raw.githubusercontent.com/cparfait/lmustatsviewer/main/version.json');

$appDataPath = getenv('APPDATA');
if (!$appDataPath) {
    $appDataPath = __DIR__ . '/../data'; 
}
$userDataDir = $appDataPath . DIRECTORY_SEPARATOR . 'LMU_Stats_Viewer';

if (!is_dir($userDataDir)) {
    @mkdir($userDataDir, 0777, true);
}

$userConfigFile = $userDataDir . DIRECTORY_SEPARATOR . 'config.json';
$defaultConfigFile = __DIR__ . '/config.default.json';

if (!file_exists($userConfigFile) && file_exists($defaultConfigFile)) {
    @copy($defaultConfigFile, $userConfigFile);
}

$config = [
    'player_name' => 'Player', 'results_dir' => '', 'timezone' => 'UTC',
    'language' => 'fr', 'theme' => 'light'
];

if (file_exists($userConfigFile)) {
    $config_from_file = json_decode(file_get_contents($userConfigFile), true);
    if (is_array($config_from_file)) {
        $config = array_merge($config, $config_from_file);
    }
}

define('PLAYER_NAME', $config['player_name']);
define('RESULTS_DIR', !empty($config['results_dir']) ? rtrim($config['results_dir'], DIRECTORY_SEPARATOR) . DIRECTORY_SEPARATOR : '');
date_default_timezone_set($config['timezone']);

// --- GESTION DE LA LANGUE ---
$supported_langs = ['fr', 'en', 'es', 'de'];
$default_lang = $config['language'] ?? 'fr';

// La langue postée par un formulaire (config.php) a la priorité
if (isset($_POST['lang']) && in_array($_POST['lang'], $supported_langs)) {
    $_SESSION['current_lang'] = $_POST['lang'];
// Sinon, on vérifie les paramètres dans l'URL
} elseif (isset($_GET['lang']) && in_array($_GET['lang'], $supported_langs)) {
    $_SESSION['current_lang'] = $_GET['lang'];
}
$current_lang = $_SESSION['current_lang'] ?? $default_lang;

// --- GESTION DU THÈME ---
$supported_themes = ['light', 'dark'];
$default_theme = $config['theme'] ?? 'light';

if (isset($_GET['theme']) && in_array($_GET['theme'], $supported_themes)) {
    $_SESSION['current_theme'] = $_GET['theme'];
}
$current_theme = $_SESSION['current_theme'] ?? $default_theme;


define('USER_CONFIG_PATH', $userConfigFile);

require_once 'functions.php';

// --- CHARGEMENT DU FICHIER DE LANGUE ---
$lang_file = __DIR__ . '/../lang/lang_' . $current_lang . '.php';
if (file_exists($lang_file)) {
    require_once($lang_file);
} else {
    require_once(__DIR__ . '/../lang/lang_' . $default_lang . '.php');
}
?>
