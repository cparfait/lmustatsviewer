# Images de voiture (page Setups)

Déposez ici le rendu de chaque voiture, nommé **`<slug>.webp`** (ou `.png`).
Le composant `CarImage` essaie `.webp`, puis `.png`, puis `.svg`, et n'affiche
rien si aucun fichier n'existe — vous pouvez donc compléter au fur et à mesure.

**Placeholders en place** : chaque modèle dépourvu de rendu réel possède un
`<slug>.svg` (silhouette neutre teintée par classe), généré par
`scripts/gen-car-placeholders.mjs`. Dès que vous déposez un vrai `<slug>.webp`
ou `<slug>.png`, il **prime** sur le `.svg` (priorité d'extension). Le script est
idempotent et n'écrase jamais un rendu réel — relancez-le quand LMU ajoute des
voitures (`node scripts/gen-car-placeholders.mjs`).

**Format conseillé (rendu réel)** : fond transparent, vue latérale, largeur ~600–800 px.

**Où trouver les modèles / rendus** : https://sketchfab.com/ (vérifier la licence avant réutilisation).

Total : 36 modèles.

## Hypercar

- [ ] `alpine-a424.webp`  — Alpine A424
- [ ] `aston-martin-valkyrie-amr-lmh.webp`  — Aston Martin Valkyrie AMR LMH
- [ ] `bmw-m-hybrid-v8.webp`  — BMW M Hybrid V8
- [ ] `cadillac-v-series-r.webp`  — Cadillac V-Series.R
- [ ] `ferrari-499p.webp`  — Ferrari 499P
- [ ] `genesis-gmr-001.webp`  — Genesis GMR-001
- [ ] `glickenhaus-007-lmh.webp`  — Glickenhaus 007 LMH
- [ ] `isotta-fraschini-tipo-6-c.webp`  — Isotta Fraschini Tipo 6-C
- [ ] `lamborghini-sc63.webp`  — Lamborghini SC63
- [ ] `peugeot-9x8.webp`  — Peugeot 9X8
- [ ] `peugeot-9x8-evo.webp`  — Peugeot 9X8 EVO
- [ ] `porsche-963.webp`  — Porsche 963
- [ ] `toyota-gr010-hybrid.webp`  — Toyota GR010 Hybrid
- [ ] `toyota-tr010.webp`  — Toyota TR010
- [ ] `vanwall-vandervell-680.webp`  — Vanwall Vandervell 680

## LMP2

- [ ] `oreca-07-gibson.webp`  — Oreca 07 Gibson

## LMP3

- [ ] `adess-ad25.webp`  — ADESS AD25
- [ ] `duqueine-d09.webp`  — Duqueine D09
- [ ] `ginetta-g61-lt-p325-evo.webp`  — Ginetta G61-LT-P325 EVO
- [ ] `ligier-js-p325.webp`  — Ligier JS P325

## GT3

- [ ] `aston-martin-vantage-amr-lmgt3-evo.webp`  — Aston Martin Vantage AMR LMGT3 Evo
- [ ] `bmw-m4-lmgt3.webp`  — BMW M4 LMGT3
- [ ] `bmw-m4-lmgt3-evo.webp`  — BMW M4 LMGT3 Evo
- [ ] `chevrolet-corvette-z06-lmgt3-r.webp`  — Chevrolet Corvette Z06 LMGT3.R
- [ ] `ferrari-296-lmgt3.webp`  — Ferrari 296 LMGT3
- [ ] `ferrari-296-lmgt3-evo.webp`  — Ferrari 296 LMGT3 Evo
- [ ] `ford-mustang-lmgt3.webp`  — Ford Mustang LMGT3
- [ ] `lamborghini-huracan-lmgt3-evo-2.webp`  — Lamborghini Huracán LMGT3 Evo 2
- [ ] `lexus-rc-f-lmgt3.webp`  — Lexus RC F LMGT3
- [ ] `mclaren-720s-lmgt3-evo.webp`  — McLaren 720S LMGT3 Evo
- [ ] `mercedes-amg-lmgt3.webp`  — Mercedes-AMG LMGT3
- [ ] `porsche-911-gt3-r-lmgt3.webp`  — Porsche 911 GT3 R LMGT3

## GTE

- [ ] `aston-martin-vantage-amr-gte.webp`  — Aston Martin Vantage AMR GTE
- [ ] `chevrolet-corvette-c8-r-gte.webp`  — Chevrolet Corvette C8.R GTE
- [ ] `ferrari-488-gte-evo.webp`  — Ferrari 488 GTE Evo
- [ ] `porsche-911-rsr-19.webp`  — Porsche 911 RSR-19

