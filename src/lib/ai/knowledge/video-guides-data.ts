/**
 * Références vidéo (lap guides) par circuit × classe — Le Mans Ultimate.
 *
 * Source : playlist YouTube « Le Mans Ultimate Lap Guides » (Unleashed Drivers),
 * complétée à la main pour les combos qu'elle ne couvre pas (chaînes HYMO
 * Academy / GO Setups, bloc en fin de tableau : Barcelone, Paul Ricard,
 * Silverstone, classe LMP3…). `layout` = mot du nom de tracé du jeu
 * (`track_course`) qui désigne la variante ; `null` = tracé principal. On ne stocke QUE le pointeur
 * (titre + URL) vers la vidéo, pas son contenu : le Coach IA peut ainsi renvoyer
 * le pilote vers le guide visuel du combo. Pour un même combo, la PREMIÈRE entrée
 * sans layout l'emporte : les guides Unleashed (commentés, donc transcrits)
 * passent avant les ajouts manuels. Fichier GÉNÉRÉ (sauf bloc manuel final).
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
  {
    "trackId": "daytona",
    "classId": "gt3",
    "layout": null,
    "title": "Daytona Lap Guide",
    "url": "https://youtu.be/gHfhmOHFFAo"
  },
  {
    "trackId": "daytona",
    "classId": "hypercar",
    "layout": null,
    "title": "Daytona Lap Guide",
    "url": "https://youtu.be/6HHynf4Pa7c"
  },
  {
    "trackId": "daytona",
    "classId": "lmp2",
    "layout": null,
    "title": "Daytona Lap Guide (LMP2 WEC)",
    "url": "https://youtu.be/vWh_gMeF7Ag"
  },
  {
    "trackId": "daytona",
    "classId": "lmp2",
    "layout": null,
    "title": "Daytona Lap Guide (LMP2 ELMS)",
    "url": "https://youtu.be/-doU5f5gh44"
  },
  {
    "trackId": "laguna-seca",
    "classId": "hypercar",
    "layout": null,
    "title": "Laguna Seca Lap Guide",
    "url": "https://youtu.be/AnX4r9Y6T3w"
  },
  {
    "trackId": "long-beach",
    "classId": "gt3",
    "layout": null,
    "title": "Long Beach Lap Guide",
    "url": "https://youtu.be/BZReoL0HE-A"
  },
  {
    "trackId": "long-beach",
    "classId": "hypercar",
    "layout": null,
    "title": "Long Beach Lap Guide",
    "url": "https://youtu.be/O17x5krJRNI"
  },
  {
    "trackId": "road-atlanta",
    "classId": "gt3",
    "layout": null,
    "title": "Road Atlanta Lap Guide",
    "url": "https://youtu.be/hi78biewbH4"
  },
  {
    "trackId": "road-atlanta",
    "classId": "hypercar",
    "layout": null,
    "title": "Road Atlanta Lap Guide",
    "url": "https://youtu.be/GVEhNS4pGpc"
  },
  // ── Combos non couverts par Unleashed Drivers (ajouts manuels, vérifiés via
  //    oEmbed le 2026-09-25). Hotlaps sans commentaire : pointeur seul, pas de
  //    transcription. À remplacer dès qu'Unleashed Drivers publie le combo.
  {
    "trackId": "laguna-seca",
    "classId": "gt3",
    "layout": null,
    "title": "Le Mans Ultimate Laguna Seca LMGT3 Guide",
    "url": "https://youtu.be/RSpKLzntZfI",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "laguna-seca",
    "classId": "lmp2",
    "layout": null,
    "title": "Laguna Seca LMP2 Track Guide | Le Mans Ultimate",
    "url": "https://youtu.be/XoutyCSLnsE",
    "channel": "GO Setups"
  },
  {
    "trackId": "road-atlanta",
    "classId": "lmp2",
    "layout": null,
    "title": "Road Atlanta LMP2 Track Guide | Le Mans Ultimate",
    "url": "https://youtu.be/Er6ldVPeJ20",
    "channel": "GO Setups"
  },
  // Ajouts du 2026-10-17 (vérifiés via oEmbed) : nouveaux circuits, Hypercar
  // manquants et classe LMP3. Un titre sans variante = tracé principal (HYMO
  // nomme toujours les variantes : Outer, Paddock, Mulsanne, Classic…).
  {
    "trackId": "barcelona",
    "classId": "gt3",
    "layout": null,
    "title": "Le Mans Ultimate Barcelona LMGT3 WEX-C Guide | HYMO Academy",
    "url": "https://youtu.be/eOCQKGg_Q3A",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "barcelona",
    "classId": "hypercar",
    "layout": null,
    "title": "Le Mans Ultimate Barcelona Hypercar WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/TumxvOGUAcI",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "paul-ricard",
    "classId": "gt3",
    "layout": "1A-V2",
    "title": "Le Mans Ultimate Paul Ricard 1A-V2 LMGT3 WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/gax_HhaE7DU",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "paul-ricard",
    "classId": "hypercar",
    "layout": "1A-V2",
    "title": "Le Mans Ultimate Paul Ricard 1A-V2 Hypercar WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/FLgA47uiAPY",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "paul-ricard",
    "classId": "gt3",
    "layout": "1A-V2-Short",
    "title": "Le Mans Ultimate Paul Ricard (1A-V2 Short) LMGT3 WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/UJVNZj9P0vc",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "paul-ricard",
    "classId": "hypercar",
    "layout": "1A-V2-Short",
    "title": "Le Mans Ultimate Paul Ricard (1A-V2 Short) Hypercar WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/iwzgHtuIb_8",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "silverstone",
    "classId": "gt3",
    "layout": null,
    "title": "Le Mans Ultimate Silverstone LMGT3 WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/QUoT4VYbNmQ",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "silverstone",
    "classId": "hypercar",
    "layout": null,
    "title": "Le Mans Ultimate Silverstone Hypercar WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/q3AxJcvLHWw",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "silverstone",
    "classId": "gt3",
    "layout": "ELMS",
    "title": "Le Mans Ultimate Silverstone (ELMS) LMGT3 WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/Hb8Vv_HIL_k",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "silverstone",
    "classId": "hypercar",
    "layout": "ELMS",
    "title": "Le Mans Ultimate Silverstone (ELMS) Hypercar WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/UXM_8y8cayU",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "lusail",
    "classId": "hypercar",
    "layout": null,
    "title": "Le Mans Ultimate Lusail Hypercar WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/bnbb9Hn4lKs",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "imola",
    "classId": "hypercar",
    "layout": null,
    "title": "Le Mans Ultimate Imola Hypercar WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/CTwKaeGZ52g",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "interlagos",
    "classId": "hypercar",
    "layout": null,
    "title": "Le Mans Ultimate Interlagos Hypercar WEC-X Guide | HYMO Academy",
    "url": "https://youtu.be/Jn0-8hU8-Uw",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "cota",
    "classId": "hypercar",
    "layout": null,
    "title": "COTA Hypercar Track Guide | Le Mans Ultimate",
    "url": "https://youtu.be/LZi1381tCfA",
    "channel": "GO Setups"
  },
  {
    "trackId": "le-mans",
    "classId": "lmp3",
    "layout": null,
    "title": "Le Mans Ultimate Le Mans LMP3 Fixed Guide | HYMO Academy",
    "url": "https://youtu.be/genaosteeE4",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "monza",
    "classId": "lmp3",
    "layout": null,
    "title": "Le Mans Ultimate Monza LMP3 Fixed Guide | HYMO Academy",
    "url": "https://youtu.be/vojeaeQUYsA",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "fuji",
    "classId": "lmp3",
    "layout": null,
    "title": "Le Mans Ultimate Fuji LMP3 Fixed Guide | HYMO Academy",
    "url": "https://youtu.be/oKghbTdxY9Q",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "fuji",
    "classId": "lmp3",
    "layout": "Classic",
    "title": "Le Mans Ultimate Fuji Classic LMP3 Fixed Guide | HYMO Academy",
    "url": "https://youtu.be/iYj-EqaRiuA",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "bahrain",
    "classId": "lmp3",
    "layout": null,
    "title": "Le Mans Ultimate Bahrain LMP3 Fixed Guide | HYMO Academy",
    "url": "https://youtu.be/EmaBhGdnccw",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "portimao",
    "classId": "lmp3",
    "layout": null,
    "title": "Le Mans Ultimate Portimao LMP3 Sprint Guide | HYMO Academy",
    "url": "https://youtu.be/oH--gccUcow",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "sebring",
    "classId": "lmp3",
    "layout": null,
    "title": "Le Mans Ultimate Sebring LMP3 Fixed Guide | HYMO Academy",
    "url": "https://youtu.be/iV3rb41_4gw",
    "channel": "HYMO Academy"
  },
  {
    "trackId": "spa",
    "classId": "lmp3",
    "layout": null,
    "title": "Le Mans Ultimate Spa LMP3 Fixed Guide | HYMO Academy",
    "url": "https://youtu.be/nywmu4mDcYs",
    "channel": "HYMO Academy"
  }
];
