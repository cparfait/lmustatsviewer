<?php
require_once 'includes/init.php';

if (isset($_SESSION['update_info'])) {
    $update_info = $_SESSION['update_info'];
    unset($_SESSION['update_info']);
} else {
    $update_info = get_remote_version_data(VERSION_CHECK_URL);
}

$is_update_available = $update_info
    && isset($update_info['latest_version'])
    && version_compare($update_info['latest_version'], APP_VERSION, '>');
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
                <strong>Erreur :</strong> Impossible de récupérer les informations de mise à jour. Le serveur distant est peut-être indisponible.
            </div>
            <div class="update-actions">
                <a href="index.php" class="btn btn-secondary"><?php echo $lang['btn_return'] ?? 'Retour'; ?></a>
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

            <div class="update-actions" style="margin-bottom: 20px;">
                <?php if (!empty($update_info['download_url'])): ?>
                <a href="<?php echo htmlspecialchars($update_info['download_url']); ?>"
                   class="btn btn-primary">
                    <?php echo $lang['update_download_direct'] ?? '⬇️ Télécharger l\'installeur'; ?>
                </a>
                <?php endif; ?>
                <a href="changelog.php?lang=<?php echo $current_lang; ?>" class="btn btn-secondary">
                    📋 <?php echo htmlspecialchars($lang['changelog_title'] ?? 'Notes de version'); ?>
                </a>
                <a href="index.php" class="btn btn-secondary"><?php echo $lang['btn_return'] ?? 'Retour'; ?></a>
            </div>

            <div class="update-install-steps">
                <h3>📋 <?php echo $lang['update_install_title'] ?? 'Comment mettre à jour ?'; ?></h3>
                <ol>
                    <li><?php echo $lang['update_step1'] ?? 'Cliquez sur Télécharger l\'installeur ci-dessus.'; ?></li>
                    <li><?php echo $lang['update_step2'] ?? 'Ouvrez le fichier téléchargé et suivez l\'assistant d\'installation.'; ?></li>
                    <li><?php echo $lang['update_step3'] ?? 'L\'ancienne version sera désinstallée automatiquement.'; ?></li>
                </ol>
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
</body>
</html>
