document.addEventListener('DOMContentLoaded', function() {
    if (typeof lmuStatsViewer === 'undefined' || !lmuStatsViewer.versionCheckUrl) {
        return;
    }

    const { appVersion, versionCheckUrl, lang } = lmuStatsViewer;

    fetch(versionCheckUrl)
        .then(response => {
            if (!response.ok) {
                return Promise.reject('Network error');
            }
            return response.json();
        })
        .then(data => {
            // Envoyer les données au proxy PHP et attendre la réponse
            return fetch('fetch_version.php', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(data),
            })
            .then(proxyResponse => proxyResponse.json())
            .then(proxyResult => {
                if (proxyResult.status !== 'success') {
                    console.error('Failed to store update info via proxy.');
                }
                // Renvoyer les données originales pour la suite
                return data;
            });
        })
        .then(data => {
            if (data && data.latest_version && data.latest_version > appVersion) {
                const configContainer = document.getElementById('update-notification-container');
                if (configContainer) {
                    configContainer.innerHTML = `
                        <div class="message success update-notice">
                            <strong>🚀 ${lang.title}</strong><br>
                            ${lang.current} <code>${appVersion}</code><br>
                            ${lang.latest} <code>${data.latest_version}</code><br>
                            <a href="update.php" class="btn btn-secondary" style="margin-top:10px; display:inline-block;">
                                ${lang.button}
                            </a>
                        </div>`;
                }

                const footerIndicator = document.getElementById('footer-update-indicator');
                if (footerIndicator) {
                    const dlAttr = data.download_url ? ` | <a href="${data.download_url}" class="update-indicator" download>⬇️</a>` : '';
                    footerIndicator.innerHTML = `
                        <a href="update.php" class="update-indicator" title="${lang.available_short} (v${data.latest_version})">
                            ⚠️ <span class="update-text">${lang.available_short}</span>
                        </a>${dlAttr}
                    `;
                }
            } else {
                const configContainer = document.getElementById('update-notification-container');
                if (configContainer) {
                     configContainer.innerHTML = `
                        <div class="message info update-notice">
                            <strong>✅ ${lang.no_update_title}</strong><br>
                            ${lang.up_to_date} (<code>${appVersion}</code>)
                        </div>`;
                }
            }
        })
        .catch(error => {
            console.error('Erreur lors de la vérification de la mise à jour :', error);
            const configContainer = document.getElementById('update-notification-container');
            if (configContainer) {
                // Utilise des clés de langue spécifiques pour l'erreur pour une meilleure traduction
                configContainer.innerHTML = `
                    <div class="message error update-notice">
                        <strong>${lang.error_title || 'Erreur de mise à jour'}</strong><br>
                        ${lang.error_message || 'Impossible de vérifier les mises à jour. Veuillez vérifier la console de votre navigateur pour les erreurs.'}
                    </div>`;
            }
        });
});
