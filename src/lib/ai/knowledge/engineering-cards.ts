/**
 * Fiches de savoir d'ingénieur (contenu maison, hors ligne).
 *
 * Chaque fiche porte un **niveau de confiance** :
 *  - `high`   : règle générale bien établie → peut être dite à la radio telle
 *               quelle (phrase courte, 5 langues) quand le Coach IA n'est pas
 *               disponible ;
 *  - `medium` : utile mais dépend de la voiture → donnée à l'IA seulement ;
 *  - `low`    : piste à vérifier → donnée à l'IA comme simple contexte, jamais
 *               affirmée.
 * Les fiches sont choisies par mots-clés (texte normalisé : minuscules, sans
 * accents, 5 langues). Aucune ne contient de chiffre propre à une voiture.
 */

export type Confidence = "high" | "medium" | "low";

export interface EngineeringCard {
  id: string;
  confidence: Confidence;
  /** Mots-clés normalisés (toutes langues) ; un mot composé = sous-chaîne. */
  keywords: string[];
  /** Phrase radio courte (≤ 2 phrases), seulement pour les fiches `high`. */
  radio?: Record<"fr" | "en" | "es" | "de" | "it", string>;
  /** Contenu pour l'IA (anglais compact). */
  detail: string;
}

export const CARDS: EngineeringCard[] = [
  {
    id: "understeer_entry",
    confidence: "high",
    keywords: ["sous virage", "sous vire", "understeer", "subviraje", "untersteuer", "sottosterzo", "pousse", "pushes", "ne tourne pas", "won t turn", "doesn t turn"],
    radio: {
      fr: "Sous-virage à l'entrée : relâche le frein plus progressivement pour charger l'avant, et entre un peu moins vite. Côté réglages, un cran de barre avant plus souple aide.",
      en: "Entry understeer: trail off the brake more gradually to keep load on the front, and carry a bit less speed in. On the setup side, one click softer front anti-roll bar helps.",
      es: "Subviraje a la entrada: suelta el freno más progresivamente para cargar el tren delantero y entra algo más despacio. En reglajes, una barra delantera un punto más blanda ayuda.",
      de: "Untersteuern am Eingang: Bremse gefühlvoller lösen, damit die Vorderachse belastet bleibt, und etwas langsamer einlenken. Im Setup hilft ein Klick weicherer Frontstabi.",
      it: "Sottosterzo in ingresso: rilascia il freno più gradualmente per caricare l'avantreno ed entra un po' più piano. Lato assetto, una tacca in meno di barra anteriore aiuta.",
    },
    detail:
      "Entry/mid-corner understeer: usually too much speed at turn-in or releasing the brake too abruptly (front unloads). Driving fixes: trail-brake progressively, earlier turn-in point, less entry speed. Setup directions (one change at a time): softer front anti-roll bar, stiffer rear anti-roll bar, more front wing/less rear wing on aero cars, brake bias slightly rearward only if stable.",
  },
  {
    id: "oversteer_exit",
    confidence: "high",
    keywords: ["survirage en sortie", "survire en sortie", "decroche en sortie", "oversteer on exit", "exit oversteer", "rear steps out", "sobreviraje a la salida", "ubersteuern am ausgang", "sovrasterzo in uscita", "patine", "wheelspin", "patina", "durchdrehen", "pattina"],
    radio: {
      fr: "Survirage en sortie : remets les gaz plus progressivement et redresse avant d'accélérer à fond. Si ça persiste, monte l'antipatinage d'un cran.",
      en: "Exit oversteer: feed the throttle in more progressively and straighten the wheel before full power. If it keeps happening, one click more traction control.",
      es: "Sobreviraje a la salida: acelera más progresivamente y endereza antes de pisar a fondo. Si sigue, sube el control de tracción un punto.",
      de: "Übersteuern am Ausgang: Gas gefühlvoller aufbauen und erst Vollgas, wenn die Räder gerade sind. Wenn es bleibt, Traktionskontrolle einen Klick höher.",
      it: "Sovrasterzo in uscita: dai gas più progressivamente e raddrizza prima di andare a fondo. Se continua, alza il controllo di trazione di una tacca.",
    },
    detail:
      "Power oversteer / wheelspin on exit: throttle applied too early or too abruptly with steering lock. Driving: progressive throttle, unwind steering first. Setup: +1 traction control, softer rear anti-roll bar, less differential power lock, more rear wing on aero cars. Worn or cold rear tyres make it worse.",
  },
  {
    id: "oversteer_entry",
    confidence: "high",
    keywords: ["survirage au freinage", "survirage a l entree", "instable au freinage", "le train arriere passe", "entry oversteer", "unstable under braking", "rear gets loose", "sobreviraje en la entrada", "inestable al frenar", "instabil beim bremsen", "sovrasterzo in ingresso", "instabile in frenata"],
    radio: {
      fr: "Instable au freinage : avance la répartition d'un demi-point et rétrograde moins vite. Freine bien droit avant de tourner.",
      en: "Unstable under braking: move the brake bias half a point forward and downshift less aggressively. Brake in a straight line before turning.",
      es: "Inestable al frenar: adelanta el reparto de frenada medio punto y reduce marchas con menos prisa. Frena recto antes de girar.",
      de: "Instabil beim Bremsen: Bremsbalance einen halben Punkt nach vorn und weniger hektisch runterschalten. Gerade bremsen, dann einlenken.",
      it: "Instabile in frenata: sposta la ripartizione di mezzo punto in avanti e scala con meno fretta. Frena dritto prima di girare.",
    },
    detail:
      "Entry oversteer / rear instability under braking: brake bias too far rearward, aggressive downshifts (engine braking), too little differential coast lock, stiff rear anti-roll bar. Fixes: bias forward in 0.5% steps, smoother downshifts, more coast lock, softer rear bar.",
  },
  {
    id: "tyre_temp_spread",
    confidence: "high",
    keywords: ["temperature interieure", "temperature exterieure", "ecart de temperature", "carrossage", "camber", "inner temperature", "outer temperature", "temperatura interior", "caida", "sturz", "innentemperatur", "campanatura", "temperatura interna"],
    radio: {
      fr: "Lis l'écart sur le pneu : intérieur bien plus chaud, trop de carrossage ; centre plus chaud que les bords, trop de pression ; bords plus chauds, pas assez.",
      en: "Read the spread across the tyre: inside much hotter means too much camber; centre hotter than the edges means too much pressure; edges hotter means too little.",
      es: "Mira la diferencia en el neumático: interior mucho más caliente, demasiada caída; centro más caliente que los bordes, demasiada presión; bordes más calientes, poca.",
      de: "Lies die Verteilung im Reifen: innen viel heißer heißt zu viel Sturz; Mitte heißer als die Ränder heißt zu viel Druck; Ränder heißer heißt zu wenig.",
      it: "Leggi la differenza sulla gomma: interno molto più caldo, troppa campanatura; centro più caldo dei bordi, troppa pressione; bordi più caldi, troppo poca.",
    },
    detail:
      "Tyre temperature spread (inner/middle/outer, read on a hot tyre after a clean lap): inner > outer by a large margin = too much negative camber; middle > both edges = over-inflated; both edges > middle = under-inflated. Some inner bias is normal. Judge carcass temperature against the tyre's window rather than surface spikes.",
  },
  {
    id: "rain_driving",
    confidence: "high",
    keywords: ["pluie", "mouille", "humide", "rain", "wet", "lluvia", "mojado", "regen", "nass", "pioggia", "bagnato", "aquaplaning"],
    radio: {
      fr: "Sous la pluie : quitte la trajectoire gommée qui glisse, évite les vibreurs et les lignes peintes, freine plus tôt et bien droit, et sois très doux au volant.",
      en: "In the wet: move off the rubbered line, it's slippery; avoid kerbs and painted lines, brake earlier and in a straight line, and keep every input smooth.",
      es: "Con lluvia: sal de la trazada con goma, resbala; evita pianos y líneas pintadas, frena antes y recto, y sé muy suave con los mandos.",
      de: "Im Nassen: weg von der gummierten Ideallinie, die ist rutschig; Randsteine und Markierungen meiden, früher und gerade bremsen, alle Eingaben weich.",
      it: "Sul bagnato: esci dalla traiettoria gommata, scivola; evita cordoli e linee dipinte, frena prima e dritto, e sii dolcissimo con i comandi.",
    },
    detail:
      "Wet driving: the dry racing line (rubber) is the most slippery in the rain; use wider lines on the outside of corners. Avoid kerbs and paint. Brake earlier and straight, smooth steering/throttle, higher TC/ABS levels. Track wetness evolves: watch the drying line and the slicks/wets crossover.",
  },
  {
    id: "fuel_saving",
    confidence: "high",
    keywords: ["economiser", "economie", "lift and coast", "lever le pied", "save fuel", "fuel saving", "ahorrar", "levantar", "sparen", "risparmiare", "lift"],
    radio: {
      fr: "Pour économiser : lève le pied un peu avant tes points de freinage dans les longues lignes droites, et passe les rapports plus tôt. Garde ta vitesse en courbe.",
      en: "To save fuel: lift a little before your braking points at the end of long straights, and short-shift. Keep your cornering speed.",
      es: "Para ahorrar: levanta un poco antes de tus puntos de frenada al final de las rectas largas y cambia antes. Mantén la velocidad en curva.",
      de: "Zum Sparen: am Ende langer Geraden etwas vor dem Bremspunkt vom Gas, und früher hochschalten. Die Kurvengeschwindigkeit halten.",
      it: "Per risparmiare: alza un po' prima dei punti di frenata in fondo ai rettilinei lunghi e cambia prima. Mantieni la velocità in curva.",
    },
    detail:
      "Fuel / virtual energy saving: lift-and-coast before braking zones at the end of the longest straights costs little time per litre saved; short-shifting helps; avoid slowing mid-corner (costs more time). Save where the car is slowest to accelerate back (end of long straights), not on short ones.",
  },
  {
    id: "cold_tyres_outlap",
    confidence: "high",
    keywords: ["pneus froids", "tour de sortie", "out lap", "cold tyres", "cold tires", "neumaticos frios", "vuelta de salida", "kalte reifen", "outlap", "gomme fredde", "giro di uscita"],
    radio: {
      fr: "Pneus froids : sois doux les deux premiers tours, évite les vibreurs et les gros coups de gaz, et freine un peu plus tôt, les freins sont froids aussi.",
      en: "Cold tyres: be gentle for the first two laps, avoid kerbs and big throttle stabs, and brake a bit earlier, the brakes are cold too.",
      es: "Neumáticos fríos: sé suave las dos primeras vueltas, evita pianos y acelerones bruscos, y frena algo antes, los frenos también están fríos.",
      de: "Kalte Reifen: die ersten zwei Runden sanft, Randsteine und harte Gasstöße meiden, etwas früher bremsen, die Bremsen sind auch kalt.",
      it: "Gomme fredde: sii delicato i primi due giri, evita cordoli e colpi di gas, e frena un po' prima, anche i freni sono freddi.",
    },
    detail:
      "Out-lap / cold tyres: grip is low until the carcass reaches its window (often 1-2 laps, longer on a cold or wet track or with harder compounds). Weaving does little; braking and accelerating loads warm tyres. Cold brakes also lengthen braking distances.",
  },
  {
    id: "traffic_multiclass",
    confidence: "high",
    keywords: ["trafic", "doubler", "depasser", "retardataire", "plus rapide derriere", "traffic", "lapping", "backmarker", "trafico", "doblar", "verkehr", "uberrunden", "traffico", "doppiare"],
    radio: {
      fr: "Trafic : sois prévisible et garde ta trajectoire quand une classe plus rapide arrive. Pour doubler plus lent, choisis une ligne droite, pas un freinage.",
      en: "Traffic: be predictable and hold your line when a faster class comes through. To pass slower cars, pick a straight, not a braking zone.",
      es: "Tráfico: sé predecible y mantén tu trazada cuando llega una clase más rápida. Para doblar a los lentos, elige una recta, no una frenada.",
      de: "Verkehr: berechenbar bleiben und die Linie halten, wenn eine schnellere Klasse kommt. Langsamere auf einer Geraden überholen, nicht in der Bremszone.",
      it: "Traffico: sii prevedibile e tieni la tua traiettoria quando arriva una classe più veloce. Per doppiare i lenti, scegli un rettilineo, non una frenata.",
    },
    detail:
      "Multi-class traffic: the faster car is responsible for the pass, the slower car must stay predictable (hold the racing line, no sudden moves). Plan passes on straights; diving into braking zones is the main cause of contact. Time the catch so the pass happens where you are strongest.",
  },
  {
    id: "brake_bias",
    confidence: "medium",
    keywords: ["repartition", "repartiteur", "brake bias", "balance de frein", "reparto de frenada", "bremsbalance", "ripartizione di frenata", "bloque", "lock up", "lockup", "blocca", "blockier"],
    detail:
      "Brake bias: forward = more stability but front lock-ups and entry understeer; rearward = more rotation but rear instability. Adjust in 0.5% steps. Front lock-ups on the same corner = bias too forward or too much pedal pressure late in the zone. Optimal bias moves rearward as fuel burns and tyres wear (less rear load). Car-specific: always compare to the car's default value.",
  },
  {
    id: "undercut_overcut",
    confidence: "medium",
    keywords: ["undercut", "overcut", "rentrer avant", "rester dehors", "pit early", "stay out", "parar antes", "quedarse fuera", "fruher stoppen", "draussen bleiben", "fermarsi prima", "restare fuori"],
    detail:
      "Undercut vs overcut: pitting first gains when fresh-tyre pace advantage per lap exceeds the out-lap warm-up cost and you rejoin in clean air. Overcut (staying out) wins when warm-up is long (cold track, hard compound, night), when the rival rejoins into traffic, or when your old tyres are still close to new pace. Use measured warm-up cost and the gaps after the stop.",
  },
  {
    id: "tyre_pressure_lmu",
    confidence: "low",
    keywords: ["pression", "pressure", "presion", "luftdruck", "reifendruck", "pressione"],
    detail:
      "Tyre pressures: hot pressures rise as the tyre heats; aim for consistent hot pressures across an axle. Exact optimal values depend on the tyre model and version; do not quote specific target numbers unless they are in the provided data.",
  },
];

