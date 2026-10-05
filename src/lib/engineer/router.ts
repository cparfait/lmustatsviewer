/**
 * Routeur local des questions du pilote (module pur).
 *
 * Une question dictée librement (« il me reste combien d'essence ? », « qui est
 * P6 en LMP2 ? ») est routée **sans IA** vers une intention dont la réponse est
 * calculée par le code — instantané, gratuit, hors ligne, chiffres exacts.
 *
 *  - **Normalisation** : minuscules, sans accents, apostrophes/tirets → espace,
 *    nombres en lettres → chiffres (« dix minutes » → « 10 minutes »).
 *  - **Barème** : une locution (`idioms`) vaut 100 (+10 par mot au-delà du
 *    premier : la locution longue bat le mot nu), un sujet 40, un indice 30.
 *    Éligible : une locution, ou un sujet + un indice. Seuil 60.
 *  - **Ambiguïté** : si une intention d'une AUTRE famille est éligible à moins de
 *    `MARGIN` points du meilleur, on ne tranche pas (l'appelant passe la main à
 *    l'IA, qui ne fait alors que choisir l'intention).
 *  - **Entités** : classe, « au général », position (« P6 », « sixième »), numéro
 *    de voiture (seulement précédé d'un indice : « la 14 », « numéro 14 »).
 *  - Commandes brèves (« compris », « répète »…) : énoncé entier uniquement.
 */

import type { Intent } from "@/lib/spotterCommands";
import { DEFAULTS, type WatchCond } from "./watches";

/** Intentions du routeur libre (spotter + intentions à paramètres). */
export type AnswerIntent = Intent | "positionOf" | "carInfo" | "watch";

export interface Entities {
  /** Classe citée (clé radio : Hypercar / LMP2 / LMP3 / GT3 / GTE). */
  cls?: string;
  overall?: boolean;
  pos?: number;
  carNo?: string;
}

/** Condition d'alerte lue, cible de rival non encore résolue. */
export type WatchSpec =
  | Exclude<WatchCond, { kind: "rivalPit" }>
  | { kind: "rivalPit"; target: "ahead" | "behind" | "leader" | "entity" };

export interface Route {
  intent: AnswerIntent | null;
  ambiguous: boolean;
  /** Intentions candidates (meilleure d'abord) — pour l'IA en cas d'ambiguïté. */
  candidates: AnswerIntent[];
  entities: Entities;
  watch: WatchSpec | null;
  /** Texte normalisé (debug / résolution de nom de pilote). */
  norm: string;
}

export const THRESHOLD = 60;
export const MARGIN = 15;

// ── Normalisation ────────────────────────────────────────────────────────────

const NUM_WORDS: Record<string, Record<string, number>> = {
  fr: {
    zero: 0, un: 1, une: 1, deux: 2, trois: 3, quatre: 4, cinq: 5, six: 6, sept: 7, huit: 8, neuf: 9,
    dix: 10, onze: 11, douze: 12, treize: 13, quatorze: 14, quinze: 15, seize: 16, vingt: 20,
    trente: 30, quarante: 40, cinquante: 50, soixante: 60,
  },
  en: {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
    eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
    eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
  },
  es: {
    cero: 0, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
    diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
    dieciocho: 18, diecinueve: 19, veinte: 20, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60,
  },
  de: {
    null: 0, eins: 1, ein: 1, eine: 1, zwei: 2, drei: 3, vier: 4, funf: 5, sechs: 6, sieben: 7, acht: 8,
    neun: 9, zehn: 10, elf: 11, zwolf: 12, dreizehn: 13, vierzehn: 14, funfzehn: 15, sechzehn: 16,
    siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20, dreissig: 30, vierzig: 40, funfzig: 50,
    sechzig: 60,
  },
  it: {
    zero: 0, uno: 1, una: 1, un: 1, due: 2, tre: 3, quattro: 4, cinque: 5, sei: 6, sette: 7, otto: 8, nove: 9,
    dieci: 10, undici: 11, dodici: 12, tredici: 13, quattordici: 14, quindici: 15, sedici: 16, diciassette: 17,
    diciotto: 18, diciannove: 19, venti: 20, trenta: 30, quaranta: 40, cinquanta: 50, sessanta: 60,
    ...itCompounds(),
  },
};

/**
 * Composés italiens soudés (« ventidue », « trentotto ») : la dizaine perd sa
 * voyelle finale devant « uno » / « otto » (« ventuno », « trentotto »). Accents
 * déjà retirés par la normalisation (« ventitré » → « ventitre »).
 */
function itCompounds(): Record<string, number> {
  const tens: [string, number][] = [["venti", 20], ["trenta", 30], ["quaranta", 40], ["cinquanta", 50], ["sessanta", 60]];
  const units: [string, number][] = [
    ["uno", 1], ["due", 2], ["tre", 3], ["quattro", 4], ["cinque", 5], ["sei", 6], ["sette", 7], ["otto", 8], ["nove", 9],
  ];
  const out: Record<string, number> = {};
  for (const [t, tv] of tens) {
    for (const [u, uv] of units) {
      const stem = u === "uno" || u === "otto" ? t.slice(0, -1) : t;
      out[stem + u] = tv + uv;
    }
  }
  return out;
}

const ORDINALS: Record<string, Record<string, number>> = {
  fr: { premier: 1, premiere: 1, deuxieme: 2, troisieme: 3, quatrieme: 4, cinquieme: 5, sixieme: 6, septieme: 7, huitieme: 8, neuvieme: 9, dixieme: 10 },
  en: { first: 1, third: 3, fourth: 4, fifth: 5, sixth: 6, seventh: 7, eighth: 8, ninth: 9, tenth: 10 },
  es: { primero: 1, primera: 1, segundo: 2, segunda: 2, tercero: 3, tercera: 3, cuarto: 4, quinto: 5, sexto: 6, septimo: 7, octavo: 8, noveno: 9, decimo: 10 },
  de: { erster: 1, erste: 1, zweiter: 2, zweite: 2, dritter: 3, dritte: 3, vierter: 4, funfter: 5, sechster: 6, siebter: 7, achter: 8, neunter: 9, zehnter: 10 },
  it: {
    primo: 1, prima: 1, secondo: 2, seconda: 2, terzo: 3, terza: 3, quarto: 4, quarta: 4, quinto: 5, quinta: 5,
    sesto: 6, sesta: 6, settimo: 7, settima: 7, ottavo: 8, ottava: 8, nono: 9, nona: 9, decimo: 10, decima: 10,
  },
};

