/**
 * Numéros et noms OFFICIELS des virages, par circuit.
 *
 * Règles (SUIVI.md §7) : sources officielles uniquement (site du circuit,
 * carte officielle, FIA / F1 / ACO / IMSA), recoupées ; un circuit dont la
 * numérotation est ambiguë ou dont la carte officielle ne correspond pas au
 * tracé du jeu **n'est pas listé**. À l'affichage, les numéros ne sont posés
 * que si le nombre de virages détectés sur le tracé égale `corners.length`.
 *
 * Écartés (2026-10-16) :
 * - Circuit de la Sarthe : l'ACO ne numérote pas les virages (sections
 *   nommées seulement), les numérotations T1..Tn des sites tiers se contredisent ;
 * - Algarve (Portimão) : 15 virages pour la F1, 16 pour le circuit, numéros
 *   des noms tirés de la presse seulement.
 * - Fuji : 16 ou 17 virages selon la source, noms de sponsors changeants ;
 * - Circuit Paul Ricard : numérotation du circuit non séquentielle sur le tracé
 *   du jeu (T8/T9 sautés), variante « V2 » ambiguë.
 * Partiels (numéro seul quand le rattachement numéro → nom n'est pas officiel) :
 * Sebring, Interlagos, Imola (carte du circuit : 21 virages, ≠ F1 : 19). Numéros seuls (aucun nom officiel) : Lusail,
 * Road Atlanta, Barcelone (noms de sponsors sans source officielle).
 */

export interface CornerTable {
  /** Fragments du nom de circuit du jeu (normalisés) qui désignent la fiche. */
  match: string[];
  /** Longueur officielle (km), pour mémoire. */
  lengthKm: number;
  /** Virages dans l'ordre du tour (libellé officiel : « 1 », « 10A »…) ; `name: null` = numéro seul. */
  corners: { n: string; name: string | null }[];
  /** Sources officielles consultées. */
  sources: string[];
}

const seq = (names: (string | null)[]) => names.map((name, i) => ({ n: String(i + 1), name }));

