<?php
require_once 'includes/init.php';

// ── Parsing CHANGELOG.md ─────────────────────────────────────────────────────

function render_changelog(string $path, string $target_lang, string $translate_label): string {
    if (!is_readable($path)) return '';

    $lines     = file($path, FILE_IGNORE_NEW_LINES);
    $html      = '';
    $in_list   = false;
    $in_card   = false;

    $section_icons = [
        'Added'       => '✅', 'Ajouté'       => '✅',
        'Fixed'       => '🐛', 'Corrigé'      => '🐛',
        'Changed'     => '♻️',  'Modifié'      => '♻️',
        'Improved'    => '⬆️',  'Amélioré'     => '⬆️',
        'Removed'     => '🗑️', 'Supprimé'     => '🗑️',
        'Performance' => '⚡',
        'Internal'    => '🔧', 'Interne'      => '🔧',
    ];

    foreach ($lines as $line) {
        $line = rtrim($line);

        // Skip main title & intro sentence
        if (str_starts_with($line, '# ') || $line === '' && !$in_card) continue;
        if (str_starts_with($line, 'All notable') || str_starts_with($line, 'Toutes')) continue;

        // Horizontal rule — skip (visual separation handled by cards)
        if ($line === '---') continue;

        // Version heading  ## [0.9.5] — 2026-04-11
        if (preg_match('/^## \[(.+?)\](.*)$/', $line, $m)) {
            if ($in_list)  { $html .= '</ul>'; $in_list = false; }
            if ($in_card)  { $html .= '</div></div>'; }
            $version   = htmlspecialchars($m[1]);
            $safe_id   = 'cl-body-' . preg_replace('/[^a-z0-9]/', '-', strtolower($m[1]));
            $date      = trim($m[2]);
            $date_html = $date ? '<span class="cl-date">' . htmlspecialchars($date) . '</span>' : '';
            $badge_cls = ($m[1] === 'Unreleased') ? 'cl-badge cl-badge-dev' : 'cl-badge cl-badge-release';
            $html    .= '<div class="cl-card"><div class="cl-card-head">'
                      . '<span class="' . $badge_cls . '">' . $version . '</span>'
                      . $date_html
                      . '<button class="btn-translate cl-translate" onclick="translateCard(\'' . $safe_id . '\',\'' . $target_lang . '\')">'
                      . $translate_label
                      . '</button>'
                      . '</div><div class="cl-card-body" id="' . $safe_id . '">';
            $in_card  = true;
            continue;
        }

        // Section heading  ### Added
        if (preg_match('/^### (.+)$/', $line, $m)) {
            if ($in_list) { $html .= '</ul>'; $in_list = false; }
            $label = $m[1];
            $icon  = $section_icons[$label] ?? '📌';
            $html .= '<h3 class="cl-section">' . $icon . ' ' . htmlspecialchars($label) . '</h3>';
            continue;
        }

        // List item
        if (preg_match('/^- (.+)$/', $line, $m)) {
            if (!$in_list) { $html .= '<ul class="cl-list">'; $in_list = true; }
            $item = htmlspecialchars($m[1]);
            $item = preg_replace('/\*\*(.+?)\*\*/', '<strong>$1</strong>', $item);
            $item = preg_replace('/\*(.+?)\*/',     '<em>$1</em>',         $item);
            $item = preg_replace('/`(.+?)`/',        '<code>$1</code>',    $item);
            $html .= '<li>' . $item . '</li>';
            continue;
        }

        // Empty line
        if ($line === '') {
            if ($in_list) { $html .= '</ul>'; $in_list = false; }
            continue;
        }

        // Plain paragraph
        if ($in_list) { $html .= '</ul>'; $in_list = false; }
        if ($in_card) $html .= '<p class="cl-para">' . htmlspecialchars($line) . '</p>';
    }

    if ($in_list) $html .= '</ul>';
    if ($in_card) $html .= '</div></div>';

    return $html;
}

$changelog_html = render_changelog(
    __DIR__ . '/../CHANGELOG.md',
    $current_lang,
    htmlspecialchars($lang['translate_button'] ?? 'Traduire')
);
?>
<!DOCTYPE html>
<html lang="<?php echo $current_lang; ?>" data-theme="<?php echo $config['theme'] ?? 'light'; ?>">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title><?php echo htmlspecialchars($lang['changelog_title']); ?> — LMU Stats Viewer</title>
    <link rel="icon" href="logos/favicon.ico" type="image/x-icon">
    <link rel="stylesheet" href="css/style.css?v=<?php echo @filemtime('css/style.css'); ?>">
    <style>
        .cl-wrap {
            max-width: 820px;
            margin: 30px auto;
            padding: 32px 36px 48px;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            font-size: 1rem;
            background: var(--card-bg-color);
            border-radius: 8px;
            box-shadow: 0 2px 10px var(--shadow-color-light);
        }

        /* ── En-tête ── */
        .cl-header {
            display: flex;
            align-items: center;
            gap: 18px;
            padding-bottom: 24px;
            border-bottom: 1px solid var(--border-color);
            margin-bottom: 30px;
        }