const lng = (lang: string) => {
  const l = (lang || "en").slice(0, 2).toLowerCase();
  return l in NUM_WORDS ? l : "en";
};

/** Minuscules, sans accents, ponctuation → espace, nombres en lettres → chiffres. */
export function normalize(text: string, lang: string): string {
  const l = lng(lang);
  const base = (text || "")
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/['’`\-_/]/g, " ")
    .replace(/[?!;,«»"()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = NUM_WORDS[l];
  const toks = base.split(" ");
  const out: string[] = [];
  for (let i = 0; i < toks.length; i++) {
    const v = words[toks[i]];
    if (v === undefined) {
      out.push(toks[i]);
      continue;
    }
    // Dizaine + unité (« vingt deux », « twenty two », « treinta y dos », « vingt et un »).
    let n = v;
    if (v >= 20 && v % 10 === 0) {
      let j = i + 1;
      if (toks[j] === "et" || toks[j] === "y" || toks[j] === "and") j++;
      const u = words[toks[j]];
      if (u !== undefined && u >= 1 && u <= 9) {
        n = v + u;
        i = j;
      }
    }
    out.push(String(n));
  }
  return out.join(" ");
}

// ── Tables d'intentions ──────────────────────────────────────────────────────

interface Def {
  id: AnswerIntent;
  family: string;
  idioms?: string[];
  subjects?: string[];
  cues?: string[];
  /** Énoncé entier uniquement (commandes brèves). */
  exact?: string[];
}

const T: Record<string, Def[]> = {
  fr: [
    { id: "status", family: "status", idioms: ["ou j en suis", "fais le point", "le point", "resume", "situation"] },
    { id: "ahead", family: "gap", idioms: ["qui est devant", "qui est juste devant", "devant moi", "voiture devant", "pilote devant", "il est ou devant", "qui j ai devant"] },
    { id: "behind", family: "gap", idioms: ["qui est derriere", "qui est juste derriere", "derriere moi", "voiture derriere", "pilote derriere", "qui me suit", "qui me pousse", "qui j ai derriere"] },
    { id: "gap", family: "gap", idioms: ["quel ecart", "l ecart", "mes ecarts"], subjects: ["ecart", "ecarts", "gap"], cues: ["combien", "quel", "devant", "derriere"] },
    { id: "closing", family: "rival", idioms: ["je reviens", "est ce que je reviens", "je le rattrape", "je rattrape", "il revient", "il se rapproche", "je me rapproche", "il s echappe", "je decroche", "il me rattrape", "je le rejoins", "je le reprends"] },
    { id: "rival", family: "rival", idioms: ["mon rival", "la bagarre", "ma bagarre", "mon adversaire", "le duel", "avec qui je me bats"] },
    { id: "position", family: "position", idioms: ["quelle position", "ma position", "quelle place", "je suis quel", "je suis combien", "je suis ou au classement", "mon classement"], subjects: ["position", "place", "classement"], cues: ["quelle", "combien", "ou", "ma"] },
    { id: "classLeader", family: "position", idioms: ["qui mene", "qui est en tete", "qui est premier", "le leader", "premier en", "leader en", "qui gagne", "en tete en"] },
    { id: "sessionBest", family: "pace", idioms: ["meilleur tour de la session", "meilleur temps de la session", "record de la session", "meilleur tour du plateau", "meilleur temps du plateau", "qui est le plus rapide", "le plus rapide en piste", "meilleur tour de la course"] },
    { id: "pace", family: "pace", idioms: ["mon dernier tour", "dernier tour", "mon meilleur tour", "meilleur tour", "mon rythme", "mon chrono", "quel chrono", "mon temps au tour", "ma moyenne"], subjects: ["rythme", "chrono", "chronos"], cues: ["mon", "quel", "combien"] },
    { id: "stops", family: "pit", idioms: ["combien d arrets", "nombre d arrets", "combien de stops", "combien de fois je m arrete", "combien d arret"] },
    { id: "pitWindow", family: "pit", idioms: ["quand est ce que je m arrete", "quand je m arrete", "quand m arreter", "quand dois je m arreter", "quand je dois m arreter", "quand je rentre", "quand rentrer", "jusqu a quand", "fenetre d arret", "quel tour je rentre", "quand est ce qu on rentre", "quand est ce que je rentre", "je dois m arreter quand", "je dois m arreter", "dois je m arreter", "quand faut il m arreter", "quand faut il rentrer", "je dois rentrer quand"] },
    { id: "pit", family: "pit", idioms: ["si je rentre", "si je m arrete", "ou je ressors", "je ressors ou", "si je boxe", "je ressors", "si on rentre"] },
    { id: "fuel", family: "fuel", idioms: ["combien d essence", "il me reste combien", "tours d essence", "j ai assez", "assez pour finir", "ma conso", "je consomme combien", "ma consommation"], subjects: ["carburant", "essence", "fuel", "jus", "reservoir", "litres", "autonomie", "conso", "consommation"], cues: ["combien", "reste", "niveau", "tenir", "assez", "quel", "quelle"] },
    { id: "tyreTemp", family: "tyres", idioms: ["temperature des pneus", "temperature pneus", "temperature de mes pneus", "pneus chauds", "pneus froids", "chauffe des pneus", "pneus en temperature", "mes pneus sont chauds"] },
    { id: "tyres", family: "tyres", idioms: ["mes pneus", "etat des pneus", "usure des pneus"], subjects: ["pneus", "pneu", "gommes", "gomme", "usure"], cues: ["etat", "combien", "tiennent", "comment", "ou", "quel"] },
    { id: "forecast", family: "weather", idioms: ["previsions", "prevision", "meteo a venir", "va t il pleuvoir", "il va pleuvoir", "la pluie arrive", "pluie prevue", "risque de pluie", "ca va pleuvoir"] },
    { id: "weather", family: "weather", idioms: ["quel temps fait il", "la meteo", "il pleut", "etat de la piste", "temperature de la piste", "temperature piste", "piste seche", "piste mouillee"], subjects: ["meteo", "pluie", "pleut", "ciel"], cues: ["quel", "quelle", "comment", "est ce"] },
    { id: "traffic", family: "traffic", idioms: ["quand je rattrape le trafic", "le trafic", "du trafic", "retardataires", "le paquet", "voitures lentes", "quand je rattrape les"], subjects: ["trafic", "retardataire", "retardataires"] },
    { id: "remaining", family: "remaining", idioms: ["combien de tours", "tours restants", "il reste combien", "temps restant", "combien de temps", "quand ca finit", "fin de course", "minutes restantes", "il reste combien de temps"] },
    { id: "battery", family: "battery", idioms: ["niveau de batterie", "ma batterie", "energie virtuelle", "mon energie"], subjects: ["batterie", "hybride", "energie", "deploiement"], cues: ["combien", "niveau", "quel", "reste"] },
    { id: "brakeBias", family: "brakes", idioms: ["repartition", "repartition de freinage", "repartition des freins", "repartiteur", "balance de frein", "brake bias"] },
    { id: "stayOut", family: "command", idioms: ["je reste dehors", "on reste dehors", "je reste en piste", "negatif je reste", "je ne rentre pas", "non je reste", "on ne rentre pas", "je rentre pas"] },
    { id: "watchCancel", family: "command", idioms: ["annule les alertes", "annule mes alertes", "oublie les alertes", "plus d alertes", "annule l alerte", "arrete de surveiller", "efface les alertes"] },
    { id: "ackBox", family: "command", exact: ["compris", "recu", "bien recu", "ok", "d accord", "ok je rentre", "je rentre", "box box", "box", "copie", "ca marche", "c est note"] },
    { id: "repeat", family: "command", exact: ["repete", "tu peux repeter", "redis", "quoi", "pardon", "repete s il te plait"] },
    { id: "mute", family: "command", exact: ["silence", "tais toi", "coupe les annonces", "mute", "chut"] },
  ],
  en: [
    { id: "status", family: "status", idioms: ["where am i", "give me a summary", "summary", "status", "situation report"] },
    { id: "ahead", family: "gap", idioms: ["who is ahead", "who s ahead", "who is in front", "car ahead", "driver ahead", "in front of me", "who is directly ahead"] },
    { id: "behind", family: "gap", idioms: ["who is behind", "who s behind", "car behind", "driver behind", "behind me", "who is chasing", "who is following"] },
    { id: "gap", family: "gap", idioms: ["what s the gap", "what is the gap", "the gap", "my gaps"], subjects: ["gap", "gaps", "interval"], cues: ["how", "what", "ahead", "behind"] },
    { id: "closing", family: "rival", idioms: ["am i catching", "catching him", "is he catching", "am i closing", "closing in", "pulling away", "is he pulling away", "am i gaining", "gaining on"] },
    { id: "rival", family: "rival", idioms: ["my rival", "the battle", "who am i racing", "my opponent", "the fight"] },
    { id: "position", family: "position", idioms: ["what position", "my position", "what place", "where am i in the standings", "am i in"], subjects: ["position", "place", "standings"], cues: ["what", "my", "which"] },
    { id: "classLeader", family: "position", idioms: ["who is leading", "who s leading", "who is first", "the leader", "leader in", "first in", "who is winning"] },
    { id: "sessionBest", family: "pace", idioms: ["best lap of the session", "session best", "fastest lap", "who is fastest", "fastest car", "best time of the session"] },
    { id: "pace", family: "pace", idioms: ["my last lap", "last lap", "my best lap", "best lap", "my pace", "my lap time", "lap time", "my average"], subjects: ["pace", "laptime"], cues: ["my", "what", "how"] },
    { id: "stops", family: "pit", idioms: ["how many stops", "number of stops", "how many pit stops", "how many times do i pit"] },
    { id: "pitWindow", family: "pit", idioms: ["when do i pit", "when should i pit", "when do i box", "when should i box", "pit window", "until when", "which lap do i pit", "when do we pit", "when must i pit"] },
    { id: "pit", family: "pit", idioms: ["if i pit", "if i box", "where do i come out", "where will i rejoin", "if we pit", "pit now"] },
    { id: "fuel", family: "fuel", idioms: ["how much fuel", "fuel left", "laps of fuel", "enough fuel", "enough to finish", "my consumption", "fuel usage", "fuel per lap"], subjects: ["fuel", "petrol", "gas", "range", "consumption", "litres", "liters", "tank"], cues: ["how", "much", "left", "enough", "what"] },
    { id: "tyreTemp", family: "tyres", idioms: ["tyre temperature", "tire temperature", "tyre temps", "tire temps", "are my tyres warm", "are my tires warm", "tyres cold", "tires cold", "tyres hot", "tires hot"] },
    { id: "tyres", family: "tyres", idioms: ["my tyres", "my tires", "tyre wear", "tire wear", "tyre status", "tire status"], subjects: ["tyres", "tires", "tyre", "tire", "wear", "rubber"], cues: ["how", "what", "state", "status", "left"] },
    { id: "forecast", family: "weather", idioms: ["forecast", "weather forecast", "is it going to rain", "will it rain", "rain coming", "rain expected", "chance of rain"] },
    { id: "weather", family: "weather", idioms: ["what s the weather", "the weather", "is it raining", "track temperature", "track temp", "track conditions"], subjects: ["weather", "rain", "raining"], cues: ["what", "how", "is"] },
    { id: "traffic", family: "traffic", idioms: ["when do i hit traffic", "the traffic", "any traffic", "backmarkers", "slower cars", "when do i catch the"], subjects: ["traffic", "backmarker", "backmarkers"] },
    { id: "remaining", family: "remaining", idioms: ["how many laps", "laps left", "laps remaining", "time left", "time remaining", "how long left", "how much time"] },
    { id: "battery", family: "battery", idioms: ["battery level", "my battery", "virtual energy", "my energy"], subjects: ["battery", "hybrid", "energy", "deployment"], cues: ["how", "what", "level", "left"] },
    { id: "brakeBias", family: "brakes", idioms: ["brake bias", "brake balance", "bias"] },
    { id: "stayOut", family: "command", idioms: ["i m staying out", "i am staying out", "staying out", "stay out", "negative staying out", "not pitting", "i m not pitting"] },
    { id: "watchCancel", family: "command", idioms: ["cancel the alerts", "cancel alerts", "cancel my alerts", "clear alerts", "stop watching", "forget the alerts"] },
    { id: "ackBox", family: "command", exact: ["copy", "copy that", "understood", "roger", "ok", "okay", "boxing", "box box", "box", "got it", "pitting this lap"] },
    { id: "repeat", family: "command", exact: ["repeat", "say again", "what", "again", "come again", "pardon"] },
    { id: "mute", family: "command", exact: ["mute", "quiet", "shut up", "silence"] },
  ],
  es: [
    { id: "status", family: "status", idioms: ["donde estoy", "resumen", "situacion"] },
    { id: "ahead", family: "gap", idioms: ["quien va delante", "quien esta delante", "coche de delante", "piloto de delante", "delante de mi"] },
    { id: "behind", family: "gap", idioms: ["quien va detras", "quien esta detras", "coche de detras", "piloto de detras", "detras de mi", "quien me sigue"] },
    { id: "gap", family: "gap", idioms: ["que diferencia", "la diferencia", "mis diferencias"], subjects: ["diferencia", "distancia", "gap"], cues: ["cuanto", "cual", "delante", "detras"] },
    { id: "closing", family: "rival", idioms: ["le estoy alcanzando", "me estoy acercando", "me alcanza", "se escapa", "se acerca", "le alcanzo", "estoy recortando"] },
    { id: "rival", family: "rival", idioms: ["mi rival", "la batalla", "mi adversario", "el duelo", "con quien peleo"] },
    { id: "position", family: "position", idioms: ["que posicion", "mi posicion", "en que posicion voy", "que puesto"], subjects: ["posicion", "puesto", "clasificacion"], cues: ["que", "cual", "mi"] },
    { id: "classLeader", family: "position", idioms: ["quien lidera", "quien va primero", "quien gana", "el lider", "primero en", "lider en"] },
    { id: "sessionBest", family: "pace", idioms: ["mejor vuelta de la sesion", "mejor tiempo de la sesion", "vuelta rapida", "quien es el mas rapido", "record de la sesion"] },
    { id: "pace", family: "pace", idioms: ["mi ultima vuelta", "ultima vuelta", "mi mejor vuelta", "mejor vuelta", "mi ritmo", "mi tiempo por vuelta", "mi media"], subjects: ["ritmo", "crono"], cues: ["mi", "que", "cual"] },
    { id: "stops", family: "pit", idioms: ["cuantas paradas", "numero de paradas", "cuantas veces paro"] },
    { id: "pitWindow", family: "pit", idioms: ["cuando paro", "cuando debo parar", "cuando entro", "ventana de parada", "hasta cuando", "en que vuelta paro", "cuando entramos"] },
    { id: "pit", family: "pit", idioms: ["si entro", "si paro", "donde salgo", "si entramos", "entrar a boxes"] },
    { id: "fuel", family: "fuel", idioms: ["cuanto combustible", "cuanta gasolina", "vueltas de combustible", "me llega", "suficiente para terminar", "mi consumo"], subjects: ["combustible", "gasolina", "autonomia", "consumo", "litros", "deposito"], cues: ["cuanto", "cuanta", "queda", "suficiente", "cual"] },
    { id: "tyreTemp", family: "tyres", idioms: ["temperatura de los neumaticos", "temperatura neumaticos", "neumaticos frios", "neumaticos calientes"] },
    { id: "tyres", family: "tyres", idioms: ["mis neumaticos", "estado de los neumaticos", "desgaste de los neumaticos"], subjects: ["neumaticos", "neumatico", "gomas", "desgaste"], cues: ["como", "cuanto", "estado", "que"] },
    { id: "forecast", family: "weather", idioms: ["pronostico", "prevision", "va a llover", "lloverá", "llovera", "viene lluvia", "probabilidad de lluvia"] },
    { id: "weather", family: "weather", idioms: ["que tiempo hace", "el clima", "esta lloviendo", "temperatura de la pista", "estado de la pista"], subjects: ["clima", "lluvia", "llueve"], cues: ["que", "como", "esta"] },
    { id: "traffic", family: "traffic", idioms: ["cuando llego al trafico", "el trafico", "hay trafico", "doblados", "coches lentos"], subjects: ["trafico", "doblados"] },
    { id: "remaining", family: "remaining", idioms: ["cuantas vueltas", "vueltas restantes", "cuanto queda", "tiempo restante", "cuanto tiempo"] },
    { id: "battery", family: "battery", idioms: ["nivel de bateria", "mi bateria", "energia virtual", "mi energia"], subjects: ["bateria", "hibrido", "energia"], cues: ["cuanto", "cuanta", "nivel", "queda"] },
    { id: "brakeBias", family: "brakes", idioms: ["reparto de frenada", "reparto de frenos", "balance de frenos", "reparto"] },
    { id: "stayOut", family: "command", idioms: ["me quedo fuera", "nos quedamos fuera", "sigo en pista", "no entro", "negativo me quedo"] },
    { id: "watchCancel", family: "command", idioms: ["cancela las alertas", "cancela mis alertas", "borra las alertas", "olvida las alertas"] },
    { id: "ackBox", family: "command", exact: ["entendido", "recibido", "ok", "vale", "de acuerdo", "entro", "box box", "box", "copiado"] },
    { id: "repeat", family: "command", exact: ["repite", "repitelo", "otra vez", "que", "perdon"] },
    { id: "mute", family: "command", exact: ["silencio", "callate", "calla"] },
  ],
  de: [
    { id: "status", family: "status", idioms: ["wo stehe ich", "zusammenfassung", "lage", "status"] },
    { id: "ahead", family: "gap", idioms: ["wer ist vor mir", "wer ist vorne", "auto vor mir", "fahrer vor mir", "vor mir"] },
    { id: "behind", family: "gap", idioms: ["wer ist hinter mir", "wer ist hinten", "auto hinter mir", "fahrer hinter mir", "hinter mir", "wer folgt mir"] },
    { id: "gap", family: "gap", idioms: ["wie gross ist der abstand", "der abstand", "meine abstande"], subjects: ["abstand", "lucke", "gap"], cues: ["wie", "welcher", "vorne", "hinten"] },
    { id: "closing", family: "rival", idioms: ["hole ich auf", "komme ich ran", "holt er auf", "kommt er ran", "fahrt er weg", "zieht er weg", "ich hole auf"] },
    { id: "rival", family: "rival", idioms: ["mein rivale", "der kampf", "mein gegner", "das duell"] },
    { id: "position", family: "position", idioms: ["welche position", "meine position", "welcher platz", "auf welchem platz"], subjects: ["position", "platz", "platzierung"], cues: ["welche", "welcher", "meine", "wo"] },
    { id: "classLeader", family: "position", idioms: ["wer fuhrt", "wer ist erster", "wer liegt vorne", "der fuhrende", "erster in", "fuhrender in"] },
    { id: "sessionBest", family: "pace", idioms: ["beste runde der session", "bestzeit der session", "schnellste runde", "wer ist am schnellsten"] },
    { id: "pace", family: "pace", idioms: ["meine letzte runde", "letzte runde", "meine beste runde", "beste runde", "mein tempo", "meine rundenzeit", "mein schnitt"], subjects: ["tempo", "rundenzeit"], cues: ["mein", "meine", "wie"] },
    { id: "stops", family: "pit", idioms: ["wie viele stopps", "anzahl der stopps", "wie oft muss ich rein"] },
    { id: "pitWindow", family: "pit", idioms: ["wann komme ich rein", "wann muss ich rein", "wann boxe ich", "boxenfenster", "bis wann", "in welcher runde komme ich rein", "wann gehen wir rein"] },
    { id: "pit", family: "pit", idioms: ["wenn ich reinkomme", "wenn ich jetzt reinkomme", "wo komme ich raus", "wenn wir reinkommen"] },
    { id: "fuel", family: "fuel", idioms: ["wie viel sprit", "wie viel benzin", "runden sprit", "reicht der sprit", "reicht es bis ins ziel", "mein verbrauch"], subjects: ["sprit", "benzin", "kraftstoff", "reichweite", "verbrauch", "liter", "tank"], cues: ["wie", "viel", "reicht", "noch", "welcher"] },
    { id: "tyreTemp", family: "tyres", idioms: ["reifentemperatur", "temperatur der reifen", "reifen kalt", "reifen warm", "reifen heiss"] },
    { id: "tyres", family: "tyres", idioms: ["meine reifen", "reifenzustand", "reifenverschleiss"], subjects: ["reifen", "verschleiss"], cues: ["wie", "zustand", "noch"] },
    { id: "forecast", family: "weather", idioms: ["vorhersage", "wettervorhersage", "wird es regnen", "kommt regen", "regenwahrscheinlichkeit", "regnet es gleich"] },
    { id: "weather", family: "weather", idioms: ["wie ist das wetter", "das wetter", "regnet es", "streckentemperatur", "streckenzustand"], subjects: ["wetter", "regen"], cues: ["wie", "was", "ist"] },
    { id: "traffic", family: "traffic", idioms: ["wann komme ich in den verkehr", "der verkehr", "verkehr", "uberrundete", "langsamere autos"], subjects: ["verkehr", "uberrundete"] },
    { id: "remaining", family: "remaining", idioms: ["wie viele runden", "runden ubrig", "verbleibende runden", "restzeit", "wie lange noch", "wie viel zeit"] },
    { id: "battery", family: "battery", idioms: ["batteriestand", "meine batterie", "virtuelle energie", "meine energie"], subjects: ["batterie", "hybrid", "energie"], cues: ["wie", "viel", "stand", "noch"] },
    { id: "brakeBias", family: "brakes", idioms: ["bremsbalance", "bremskraftverteilung", "brake bias", "bremsverteilung"] },
    { id: "stayOut", family: "command", idioms: ["ich bleibe draussen", "wir bleiben draussen", "ich komme nicht rein", "negativ ich bleibe", "bleibe draussen"] },
    { id: "watchCancel", family: "command", idioms: ["alarme loschen", "alle alarme loschen", "alarme abbrechen", "vergiss die alarme"] },
    { id: "ackBox", family: "command", exact: ["verstanden", "roger", "ok", "okay", "alles klar", "ich komme rein", "box box", "box", "kopiert"] },
    { id: "repeat", family: "command", exact: ["wiederhole", "noch mal", "was", "wie bitte", "nochmal"] },
    { id: "mute", family: "command", exact: ["stumm", "ruhe", "halt den mund"] },
  ],
  it: [
    { id: "status", family: "status", idioms: ["dove sono", "a che punto sono", "fai il punto", "riepilogo", "riassunto", "situazione"] },
    { id: "ahead", family: "gap", idioms: ["chi ho davanti", "chi c e davanti", "chi e davanti", "chi sta davanti", "davanti a me", "macchina davanti", "auto davanti", "pilota davanti", "chi mi precede"] },
    { id: "behind", family: "gap", idioms: ["chi ho dietro", "chi c e dietro", "chi e dietro", "chi sta dietro", "dietro di me", "macchina dietro", "auto dietro", "pilota dietro", "chi mi segue", "chi mi insegue"] },
    { id: "gap", family: "gap", idioms: ["che distacco", "quale distacco", "quanto distacco", "il distacco", "i distacchi", "distacco davanti", "distacco dietro"], subjects: ["distacco", "distacchi", "gap", "margine"], cues: ["quanto", "quale", "che", "davanti", "dietro"] },
    { id: "closing", family: "rival", idioms: ["lo sto prendendo", "lo prendo", "sto recuperando", "recupero su", "lo riprendo", "mi avvicino", "mi sto avvicinando", "si avvicina", "mi sta prendendo", "mi sta recuperando", "sta scappando", "si allontana", "sto guadagnando"] },
    { id: "rival", family: "rival", idioms: ["il mio rivale", "mio rivale", "la battaglia", "il duello", "il mio avversario", "con chi lotto", "con chi sto lottando"] },
    { id: "position", family: "position", idioms: ["che posizione", "quale posizione", "in che posizione sono", "la mia posizione", "che posto", "in che posto sono", "dove sono in classifica", "la mia classifica"], subjects: ["posizione", "posto", "classifica"], cues: ["che", "quale", "mia", "dove"] },
    { id: "classLeader", family: "position", idioms: ["chi comanda", "chi e in testa", "chi e primo", "chi guida", "il leader", "primo in", "leader in", "chi vince", "chi sta vincendo", "in testa in"] },
    { id: "sessionBest", family: "pace", idioms: ["miglior giro della sessione", "miglior tempo della sessione", "giro piu veloce della sessione", "record della sessione", "giro piu veloce", "giro veloce", "chi e il piu veloce", "il piu veloce in pista", "miglior giro della gara"] },
    { id: "pace", family: "pace", idioms: ["il mio ultimo giro", "ultimo giro", "il mio miglior giro", "miglior giro", "il mio passo", "il mio ritmo", "il mio tempo sul giro", "tempo sul giro", "il mio tempo", "la mia media"], subjects: ["passo", "ritmo", "cronometro"], cues: ["mio", "che", "quale", "com e"] },
    { id: "stops", family: "pit", idioms: ["quante soste", "numero di soste", "quante fermate", "quanti pit stop", "quante volte mi fermo", "quante volte devo fermarmi", "quante volte rientro"] },
    { id: "pitWindow", family: "pit", idioms: ["quando devo rientrare", "quando rientro", "quando mi fermo", "quando devo fermarmi", "quando mi devo fermare", "quando devo entrare ai box", "quando entro ai box", "finestra di sosta", "finestra pit", "fino a quando", "in che giro rientro", "a che giro rientro", "quando rientriamo", "quando ci fermiamo", "devo rientrare", "devo fermarmi"] },
    { id: "pit", family: "pit", idioms: ["se rientro", "se mi fermo", "se entro ai box", "se rientriamo", "se ci fermiamo", "dove esco", "dove rientro in pista", "in che posizione esco"] },
    { id: "fuel", family: "fuel", idioms: ["quanta benzina", "quanto carburante", "giri di benzina", "giri di carburante", "mi basta la benzina", "basta la benzina", "ho abbastanza benzina", "abbastanza per finire", "basta per finire", "il mio consumo", "quanto consumo", "consumo per giro"], subjects: ["benzina", "carburante", "fuel", "serbatoio", "litri", "autonomia", "consumo"], cues: ["quanto", "quanta", "quanti", "resta", "rimane", "basta", "abbastanza", "quale"] },
    { id: "tyreTemp", family: "tyres", idioms: ["temperatura delle gomme", "temperatura gomme", "temperatura degli pneumatici", "temperatura pneumatici", "gomme calde", "gomme fredde", "gomme in temperatura", "pneumatici caldi", "pneumatici freddi"] },
    { id: "tyres", family: "tyres", idioms: ["le mie gomme", "stato delle gomme", "usura delle gomme", "usura gomme", "i miei pneumatici", "stato degli pneumatici", "usura degli pneumatici"], subjects: ["gomme", "gomma", "pneumatici", "pneumatico", "usura"], cues: ["stato", "quanto", "quanta", "come", "che"] },
    { id: "forecast", family: "weather", idioms: ["previsioni", "previsione", "previsioni meteo", "piovera", "sta per piovere", "arriva la pioggia", "pioggia in arrivo", "pioggia prevista", "rischio pioggia", "probabilita di pioggia"] },
    { id: "weather", family: "weather", idioms: ["che tempo fa", "il meteo", "sta piovendo", "piove", "temperatura della pista", "temperatura pista", "condizioni della pista", "pista asciutta", "pista bagnata"], subjects: ["meteo", "pioggia", "cielo"], cues: ["che", "come", "com e", "sta"] },
    { id: "traffic", family: "traffic", idioms: ["quando prendo il traffico", "il traffico", "c e traffico", "doppiati", "macchine lente", "auto lente", "vetture lente", "quando raggiungo i"], subjects: ["traffico", "doppiato", "doppiati"] },
    { id: "remaining", family: "remaining", idioms: ["quanti giri", "giri rimanenti", "giri mancanti", "quanti giri mancano", "quanto manca", "tempo rimanente", "tempo restante", "quanto tempo", "minuti rimanenti", "quando finisce", "fine gara"] },
    { id: "battery", family: "battery", idioms: ["livello batteria", "livello della batteria", "la mia batteria", "energia virtuale", "la mia energia"], subjects: ["batteria", "ibrido", "energia"], cues: ["quanto", "quanta", "livello", "resta", "rimane"] },
    { id: "brakeBias", family: "brakes", idioms: ["ripartizione", "ripartizione di frenata", "ripartizione frenata", "ripartizione dei freni", "ripartitore", "bilanciamento dei freni", "bilanciamento freni", "brake bias"] },
    { id: "stayOut", family: "command", idioms: ["resto fuori", "restiamo fuori", "rimango fuori", "resto in pista", "rimango in pista", "non rientro", "negativo resto fuori", "non mi fermo"] },
    { id: "watchCancel", family: "command", idioms: ["annulla gli avvisi", "annulla i miei avvisi", "cancella gli avvisi", "annulla gli allarmi", "cancella gli allarmi", "dimentica gli avvisi", "annulla l avviso", "smetti di controllare"] },
    { id: "ackBox", family: "command", exact: ["ricevuto", "capito", "ok", "okay", "va bene", "d accordo", "rientro", "box box", "box", "copiato", "chiaro", "perfetto"] },
    { id: "repeat", family: "command", exact: ["ripeti", "puoi ripetere", "ripeti per favore", "come", "cosa", "scusa", "di nuovo", "non ho capito"] },
    { id: "mute", family: "command", exact: ["silenzio", "zitto", "stai zitto", "taci", "muto"] },
  ],
};

/** Paires de familles qui ne rendent pas une question ambiguë. */
const BENIGN = new Set(["fuel|remaining", "gap|pit", "pit|tyres", "tyres|weather", "gap|rival", "gap|position", "pit|traffic"]);
const benign = (a: string, b: string) => a === b || BENIGN.has([a, b].sort().join("|"));

const tokenSet = (s: string) => new Set(s.split(" "));

function score(def: Def, norm: string, toks: Set<string>): number {
  if (def.exact) return def.exact.includes(norm) ? 200 : 0;
  let best = 0;
  for (const idiom of def.idioms ?? []) {
    const multi = idiom.includes(" ");
    const hit = multi ? ` ${norm} `.includes(` ${idiom} `) : toks.has(idiom);
    if (hit) best = Math.max(best, 100 + 10 * (idiom.split(" ").length - 1));
  }
  const subj = (def.subjects ?? []).some((w) => toks.has(w));
  const cue = (def.cues ?? []).some((w) => (w.includes(" ") ? ` ${norm} `.includes(` ${w} `) : toks.has(w)));
  const base = best > 0 ? best : subj && cue ? 70 : subj ? 40 : 0;
  return best > 0 && subj ? base + 10 : base;
}

// ── Entités ──────────────────────────────────────────────────────────────────

export function extractEntities(norm: string, lang: string): Entities {
  const e: Entities = {};
  const n = ` ${norm} `;
  if (/ (hypercars?|hyper|lmh|lmdh) /.test(n)) e.cls = "Hypercar";
  else if (/ (lmp ?2|l m p ?2) /.test(n)) e.cls = "LMP2";
  else if (/ (lmp ?3|l m p ?3) /.test(n)) e.cls = "LMP3";
  else if (/ (lm ?gt ?3|gt ?3|g t ?3) /.test(n)) e.cls = "GT3";
  else if (/ (gte|g t e) /.test(n)) e.cls = "GTE";
  if (/ (au general|general|overall|absolu|gesamt|insgesamt|en la general|generale|assoluta|assoluto) /.test(n)) e.overall = true;
  const pm =
    / p ?(\d{1,2}) /.exec(n) ??
    / (?:position|place|posicion|puesto|platz|rang|posizione) (\d{1,2}) /.exec(n) ??
    / (\d{1,2}) ?(?:e|eme|er|th|st|nd|rd|ter|te) /.exec(n);
  if (pm) e.pos = Number(pm[1]);
  else {
    const ord = ORDINALS[lng(lang)];
    const word = norm.split(" ").find((w) => ord[w] !== undefined);
    if (word) e.pos = ord[word];
  }
  const cm = / (?:la|le|numero|number|no|nummer|#|voiture|car|coche|auto|wagen|el|der|die|das|macchina|vettura) (\d{1,3}) /.exec(n);
  if (cm) e.carNo = cm[1];
  return e;
}

// ── Alertes « préviens-moi quand… » ──────────────────────────────────────────

const WATCH_TRIGGERS: Record<string, string[]> = {
  fr: ["previens moi", "previens", "dis moi quand", "dis moi des que", "avertis moi", "alerte moi", "signale moi", "fais moi signe", "tiens moi au courant", "annonce moi quand"],
  en: ["let me know when", "tell me when", "warn me when", "alert me when", "notify me when", "let me know if", "tell me if", "warn me if"],
  es: ["avisame cuando", "avisame si", "dime cuando", "alertame cuando", "avisa cuando"],
  de: ["sag mir wenn", "sag mir bescheid wenn", "sag bescheid wenn", "warn mich wenn", "melde dich wenn", "gib mir bescheid wenn"],
  it: ["dimmi quando", "avvisami quando", "avvisami se", "fammi sapere quando", "fammi sapere se", "avvertimi quando", "avvertimi se", "segnalami quando"],
};

const W = {
  time: /(\d+) ?(minutes?|min|minutos?|minuten?|minut[oi])/,
  laps: /(\d+) ?(tours?|laps?|vueltas?|runden?|gir[oi])/,
  secs: /(\d+(?:[.,]\d+)?) ?(secondes?|seconds?|sec|segundos?|sekunden?|second[oi])/,
  fuel: / (essence|carburant|fuel|gasolina|combustible|sprit|benzin|kraftstoff|autonomie|range|autonomia|reichweite|benzina|carburante) /,
  pit: / (s arrete|arrete|au stand|aux stands|rentre|pits|pit|boxes|box|boxt|para|entra|reinkommt|stoppt|boxen|rientra|si ferma|ferma) /,
  rain: / (pluie|pleut|pleuvoir|rain|raining|lluvia|llueve|llover|regen|regnet|pioggia|piove|piovere|piovera) /,
  ahead: / (devant|ahead|in front|delante|vor mir|vorne|davanti) /,
  behind: / (derriere|behind|detras|hinter mir|hinten|dietro) /,
  leader: / (leader|premier|en tete|first|lider|primero|fuhrende|erster|primo|in testa) /,
};

export function isWatchRequest(norm: string, lang: string): boolean {
  const n = ` ${norm} `;
  return (WATCH_TRIGGERS[lng(lang)] ?? WATCH_TRIGGERS.en).some((t) => n.includes(` ${t} `));
}

/** Lit la condition d'une alerte ; null si non comprise. */
export function parseWatch(norm: string, ent: Entities): WatchSpec | null {
  const n = ` ${norm} `;
  const secs = W.secs.exec(n);
  if (W.pit.test(n) && (ent.carNo || ent.pos || W.ahead.test(n) || W.behind.test(n) || W.leader.test(n))) {
    const target = ent.carNo || ent.pos ? "entity" : W.leader.test(n) ? "leader" : W.behind.test(n) ? "behind" : "ahead";
    return { kind: "rivalPit", target };
  }
  if (W.rain.test(n)) return { kind: "rain" };
  if (W.fuel.test(n)) {
    const m = W.laps.exec(n) ?? / (\d+) /.exec(n);
    return { kind: "fuelLaps", laps: m ? Number(m[1]) : DEFAULTS.fuelLaps };
  }
  const t = W.time.exec(n);
  if (t) return { kind: "timeLeft", minutes: Number(t[1]) };
  const l = W.laps.exec(n);
  if (l) return { kind: "lapsLeft", laps: Number(l[1]) };
  if (secs || / (moins d|less than|menos de|weniger als|sous|under|meno di|sotto) /.test(n)) {
    const s = secs ? Number(secs[1].replace(",", ".")) : DEFAULTS.gapS;
    return W.behind.test(n) ? { kind: "gapBehind", seconds: s } : { kind: "gapAhead", seconds: s };
  }
  if (/ (fin|end|final|ende|fine) /.test(n)) return { kind: "timeLeft", minutes: DEFAULTS.timeLeftMin };
  return null;
}

/** Description courte (anglais) de chaque intention — pour l'aiguillage par l'IA. */
export const INTENT_HELP: Partial<Record<AnswerIntent, string>> = {
  status: "full race summary",
  gap: "time gaps to the cars ahead and behind",
  ahead: "who is the car ahead in my class and the gap",
  behind: "who is the car behind in my class and the gap",
  closing: "am I catching the car ahead (closing rate)",
  rival: "nearest rival, class and sector strengths",
  position: "my position",
  classLeader: "who leads the class / the race",
  positionOf: "who is at a given position",
  carInfo: "information about a given car number or driver",
  sessionBest: "fastest lap of the session",
  pace: "my last / best lap and delta",
  stops: "how many pit stops are still needed",
  pitWindow: "latest lap to pit (pit window)",
  pit: "where I would rejoin if I pit now",
  fuel: "fuel level, range and fuel to finish",
  tyreTemp: "tyre temperatures vs working window",
  tyres: "tyre wear and temperature",
  forecast: "weather forecast (rain coming?)",
  weather: "current weather and track temperature",
  traffic: "slower traffic ahead / backmarkers",
  remaining: "laps or time remaining",
  battery: "hybrid battery and virtual energy",
  brakeBias: "brake bias",
};

// ── Routage ──────────────────────────────────────────────────────────────────

const WHO = / (qui|who|quien|wer|c est qui|ou est|where is|donde esta|wo ist|chi|dov e|dove e|dove sta) /;

/**
 * Marqueurs de jugement / conseil (« ça tiendra jusqu'au bout ? », « tu me
 * conseilles quoi ? ») : sans locution précise, la question relève de l'IA, pas
 * d'une lecture de chiffres.
 */
const JUDGMENT =
  / (pourquoi|comment je|comment faire|tiendr\w*|tiennent|tient|jusqu a la fin|jusqu au bout|vaut il mieux|tu penses|tu conseilles|conseil|je devrais|faut il|strategie|why|how do i|how can i|should i|will it last|last until|do you think|advice|strategy|better to|por que|como puedo|deberia|aguanta\w*|crees|consejo|estrategia|warum|wie kann ich|sollte ich|halten|meinst du|strategie|perche|come faccio|come posso|dovrei|conviene|secondo te|pensi|consigli\w*|strategia|durer\w*|regg\w*|fino alla fine|fino in fondo) /;

export function route(text: string, lang: string): Route {
  const norm = normalize(text, lang);
  const entities = extractEntities(norm, lang);
  const empty: Route = { intent: null, ambiguous: false, candidates: [], entities, watch: null, norm };
  if (!norm) return empty;

  if (isWatchRequest(norm, lang)) {
    return { ...empty, intent: "watch", candidates: ["watch"], watch: parseWatch(norm, entities) };
  }

  const toks = tokenSet(norm);
  const scored = (T[lng(lang)] ?? T.en)
    .map((d) => ({ d, s: score(d, norm, toks) }))
    .filter((x) => x.s >= THRESHOLD)
    .sort((a, b) => b.s - a.s);

  // Questions à entité : « qui est P6 en LMP2 », « où est la 14 ».
  const n = ` ${norm} `;
  if (WHO.test(n) && entities.carNo) {
    scored.unshift({ d: { id: "carInfo", family: "identity" }, s: 150 });
  } else if (WHO.test(n) && entities.pos && !(scored[0]?.s >= 200)) {
    scored.unshift({ d: { id: "positionOf", family: "identity" }, s: 150 });
  }

  if (!scored.length) return empty;
  const best = scored[0];
  // Question de jugement sans locution précise (au plus 2 mots) → l'IA, qui a le contexte.
  if (best.s <= 120 && JUDGMENT.test(n)) return empty;
  const rival = scored.find((x) => x !== best && !benign(x.d.family, best.d.family));
  const ambiguous = !!rival && best.s - rival.s < MARGIN && best.s < 200;
  const candidates = [...new Set(scored.map((x) => x.d.id))];
  return { ...empty, intent: ambiguous ? null : best.d.id, ambiguous, candidates };
}