/** Fiches pertinentes pour une question normalisée (meilleure d'abord). */
export function matchCards(norm: string, max = 3): EngineeringCard[] {
  const n = ` ${norm} `;
  const toks = norm.split(" ");
  // Mot composé : sous-chaîne exacte ; mot seul : début de mot (« untersteuer » → « untersteuern »).
  const hit = (k: string) => (k.includes(" ") ? n.includes(` ${k} `) : toks.some((w) => w.startsWith(k)));
  return CARDS.map((c) => ({ c, hits: c.keywords.filter(hit).length }))
    .filter((x) => x.hits > 0)
    .sort((a, b) => b.hits - a.hits)
    .slice(0, max)
    .map((x) => x.c);
}

/** Phrase radio d'une fiche sûre (sinon null : on ne dit jamais une fiche incertaine). */
export function radioCard(norm: string, lang: string): string | null {
  const best = matchCards(norm, 1)[0];
  if (!best || best.confidence !== "high" || !best.radio) return null;
  const l = (lang || "en").slice(0, 2).toLowerCase() as keyof NonNullable<EngineeringCard["radio"]>;
  return best.radio[l] ?? best.radio.en;
}

/** Bloc de contexte pour l'IA, confiance explicite. */
export function cardsContextText(cards: EngineeringCard[]): string {
  if (!cards.length) return "";
  const lines = [
    "## Engineering notes (app knowledge base)",
    "Confidence: high = established rule; medium = depends on the car, present as a direction; low = background only, never state it as fact.",
  ];
  for (const c of cards) lines.push(`- [${c.id}, confidence ${c.confidence}] ${c.detail}`);
  return lines.join("\n");
}