.cl-header-text h1 { margin: 0 0 3px; font-size: 1.35em; }
        .cl-header-text p  { margin: 0; font-size: 0.82em; color: var(--text-color-light); }
        .cl-back {
            padding: 6px 14px;
            font-size: 0.85em;
            white-space: nowrap;
            flex-shrink: 0;
        }

        /* ── Cards de version ── */
        .cl-card {
            border: 1px solid var(--border-color);
            border-radius: 10px;
            margin-bottom: 20px;
            background: var(--card-bg-color);
            overflow: hidden;
        }
        .cl-card-head {
            display: flex;
            align-items: center;
            gap: 14px;
            padding: 14px 20px;
            background: var(--header-bg-color);
            border-bottom: 1px solid var(--border-color);
            color: #fff;
        }
        .cl-badge {
            font-size: 1em;
            font-weight: 700;
            letter-spacing: 0.02em;
            padding: 3px 12px;
            border-radius: 20px;
            border: 1.5px solid rgba(255,255,255,0.5);
            background: rgba(255,255,255,0.12);
            color: #fff;
        }
        .cl-badge-dev {
            border-color: #f59e0b;
            background: rgba(245,158,11,0.18);
            color: #fcd34d;
        }
        .cl-date {
            font-size: 0.82em;
            color: rgba(255,255,255,0.6);
        }
        .cl-card-body { padding: 18px 22px 14px; }

        /* ── Sections internes ── */
        .cl-section {
            margin: 14px 0 6px;
            font-size: 0.88em;
            font-weight: 600;
            text-transform: uppercase;
            letter-spacing: 0.06em;
            color: var(--text-color-light);
            border: none;
            padding: 0;
        }
        .cl-section:first-child { margin-top: 0; }
        .cl-list {
            margin: 0 0 10px 0;
            padding-left: 22px;
            font-size: 0.9em;
            line-height: 1.7;
        }
        .cl-list li { margin-bottom: 2px; }
        .cl-list code {
            font-size: 0.88em;
            background: var(--row-hover-bg-color);
            padding: 1px 5px;
            border-radius: 4px;
        }
        .cl-para { font-size: 0.9em; color: var(--text-color-light); margin: 6px 0; }

        /* ── Message vide ── */
        .cl-empty {
            text-align: center;
            padding: 60px 20px;
            color: var(--text-color-light);
            font-size: 0.95em;
        }

        /* ── Bouton traduction dans le card head sombre ── */
        .cl-translate {
            margin-left: auto;
            background: rgba(255,255,255,0.12);
            border-color: rgba(255,255,255,0.35);
            color: rgba(255,255,255,0.85);
        }
        .cl-translate:hover {
            background: rgba(255,255,255,0.22);
        }

        @media (max-width: 600px) {
            .cl-wrap { padding: 20px 16px 40px; }
            .cl-card-body { padding: 14px 16px 10px; }
        }
    </style>
</head>
<body>
<div class="cl-wrap">

    <div class="cl-header">
        <a href="config.php?lang=<?php echo $current_lang; ?>" class="btn btn-secondary cl-back">← <?php echo htmlspecialchars($lang['btn_return'] ?? 'Retour'); ?></a>
        <div class="cl-header-text">
            <h1>📋 <?php echo htmlspecialchars($lang['changelog_title']); ?></h1>
            <p>LMU Stats Viewer</p>
        </div>
    </div>

    <?php if ($changelog_html): ?>
        <?php echo $changelog_html; ?>
    <?php else: ?>
        <div class="cl-empty"><?php echo htmlspecialchars($lang['changelog_not_available']); ?></div>
    <?php endif; ?>

</div>
<?php require 'includes/footer.php'; ?>
<script>
function translateCard(bodyId, targetLang) {
    const el = document.getElementById(bodyId);
    if (!el) return;
    let text = '';
    el.querySelectorAll('li').forEach(li => { text += li.textContent.trim() + '\n'; });
    if (text.trim()) {
        window.open('https://translate.google.com/?sl=auto&tl=' + targetLang + '&text=' + encodeURIComponent(text) + '&op=translate', '_blank');
    }
}
</script>
</body>
</html>
