/**
 * Correspondance mot-clé → image de volant (slug WebP de public/steering_wheels/).
 * Repris de la config V1 `includes/cars.json` : un mot-clé est cherché comme
 * sous-chaîne (minuscules, accents pliés) du nom de voiture → robuste aux
 * variantes (Evo, Gibson, année, livrée…).
 */
export interface WheelMapEntry {
  keywords: string[];
  wheel: string;
}

export const STEERING_WHEEL_MAP: WheelMapEntry[] = [
  { keywords: ["alpine a424"], wheel: "alpine-a424" },
  { keywords: ["aston martin valkyrie"], wheel: "aston-martin-valkyrie-lmh" },
  { keywords: ["bmw m hybrid"], wheel: "bmw-m-hybrid-v8" },
  { keywords: ["cadillac v-series", "cadillac"], wheel: "cadillac-v-series-r" },
  { keywords: ["ferrari 499p"], wheel: "ferrari-499p" },
  { keywords: ["genesis gmr", "genesis"], wheel: "genesis-gmr-001" },
  { keywords: ["glickenhaus"], wheel: "glickenhaus-scg-007" },
  { keywords: ["isotta"], wheel: "isotta-fraschini-tipo6" },
  { keywords: ["lamborghini sc63"], wheel: "lamborghini-sc63" },
  { keywords: ["peugeot 9x8 (2023)", "peugeot 9x8 sans aileron"], wheel: "peugeot-9x8-2023" },
  { keywords: ["peugeot 9x8 evo", "peugeot 9x8 (2024)", "peugeot 9x8 aileron"], wheel: "peugeot-9x8" },
  { keywords: ["porsche 963"], wheel: "porsche-963" },
  { keywords: ["toyota gr010"], wheel: "toyota-gr010" },
  { keywords: ["vanwall"], wheel: "vanwall-vandervell-680" },
  { keywords: ["oreca"], wheel: "oreca-07" },
  { keywords: ["duqueine"], wheel: "duqueine-d09-p3" },
  { keywords: ["ginetta"], wheel: "ginetta-g61-lt-p325-evo" },
  { keywords: ["ligier"], wheel: "ligier-js-p325" },
  { keywords: ["aston martin vantage amr lmgt3"], wheel: "aston-martin-vantage-amr-lmgt3" },
  { keywords: ["bmw m4 lmgt3"], wheel: "bmw-m4-lmgt3" },
  { keywords: ["bmw m4 lmgt3 evo"], wheel: "bmw-m4-lmgt3" },
  { keywords: ["corvette z06", "chevrolet corvette z06"], wheel: "chevrolet-corvette-z06-lmgt3-r" },
  { keywords: ["ferrari 296"], wheel: "ferrari-296-lmgt3" },
  { keywords: ["ford mustang"], wheel: "ford-mustang-lmgt3" },
  { keywords: ["lamborghini huracan", "huracan"], wheel: "lamborghini-huracan-lmgt3-evo2" },
  { keywords: ["lexus"], wheel: "lexus-rcf-lmgt3" },
  { keywords: ["mclaren 720s"], wheel: "mclaren-720s-lmgt3-evo" },
  { keywords: ["mercedes"], wheel: "mercedes-amg-lmgt3" },
  { keywords: ["porsche 911 gt3"], wheel: "porsche-911-gt3-r-lmgt3" },
  { keywords: ["aston martin vantage gte", "aston martin vantage amr"], wheel: "aston-martin-vantage-amr" },
  { keywords: ["corvette c8.r gte", "corvette c8", "chevrolet corvette c8"], wheel: "corvette-c8-r-gte" },
  { keywords: ["ferrari 488"], wheel: "ferrari-488-gte-evo" },
  { keywords: ["porsche 911 rsr"], wheel: "porsche-911-rsr-19" },
];