export const CORNER_TABLE: CornerTable[] = [
  {
    // Numérotation F1 (19 virages) ; noms et ordre confirmés par le circuit.
    match: ["francorchamps", "spa"],
    lengthKm: 7.004,
    corners: seq([
      "La Source",
      "Eau Rouge",
      "Raidillon",
      "Raidillon",
      "Les Combes",
      "Les Combes",
      "Malmedy",
      "Bruxelles",
      "Jacky Ickx",
      "Pouhon",
      "Pouhon",
      "Fagnes",
      "Fagnes",
      "Campus",
      "Paul Frère",
      "Blanchimont",
      "Blanchimont",
      "Chicane",
      "Chicane",
    ]),
    sources: [
      "https://www.formula1.com/en/latest/article/explained-how-every-corner-at-the-circuit-de-spa-francorchamps-got-its-name.1o6cyXf5F6q9VFFcgMqTqs",
      "https://www.spa-francorchamps.be/en/news/96_the-corners-of-the-spa-francorchamps-circuit",
    ],
  },
  {
    // Numérotation F1 (11 virages), confirmée par le circuit (7 droites, 4 gauches).
    match: ["monza"],
    lengthKm: 5.793,
    corners: seq([
      "Prima Variante",
      "Prima Variante",
      "Curva Biassono",
      "Variante della Roggia",
      "Variante della Roggia",
      "Lesmo 1",
      "Lesmo 2",
      "Variante Ascari",
      "Variante Ascari",
      "Variante Ascari",
      "Curva Alboreto",
    ]),
    sources: [
      "https://www.formula1.com/en/latest/article/explained-how-every-corner-at-monza-got-its-name.53lIthEwI2Ko9BC8YRnuZK",
      "https://www.monzanet.it/en/circuit/",
    ],
  },
  {
    // Noms attribués par le circuit (blog officiel 2023) ; 20 virages, antihoraire.
    match: ["circuitoftheamericas", "americas", "cota"],
    lengthKm: 5.513,
    corners: seq([
      "Big Red",
      null,
      "COTA Esses",
      "COTA Esses",
      "COTA Esses",
      null,
      null,
      null,
      null,
      null,
      "Bobby Pin",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "The Andretti",
    ]),
    sources: ["https://circuitoftheamericas.com/blog/2023/9/29/cota-crash-course/"],
  },
  {
    // formula1.com + FIA ; T12 encadré par T11 Maggotts et T13 Becketts.
    match: ["silverstone"],
    lengthKm: 5.891,
    corners: seq([
      "Abbey",
      "Farm",
      "Village",
      "The Loop",
      "Aintree",
      "Brooklands",
      "Luffield",
      "Woodcote",
      "Copse",
      "Maggotts",
      "Maggotts",
      "Becketts",
      "Becketts",
      "Chapel",
      "Stowe",
      "Vale",
      "Club",
      "Club",
    ]),
    sources: [
      "https://www.formula1.com/en/latest/article/whats-in-a-name-the-history-behind-silverstones-iconic-corners.4Q3miKVCXBkz5rKtyYnL5z",
      "https://api.fia.com/sites/default/files/2019_british_gp_preview_1.pdf",
    ],
  },
  {
    // Carte FIA (16 virages numérotés), aucun nom officiel.
    match: ["lusail", "losail", "qatar"],
    lengthKm: 5.419,
    corners: seq(Array.from({ length: 16 }, () => null)),
    sources: [
      "https://www.fia.com/system/files/decision-document/2025_qatar_grand_prix_-_event_notes_-_circuit_map._pit_lane_drawing_emergency_exits_map_ers_battery_containment_area_red_zones_map.pdf",
    ],
  },
  {
    // ACO (numéros explicites), IMSA, circuit ; Fangio « entre 8 et 9 » → numéros seuls.
    match: ["sebring"],
    lengthKm: 6.019,
    corners: seq([
      null,
      null,
      "Kristensen Corner",
      null,
      null,
      "Gurney Bend",
      "Hairpin",
      null,
      null,
      "Cunningham Corner",
      "Collier Curve",
      null,
      null,
      "Bishop Curve",
      "Gendebien Curve",
      "Le Mans Curve",
      "Sunset Bend",
    ]),
    sources: [
      "https://www.24h-lemans.com/en/news/12-hours-of-sebring-legendary-race-track-6374",
      "https://www.24h-lemans.com/en/news/a-corner-for-kristensen-nine-time-winner-at-le-mans-at-the-sebring-circuit-23988",
      "https://www.sebringraceway.com/where-to-watch/",
    ],
  },
  {
    // Numéros FIA (15) ; noms seulement là où une source officielle les numérote.
    match: ["interlagos", "carlospace", "josecarlospace"],
    lengthKm: 4.309,
    corners: seq([
      "S do Senna",
      "S do Senna",
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "Junção",
      null,
      null,
      null,
    ]),
    sources: [
      "https://www.fia.com/sites/default/files/decision-document/2022%20Brazilian%20Grand%20Prix%20-%20Event%20Notes%20-%20Circuit%20Map,%20Pit%20Lane%20Drawing%20and%20Red%20Zone.pdf",
      "https://www.formula1.com/en/latest/article/need-to-know-brazil.2txdrfSt3S8ekYIGkS6QOK",
    ],
  },
  {
    // Carte officielle 2026 : 1 à 9, 10A, 10B, 11, 12 (10A/10B = la chicane).
    match: ["roadatlanta"],
    lengthKm: 4.088,
    corners: ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10A", "10B", "11", "12"].map((n) => ({ n, name: null })),
    sources: ["https://michelinracewayroadatlanta.com/track-info/track-map"],
  },
  {
    // Carte officielle du circuit (« Tracciato auto », 2025) : 21 virages.
    // Noms gardés seulement là où le rattachement est sans ambiguïté.
    match: ["imola", "enzoedino"],
    lengthKm: 4.909,
    corners: seq([
      null,
      null,
      null,
      null,
      null,
      null,
      "Tosa",
      null,
      "Piratella",
      null,
      null,
      null,
      null,
      "Curva Gresini",
      "Curva Gresini",
      null,
      null,
      "Rivazza",
      "Rivazza",
      null,
      null,
    ]),
    sources: ["https://www.autodromoimola.it/wp-content/uploads/2025/04/mappaTracciatoAUTO.jpg"],
  },
  {
    // Programme officiel F1 2025 : 15 virages, seul le 1 porte un nom.
    match: ["bahrain", "sakhir"],
    lengthKm: 5.412,
    corners: seq(["Michael Schumacher", ...Array.from({ length: 14 }, () => null)]),
    sources: ["https://www.formula1.com/en/racing/2025/bahrain"],
  },
  {
    // Tracé sans chicane (depuis 2023) : 14 virages ; aucun nom officiel publié.
    match: ["barcelona", "catalunya"],
    lengthKm: 4.657,
    corners: seq(Array.from({ length: 14 }, () => null)),
    sources: ["https://www.circuitcat.com/en/news/formula-1/the-formula-1-aws-gran-premio-de-espana-2023-changes-its-track-configuration/"],
  },
];
