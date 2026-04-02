<footer>
    <?php 
    // Affiche le crédit avec le numéro de version, qui vient de init.php
    echo sprintf($lang['footer_credit'], APP_VERSION); 
    ?>
    <span id="footer-update-indicator"></span>
</footer>

<div class="footer-avatar">
    <a href="https://discord.gg/bY6W9gZ6" target="_blank"><img src="logos/avatar.png" alt="<?php echo $lang['player_avatar_alt']; ?>" id="page-avatar"></a>
</div>

<style>
/* Style pour l'indicateur de mise à jour dans le pied de page */
.update-indicator {
    color: orange;
    font-weight: bold;
    text-decoration: none;
    margin-left: 8px;
    transition: color 0.3s ease;
}
.update-indicator:hover { color: darkorange; }
@media (max-width: 600px) { .update-indicator .update-text { display: none; } }
</style>

<script>
    if (typeof lmuStatsViewer === 'undefined') {
        var lmuStatsViewer = {
            appVersion: '<?php echo defined('APP_VERSION') ? APP_VERSION : '0.0.0'; ?>',
            versionCheckUrl: '<?php echo defined('VERSION_CHECK_URL') ? VERSION_CHECK_URL : ''; ?>',
            lang: {
                title: "<?php echo addslashes($lang['update_available_title'] ?? 'Mise à jour disponible'); ?>",
                current: "<?php echo addslashes($lang['update_current_version'] ?? 'Version actuelle'); ?>",
                latest: "<?php echo addslashes($lang['update_latest_version'] ?? 'Dernière version'); ?>",
                button: "<?php echo addslashes($lang['update_download_button'] ?? 'Télécharger'); ?>",
                no_update_title: "<?php echo addslashes($lang['update_no_update_title'] ?? 'À jour'); ?>",
                up_to_date: "<?php echo addslashes($lang['update_up_to_date'] ?? 'Votre application est à jour.'); ?>",
                available_short: "<?php echo addslashes($lang['update_available_short'] ?? 'Mise à jour disponible !'); ?>",
                error_title: "<?php echo addslashes($lang['update_error_title'] ?? 'Erreur de mise à jour'); ?>",
                error_message: "<?php echo addslashes($lang['update_error_message'] ?? 'Impossible de vérifier les mises à jour. Veuillez vérifier la console de votre navigateur pour les erreurs.'); ?>"
            }
        };
    }
</script>
<script src="js/update-checker.js?v=<?php echo filemtime('js/update-checker.js'); ?>"></script>
