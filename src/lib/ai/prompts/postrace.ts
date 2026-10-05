/**
 * Prompts utilisateur post-race : analyse rapide (≈300 tokens) et complète
 * (≈1000 tokens), 5 langues. La question est suivie du contexte de données
 * (`context/postrace-context.ts`).
 */

export type PostRaceMode = "quick" | "full";

const QUICK: Record<string, string> = {
  fr: `Analyse rapide de ma session. Donne-moi 3 points : mon point fort principal, mon point faible principal, et LA priorité n°1 pour ma prochaine session sur ce combo. Une donnée chiffrée par point. Sois direct.`,
  en: `Quick analysis of my session. Give me 3 points: my main strength, my main weakness, and THE #1 priority for my next session on this combo. One data point per item. Be direct.`,
  es: `Análisis rápido de mi sesión. Dame 3 puntos: mi punto fuerte principal, mi punto débil principal y LA prioridad nº1 para mi próxima sesión en este combo. Un dato por punto. Sé directo.`,
  de: `Schnellanalyse meiner Session. Gib mir 3 Punkte: meine größte Stärke, meine größte Schwäche und DIE Priorität Nr. 1 für meine nächste Session auf dieser Kombination. Eine Kennzahl pro Punkt. Sei direkt.`,
  it: `Analisi rapida della mia sessione. Dammi 3 punti: il mio principale punto di forza, il mio principale punto debole e LA priorità n°1 per la mia prossima sessione su questa combinazione. Un dato numerico per ogni punto. Sii diretto.`,
};

const FULL: Record<string, string> = {
  fr: `Analyse complète de ma session en 5 parties, chiffrée :
1. Forces — ce que j'ai bien fait (secteurs forts, régularité, gestion).
2. Points d'amélioration — où j'ai perdu du temps (secteurs faibles, incohérences).
3. Analyse sectorielle — S1/S2/S3 vs ma référence et vs la classe.
4. Stratégie — gestion carburant / pneus / arrêts.
5. Recommandations — 3 conseils concrets et chiffrés pour la prochaine session.`,
  en: `Full analysis of my session in 5 parts, with numbers:
1. Strengths — what I did well (strong sectors, consistency, management).
2. Areas to improve — where I lost time (weak sectors, inconsistencies).
3. Sector analysis — S1/S2/S3 vs my reference and vs the class.
4. Strategy — fuel / tyre / pit management.
5. Recommendations — 3 concrete, quantified tips for next session.`,
  es: `Análisis completo de mi sesión en 5 partes, con cifras:
1. Puntos fuertes — lo que hice bien (sectores fuertes, regularidad, gestión).
2. Puntos a mejorar — dónde perdí tiempo (sectores débiles, incoherencias).
3. Análisis sectorial — S1/S2/S3 vs mi referencia y vs la clase.
4. Estrategia — gestión de combustible / neumáticos / paradas.
5. Recomendaciones — 3 consejos concretos y cuantificados para la próxima sesión.`,
  de: `Vollständige Analyse meiner Session in 5 Teilen, mit Zahlen:
1. Stärken — was ich gut gemacht habe (starke Sektoren, Konstanz, Management).
2. Verbesserungsbereiche — wo ich Zeit verloren habe (schwache Sektoren, Inkonsistenzen).
3. Sektoranalyse — S1/S2/S3 vs. meine Referenz und vs. die Klasse.
4. Strategie — Kraftstoff- / Reifen- / Boxenmanagement.
5. Empfehlungen — 3 konkrete, mit Zahlen belegte Tipps für die nächste Session.`,
  it: `Analisi completa della mia sessione in 5 parti, con i numeri:
1. Punti di forza — cosa ho fatto bene (settori forti, costanza, gestione).
2. Margini di miglioramento — dove ho perso tempo (settori deboli, incoerenze).
3. Analisi per settori — S1/S2/S3 rispetto al mio riferimento e alla classe.
4. Strategia — gestione di carburante / gomme / soste.
5. Raccomandazioni — 3 consigli concreti e quantificati per la prossima sessione.`,
};

/**
 * Consigne de sortie structurée (mode complet uniquement) : objectifs
 * mesurables en JSON, parsés par `CoachPanel` et rendus en cartes épinglables.
 * Clés en anglais (stables pour le parseur), valeurs dans la langue de la
 * réponse. Le bloc est retiré du texte affiché/lu.
 */
const OBJECTIVES_JSON = `

At the very end of your answer, append a fenced \`\`\`json block (nothing after it) of the form:
{"objectives":[{"title":"...","metric":"...","current":"...","target":"..."}]}
1 to 3 objectives max, written in the same language as the rest of your answer, each measurable against the provided data.`;

export function postRacePrompt(mode: PostRaceMode, lang: string): string {
  const code = lang.slice(0, 2).toLowerCase();
  const table = mode === "quick" ? QUICK : FULL;
  const base = table[code] ?? table.en;
  return mode === "full" ? base + OBJECTIVES_JSON : base;
}

/** Budget de tokens de sortie par mode. Complet : large, pour que l'analyse en
 *  5 parties + le bloc d'objectifs JSON aillent au bout sans être tronqués. */
export const POST_RACE_MAX_TOKENS: Record<PostRaceMode, number> = {
  quick: 400,
  full: 3000,
};
