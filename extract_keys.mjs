import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function extractKeysFromFile(filepath) {
  const content = fs.readFileSync(filepath, 'utf-8');
  const match = content.match(/export\s+default\s+({[\s\S]*})\s*;?\s*$/);
  if (!match) throw new Error(`Cannot parse ${filepath}`);
  
  try {
    // eval is dangerous but we control the input
    const obj = eval('(' + match[1] + ')');
    
    function getKeys(o, prefix = '') {
      const keys = new Set();
      for (const [k, v] of Object.entries(o)) {
        const fullKey = prefix ? `${prefix}.${k}` : k;
        keys.add(fullKey);
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
const keysByLang = {};

for (const lang of langs) {
  const filepath = path.join(baseDir, `${lang}.ts`);
  keysByLang[lang] = extractKeysFromFile(filepath);
  console.log(`${lang.toUpperCase()}: ${keysByLang[lang].size} clés`);
}

console.log('\n=== COMPARAISON DES CLÉS ===\n');

// Base : clés FR
const frKeys = keysByLang['fr'];
for (const lang of ['en', 'de', 'es']) {
  const langKeys = keysByLang[lang];
  const missing = [...frKeys].filter(k => !langKeys.has(k));
  const extra = [...langKeys].filter(k => !frKeys.has(k));
  
  console.log(`\n${lang.toUpperCase()}:`);
  console.log(`  Manquantes (présentes en FR): ${missing.length}`);
  if (missing.length > 0 && missing.length <= 10) {
    missing.forEach(k => console.log(`    - ${k}`));
  } else if (missing.length > 10) {
    missing.slice(0, 5).forEach(k => console.log(`    - ${k}`));
    console.log(`    ... et ${missing.length - 5} autres`);
  }
  
  console.log(`  Extra (manquantes en FR): ${extra.length}`);
  if (extra.length > 0 && extra.length <= 10) {
    extra.forEach(k => console.log(`    - ${k}`));
  } else if (extra.length > 10) {
    extra.slice(0, 5).forEach(k => console.log(`    - ${k}`));
    console.log(`    ... et ${extra.length - 5} autres`);
  }
}

// Récapitulatif des totaux
console.log('\n=== RÉCAPITULATIF ===');
for (const lang of langs) {
  console.log(`${lang.toUpperCase()}: ${keysByLang[lang].size}`);
}
