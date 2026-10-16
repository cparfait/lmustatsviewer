/* ============================================================
   LMU Stats Viewer — page des notes de version
   Les publications GitHub sont la seule source : rien à tenir à jour
   à la main dans le site. Nécessite app.js (window.LMUSV).
   ============================================================ */
(function () {
  "use strict";

  // `.v2` : entrée horodatée ; les anciennes entrées (sans date) sont ignorées.
  var SS_LIST = "lmusv.releases.v2";
  var LIST_TTL = 10 * 60 * 1000;   // même durée que la dernière version (app.js)
  var MAX = 30;

  var list = document.getElementById("clList");
  if (!list) return;

  var releases = null;   // conservé pour re-rendre au changement de langue
  var picked = {};       // version → langue choisie à la main (« Lire en : … »)

  /* ─────────────── Rendu Markdown ───────────────
     Les notes de version sont écrites en Markdown sur GitHub. Le texte est
     échappé avant toute transformation : rien de ce qui vient de l'API n'est
     interprété comme du HTML. */

  function esc(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  function safeUrl(u) {
    return /^https?:\/\//i.test(u) ? u : "";
  }

  function inline(s) {
    return s
      // Les captures insérées dans les notes GitHub n'ont pas leur place ici.
      .replace(/!\[[^\]]*\]\([^)\s]*\)/g, "")
      .replace(/`([^`]+)`/g, function (_, c) { return "<code>" + c + "</code>"; })
      .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (_, t, u) {
        var href = safeUrl(u);
        return href ? '<a href="' + href + '" rel="noopener">' + t + "</a>" : t;
      })
      .replace(/(^|[\s(])(https?:\/\/[^\s<)]+)/g, function (_, p, u) {
        return p + '<a href="' + u + '" rel="noopener">' + u + "</a>";
      })
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>");
  }

  function mdToHtml(src) {
    var lines = esc(src || "").replace(/\r\n?/g, "\n").split("\n");
    var out = [];

    // La page porte déjà un h1 et chaque version un h2. Le titre le plus haut
    // des notes devient donc h3, les suivants suivent le même décalage : peu
    // importe que l'auteur ait commencé en « # » ou en « ## ».
    var top = 6;
    lines.forEach(function (l) {
      var m = l.match(/^(#{1,6})\s+\S/);
      if (m) top = Math.min(top, m[1].length);
    });
    var shift = 3 - top;

    var listType = null;     // "ul" | "ol" | null
    var inCode = false;
    var para = [];

    function flushPara() {
      if (!para.length) return;
      out.push("<p>" + inline(para.join(" ")) + "</p>");
      para = [];
    }
    function closeList() {
      if (!listType) return;
      out.push("</" + listType + ">");
      listType = null;
    }
    function openList(type) {
      if (listType === type) return;
      closeList();
      out.push("<" + type + ">");
      listType = type;
    }

    lines.forEach(function (raw) {
      var line = raw.trimEnd();

      if (/^\s*```/.test(line)) {
        flushPara(); closeList();
        out.push(inCode ? "</code></pre>" : "<pre><code>");
        inCode = !inCode;
        return;
      }
      if (inCode) { out.push(raw); return; }

      if (!line.trim()) { flushPara(); closeList(); return; }

      var h = line.match(/^(#{1,6})\s+(.*)$/);
      if (h) {
        flushPara(); closeList();
        var level = Math.min(6, Math.max(3, h[1].length + shift));
        out.push("<h" + level + ">" + inline(h[2]) + "</h" + level + ">");
        return;
      }

      if (/^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/.test(line)) {
        flushPara(); closeList(); out.push("<hr>"); return;
      }

      var ul = line.match(/^\s*[-*+]\s+(.*)$/);
      if (ul) { flushPara(); openList("ul"); out.push("<li>" + inline(ul[1]) + "</li>"); return; }

      var ol = line.match(/^\s*\d+[.)]\s+(.*)$/);
      if (ol) { flushPara(); openList("ol"); out.push("<li>" + inline(ol[1]) + "</li>"); return; }

      var bq = line.match(/^\s*&gt;\s?(.*)$/);
      if (bq) { flushPara(); closeList(); out.push("<blockquote>" + inline(bq[1]) + "</blockquote>"); return; }

      para.push(line.trim());
    });

    flushPara();
    closeList();
    if (inCode) out.push("</code></pre>");
    return out.join("\n");
  }

  /* ─────────────── Langue des notes ───────────────
     Les notes GitHub mettent plusieurs langues à la suite (FR puis EN, EN
     puis FR…), sans format commun d'une version à l'autre. On découpe le texte
     en blocs (séparés par une ligne vide), on devine la langue de chaque bloc
     et on n'affiche que celle du visiteur — repli sur l'anglais, puis la
     première trouvée. Les autres langues restent accessibles (« Lire en : … »).
     Format conseillé pour les prochaines notes : un titre par langue,
     « ## 🇫🇷 Français », « ## 🇬🇧 English », « ## 🇮🇹 Italiano »… : ces lignes
     fixent la langue des blocs qui suivent et sont retirées à l'affichage. */

  var NOTE_LANGS = ["fr", "en", "es", "de", "it"];

  // Mots courants propres à chaque langue (les mots partagés — « una », « con »,
  // « in », « du », « es »… — sont exclus pour ne pas brouiller le score).
  var STOPWORDS = {
    fr: "les des est pour dans avec vous votre vos sur sont cette aux pas plus qui et au ce être été où mais très tous toutes ton ta tes sa leur peut lors après désormais",
    en: "the and is are of to for with your you now it this that from was be at by not can when after all its has have will",
    es: "los las y para tus ahora por más muy cuando también puedes ya está",
    de: "der die das und ist mit für auf ein eine dein deine nicht von zu jetzt im den dem wird werden auch wenn bei sich nach",
    it: "il gli della delle dei di e è per tuo tua ora non che nel nella alla sulla anche quando puoi già sono più"
  };
  var WORDS = {};
  NOTE_LANGS.forEach(function (l) {
    WORDS[l] = {};
    STOPWORDS[l].split(" ").forEach(function (w) { WORDS[l][w] = true; });
  });

  // Ligne qui annonce une langue : « English », « ###Français », « ## 🇮🇹 Italiano »…
  var MARKER = /^\s*#*\s*(?:\uD83C[\uDDE6-\uDDFF]){0,2}\s*(fran[cç]ais|english|espa[nñ]ol|deutsch|italiano)\s*:?\s*$/i;
  var HR = /^\s*([-*_])\s*\1\s*\1[\s\-*_]*$/;

  function markerLang(line) {
    var m = line.match(MARKER);
    if (!m) return null;
    var w = m[1].toLowerCase();
    if (w.charAt(0) === "f") return "fr";
    if (w.charAt(0) === "d") return "de";
    if (w.charAt(0) === "i") return "it";
    return w.charAt(1) === "n" ? "en" : "es";
  }

  /** Langue d'un texte : code, "mix" (plusieurs langues mêlées) ou null (indécidable). */
  function guessLang(text) {
    var score = {};
    NOTE_LANGS.forEach(function (l) { score[l] = 0; });
    String(text).toLowerCase().split(/[^a-zà-öø-ÿ]+/).forEach(function (w) {
      if (!w) return;
      NOTE_LANGS.forEach(function (l) { if (WORDS[l][w]) score[l]++; });
    });
    var ranked = NOTE_LANGS.slice().sort(function (a, b) { return score[b] - score[a]; });
    var best = score[ranked[0]], second = score[ranked[1]];
    if (!best) return null;
    if (second >= 2 && best < 2 * second) return "mix";
    return best >= 2 * second ? ranked[0] : null;
  }

  /** Découpe en blocs (lignes vides, séparateurs, titres de langue), sans couper un bloc de code. */
  function toBlocks(src) {
    var blocks = [], cur = [], inCode = false;
    function flush() { if (cur.length) blocks.push(cur.join("\n")); cur = []; }
    String(src || "").replace(/\r\n?/g, "\n").split("\n").forEach(function (line) {
      if (/^\s*```/.test(line)) inCode = !inCode;
      if (!inCode && !line.trim()) { flush(); return; }
      if (!inCode && (HR.test(line) || MARKER.test(line))) { flush(); blocks.push(line); return; }
      cur.push(line);
    });
    flush();
    return blocks;
  }

  /**
   * Notes d'une version dans une langue. Renvoie `{ body, langs, shown }` :
   * `langs` = langues trouvées (vide si le texte n'est que dans une langue →
   * `body` intact), `shown` = langue affichée.
   */
  function notesFor(src, want, titles) {
    var blocks = toBlocks(src).map(function (text) {
      if (HR.test(text)) return { text: text, kind: "hr" };
      var ml = text.indexOf("\n") === -1 ? markerLang(text) : null;
      if (ml) return { text: text, kind: "marker", lang: ml };
      return { text: text, kind: /^#{1,6}\s/.test(text) ? "head" : "text", lang: guessLang(text) };
    });

    // Un titre de langue impose la sienne aux blocs qui suivent (sauf texte
    // nettement dans une autre langue) ; une ligne « --- » le referme.
    var forced = null;
    blocks.forEach(function (b) {
      if (b.kind === "marker") { forced = b.lang; return; }
      if (b.kind === "hr") { forced = null; return; }
      if (forced && (b.lang === null || b.kind === "head")) b.lang = forced;
    });
    // Blocs encore indécidables : un titre prend la langue de ce qu'il
    // introduit, le reste celle du bloc précédent ; à défaut, commun à toutes.
    blocks.forEach(function (b, i) {
      if (b.kind === "hr" || b.kind === "marker" || b.lang) return;
      var j;
      if (b.kind === "head") {
        for (j = i + 1; j < blocks.length && blocks[j].kind !== "hr"; j++) {
          if (blocks[j].lang && blocks[j].lang !== "mix") { b.lang = blocks[j].lang; return; }
        }
      }
      for (j = i - 1; j >= 0 && blocks[j].kind !== "hr"; j--) {
        if (blocks[j].lang && blocks[j].lang !== "mix") { b.lang = blocks[j].lang; return; }
      }
      b.lang = "mix";
    });

    var langs = NOTE_LANGS.filter(function (l) {
      return blocks.some(function (b) { return b.kind !== "marker" && b.lang === l; });
    });
    if (langs.length < 2) return { body: src, langs: [], shown: null };

    var shown = langs.indexOf(want) !== -1 ? want : langs.indexOf("en") !== -1 ? "en" : langs[0];
    var keep = blocks.map(function (b) {
      if (b.kind === "marker") return false;
      // Titre qui répète le nom de la version (déjà titre de la carte).
      if (b.kind === "head" && titles.indexOf(b.text.replace(/^#+\s*/, "").trim().toLowerCase()) !== -1) return false;
      return b.kind === "hr" || b.lang === shown || b.lang === "mix";
    });
    var out = [];
    blocks.forEach(function (b, i) {
      if (!keep[i]) return;
      if (b.kind === "hr") {
        // Un séparateur ne sert qu'entre deux blocs gardés.
        if (!out.length || HR.test(out[out.length - 1])) return;
        for (var j = i + 1; j < blocks.length; j++) {
          if (blocks[j].kind === "hr" || blocks[j].kind === "marker") continue;
          if (!keep[j]) return;
          break;
        }
        if (j >= blocks.length) return;
      }
      out.push(b.text);
    });
    return { body: out.join("\n\n"), langs: langs, shown: shown };
  }

  /* ─────────────── Mise en forme ─────────────── */

  function fmtDate(iso, lang) {
    if (!iso) return "";
    try {
      return new Date(iso).toLocaleDateString(lang, { day: "numeric", month: "long", year: "numeric" });
    } catch (e) {
      return iso.slice(0, 10);
    }
  }

  function fmtSize(bytes, unit) {
    if (!bytes) return "";
    var mb = bytes / (1024 * 1024);
    return (mb >= 10 ? Math.round(mb) : mb.toFixed(1)) + " " + unit;
  }

  function state(key) {
    var d = window.LMUSV.dict();
    list.innerHTML = '<p class="cl-state" data-i18n="' + key + '">' + esc(d[key] || "") + "</p>";
  }

  function render() {
    if (!releases) return;
    var d = window.LMUSV.dict();
    var lang = window.LMUSV.lang();

    if (!releases.length) { state("cl.empty"); return; }

    list.innerHTML = releases.map(function (r, i) {
      var tags = [];
      if (i === 0 && !r.prerelease) tags.push('<span class="cl-badge">' + esc(d["cl.latest"]) + "</span>");
      if (r.prerelease) tags.push('<span class="cl-badge cl-badge-pre">' + esc(d["cl.pre"]) + "</span>");

      var actions = [];
      if (r.asset) {
        actions.push('<a class="btn btn-primary btn-sm" data-dl="version" href="' + esc(r.asset) + '">' +
          esc(d["cl.dl"]) + (r.size ? " · " + fmtSize(r.size, d["cl.unitMb"] || "MB") : "") + "</a>");
      }
      actions.push('<a class="btn btn-ghost btn-sm" href="' + esc(r.url) + '" rel="noopener">' + esc(d["cl.gh"]) + "</a>");

      var titles = [r.name, r.version, "v" + r.version]
        .filter(Boolean).map(function (s) { return String(s).trim().toLowerCase(); });
      var notes = notesFor(r.body, picked[r.version] || lang, titles);
      var body = r.body ? mdToHtml(notes.body) : "<p>" + esc(d["cl.noNotes"]) + "</p>";
      var langBar = "";
      if (notes.langs.length) {
        langBar = '<p class="cl-langs">' +
          (notes.shown !== lang && !picked[r.version] ? esc(d["cl.notInLang"]) + " " : "") +
          esc(d["cl.readIn"]) + " " +
          notes.langs.map(function (l) {
            return l === notes.shown
              ? '<strong lang="' + l + '">' + l.toUpperCase() + "</strong>"
              : '<button type="button" lang="' + l + '" data-cl-lang="' + l + '" data-cl-version="' +
                esc(r.version) + '">' + l.toUpperCase() + "</button>";
          }).join(" · ") + "</p>";
      }

      return '<article class="cl-item">' +
        '<div class="cl-meta"><span class="cl-tag">' + esc(r.version) + "</span>" +
        (r.date ? '<time datetime="' + esc(r.date) + '">' + esc(fmtDate(r.date, lang)) + "</time>" : "") +
        tags.join("") + "</div>" +
        "<h2>" + esc(r.name || r.version) + "</h2>" +
        langBar +
        '<div class="cl-body">' + body + "</div>" +
        '<div class="cl-actions">' + actions.join("") + "</div>" +
        "</article>";
    }).join("");

    list.setAttribute("aria-busy", "false");
  }

  /* ─────────────── Chargement ─────────────── */

  /**
   * Beaucoup de notes GitHub répètent en tête le nom de la version, qui est
   * déjà le titre de la carte. On retire ce doublon.
   */
  function stripDupTitle(body, name, version) {
    var lines = String(body || "").replace(/\r\n?/g, "\n").split("\n");
    var i = 0;
    while (i < lines.length && !lines[i].trim()) i++;
    var h = lines[i] && lines[i].match(/^#{1,6}\s+(.*)$/);
    if (!h) return body;

    var title = h[1].trim().toLowerCase();
    var known = [name, version, "v" + version]
      .filter(Boolean).map(function (s) { return String(s).trim().toLowerCase(); });
    if (known.indexOf(title) === -1) return body;

    lines.splice(i, 1);
    return lines.join("\n");
  }

  /**
   * Le numéro affiché vient du tag, mais tous les tags ne sont pas des
   * numéros de version (le dépôt en compte un nommé « release ») : on retombe
   * alors sur le titre de la publication.
   */
  function versionLabel(tag, name) {
    var num = /\d+(?:\.\d+)+[\w.\-]*/;
    var m = String(tag || "").match(num) || String(name || "").match(num);
    return m ? m[0] : String(tag || name || "?").replace(/^v/i, "");
  }

  function normalise(json) {
    return (json || []).filter(function (r) { return !r.draft; }).map(function (r) {
      var exe = (r.assets || []).filter(function (a) { return /\.exe$/i.test(a.name); })[0];
      var version = versionLabel(r.tag_name, r.name);
      return {
        version: version,
        name: r.name || "",
        date: r.published_at || r.created_at || "",
        body: stripDupTitle(r.body, r.name, version),
        prerelease: !!r.prerelease,
        url: r.html_url || "",
        asset: exe ? exe.browser_download_url : "",
        size: exe ? exe.size : 0
      };
    });
  }

  /** La dernière version stable alimente aussi le badge et les boutons du site. */
  function shareLatest() {
    var latest = releases.filter(function (r) { return !r.prerelease; })[0];
    if (latest) window.LMUSV.applyRelease({ version: latest.version, asset: latest.asset });
  }

  function load() {
    var cached;
    try { cached = JSON.parse(sessionStorage.getItem(SS_LIST) || "null"); } catch (e) { cached = null; }
    var stale = cached && cached.data;
    if (stale && Date.now() - cached.t < LIST_TTL) { releases = stale; shareLatest(); render(); return; }

    if (!window.fetch) {
      if (stale) { releases = stale; shareLatest(); render(); } else state("cl.error");
      return;
    }

    fetch("https://api.github.com/repos/" + window.LMUSV.repo + "/releases?per_page=" + MAX, {
      headers: { Accept: "application/vnd.github+json" }
    })
      .then(function (r) { return r.ok ? r.json() : Promise.reject(r.status); })
      .then(function (json) {
        releases = normalise(json);
        try { sessionStorage.setItem(SS_LIST, JSON.stringify({ t: Date.now(), data: releases })); } catch (e) { /* ignoré */ }
        shareLatest();
        render();
      })
      .catch(function () {
        // Hors ligne ou quota GitHub atteint : la dernière liste connue vaut mieux qu'une erreur.
        if (stale) { releases = stale; shareLatest(); render(); return; }
        list.setAttribute("aria-busy", "false");
        var d = window.LMUSV.dict();
        list.innerHTML = '<p class="cl-state">' + esc(d["cl.error"]) +
          ' <a href="https://github.com/' + window.LMUSV.repo + '/releases" rel="noopener">' +
          esc(d["cl.errorGh"]) + "</a></p>";
      });
  }

  // « Lire en : … » : autre langue pour cette version seulement.
  list.addEventListener("click", function (e) {
    var btn = e.target.closest && e.target.closest("[data-cl-lang]");
    if (!btn) return;
    picked[btn.getAttribute("data-cl-version")] = btn.getAttribute("data-cl-lang");
    render();
  });

  // Les dates, les libellés et la langue des notes suivent l'en-tête.
  document.addEventListener("lmusv:lang", function () { picked = {}; render(); });
  document.addEventListener("DOMContentLoaded", load);
})();
