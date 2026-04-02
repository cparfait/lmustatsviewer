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

            <div class="update-actions" style="margin-bottom: 30px;">
                <a href="<?php echo htmlspecialchars($update_info['release_url']); ?>" target="_blank" class="btn btn-primary">
                    <?php echo $lang['update_download_button'] ?? 'Télécharger la mise à jour'; ?>
                </a>
                <a href="index.php" class="btn btn-secondary"><?php echo $lang['btn_return'] ?? 'Retour'; ?></a>
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
