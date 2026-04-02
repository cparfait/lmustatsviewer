<?php
require_once 'includes/init.php';

// Priorité 1: Utiliser les données de la session si elles existent
if (isset($_SESSION['update_info'])) {
    $update_info = $_SESSION['update_info'];
    // On nettoie pour ne pas les garder indéfiniment
    unset($_SESSION['update_info']); 
} else {
    // Fallback: Essayer de récupérer directement (peut échouer)
    $update_info = get_remote_version_data(VERSION_CHECK_URL);
}

$is_update_available = $update_info && isset($update_info['latest_version']) && version_compare($update_info['latest_version'], APP_VERSION, '>');
$fetch_error = !$update_info;

?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>" data-theme="<?php echo $current_theme; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo $lang['update_title'] ?? 'Mise à jour'; ?> - LMU Stats Viewer</title>
    <link rel="icon" href="logos/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="css/style.css?v=<?php echo @filemtime('css/style.css'); ?>">
</head>
<body>
    <div class="update-container">
        <div class="update-header">
            <h1>🚀 <?php echo $lang['update_title'] ?? 'Mise à jour'; ?></h1>
        </div>

        <?php if ($fetch_error): ?>
            <div class="message error">
                <strong>Erreur :</strong> Impossible de récupérer les informations de mise à jour. Le serveur distant est peut-être indisponible ou bloque les requêtes.
            </div>
            <div class="update-actions">
                 <a href="index.php" class="btn-secondary"><?php echo $lang['btn_return'] ?? 'Retour'; ?></a>
            </div>
        <?php elseif ($is_update_available): ?>
            <p class="subtitle"><?php echo $lang['update_subtitle'] ?? 'Une nouvelle version est disponible'; ?></p>
            <div class="update-summary">
                <div class="version-info">
                    <span class="version-label"><?php echo $lang['update_current_version'] ?? 'Votre version'; ?></span>
                    <span class="version-number"><?php echo APP_VERSION; ?></span>
                </div>
                <div class="version-arrow">→</div>
                <div class="version-info latest">
                    <span class="version-label"><?php echo $lang['update_latest_version'] ?? 'Dernière version'; ?></span>
                    <span class="version-number"><?php echo htmlspecialchars($update_info['latest_version']); ?></span>
                </div>
            </div>

            <div class="update-actions" style="margin-bottom: 20px;" id="update-action-area">
                <?php if (!empty($update_info['download_url'])): ?>
                <!-- État 0 : télécharger -->
                <button id="btn-download" class="btn btn-primary" onclick="startDownload()">
                    <?php echo $lang['update_download_direct'] ?? '⬇️ Télécharger l\'installeur'; ?>
                </button>
                <!-- État 1 : en cours -->
                <button id="btn-downloading" class="btn btn-primary" disabled style="display:none;">
                    <span class="update-spinner"></span>
                    <?php echo $lang['update_downloading'] ?? 'Téléchargement en cours...'; ?>
                </button>
                <!-- État 2 : installer -->
                <button id="btn-install" class="btn btn-success" onclick="launchInstaller()" style="display:none;">
                    <?php echo $lang['update_install_now'] ?? '▶️ Installer maintenant'; ?>
                </button>
                <?php endif; ?>
                <a href="<?php echo htmlspecialchars($update_info['release_url']); ?>" target="_blank" class="btn btn-secondary">
                    <?php echo $lang['update_release_notes'] ?? 'Notes de version sur GitHub'; ?>
                </a>
                <a href="index.php" class="btn btn-secondary"><?php echo $lang['btn_return'] ?? 'Retour'; ?></a>
            </div>

            <!-- État 3 : lancé / erreur -->
            <div id="update-status-msg" style="display:none; margin-bottom:20px;"></div>

            <div class="update-install-steps" id="update-steps">
                <h3>📋 <?php echo $lang['update_install_title'] ?? 'Comment mettre à jour ?'; ?></h3>
                <ol>
                    <li><?php echo $lang['update_step1'] ?? 'Cliquez sur Télécharger l\'installeur ci-dessus.'; ?></li>
                    <li><?php echo $lang['update_step2'] ?? 'Attendez la fin du téléchargement.'; ?></li>
                    <li><?php echo $lang['update_step3'] ?? 'Cliquez sur Installer maintenant.'; ?></li>
                    <li><?php echo $lang['update_step4'] ?? 'Quittez via le tray pour finaliser.'; ?></li>
                </ol>
            </div>

            <div class="changelog-container">
                <h2><?php echo $lang['changelog_title'] ?? 'Notes de version'; ?></h2>
                <?php if (!empty($update_info['changelog'])): ?>
                    <?php foreach ($update_info['changelog'] as $version => $details): ?>
                        <div class="changelog-version">
                            <div class="changelog-header">
                                <h3>Version <?php echo htmlspecialchars($version); ?> - <?php echo htmlspecialchars($details['date']); ?></h3>
                                <button class="btn-translate" onclick="translateChangelog('changelog-<?php echo htmlspecialchars($version); ?>', '<?php echo $current_lang; ?>')">
                                    <?php echo $lang['translate_button'] ?? 'Traduire'; ?>
                                </button>
                            </div>
                            <ul id="changelog-<?php echo htmlspecialchars($version); ?>">
                                <?php foreach ($details['notes'] as $note): ?>
                                    <li><?php echo htmlspecialchars($note); ?></li>
                                <?php endforeach; ?>
                            </ul>
                        </div>
                    <?php endforeach; ?>
                <?php else: ?>
                    <p><?php echo $lang['changelog_not_available'] ?? 'Le journal des modifications n\'est pas disponible.'; ?></p>
                <?php endif; ?>
            </div>
        <?php else: ?>
            <div class="message info">
                <strong>✅ <?php echo $lang['update_no_update_title'] ?? 'Application à jour'; ?></strong><br>
                <?php echo $lang['update_up_to_date'] ?? 'Votre application est à la dernière version disponible.'; ?> (v<?php echo APP_VERSION; ?>)
            </div>
            <div class="update-actions">
                 <a href="index.php" class="btn btn-secondary"><?php echo $lang['btn_return'] ?? 'Retour'; ?></a>
            </div>
        <?php endif; ?>
    </div>
