import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractKeysFromFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const match = content.match(/export\s+default\s+({[\s\S]*})\s*;?\s*$/);
  if (!match) throw new Error(`Cannot parse ${filepath}`);
  
  try {
    const obj = eval('(' + match[1] + ')');
    
    function getKeys(o, prefix = '') {
      const keys = new Set();
      for (const [k, v] of Object.entries(o)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        if (fullKey.startsWith('live.v')) {
          keys.add(fullKey);
        }
        if (typeof v === 'object' && v !== null && !Array.isArray(v)) {
          for (const subKey of getKeys(v, fullKey)) {
            keys.add(subKey);
          }
        }
      }
      return keys;
    }
    
    return getKeys(obj);
  } catch (e) {
    console.error(`Error parsing ${filepath}:`, e.message);
    return new Set();
  }
}

const baseDir = path.join(__dirname, 'src/i18n');
const langs = ['fr', 'en', 'de', 'es'];
const voiceKeysByLang = {};

for (const lang of langs) {
  const filepath = path.join(baseDir, `${lang}.ts`);
  voiceKeysByLang[lang] = extractKeysFromFile(filepath);
}

console.log('=== COUVERTURE DES PHRASES VOCALES ===\n');
for (const lang of langs) {
  const count = voiceKeysByLang[lang].size;
  console.log(`${lang.toUpperCase()}: ${count} clés vocales (live.v*)`);
}

// Vérifie que toutes les clés vocal v* sont présentes dans toutes les langues
const frVoiceKeys = voiceKeysByLang['fr'];
let issues = false;

for (const lang of ['en', 'de', 'es']) {
  const langVoiceKeys = voiceKeysByLang[lang];
  const missing = [...frVoiceKeys].filter(k => !langVoiceKeys.has(k));
  if (missing.length > 0) {
    console.log(`\n⚠️  ${lang.toUpperCase()} manquent ${missing.length} clés vocales:`);
    missing.slice(0, 5).forEach(k => console.log(`  - ${k}`));
    if (missing.length > 5) console.log(`  ... et ${missing.length - 5} autres`);
    issues = true;
  }
}

if (!issues) {
  console.log('\n✓ Toutes les langues couvrent les mêmes clés vocales');
}

// Compte les "v*" clés
console.log('\n=== DÉTAIL VOCAL ===');
const allVoiceKeys = [...frVoiceKeys].sort();
console.log(`Total de clés vocales (v*): ${allVoiceKeys.length}`);

// Groupe par préfixe (vFlag, vCorner, etc.)
const groups = {};
for (const key of allVoiceKeys) {
  const prefix = key.match(/live\.(v\w+?(?=[A-Z]|$))/)?.[1] || key;
  groups[prefix] = (groups[prefix] || 0) + 1;
}

Object.entries(groups).sort((a, b) => b[1] - a[1]).forEach(([grp, count]) => {
  console.log(`  ${grp}: ${count}`);
});
