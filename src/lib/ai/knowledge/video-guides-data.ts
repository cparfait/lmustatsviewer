/**
 * Références vidéo (lap guides) par circuit × classe — Le Mans Ultimate.
 *
 * Source : playlist YouTube « Le Mans Ultimate Lap Guides » (Unleashed Drivers),
 * complétée à la main pour les circuits du US Track Pass (chaînes HYMO Academy /
 * GO Setups — Unleashed Drivers ne les a pas couverts). On ne stocke QUE le
 * pointeur (titre + URL) vers la vidéo, pas son contenu : le Coach IA peut ainsi
 * renvoyer le pilote vers le guide visuel du combo. Fichier GÉNÉRÉ (sauf bloc
 * « US Track Pass » en fin de tableau).
 */

export interface VideoGuide {
  trackId: string;
  classId: string;
  layout: string | null;
  title: string;
  url: string;
  /** Chaîne YouTube. Absent = « Unleashed Drivers » (entrées historiques). */
  channel?: string;
}

export const VIDEO_GUIDES: VideoGuide[] = [
  {
    "trackId": "spa",
    "classId": "gte",
    "layout": null,
    "title": "Spa Francorchamps Lap Guide",
    "url": "https://youtu.be/khOv_ZOqU7Q"
  },
  {
    "trackId": "spa",
    "classId": "hypercar",
    "layout": null,
    "title": "Spa Francorchamps Lap Guide",
    "url": "https://youtu.be/oRZD4Ti098w"
  },
  {
    "trackId": "spa",
    "classId": "lmp2",
    "layout": null,
    "title": "Spa Francorchamps Lap Guide",
    "url": "https://youtu.be/1xgcT7HxsDw"
  },
  {
    "trackId": "fuji",
    "classId": "gte",
    "layout": null,
    "title": "Fuji Lap Guide",
    "url": "https://youtu.be/UgNKAmtZuSw"
  },
  {
    "trackId": "monza",
    "classId": "gte",
    "layout": null,
    "title": "Monza Lap Guide",
    "url": "https://youtu.be/5bkSPD_C6d8"
  },
  {
    "trackId": "sebring",
    "classId": "lmp2",
    "layout": null,
    "title": "Sebring Lap Guide",
    "url": "https://youtu.be/BJvTgZsBnYA"
  },
  {
    "trackId": "le-mans",
    "classId": "hypercar",
    "layout": null,
    "title": "Le Mans Lap Guide",
    "url": "https://youtu.be/gXipftLDOZ4"
  },
  {
    "trackId": "le-mans",
    "classId": "gte",
    "layout": null,
    "title": "Le Mans Lap Guide",
    "url": "https://youtu.be/JSv8JFUE3wg"
  },
  {
    "trackId": "le-mans",
    "classId": "lmp2",
    "layout": null,
    "title": "Le Mans Lap Guide",
    "url": "https://youtu.be/hZfUgUKO6Hc"
  },
  {
    "trackId": "bahrain",
    "classId": "lmp2",
    "layout": null,
    "title": "Bahrain Lap Guide",
    "url": "https://youtu.be/oL1slN84RN0"
  },
  {
    "trackId": "bahrain",
    "classId": "gte",
    "layout": null,
    "title": "Bahrain Lap Guide",
    "url": "https://youtu.be/Ly7Lbltptzo"
  },
  {
    "trackId": "monza",
    "classId": "lmp2",
    "layout": null,
    "title": "Monza Lap Guide",
    "url": "https://youtu.be/EozaTbLB0HE"
  },
  {
    "trackId": "sebring",
    "classId": "gte",
    "layout": null,
    "title": "Sebring Lap Guide",
    "url": "https://youtu.be/COVMEogF0gw"
  },
  {
    "trackId": "sebring",
    "classId": "hypercar",
    "layout": null,
    "title": "Sebring Lap Guide",
    "url": "https://youtu.be/OVAlCtGWwyk"
  },
  {
    "trackId": "portimao",
    "classId": "gte",
    "layout": null,
    "title": "Algarve Lap Guide",
    "url": "https://youtu.be/9xmo4IlRN0g"
  },
  {
    "trackId": "portimao",
    "classId": "lmp2",
    "layout": null,
    "title": "Algarve Lap Guide",
    "url": "https://youtu.be/BgKRe2YO4rg"
  },
  {
    "trackId": "fuji",
    "classId": "lmp2",
    "layout": null,
    "title": "Fuji Lap Guide",
    "url": "https://youtu.be/HW1A9QQ_5uw"
  },
  {
    "trackId": "bahrain",
    "classId": "hypercar",
    "layout": null,
    "title": "Bahrain Lap Guide",
    "url": "https://youtu.be/SLUevRF6Izc"
  },
  {
    "trackId": "monza",
    "classId": "hypercar",
    "layout": null,
    "title": "Monza Lap Guide",
    "url": "https://youtu.be/zYZXbkjRqho"
  },
  {
    "trackId": "spa",
    "classId": "gt3",
    "layout": null,
    "title": "Spa Lap Guide",
    "url": "https://youtu.be/z_JX3vYkU1c"
  },
  {
    "trackId": "monza",
    "classId": "gt3",
    "layout": null,
    "title": "Monza Lap Guide",
    "url": "https://youtu.be/gyD0I2bb9Cs"
  },
  {
    "trackId": "sebring",
    "classId": "gt3",
    "layout": null,
    "title": "Sebring Lap Guide",
    "url": "https://youtu.be/1fckgGvaIpo"
  },
  {
    "trackId": "sebring",
    "classId": "gt3",
    "layout": "Short",
    "title": "Sebring School Layout Lap Guide (Short Layout)",
    "url": "https://youtu.be/TjU9MLRbVU0"
  },
  {
    "trackId": "monza",
    "classId": "gt3",
    "layout": "Curva Grande",
    "title": "Monza Short Layout Lap Guide (Curva Grande Layout)",
    "url": "https://youtu.be/sJqvo9wppdQ"
  },
  {
    "trackId": "fuji",
    "classId": "gt3",
    "layout": null,
    "title": "Fuji Lap Guide",
    "url": "https://youtu.be/PqixpoIVt7Y"
  },
  {
    "trackId": "interlagos",
    "classId": "gt3",
    "layout": null,
    "title": "Interlagos Lap Guide",
    "url": "https://youtu.be/iAgFJhpjxdo"
  },
  {
    "trackId": "portimao",
    "classId": "gt3",
    "layout": null,
    "title": "Algarve Lap Guide (Portimao)",
    "url": "https://youtu.be/GGuCzzXYLRc"
  },
  {
    "trackId": "imola",
    "classId": "gt3",
    "layout": null,
    "title": "Imola Lap Guide",
    "url": "https://youtu.be/oIgBfRA5WQk"
  },
  {
    "trackId": "bahrain",
    "classId": "gt3",
    "layout": null,
    "title": "Bahrain Lap Guide",
    "url": "https://youtu.be/OeMKUsb54zM"
  },
  {
    "trackId": "bahrain",
    "classId": "gt3",
    "layout": "Short",
    "title": "Bahrain Paddock Layout Lap Guide (Short Layout)",
    "url": "https://youtu.be/NIpJkb7hhUw"
  },
  {
    "trackId": "bahrain",
    "classId": "gt3",
    "layout": null,
    "title": "Bahrain Outer Layout Lap Guide",
    "url": "https://youtu.be/FkDWxFSmj3I"
  },
  {
    "trackId": "le-mans",
    "classId": "gt3",
    "layout": null,
    "title": "Le Mans Lap Guide",
    "url": "https://youtu.be/HVb9K1uodtA"
  },
  {
    "trackId": "cota",
    "classId": "gt3",
    "layout": null,
    "title": "COTA Lap Guide",
    "url": "https://youtu.be/WY0RYBKw5PM"
  },
  {
    "trackId": "cota",
    "classId": "gt3",
    "layout": null,
    "title": "COTA National Lap Guide",
    "url": "https://youtu.be/h42kcWkM3dM"
  },
  {
    "trackId": "lusail",
    "classId": "gt3",
    "layout": null,
    "title": "Lusail Lap Guide",
    "url": "https://youtu.be/VtiDtXU9za0"
  },
  {
    "trackId": "lusail",
    "classId": "lmp2",
    "layout": null,
    "title": "Lusail Lap Guide",
    "url": "https://youtu.be/WpjL4TjBwPI"
  },
  // ── US Track Pass (ajouts manuels, vérifiés via oEmbed le 2026-08-24) ──
  {
    "trackId": "daytona",
    "classId": "hypercar",
    "layout": null,
    "title": "Daytona Hypercar Track Guide | Le Mans Ultimate",
    "url": "https://youtu.be/F0_z9kVVdRA",
    "channel": "GO Setups"
  },
  {
    "trackId": "daytona",
    "classId": "gt3",
    "layout": null,
    "title": "Le Mans Ultimate Daytona LMGT3 Guide",
    "url": "https://youtu.be/tolCwj9K8-4",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "laguna-seca",
    "classId": "hypercar",
    "layout": null,
    "title": "Le Mans Ultimate Laguna Seca Hypercar Guide",
    "url": "https://youtu.be/fUf1azg72mc",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "laguna-seca",
    "classId": "gt3",
    "layout": null,
    "title": "Le Mans Ultimate Laguna Seca LMGT3 Guide",
    "url": "https://youtu.be/RSpKLzntZfI",
    "channel": "HYMO Academy"
  }
];