<?php require 'includes/footer.php'; ?>

<script>
const i18n = {
    error_download: <?php echo json_encode($lang['update_error_download'] ?? 'Download failed.'); ?>,
    error_install:  <?php echo json_encode($lang['update_error_install']  ?? 'Could not launch installer.'); ?>,
    launched:       <?php echo json_encode($lang['update_launched']       ?? 'Installer launched.'); ?>,
};

function startDownload() {
    document.getElementById('btn-download').style.display    = 'none';
    document.getElementById('btn-downloading').style.display = '';
    document.getElementById('update-status-msg').style.display = 'none';

    fetch('start_download.php', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'complete') {
                document.getElementById('btn-downloading').style.display = 'none';
                document.getElementById('btn-install').style.display     = '';
                document.getElementById('update-steps').style.display    = 'none';
            } else {
                showError(data.message || i18n.error_download);
            }
        })
        .catch(() => showError(i18n.error_download));
}

function launchInstaller() {
    fetch('launch_installer.php', { method: 'POST' })
        .then(r => r.json())
        .then(data => {
            if (data.status === 'launched') {
                document.getElementById('btn-install').style.display = 'none';
                showMsg(i18n.launched, 'info');
            } else {
                showError(data.message || i18n.error_install);
            }
        })
        .catch(() => showError(i18n.error_install));
}

function showError(msg) {
    document.getElementById('btn-downloading').style.display = 'none';
    document.getElementById('btn-download').style.display    = '';
    showMsg(msg, 'error');
}

function showMsg(msg, type) {
    const el = document.getElementById('update-status-msg');
    el.className = 'message ' + type;
    el.innerHTML = msg;
    el.style.display = '';
}

function translateChangelog(elementId, targetLang) {
    const changelogList = document.getElementById(elementId);
    if (!changelogList) {
        return;
    }

    let textToTranslate = '';
    changelogList.querySelectorAll('li').forEach(item => {
        textToTranslate += item.textContent + '\n';
    });

    if (textToTranslate) {
        const encodedText = encodeURIComponent(textToTranslate);
        const translateUrl = `https://translate.google.com/?sl=auto&tl=${targetLang}&text=${encodedText}&op=translate`;
        window.open(translateUrl, '_blank');
    }
}
</script>

</body>
</html>
