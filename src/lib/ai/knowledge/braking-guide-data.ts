/**
 * Base de référence des freinages idéaux par circuit (Le Mans Ultimate).
 *
 * Source : ApexPoints (apex-brake-flow.base44.app) — guide communautaire des
 * zones de freinage par circuit et par classe (Hypercar / LMP2 / GT3). Donnée
 * de référence utilisée par le Coach IA (cf. `braking-guide.ts`). Crédit à
 * l auteur d origine ; affichage interne, non redistribué tel quel.
 *
 * Fichier GÉNÉRÉ — ne pas éditer à la main.
 *
 * ⚠️ Règle (2026-09-25) : on n'intègre AUCUNE fiche dont le tracé ne correspond
 * pas au circuit du jeu. Audit contre les tracés officiels : Le Mans, Monza, Spa
 * et Imola sont justes (seuls les numéros de virage sont décalés) ; Sebring,
 * COTA, Interlagos, Paul Ricard, Fuji, Portimão et Bahreïn décrivaient des
 * virages faux (noms d'autres circuits, freinages à la place de virages à fond,
 * épingles absentes) → RETIRÉES, y compris au regénérage. Road Atlanta est
 * réécrite à la main (bloc dédié). Détail et sources : SUIVI.md, journal du
 * 2026-09-25.
 */

export interface BrakingRef {
  marker: string;
  speed: string;
  gear: string;
  pressure: string;
  tip: string;
  tipFr: string;
}
export interface BrakingCorner {
  number: string;
  name: string;
  type: string;
  braking: Record<string, BrakingRef>;
}
export interface BrakingTrack {
  id: string;
  name: string;
  location: string;
  /** Source de la donnée. Absent = ApexPoints (entrées historiques générées). */
  source?: string;
  corners: BrakingCorner[];
}

export const BRAKING_GUIDE: BrakingTrack[] = [
  {
    "id": "le-mans",
    "name": "Circuit de la Sarthe",
    "location": "Le Mans, France",
    "corners": [
      {
        "number": "T1-T2",
        "name": "Dunlop Chicane",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "150m board",
            "speed": "320→100 km/h",
            "gear": "3rd",
            "pressure": "Heavy initial, trail brake",
            "tip": "Brake just before the 150m board. Hard initial brake, release as you turn in for the first apex.",
            "tipFr": "Freinez juste avant le panneau 150m. Freinage initial fort, relâchez en tournant vers le premier apex."
          },
          "lmp2": {
            "marker": "150m board",
            "speed": "300→95 km/h",
            "gear": "3rd",
            "pressure": "Heavy initial, trail brake",
            "tip": "Brake at the 150m board. The car is lighter so braking zone is similar but entry speed lower.",
            "tipFr": "Freinez au panneau 150m. La voiture est plus légère donc la zone est similaire mais la vitesse d'entrée est moins élevée."
          },
          "gt3": {
            "marker": "175m board",
            "speed": "265→80 km/h",
            "gear": "2nd",
            "pressure": "Heavy, progressive release",
            "tip": "Brake earlier at the 175m board. GT3 needs more braking distance. Be patient on turn-in.",
            "tipFr": "Freinez plus tôt au panneau 175m. La GT3 a besoin de plus de distance de freinage. Soyez patient à l'entrée du virage."
          }
        }
      },
      {
        "number": "T3-T4",
        "name": "Esses",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Lift only",
            "speed": "290→240 km/h",
            "gear": "5th",
            "pressure": "Light brush / lift",
            "tip": "Mostly flat or a light lift. High downforce keeps you planted. Commit to it.",
            "tipFr": "Presque à plat ou légère levée de pied. L'appui élevé vous colle au sol. Engagez-vous."
          },
          "lmp2": {
            "marker": "Light brake",
            "speed": "275→220 km/h",
            "gear": "5th",
            "pressure": "Light brush",
            "tip": "A light dab of brakes or lift. Carry as much speed as you dare through here.",
            "tipFr": "Un léger frein ou levée de pied. Portez autant de vitesse que vous l'osez."
          },
          "gt3": {
            "marker": "100m before entry",
            "speed": "240→180 km/h",
            "gear": "4th",
            "pressure": "Moderate brake",
            "tip": "You need a proper braking zone here. Brake before turn-in and get the car settled.",
            "tipFr": "Il faut ici une vraie zone de freinage. Freinez avant l'entrée et stabilisez la voiture."
          }
        }
      },
      {
        "number": "T5",
        "name": "Tertre Rouge",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Lift / light brake",
            "speed": "250→200 km/h",
            "gear": "5th",
            "pressure": "Very light",
            "tip": "Crucial corner — exit speed defines your Mulsanne speed. Light brake, early apex, and unwind onto the straight.",
            "tipFr": "Virage crucial — la vitesse de sortie définit votre vitesse sur la Mulsanne. Léger frein, apex tôt, déroulez sur la ligne droite."
          },
          "lmp2": {
            "marker": "Light brake",
            "speed": "235→185 km/h",
            "gear": "4th-5th",
            "pressure": "Light",
            "tip": "Gentle braking to set up the car. Prioritize exit speed above all else here.",
            "tipFr": "Freinage doux pour stabiliser la voiture. Priorité absolue à la vitesse de sortie."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "210→155 km/h",
            "gear": "4th",
            "pressure": "Moderate",
            "tip": "Brake properly, get the car rotated, and focus on a clean exit. Every km/h matters down Mulsanne.",
            "tipFr": "Freinez correctement, faites pivoter la voiture et concentrez-vous sur une sortie propre. Chaque km/h compte sur la Mulsanne."
          }
        }
      },
      {
        "number": "T8-T9",
        "name": "Mulsanne Chicane 1",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "150m board",
            "speed": "340→90 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "One of the heaviest braking zones. Brake at 150m board, downshift progressively. Don't lock up.",
            "tipFr": "L'une des zones de freinage les plus lourdes. Freinez au panneau 150m, rétrogradez progressivement. Ne bloquez pas."
          },
          "lmp2": {
            "marker": "150m board",
            "speed": "315→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at the 150m board. Big speed scrub needed. Stay straight on initial braking.",
            "tipFr": "Freinez au panneau 150m. Grande réduction de vitesse nécessaire. Restez droit au freinage initial."
          },
          "gt3": {
            "marker": "200m board",
            "speed": "270→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at or before the 200m board. This is a long braking zone — be patient and progressive.",
            "tipFr": "Freinez au panneau 200m ou avant. C'est une longue zone de freinage — soyez patient et progressif."
          }
        }
      },
      {
        "number": "T11-T12",
        "name": "Mulsanne Chicane 2",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "150m board",
            "speed": "340→90 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Almost identical to Chicane 1. Same approach — heavy brake at 150m, trail into the chicane.",
            "tipFr": "Presque identique à la Chicane 1. Même approche — freinage lourd à 150m, lestage dans la chicane."
          },
          "lmp2": {
            "marker": "150m board",
            "speed": "315→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Mirror of Chicane 1. Same technique applies. Keep it clean and consistent.",
            "tipFr": "Miroir de la Chicane 1. Même technique. Restez propre et régulier."
          },
          "gt3": {
            "marker": "200m board",
            "speed": "270→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Same as Chicane 1. Brake at 200m. Consistency is key in endurance racing.",
            "tipFr": "Identique à la Chicane 1. Freinez à 200m. La régularité est la clé en endurance."
          }
        }
      },
      {
        "number": "T13",
        "name": "Mulsanne Corner",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "150m board",
            "speed": "300→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy, trail brake",
            "tip": "Heavy braking zone. Trail brake deep into the corner to rotate the car. Late apex for good exit.",
            "tipFr": "Zone de freinage lourd. Lestage profond dans le virage pour faire pivoter la voiture. Apex tardif pour une bonne sortie."
          },
          "lmp2": {
            "marker": "150m board",
            "speed": "280→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy, trail brake",
            "tip": "Big stop. Trail brake to rotate. Get a good exit toward Indianapolis.",
            "tipFr": "Gros arrêt. Lestage pour faire pivoter. Bonne sortie vers Indianapolis."
          },
          "gt3": {
            "marker": "175m board",
            "speed": "245→55 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake early, slow the car down. Trail brake to keep the front loaded. Late apex.",
            "tipFr": "Freinez tôt, ralentissez la voiture. Lestage pour garder l'avant chargé. Apex tardif."
          }
        }
      },
      {
        "number": "T15",
        "name": "Indianapolis",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "280→130 km/h",
            "gear": "4th",
            "pressure": "Heavy initial",
            "tip": "Fast right-hander. Brake at the 100m board, quick downshift, and commit to the apex.",
            "tipFr": "Virage rapide à droite. Freinez au panneau 100m, rétrogradez rapidement et engagez-vous vers l'apex."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "260→120 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Firm braking at the 100m board. Get the car slowed and turned in together.",
            "tipFr": "Freinage ferme au panneau 100m. Ralentissez la voiture et tournez en même temps."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "230→100 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake a bit earlier. The car will understeer if you brake too late here.",
            "tipFr": "Freinez un peu plus tôt. La voiture sous-virera si vous freinez trop tard ici."
          }
        }
      },
      {
        "number": "T17",
        "name": "Arnage",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "260→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy, trail brake",
            "tip": "Tight right-hander. Heavy braking, trail in deep. Late apex and get on the power early.",
            "tipFr": "Virage serré à droite. Freinage lourd, lestage profond. Apex tardif et accélérez tôt."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "240→60 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Big stop into a tight corner. Trail brake to rotate the car. Power out hard.",
            "tipFr": "Gros arrêt dans un virage serré. Lestage pour faire pivoter la voiture. Accélérez fort en sortie."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "210→50 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m, slow it down a lot. Be patient — exit speed matters for the next section.",
            "tipFr": "Freinez à 125m, ralentissez beaucoup. Soyez patient — la vitesse de sortie compte pour la section suivante."
          }
        }
      },
      {
        "number": "T20-T26",
        "name": "Porsche Curves",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Mostly flat / lifts",
            "speed": "280→220 km/h",
            "gear": "5th-6th",
            "pressure": "Minimal",
            "tip": "Almost flat in a Hypercar. Small lifts between direction changes. Trust the downforce. Rhythm is key.",
            "tipFr": "Presque à plat en Hypercar. Petites levées de pied entre les changements de direction. Faites confiance à l'appui. Le rythme est la clé."
          },
          "lmp2": {
            "marker": "Light brakes / lifts",
            "speed": "260→200 km/h",
            "gear": "4th-5th",
            "pressure": "Light",
            "tip": "Light brakes or lifts at each crest. Find a rhythm. Don't overdrive — smooth is fast here.",
            "tipFr": "Freins légers ou levées de pied à chaque crête. Trouvez un rythme. Ne sur-conduisez pas — la fluidité est rapide ici."
          },
          "gt3": {
            "marker": "Brake between sections",
            "speed": "220→160 km/h",
            "gear": "4th",
            "pressure": "Moderate",
            "tip": "You'll need proper braking between each curve. Keep the car balanced. This is survival territory.",
            "tipFr": "Il vous faudra de vrais freinages entre chaque courbe. Gardez la voiture équilibrée. C'est un secteur de survie."
          }
        }
      },
      {
        "number": "T32-T33",
        "name": "Ford Chicane",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "300→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Last chicane before the start/finish. Heavy brake at 100m, nail both apexes. Clean exit onto the pit straight.",
            "tipFr": "Dernière chicane avant la ligne d'arrivée. Freinage lourd à 100m, visez les deux apex. Sortie propre sur la ligne droite des stands."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "275→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m, hard stop. Be precise through the chicane — contact here ruins your race.",
            "tipFr": "Freinez à 100m, arrêt brusque. Soyez précis dans la chicane — un contact ici ruine votre course."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "240→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. This chicane is tight — don't cut too aggressively or you'll get a penalty.",
            "tipFr": "Freinez à 125m. Cette chicane est serrée — ne coupez pas trop agressivement ou vous aurez une pénalité."
          }
        }
      }
    ]
  },
  {
    "id": "monza",
    "name": "Autodromo di Monza",
    "location": "Monza, Italy",
    "corners": [
      {
        "number": "T1-T2",
        "name": "Variante del Rettifilo",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "330→80 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Massive braking zone from top speed. Brake at the 100m board. Trail brake into the chicane.",
            "tipFr": "Énorme zone de freinage depuis la vitesse maximale. Freinez au panneau 100m. Lestage dans la chicane."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "305→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at the 100m board. Stay straight initially, then turn in as you release the brake.",
            "tipFr": "Freinez au panneau 100m. Restez d'abord droit, puis tournez en relâchant le frein."
          },
          "gt3": {
            "marker": "150m board",
            "speed": "270→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at the 150m board. Long braking zone — don't lock up on the initial hit.",
            "tipFr": "Freinez au panneau 150m. Longue zone de freinage — ne bloquez pas au début."
          }
        }
      },
      {
        "number": "T3-T4",
        "name": "Curva Grande",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Flat",
            "speed": "310+ km/h",
            "gear": "7th",
            "pressure": "None",
            "tip": "Flat out through here. The car has enough downforce. Commit fully.",
            "tipFr": "Pleine charge ici. La voiture a assez d'appui. Engagez-vous totalement."
          },
          "lmp2": {
            "marker": "Slight lift",
            "speed": "285→270 km/h",
            "gear": "6th",
            "pressure": "Very light",
            "tip": "Slight lift or flat depending on setup. Trust the downforce.",
            "tipFr": "Légère levée de pied ou à plat selon le réglage. Faites confiance à l'appui."
          },
          "gt3": {
            "marker": "Light brake",
            "speed": "250→220 km/h",
            "gear": "5th",
            "pressure": "Light",
            "tip": "A light brake tap to settle the car. Don't lift abruptly mid-corner.",
            "tipFr": "Un léger coup de frein pour stabiliser la voiture. Ne levez pas brusquement en milieu de virage."
          }
        }
      },
      {
        "number": "T5-T6",
        "name": "Variante della Roggia",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "310→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Another big stop. Brake at the 100m board. Attack the kerbs but don't overdo it.",
            "tipFr": "Un autre gros arrêt. Freinez au panneau 100m. Attaquez les vibreurs mais sans excès."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "290→80 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Heavy braking from high speed. Be precise with the turn-in — it's easy to overshoot.",
            "tipFr": "Freinage lourd depuis haute vitesse. Soyez précis à l'entrée — il est facile de dépasser."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "255→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. The chicane is tight — use the kerbs but keep the car stable.",
            "tipFr": "Freinez à 125m. La chicane est serrée — utilisez les vibreurs mais gardez la voiture stable."
          }
        }
      },
      {
        "number": "T7",
        "name": "Lesmo 1",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "280→170 km/h",
            "gear": "4th-5th",
            "pressure": "Heavy initial",
            "tip": "Brake at the 75m board. It tightens on exit so don't get on the power too early.",
            "tipFr": "Freinez au panneau 75m. Le virage se resserre en sortie, ne reprenez pas les gaz trop tôt."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "260→155 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Brake at the 100m board. Respect the corner — it punishes overspeed on exit.",
            "tipFr": "Freinez au panneau 100m. Respectez ce virage — il punit la survitesse en sortie."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "230→130 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Brake at 100m. This corner tightens — carry less speed in and focus on exit.",
            "tipFr": "Freinez à 100m. Ce virage se resserre — portez moins de vitesse à l'entrée et concentrez-vous sur la sortie."
          }
        }
      },
      {
        "number": "T8",
        "name": "Lesmo 2",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "260→155 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Similar to Lesmo 1 but slightly tighter. Brake at 75m, late apex, and accelerate onto the back straight.",
            "tipFr": "Similaire à Lesmo 1 mais légèrement plus serré. Freinez à 75m, apex tardif, accélérez sur la ligne droite du fond."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "245→140 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Get a good exit — it feeds onto a long straight.",
            "tipFr": "Freinez à 75m. Bonne sortie — ça débouche sur une longue ligne droite."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "215→120 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Late apex and prioritize exit speed for the run to Ascari.",
            "tipFr": "Freinez à 100m. Apex tardif et priorisez la vitesse de sortie vers Ascari."
          }
        }
      },
      {
        "number": "T9-T10",
        "name": "Ascari",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "300→140 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Brake at the 75m board. It's a fast chicane — carry good speed through and flow left-right-left.",
            "tipFr": "Freinez au panneau 75m. C'est une chicane rapide — portez de la vitesse et enchaînez gauche-droite-gauche."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "280→130 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Smooth inputs through the direction changes. Don't fight the car.",
            "tipFr": "Freinez à 100m. Gestes fluides dans les changements de direction. Ne combattez pas la voiture."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "250→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Take a good line through — exit speed matters for Parabolica.",
            "tipFr": "Freinez à 100m. Prenez une bonne trajectoire — la vitesse de sortie compte pour la Parabolique."
          }
        }
      },
      {
        "number": "T11",
        "name": "Parabolica (Alboreto)",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "310→140 km/h",
            "gear": "4th",
            "pressure": "Heavy initial, trail brake",
            "tip": "Brake at 100m. Trail brake to rotate. Late apex and get on the power as early as possible for the main straight.",
            "tipFr": "Freinez à 100m. Lestage pour faire pivoter. Apex tardif et reprenez les gaz le plus tôt possible pour la ligne droite."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "290→130 km/h",
            "gear": "4th",
            "pressure": "Heavy, trail brake",
            "tip": "Brake at 100m. Long corner — patience is rewarded. Focus on exit speed.",
            "tipFr": "Freinez à 100m. Long virage — la patience est récompensée. Concentrez-vous sur la vitesse de sortie."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "255→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 125m. The exit defines your straight speed — be patient and get on the power cleanly.",
            "tipFr": "Freinez à 125m. La sortie définit votre vitesse en ligne droite — soyez patient et reprenez les gaz proprement."
          }
        }
      }
    ]
  },
  {
    "id": "spa",
    "name": "Circuit de Spa-Francorchamps",
    "location": "Stavelot, Belgium",
    "corners": [
      {
        "number": "T1",
        "name": "La Source",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "310→60 km/h",
            "gear": "1st-2nd",
            "pressure": "Very heavy",
            "tip": "Hairpin at the end of the main straight. Brake at 100m, slow it right down. Late apex for the run to Eau Rouge.",
            "tipFr": "Épingle en fin de ligne droite. Freinez à 100m, ralentissez au maximum. Apex tardif pour le run vers Eau Rouge."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "285→55 km/h",
            "gear": "1st-2nd",
            "pressure": "Very heavy",
            "tip": "Big stop. Brake at 100m. Don't overdrive the entry — the exit matters more.",
            "tipFr": "Gros arrêt. Freinez à 100m. Ne sur-conduisez pas l'entrée — la sortie compte plus."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "250→45 km/h",
            "gear": "1st",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. Classic hairpin — brake hard, turn in late, and accelerate out.",
            "tipFr": "Freinez à 125m. Épingle classique — freinez fort, tournez tard et accélérez en sortie."
          }
        }
      },
      {
        "number": "T3-T5",
        "name": "Eau Rouge / Raidillon",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Flat",
            "speed": "300+ km/h",
            "gear": "7th",
            "pressure": "None",
            "tip": "Flat out. The Hypercar has more than enough downforce. Commit 100%. Don't lift.",
            "tipFr": "Pleine charge. L'Hypercar a plus que suffisamment d'appui. Engagez-vous à 100%. Ne levez pas le pied."
          },
          "lmp2": {
            "marker": "Flat / slight lift",
            "speed": "280+ km/h",
            "gear": "6th-7th",
            "pressure": "None / very light",
            "tip": "Should be flat or very close to it. Set up correctly at the bottom.",
            "tipFr": "Devrait être à plat ou presque. Positionnez-vous correctement dans le creux."
          },
          "gt3": {
            "marker": "Lift on crest",
            "speed": "250→230 km/h",
            "gear": "5th-6th",
            "pressure": "Light lift",
            "tip": "Mostly flat but be careful over the crest at Raidillon. A slight lift may be needed until confident.",
            "tipFr": "Presque à plat mais attention à la crête de Raidillon. Une légère levée de pied peut être nécessaire avant d'être confiant."
          }
        }
      },
      {
        "number": "T7-T8",
        "name": "Les Combes",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "310→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Big braking zone at the top of the hill. Brake at 100m. Trail brake through the left-right.",
            "tipFr": "Grande zone de freinage au sommet de la côte. Freinez à 100m. Lestage dans le gauche-droite."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "290→95 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Stay straight on initial braking — the road curves slightly.",
            "tipFr": "Freinez à 100m. Restez droit au freinage initial — la route tourne légèrement."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "255→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. Longer braking zone needed. Be patient through the chicane.",
            "tipFr": "Freinez à 125m. Zone de freinage plus longue nécessaire. Soyez patient dans la chicane."
          }
        }
      },
      {
        "number": "T11",
        "name": "Bruxelles",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "50m board",
            "speed": "230→120 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Quick brake at the 50m board. Double apex right-hander. Smooth through the middle.",
            "tipFr": "Freinage rapide au panneau 50m. Virage à droite double apex. Fluide au milieu."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "215→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Flow through the double apex. Don't rush it.",
            "tipFr": "Freinez à 75m. Enchaînez le double apex. Ne forcez pas."
          },
          "gt3": {
            "marker": "75m board",
            "speed": "195→95 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Take a smooth line through both apexes.",
            "tipFr": "Freinez à 75m. Prenez une trajectoire fluide sur les deux apex."
          }
        }
      },
      {
        "number": "T13",
        "name": "Pouhon",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Light brake / lift",
            "speed": "280→230 km/h",
            "gear": "5th-6th",
            "pressure": "Light",
            "tip": "Fast double-apex left. Light braking to set the car. Trust the downforce through the second part.",
            "tipFr": "Gauche rapide à double apex. Léger freinage pour stabiliser la voiture. Faites confiance à l'appui dans la deuxième partie."
          },
          "lmp2": {
            "marker": "Light brake",
            "speed": "260→210 km/h",
            "gear": "5th",
            "pressure": "Light-moderate",
            "tip": "Light brake to set the entry speed. Carry speed through — it's a flowing corner.",
            "tipFr": "Léger frein pour régler la vitesse d'entrée. Portez de la vitesse — c'est un virage fluide."
          },
          "gt3": {
            "marker": "100m before entry",
            "speed": "230→175 km/h",
            "gear": "4th",
            "pressure": "Moderate",
            "tip": "You need a proper brake here. Get the speed right and carry it through both apexes.",
            "tipFr": "Il vous faut un vrai freinage ici. Gérez la vitesse et maintenez-la sur les deux apex."
          }
        }
      },
      {
        "number": "T15",
        "name": "Stavelot",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "270→140 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Downhill entry makes it tricky. Get the car settled before turn-in.",
            "tipFr": "Freinez à 75m. L'entrée en descente rend ce virage délicat. Stabilisez la voiture avant d'attaquer."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "250→130 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Brake at 75m. The downhill approach can unsettle the car — smooth brake application.",
            "tipFr": "Freinez à 75m. L'approche en descente peut déséquilibrer la voiture — freinage progressif."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "220→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Downhill entry is tricky — brake earlier until you're confident.",
            "tipFr": "Freinez à 100m. L'entrée en descente est délicate — freinez plus tôt jusqu'à être confiant."
          }
        }
      },
      {
        "number": "T17",
        "name": "Blanchimont",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Flat",
            "speed": "300+ km/h",
            "gear": "7th",
            "pressure": "None",
            "tip": "Flat out. Full commitment. One of the great corners in motorsport.",
            "tipFr": "Pleine charge. Engagement total. L'un des grands virages du sport automobile."
          },
          "lmp2": {
            "marker": "Flat / slight lift",
            "speed": "280+ km/h",
            "gear": "6th-7th",
            "pressure": "None / very light",
            "tip": "Should be flat or very close. The car has enough grip. Commit to it.",
            "tipFr": "Devrait être à plat ou presque. La voiture a suffisamment d'adhérence. Engagez-vous."
          },
          "gt3": {
            "marker": "Slight lift",
            "speed": "260→245 km/h",
            "gear": "6th",
            "pressure": "Very light",
            "tip": "A slight lift may be needed. Build confidence gradually — this is a big consequence corner.",
            "tipFr": "Une légère levée de pied peut être nécessaire. Gagnez en confiance progressivement — ce virage a de grandes conséquences."
          }
        }
      },
      {
        "number": "T18-T19",
        "name": "Bus Stop Chicane",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "310→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Big stop. Hit both apexes and get a clean exit onto the main straight.",
            "tipFr": "Freinez à 100m. Gros arrêt. Visez les deux apex et sortez proprement sur la ligne droite principale."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "290→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Be precise through the chicane. Exit speed is crucial for the pit straight.",
            "tipFr": "Freinez à 100m. Soyez précis dans la chicane. La vitesse de sortie est cruciale pour la ligne droite des stands."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "255→55 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. Tight chicane — don't cut too aggressively. Focus on the exit.",
            "tipFr": "Freinez à 125m. Chicane serrée — ne coupez pas trop agressivement. Concentrez-vous sur la sortie."
          }
        }
      }
    ]
  },
  {
    "id": "imola",
    "name": "Autodromo Enzo e Dino Ferrari",
    "location": "Imola, Italy",
    "corners": [
      {
        "number": "T1-T2",
        "name": "Tamburello",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "300→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Fast approach into the chicane. Brake at 75m, be precise. Kerbs are aggressive here.",
            "tipFr": "Approche rapide dans la chicane. Freinez à 75m, soyez précis. Les vibreurs sont agressifs ici."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "280→90 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Don't abuse the kerbs — they can unsettle the car badly.",
            "tipFr": "Freinez à 100m. N'abusez pas des vibreurs — ils peuvent déstabiliser sérieusement la voiture."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "250→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Be conservative with the kerbs until you know the limits.",
            "tipFr": "Freinez à 100m. Soyez conservateur avec les vibreurs jusqu'à connaître les limites."
          }
        }
      },
      {
        "number": "T3-T4",
        "name": "Villeneuve",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "270→90 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Quick chicane. Brake at 75m, flow through left-right. Don't fight the car.",
            "tipFr": "Chicane rapide. Freinez à 75m, enchaînez gauche-droite. Ne combattez pas la voiture."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "255→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Smooth direction changes — this is a rhythm chicane.",
            "tipFr": "Freinez à 75m. Changements de direction fluides — c'est une chicane de rythme."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "225→70 km/h",
            "gear": "2nd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Take your time through the direction changes.",
            "tipFr": "Freinez à 100m. Prenez votre temps dans les changements de direction."
          }
        }
      },
      {
        "number": "T5",
        "name": "Tosa",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "250→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Tight left hairpin. Brake at 75m, trail brake to rotate. Good exit sets up Piratella.",
            "tipFr": "Épingle gauche serrée. Freinez à 75m, lestage pour faire pivoter. Bonne sortie pour Piratella."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "235→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Classic hairpin technique — brake hard, trail in, power out.",
            "tipFr": "Freinez à 75m. Technique classique d'épingle — freinez fort, lestage à l'intérieur, accélérez en sortie."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "210→55 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Slow it right down. Exit speed matters for the uphill section.",
            "tipFr": "Freinez à 100m. Ralentissez vraiment. La vitesse de sortie compte pour la section montante."
          }
        }
      },
      {
        "number": "T7",
        "name": "Piratella",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "270→150 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Uphill fast right. Brake at 75m, late apex. A good exit here is key for the Acque Minerali section.",
            "tipFr": "Droite rapide en montée. Freinez à 75m, apex tardif. Une bonne sortie est clé pour Acque Minerali."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "255→140 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Brake at 75m. The uphill means you can brake slightly later. Carry good exit speed.",
            "tipFr": "Freinez à 75m. La montée signifie que vous pouvez freiner légèrement plus tard. Portez une bonne vitesse de sortie."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "230→120 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Focus on a clean line through this uphill corner.",
            "tipFr": "Freinez à 100m. Concentrez-vous sur une trajectoire propre dans ce virage montant."
          }
        }
      },
      {
        "number": "T11-T12",
        "name": "Acque Minerali",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "260→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Downhill braking makes this tricky. Brake at 75m. The bumps can upset the car.",
            "tipFr": "Le freinage en descente rend ça délicat. Freinez à 75m. Les bosses peuvent déstabiliser la voiture."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "245→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Downhill and bumpy — be smooth and progressive.",
            "tipFr": "Freinez à 75m. Descente et bosses — soyez fluide et progressif."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "215→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Downhill and the surface is tricky. Don't be a hero here.",
            "tipFr": "Freinez à 100m. Descente et surface délicate. Ne prenez pas de risques ici."
          }
        }
      },
      {
        "number": "T14-T15",
        "name": "Variante Alta",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "50m board",
            "speed": "230→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Heavy",
            "tip": "Short braking zone into a tight chicane. Late brake at the 50m board, flow through.",
            "tipFr": "Zone de freinage courte dans une chicane serrée. Freinage tardif au panneau 50m, enchaînez."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "215→75 km/h",
            "gear": "2nd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Quick chicane — precision over speed here.",
            "tipFr": "Freinez à 75m. Chicane rapide — la précision prime sur la vitesse ici."
          },
          "gt3": {
            "marker": "75m board",
            "speed": "195→65 km/h",
            "gear": "2nd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Tight chicane — be neat and tidy.",
            "tipFr": "Freinez à 75m. Chicane serrée — soyez propre et ordonné."
          }
        }
      },
      {
        "number": "T17-T18",
        "name": "Rivazza 1 & 2",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "250→100 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Double left-hander. Brake at 75m, carry speed through the first part, brake again lightly for the second.",
            "tipFr": "Double gauche. Freinez à 75m, portez la vitesse dans la première partie, léger frein pour la deuxième."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "235→90 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Two connected lefts — get the rhythm right. Exit speed counts.",
            "tipFr": "Freinez à 75m. Deux gauches connectés — trouvez le bon rythme. La vitesse de sortie compte."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "210→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Two left-handers — be patient and get a clean exit onto the main straight.",
            "tipFr": "Freinez à 100m. Deux gauches — soyez patient et sortez proprement sur la ligne droite principale."
          }
        }
      }
    ]
  },
  // ── Road Atlanta (remplacé À LA MAIN, 2026-09-25) ────────────────────────────
  // Les données ApexPoints, rédigées avant la sortie du circuit en jeu, ne
  // correspondaient pas au tracé : « chicane » placée au T3 (ce sont les S, à
  // fond), T10A donné « à fond » alors que c'est la chicane et le plus gros
  // freinage, T5 et T12 inversés (freinage / à fond). Réécrit depuis les guides
  // LMU commentés et les guides de pilotage du circuit réel ; repères de
  // panneaux tels que cités, vitesses qualitatives. À re-comparer si
  // ApexPoints corrige sa fiche.
  {
    "id": "road-atlanta",
    "name": "Michelin Raceway Road Atlanta",
    "location": "Braselton, USA",
    "source": "in-game corner notes (approximate — the ApexPoints data for this circuit contradicted the in-game layout)",
    "corners": [
      {
        "number": "T1",
        "name": "Turn 1",
        "type": "medium_corner",
        "braking": {
          "hypercar": { "marker": "short brake (≈ later than GT3)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Moderate, short", "tip": "Slow in, fast out: the exit starts a steep climb to Turn 2. Enter as wide as possible, hit the apex and get on the throttle straight away. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Lent en entrée, rapide en sortie : la sortie attaque une forte montée vers le virage 2. Entre le plus large possible, prends l'apex et remets les gaz immédiatement. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "lmp2": { "marker": "short brake (≈ later than GT3)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Moderate, short", "tip": "Slow in, fast out: the exit starts a steep climb to Turn 2. Enter as wide as possible, hit the apex and get on the throttle straight away. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Lent en entrée, rapide en sortie : la sortie attaque une forte montée vers le virage 2. Entre le plus large possible, prends l'apex et remets les gaz immédiatement. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "gt3": { "marker": "short brake at the end of the front straight", "speed": "fast → medium", "gear": "mid gear", "pressure": "Moderate, short", "tip": "Slow in, fast out: the exit starts a steep climb to Turn 2. Enter as wide as possible, hit the apex and get on the throttle straight away.", "tipFr": "Lent en entrée, rapide en sortie : la sortie attaque une forte montée vers le virage 2. Entre le plus large possible, prends l'apex et remets les gaz immédiatement." }
        }
      },
      {
        "number": "T2",
        "name": "Turn 2 (blind crest)",
        "type": "fast_corner",
        "braking": {
          "hypercar": { "marker": "lift or light brake over the crest", "speed": "fast → medium-fast", "gear": "mid gear", "pressure": "Light or lift", "tip": "Blind crest: brake very smoothly as the car goes light. Only two wheels over the apex kerb (four = track limits), and no full throttle too early on the kerb or the rear steps out. The Esses (T3-T4) that follow are flat on the right line.", "tipFr": "Crête aveugle : freine très progressivement, la voiture s'allège. Seulement deux roues sur le vibreur d'apex (quatre = limites de piste), et pas de plein gaz trop tôt sur le vibreur sinon l'arrière décroche. Les S (T3-T4) qui suivent passent à fond sur la bonne trajectoire." },
          "lmp2": { "marker": "lift or light brake over the crest", "speed": "fast → medium-fast", "gear": "mid gear", "pressure": "Light or lift", "tip": "Blind crest: brake very smoothly as the car goes light. Only two wheels over the apex kerb (four = track limits), and no full throttle too early on the kerb or the rear steps out. The Esses (T3-T4) that follow are flat on the right line.", "tipFr": "Crête aveugle : freine très progressivement, la voiture s'allège. Seulement deux roues sur le vibreur d'apex (quatre = limites de piste), et pas de plein gaz trop tôt sur le vibreur sinon l'arrière décroche. Les S (T3-T4) qui suivent passent à fond sur la bonne trajectoire." },
          "gt3": { "marker": "light brake over the blind crest", "speed": "fast → medium-fast", "gear": "mid gear", "pressure": "Light, very smooth", "tip": "Blind crest: brake very smoothly as the car goes light. Only two wheels over the apex kerb (four = track limits), and no full throttle too early on the kerb or the rear steps out. The Esses (T3-T4) that follow are flat on the right line.", "tipFr": "Crête aveugle : freine très progressivement, la voiture s'allège. Seulement deux roues sur le vibreur d'apex (quatre = limites de piste), et pas de plein gaz trop tôt sur le vibreur sinon l'arrière décroche. Les S (T3-T4) qui suivent passent à fond sur la bonne trajectoire." }
        }
      },
      {
        "number": "T5",
        "name": "Turn 5",
        "type": "medium_corner",
        "braking": {
          "hypercar": { "marker": "≈ entry kerb, slightly later than GT3", "speed": "fast → medium", "gear": "mid gear", "pressure": "Progressive — don't stamp (the car bottoms out)", "tip": "Big lap-time corner. Brake smoothly: stamping the pedal makes the car bottom out. A touch of inside kerb is fine without unsettling the car, then full throttle early using all of the exit kerb. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Virage où l'on gagne ou perd beaucoup. Freine en douceur : écraser la pédale fait talonner la voiture. Un peu de vibreur intérieur, sans déstabiliser, puis plein gaz tôt en utilisant tout le vibreur de sortie. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "lmp2": { "marker": "≈ entry kerb, slightly later than GT3", "speed": "fast → medium", "gear": "mid gear", "pressure": "Progressive — don't stamp (the car bottoms out)", "tip": "Big lap-time corner. Brake smoothly: stamping the pedal makes the car bottom out. A touch of inside kerb is fine without unsettling the car, then full throttle early using all of the exit kerb. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Virage où l'on gagne ou perd beaucoup. Freine en douceur : écraser la pédale fait talonner la voiture. Un peu de vibreur intérieur, sans déstabiliser, puis plein gaz tôt en utilisant tout le vibreur de sortie. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "gt3": { "marker": "as the car reaches the entry kerb (bottom of the Esses)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Progressive — don't stamp (the car bottoms out)", "tip": "Big lap-time corner. Brake smoothly: stamping the pedal makes the car bottom out. A touch of inside kerb is fine without unsettling the car, then full throttle early using all of the exit kerb.", "tipFr": "Virage où l'on gagne ou perd beaucoup. Freine en douceur : écraser la pédale fait talonner la voiture. Un peu de vibreur intérieur, sans déstabiliser, puis plein gaz tôt en utilisant tout le vibreur de sortie." }
        }
      },
      {
        "number": "T6",
        "name": "Turn 6",
        "type": "medium_corner",
        "braking": {
          "hypercar": { "marker": "≈ just after the 200 board (later than GT3)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Medium, trail", "tip": "Cambered corner: you can carry much more speed than it looks — turn in early and lean on the camber. Clip a little inside kerb, but don't run wide over the exit kerb: it unsettles the car for the Turn 7 hairpin.", "tipFr": "Virage relevé : on peut garder bien plus de vitesse qu'il n'y paraît — braque tôt et appuie-toi sur le devers. Un peu de vibreur intérieur, mais n'élargis pas sur le vibreur de sortie : il déstabilise la voiture pour l'épingle du 7." },
          "lmp2": { "marker": "≈ just after the 200 board (later than GT3)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Medium, trail", "tip": "Cambered corner: you can carry much more speed than it looks — turn in early and lean on the camber. Clip a little inside kerb, but don't run wide over the exit kerb: it unsettles the car for the Turn 7 hairpin.", "tipFr": "Virage relevé : on peut garder bien plus de vitesse qu'il n'y paraît — braque tôt et appuie-toi sur le devers. Un peu de vibreur intérieur, mais n'élargis pas sur le vibreur de sortie : il déstabilise la voiture pour l'épingle du 7." },
          "gt3": { "marker": "200 board / green board on the left", "speed": "fast → medium", "gear": "mid gear", "pressure": "Medium, trail", "tip": "Cambered corner: you can carry much more speed than it looks — turn in early and lean on the camber. Clip a little inside kerb, but don't run wide over the exit kerb: it unsettles the car for the Turn 7 hairpin.", "tipFr": "Virage relevé : on peut garder bien plus de vitesse qu'il n'y paraît — braque tôt et appuie-toi sur le devers. Un peu de vibreur intérieur, mais n'élargis pas sur le vibreur de sortie : il déstabilise la voiture pour l'épingle du 7." }
        }
      },
      {
        "number": "T7",
        "name": "Turn 7 (hairpin)",
        "type": "slow_corner",
        "braking": {
          "hypercar": { "marker": "short, firm brake after Turn 6", "speed": "medium → slow", "gear": "low gear", "pressure": "Firm but controlled", "tip": "Exit onto the longest straight: sacrifice the entry. Don't stamp the brake — hitting the ABS makes you run wide. Nail the apex (the kerb hooks the car round), then full throttle. Its line depends on how you took Turn 6. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Sortie vers la plus longue ligne droite : sacrifie l'entrée. N'écrase pas le frein — déclencher l'ABS te fait élargir. Prends bien l'apex (le vibreur fait pivoter la voiture), puis plein gaz. Sa trajectoire dépend de ta sortie du 6. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "lmp2": { "marker": "short, firm brake after Turn 6", "speed": "medium → slow", "gear": "low gear", "pressure": "Firm but controlled", "tip": "Exit onto the longest straight: sacrifice the entry. Don't stamp the brake — hitting the ABS makes you run wide. Nail the apex (the kerb hooks the car round), then full throttle. Its line depends on how you took Turn 6. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Sortie vers la plus longue ligne droite : sacrifie l'entrée. N'écrase pas le frein — déclencher l'ABS te fait élargir. Prends bien l'apex (le vibreur fait pivoter la voiture), puis plein gaz. Sa trajectoire dépend de ta sortie du 6. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "gt3": { "marker": "short, firm brake after Turn 6", "speed": "medium → slow", "gear": "low gear", "pressure": "Firm but controlled — don't trigger the ABS", "tip": "Exit onto the longest straight: sacrifice the entry. Don't stamp the brake — hitting the ABS makes you run wide. Nail the apex (the kerb hooks the car round), then full throttle. Its line depends on how you took Turn 6.", "tipFr": "Sortie vers la plus longue ligne droite : sacrifie l'entrée. N'écrase pas le frein — déclencher l'ABS te fait élargir. Prends bien l'apex (le vibreur fait pivoter la voiture), puis plein gaz. Sa trajectoire dépend de ta sortie du 6." }
        }
      },
      {
        "number": "T10A",
        "name": "Chicane (Turns 10A-10B)",
        "type": "chicane",
        "braking": {
          "hypercar": { "marker": "≈ between the 200 and 100 boards (later than GT3)", "speed": "very fast → slow", "gear": "low gear", "pressure": "Very heavy, trail to the first apex", "tip": "Heaviest braking zone and main overtaking spot, downhill after the back straight. Brake hard in a straight line, trail into the first apex and cut the kerb. Compromise 10A to get on the power early through 10B, using all the kerb and track on exit. No ABS: modulate the pedal to avoid a lock-up. Downhill braking: easy to lock the fronts.", "tipFr": "Plus gros freinage du tour et principal point de dépassement, en descente après la ligne droite opposée. Freine fort en ligne droite, dégressif jusqu'au premier apex en coupant le vibreur. Sacrifie le 10A pour remettre les gaz tôt dans le 10B, en utilisant tout le vibreur et la piste en sortie. Pas d'ABS : dose la pédale pour ne pas bloquer. Freinage en descente : blocage des roues avant facile." },
          "lmp2": { "marker": "≈ between the 200 and 100 boards (later than GT3)", "speed": "very fast → slow", "gear": "low gear", "pressure": "Very heavy, trail to the first apex", "tip": "Heaviest braking zone and main overtaking spot, downhill after the back straight. Brake hard in a straight line, trail into the first apex and cut the kerb. Compromise 10A to get on the power early through 10B, using all the kerb and track on exit. No ABS: modulate the pedal to avoid a lock-up. Downhill braking: easy to lock the fronts.", "tipFr": "Plus gros freinage du tour et principal point de dépassement, en descente après la ligne droite opposée. Freine fort en ligne droite, dégressif jusqu'au premier apex en coupant le vibreur. Sacrifie le 10A pour remettre les gaz tôt dans le 10B, en utilisant tout le vibreur et la piste en sortie. Pas d'ABS : dose la pédale pour ne pas bloquer. Freinage en descente : blocage des roues avant facile." },
          "gt3": { "marker": "just after the 200 board on the right (strong-braking cars: up to just before the 100)", "speed": "very fast → slow", "gear": "low gear", "pressure": "Very heavy, trail to the first apex", "tip": "Heaviest braking zone and main overtaking spot, downhill after the back straight. Brake hard in a straight line, trail into the first apex and cut the kerb. Compromise 10A to get on the power early through 10B, using all the kerb and track on exit.", "tipFr": "Plus gros freinage du tour et principal point de dépassement, en descente après la ligne droite opposée. Freine fort en ligne droite, dégressif jusqu'au premier apex en coupant le vibreur. Sacrifie le 10A pour remettre les gaz tôt dans le 10B, en utilisant tout le vibreur et la piste en sortie." }
        }
      },
      {
        "number": "T12",
        "name": "Turns 11-12 (bridge & final corner)",
        "type": "fast_corner",
        "braking": {
          "hypercar": { "marker": "no braking", "speed": "flat", "gear": "hold", "pressure": "None", "tip": "After the bridge the track drops away and the car goes light over the blind crest: keep the steering straight and be ready for a snap. Let it run naturally wide, not too wide — the final corner is flat on the right line.", "tipFr": "Après le pont la piste plonge et la voiture s'allège sur la crête aveugle : garde le volant droit et sois prêt à rattraper. Laisse-la s'élargir naturellement, sans excès — le dernier virage passe à fond sur la bonne trajectoire." },
          "lmp2": { "marker": "no braking", "speed": "flat", "gear": "hold", "pressure": "None", "tip": "After the bridge the track drops away and the car goes light over the blind crest: keep the steering straight and be ready for a snap. Let it run naturally wide, not too wide — the final corner is flat on the right line.", "tipFr": "Après le pont la piste plonge et la voiture s'allège sur la crête aveugle : garde le volant droit et sois prêt à rattraper. Laisse-la s'élargir naturellement, sans excès — le dernier virage passe à fond sur la bonne trajectoire." },
          "gt3": { "marker": "no braking", "speed": "flat", "gear": "hold", "pressure": "None", "tip": "After the bridge the track drops away and the car goes light over the blind crest: keep the steering straight and be ready for a snap. Let it run naturally wide, not too wide — the final corner is flat on the right line.", "tipFr": "Après le pont la piste plonge et la voiture s'allège sur la crête aveugle : garde le volant droit et sois prêt à rattraper. Laisse-la s'élargir naturellement, sans excès — le dernier virage passe à fond sur la bonne trajectoire." }
        }
      }
    ]
  },
  // ── US Track Pass (ajouts MANUELS, 2026-08) ────────────────────────────────
  // ApexPoints ne couvre pas (encore) ces circuits. Référence APPROXIMATIVE
  // compilée depuis les notes de circuit publiques (IMSA/Studio-397/Autometrics,
  // guides vidéo HYMO Academy & GO Setups) : vitesses/rapports indicatifs (≈),
  // la TECHNIQUE de virage est la partie fiable. À remplacer par la donnée
  // ApexPoints dès qu'elle existe.
  {
    "id": "daytona",
    "name": "Daytona International Speedway (Road Course)",
    "location": "Daytona Beach, USA",
    "source": "community track notes (approximate — pending ApexPoints coverage)",
    "corners": [
      {
        "number": "T1",
        "name": "Turn 1 (off the tri-oval)",
        "type": "hairpin-left",
        "braking": {
          "hypercar": { "marker": "≈150m after leaving the banking", "speed": "≈320→130 km/h", "gear": "3rd", "pressure": "Heavy initial, long trail", "tip": "Main overtaking spot. Brake in a straight line as the banking flattens; the car is light coming off the oval — avoid locking the left front. Trail brake to a late apex.", "tipFr": "Principal point de dépassement. Freine en ligne droite quand le banking s'aplanit ; la voiture est allégée en sortie d'ovale — attention au blocage avant-gauche. Freinage dégressif vers un apex tardif." },
          "lmp2": { "marker": "≈140m", "speed": "≈300→125 km/h", "gear": "3rd", "pressure": "Heavy initial, trail", "tip": "Same approach as Hypercar, slightly later marker thanks to the lighter car.", "tipFr": "Même approche qu'en Hypercar, repère un peu plus tardif grâce à la voiture plus légère." },
          "gt3": { "marker": "≈160m", "speed": "≈280→120 km/h", "gear": "3rd", "pressure": "Heavy initial, trail", "tip": "Brake earlier than the prototypes; prioritise a clean exit toward the infield.", "tipFr": "Freine plus tôt que les protos ; privilégie une sortie propre vers l'infield." }
        }
      },
      {
        "number": "T3",
        "name": "International Horseshoe",
        "type": "hairpin-right",
        "braking": {
          "hypercar": { "marker": "≈100m", "speed": "≈250→95 km/h", "gear": "2nd", "pressure": "Late, heavy, trail to late apex", "tip": "Deceptively late braking works: trail brake to a late apex for a strong launch. Clear passing opportunity.", "tipFr": "Le freinage tardif paie : dégressif vers un apex tardif pour une bonne relance. Vraie opportunité de dépassement." },
          "lmp2": { "marker": "≈95m", "speed": "≈240→90 km/h", "gear": "2nd", "pressure": "Late, heavy, trail", "tip": "Rotate the car on the brakes, late apex, patience on throttle.", "tipFr": "Fais pivoter la voiture au freinage, apex tardif, patience à l'accélération." },
          "gt3": { "marker": "≈110m", "speed": "≈230→85 km/h", "gear": "2nd", "pressure": "Heavy, trail", "tip": "Down to 1st-2nd; long-radius hairpin — late apex and clean exit matter more than entry speed.", "tipFr": "Descends en 1re-2e ; épingle à grand rayon — l'apex tardif et la sortie comptent plus que la vitesse d'entrée." }
        }
      },
      {
        "number": "T4",
        "name": "The Kink",
        "type": "kink-left",
        "braking": {
          "hypercar": { "marker": "no braking", "speed": "lift only", "gear": "hold", "pressure": "None (brief lift)", "tip": "Faster than it looks. A lift is enough in high-power cars; more lap time is gained braking well for the West Horseshoe than carrying extra speed here.", "tipFr": "Plus rapide qu'il n'y paraît. Un lever de pied suffit en voiture puissante ; on gagne plus à bien freiner pour le West Horseshoe qu'à forcer ici." },
          "lmp2": { "marker": "no braking", "speed": "flat or lift", "gear": "hold", "pressure": "None", "tip": "Nearly flat; mind worn tyres — off-line it bites.", "tipFr": "Quasi à fond ; attention aux pneus usés — hors trajectoire, ça mord." },
          "gt3": { "marker": "no braking", "speed": "flat", "gear": "hold", "pressure": "None", "tip": "Flat in GT3 on line; stay disciplined on placement.", "tipFr": "À fond en GT3 sur la trajectoire ; discipline sur le placement." }
        }
      },
      {
        "number": "T5",
        "name": "West Horseshoe",
        "type": "hairpin-right",
        "braking": {
          "hypercar": { "marker": "≈120m (bumpy entry)", "speed": "≈270→90 km/h", "gear": "2nd", "pressure": "Heavy, 3 downshifts, trail", "tip": "Bumpy on entry — brake slightly earlier and release over the bumps. Late apex like the International Horseshoe.", "tipFr": "Entrée bosselée — freine un peu plus tôt et relâche sur les bosses. Apex tardif comme à l'International Horseshoe." },
          "lmp2": { "marker": "≈110m", "speed": "≈255→85 km/h", "gear": "2nd", "pressure": "Heavy, trail", "tip": "Stable car required over the bumps; don't chase entry speed.", "tipFr": "Voiture stable sur les bosses ; ne cherche pas la vitesse d'entrée." },
          "gt3": { "marker": "≈130m", "speed": "≈240→80 km/h", "gear": "2nd", "pressure": "Heavy, trail", "tip": "Three downshifts; late apex, clean drive toward the banking section.", "tipFr": "Trois rapports ; apex tardif, relance propre vers le banking." }
        }
      },
      {
        "number": "T8-T11",
        "name": "Le Mans Chicane (Bus Stop)",
        "type": "chicane",
        "braking": {
          "hypercar": { "marker": "≈150m on the backstretch", "speed": "≈330→110 km/h", "gear": "3rd", "pressure": "Very heavy, straight-line", "tip": "Brake fully in a straight line from top speed before the left flick. Use the kerbs lightly; the exit launches you onto the banking — a mistake costs the whole lap.", "tipFr": "Freine entièrement en ligne droite depuis la vitesse maxi avant le premier gauche. Vibreurs avec modération ; la sortie lance sur le banking — une erreur coûte tout le tour." },
          "lmp2": { "marker": "≈140m", "speed": "≈310→105 km/h", "gear": "3rd", "pressure": "Very heavy", "tip": "Straight-line braking, quick left-right-left-right; exit speed onto the banking is everything.", "tipFr": "Freinage en ligne, enchaînement gauche-droite rapide ; la vitesse de sortie sur le banking fait tout." },
          "gt3": { "marker": "≈160m", "speed": "≈280→95 km/h", "gear": "2nd", "pressure": "Very heavy", "tip": "Taken in 2nd in GT3. Sacrifice entry, get on power early for the long run to the line.", "tipFr": "En 2e en GT3. Sacrifie l'entrée, remets les gaz tôt pour la longue portion jusqu'à la ligne." }
        }
      }
    ]
  },
  {
    "id": "laguna-seca",
    "name": "WeatherTech Raceway Laguna Seca",
    "location": "Monterey, USA",
    "source": "community track notes (approximate — pending ApexPoints coverage)",
    "corners": [
      {
        "number": "T2",
        "name": "Andretti Hairpin",
        "type": "hairpin-left",
        "braking": {
          "hypercar": { "marker": "≈120m (end of main straight, downhill)", "speed": "≈275→85 km/h", "gear": "2nd", "pressure": "Heavy initial, long trail", "tip": "Main braking zone, slightly downhill. Double apex: brake straight, trail to the first apex, let the car run to the second.", "tipFr": "Principale zone de freinage, légèrement en descente. Double apex : freine droit, dégressif vers le premier apex, laisse filer vers le second." },
          "lmp2": { "marker": "≈110m", "speed": "≈260→80 km/h", "gear": "2nd", "pressure": "Heavy, trail", "tip": "Same double-apex approach; the car rotates well on the brakes.", "tipFr": "Même approche double apex ; la voiture pivote bien au freinage." },
          "gt3": { "marker": "≈130m", "speed": "≈235→80 km/h", "gear": "2nd", "pressure": "Heavy, trail", "tip": "Brake earlier, prioritise the second apex for the exit up the hill.", "tipFr": "Freine plus tôt, privilégie le second apex pour la sortie en montée." }
        }
      },
      {
        "number": "T3",
        "name": "Turn 3",
        "type": "medium-right",
        "braking": {
          "hypercar": { "marker": "≈80m", "speed": "≈240→130 km/h", "gear": "4th", "pressure": "Medium", "tip": "Short brake, early throttle — the exit feeds a decent straight.", "tipFr": "Freinage court, gaz tôt — la sortie donne sur une belle ligne droite." },
          "lmp2": { "marker": "≈75m", "speed": "≈230→125 km/h", "gear": "4th", "pressure": "Medium", "tip": "Carry speed in; smooth hands mid-corner.", "tipFr": "Garde de la vitesse en entrée ; mains douces à mi-virage." },
          "gt3": { "marker": "≈90m", "speed": "≈215→115 km/h", "gear": "3rd", "pressure": "Medium", "tip": "Don't over-slow; it's faster than it looks.", "tipFr": "Ne ralentis pas trop : c'est plus rapide qu'il n'y paraît." }
        }
      },
      {
        "number": "T5",
        "name": "Turn 5",
        "type": "medium-left",
        "braking": {
          "hypercar": { "marker": "≈70m (uphill)", "speed": "≈250→125 km/h", "gear": "4th", "pressure": "Medium, uphill helps", "tip": "The climb helps braking — brake later than instinct says, apex late for the uphill drive.", "tipFr": "La montée aide au freinage — freine plus tard que l'instinct, apex tardif pour la relance en montée." },
          "lmp2": { "marker": "≈65m", "speed": "≈240→120 km/h", "gear": "4th", "pressure": "Medium", "tip": "Uphill entry; use the compression for grip.", "tipFr": "Entrée en montée ; utilise la compression pour le grip." },
          "gt3": { "marker": "≈80m", "speed": "≈220→110 km/h", "gear": "3rd", "pressure": "Medium", "tip": "Smooth entry, strong exit up toward T6.", "tipFr": "Entrée fluide, sortie forte vers le T6." }
        }
      },
      {
        "number": "T6",
        "name": "Turn 6",
        "type": "fast-left",
        "braking": {
          "hypercar": { "marker": "≈40m (crest)", "speed": "≈250→160 km/h", "gear": "4th", "pressure": "Light-medium", "tip": "Commit through the uphill left — a confident line here sets up the whole run to the Corkscrew.", "tipFr": "Engage-toi dans ce gauche en montée — une trajectoire assumée ici conditionne toute la montée vers le Corkscrew." },
          "lmp2": { "marker": "≈35m", "speed": "≈240→155 km/h", "gear": "4th", "pressure": "Light", "tip": "Barely a brush of brakes; balance over the crest.", "tipFr": "À peine un effleurement de frein ; équilibre au sommet." },
          "gt3": { "marker": "≈50m", "speed": "≈215→140 km/h", "gear": "4th", "pressure": "Light-medium", "tip": "Keep momentum; a small lift plus light braking is enough.", "tipFr": "Garde l'élan ; un petit lever de pied et un freinage léger suffisent." }
        }
      },
      {
        "number": "T8-T8A",
        "name": "The Corkscrew",
        "type": "chicane-downhill",
        "braking": {
          "hypercar": { "marker": "≈60m, BEFORE the blind crest", "speed": "≈250→80 km/h", "gear": "2nd", "pressure": "Hard, done before turn-in", "tip": "All braking straight and before the crest — the track drops away blind. Aim at the tree line for the left apex, then let the car fall right for 8A.", "tipFr": "Tout le freinage en ligne et avant la crête — la piste plonge en aveugle. Vise la ligne d'arbres pour l'apex gauche, puis laisse tomber la voiture à droite pour le 8A." },
          "lmp2": { "marker": "≈55m", "speed": "≈240→75 km/h", "gear": "2nd", "pressure": "Hard, before crest", "tip": "Two to three downshifts before the crest; no brakes in the drop.", "tipFr": "Deux à trois rapports avant la crête ; pas de frein dans la descente." },
          "gt3": { "marker": "≈65m", "speed": "≈220→70 km/h", "gear": "2nd", "pressure": "Hard, before crest", "tip": "Brake early enough to turn in calmly — the drop punishes any leftover brake pressure.", "tipFr": "Freine assez tôt pour tourner sereinement — la descente punit tout frein résiduel." }
        }
      },
      {
        "number": "T9",
        "name": "Rainey Curve",
        "type": "fast-left-downhill",
        "braking": {
          "hypercar": { "marker": "lift or ≈30m", "speed": "≈210→150 km/h", "gear": "4th", "pressure": "Light", "tip": "Downhill fast left — mostly a lift; keep the car loaded and flowing.", "tipFr": "Gauche rapide en descente — surtout un lever de pied ; garde la voiture chargée et fluide." },
          "lmp2": { "marker": "lift", "speed": "≈205→145 km/h", "gear": "4th", "pressure": "Light", "tip": "Momentum corner; smooth inputs downhill.", "tipFr": "Virage d'élan ; commandes douces en descente." },
          "gt3": { "marker": "≈40m", "speed": "≈190→130 km/h", "gear": "3rd", "pressure": "Light", "tip": "Light brake to settle the nose, then commit.", "tipFr": "Freinage léger pour poser l'avant, puis engage-toi." }
        }
      },
      {
        "number": "T11",
        "name": "Turn 11 (final hairpin)",
        "type": "hairpin-left",
        "braking": {
          "hypercar": { "marker": "≈90m", "speed": "≈240→75 km/h", "gear": "2nd", "pressure": "Heavy, trail", "tip": "Last corner onto the main straight: late apex, sacrifice entry for the earliest possible full throttle.", "tipFr": "Dernier virage avant la ligne droite : apex tardif, sacrifie l'entrée pour remettre plein gaz le plus tôt possible." },
          "lmp2": { "marker": "≈85m", "speed": "≈230→70 km/h", "gear": "2nd", "pressure": "Heavy, trail", "tip": "Rotate on the brakes, straighten the exit.", "tipFr": "Pivote au freinage, redresse la sortie." },
          "gt3": { "marker": "≈100m", "speed": "≈210→65 km/h", "gear": "2nd", "pressure": "Heavy", "tip": "The straight is long: exit speed beats entry heroics.", "tipFr": "La ligne droite est longue : la vitesse de sortie vaut mieux que l'héroïsme en entrée." }
        }
      }
    ]
  },
  // Long Beach (US Track Pack 2, 22/09/2026) : pas couvert par ApexPoints. Même
  // démarche : repères GT3 tirés du guide vidéo commenté (Unleashed Drivers),
  // numérotation officielle IMSA/IndyCar ; protos = technique GT3, repère à ajuster.
  {
    "id": "long-beach",
    "name": "Grand Prix of Long Beach",
    "location": "Long Beach, USA",
    "source": "in-game corner notes (approximate — pending ApexPoints coverage)",
    "corners": [
      {
        "number": "T1",
        "name": "Turn 1",
        "type": "heavy_braking",
        "braking": {
          "hypercar": { "marker": "≈400 board (adjust from the GT3 reference)", "speed": "very fast → medium", "gear": "mid gear", "pressure": "Heavy, straight line", "tip": "Main overtaking spot at the end of Shoreline Drive. Keep the wheels inside the red line on the approach (track limits here are the red lines, not the white ones). Cut over the bottom of the inside kerb, not its raised part. Early throttle, use all the width up to the wall. GT3 can hammer the brakes here; a prototype locks up far more easily. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Principal point de dépassement, au bout de Shoreline Drive. Garde les roues en deçà de la ligne rouge à l'approche (ici les limites de piste sont les lignes rouges, pas les blanches). Coupe le bas du vibreur intérieur, pas sa partie surélevée. Gaz tôt, utilise toute la largeur jusqu'au mur. En GT3 on peut écraser le frein ; un proto bloque bien plus facilement. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "lmp2": { "marker": "≈400 board (adjust from the GT3 reference)", "speed": "very fast → medium", "gear": "mid gear", "pressure": "Heavy, straight line", "tip": "Main overtaking spot at the end of Shoreline Drive. Keep the wheels inside the red line on the approach (track limits here are the red lines, not the white ones). Cut over the bottom of the inside kerb, not its raised part. Early throttle, use all the width up to the wall. GT3 can hammer the brakes here; a prototype locks up far more easily. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Principal point de dépassement, au bout de Shoreline Drive. Garde les roues en deçà de la ligne rouge à l'approche (ici les limites de piste sont les lignes rouges, pas les blanches). Coupe le bas du vibreur intérieur, pas sa partie surélevée. Gaz tôt, utilise toute la largeur jusqu'au mur. En GT3 on peut écraser le frein ; un proto bloque bien plus facilement. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "gt3": { "marker": "400 board (at or just before)", "speed": "very fast → medium", "gear": "mid gear", "pressure": "Heavy, straight line", "tip": "Main overtaking spot at the end of Shoreline Drive. Keep the wheels inside the red line on the approach (track limits here are the red lines, not the white ones). Cut over the bottom of the inside kerb, not its raised part. Early throttle, use all the width up to the wall.", "tipFr": "Principal point de dépassement, au bout de Shoreline Drive. Garde les roues en deçà de la ligne rouge à l'approche (ici les limites de piste sont les lignes rouges, pas les blanches). Coupe le bas du vibreur intérieur, pas sa partie surélevée. Gaz tôt, utilise toute la largeur jusqu'au mur." }
        }
      },
      {
        "number": "T2-T3",
        "name": "Fountain (Turns 2-3)",
        "type": "slow_corner",
        "braking": {
          "hypercar": { "marker": "≈ same point (adjust from the GT3 reference)", "speed": "medium → slow", "gear": "low gear", "pressure": "Hard, straight line", "tip": "Fountain section. Stay close to the wall on entry, then tuck in really tight around the garden: apex midway round it without climbing the garden kerb. Early throttle, run the exit right up to the wall. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Section de la fontaine. Reste près du mur en entrée, puis serre au maximum autour du jardin : apex à mi-parcours, sans monter sur la bordure du jardin. Gaz tôt, sortie jusqu'au mur. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "lmp2": { "marker": "≈ same point (adjust from the GT3 reference)", "speed": "medium → slow", "gear": "low gear", "pressure": "Hard, straight line", "tip": "Fountain section. Stay close to the wall on entry, then tuck in really tight around the garden: apex midway round it without climbing the garden kerb. Early throttle, run the exit right up to the wall. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Section de la fontaine. Reste près du mur en entrée, puis serre au maximum autour du jardin : apex à mi-parcours, sans monter sur la bordure du jardin. Gaz tôt, sortie jusqu'au mur. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "gt3": { "marker": "halfway across the track after leaving the wall", "speed": "medium → slow", "gear": "low gear", "pressure": "Hard, straight line", "tip": "Fountain section. Stay close to the wall on entry, then tuck in really tight around the garden: apex midway round it without climbing the garden kerb. Early throttle, run the exit right up to the wall.", "tipFr": "Section de la fontaine. Reste près du mur en entrée, puis serre au maximum autour du jardin : apex à mi-parcours, sans monter sur la bordure du jardin. Gaz tôt, sortie jusqu'au mur." }
        }
      },
      {
        "number": "T4",
        "name": "Turn 4",
        "type": "medium_corner",
        "braking": {
          "hypercar": { "marker": "≈100 board (adjust from the GT3 reference)", "speed": "medium → medium-slow", "gear": "mid gear", "pressure": "Short — just scrub some speed", "tip": "Don't brake too hard for too long. Only touch the bottom of the raised inside kerb (mounting it throws you into the wall) and don't open the throttle too early. Stay on the outside on exit to set up Turn 5.", "tipFr": "Ne freine ni trop fort ni trop longtemps. Touche seulement le bas du vibreur intérieur surélevé (monter dessus t'envoie au mur) et ne remets pas les gaz trop tôt. Reste à l'extérieur en sortie pour préparer le virage 5." },
          "lmp2": { "marker": "≈100 board (adjust from the GT3 reference)", "speed": "medium → medium-slow", "gear": "mid gear", "pressure": "Short — just scrub some speed", "tip": "Don't brake too hard for too long. Only touch the bottom of the raised inside kerb (mounting it throws you into the wall) and don't open the throttle too early. Stay on the outside on exit to set up Turn 5.", "tipFr": "Ne freine ni trop fort ni trop longtemps. Touche seulement le bas du vibreur intérieur surélevé (monter dessus t'envoie au mur) et ne remets pas les gaz trop tôt. Reste à l'extérieur en sortie pour préparer le virage 5." },
          "gt3": { "marker": "just before the 100 board", "speed": "medium → medium-slow", "gear": "mid gear", "pressure": "Short — just scrub some speed", "tip": "Don't brake too hard for too long. Only touch the bottom of the raised inside kerb (mounting it throws you into the wall) and don't open the throttle too early. Stay on the outside on exit to set up Turn 5.", "tipFr": "Ne freine ni trop fort ni trop longtemps. Touche seulement le bas du vibreur intérieur surélevé (monter dessus t'envoie au mur) et ne remets pas les gaz trop tôt. Reste à l'extérieur en sortie pour préparer le virage 5." }
        }
      },
      {
        "number": "T5",
        "name": "Turn 5 (uphill, crest)",
        "type": "medium_corner",
        "braking": {
          "hypercar": { "marker": "≈ gap in the fence (adjust from the GT3 reference)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Hard initially", "tip": "The braking zone climbs to a crest at the apex and the car goes light as the road dips after it. Cut across most of the apex kerb, then be patient on the throttle over the dip. On exit, aim for where the wall steps back. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "La zone de freinage monte jusqu'à une crête à l'apex, et la voiture s'allège quand la route replonge. Coupe l'essentiel du vibreur d'apex, puis patience à l'accélération dans le creux. En sortie, vise l'endroit où le mur recule. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "lmp2": { "marker": "≈ gap in the fence (adjust from the GT3 reference)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Hard initially", "tip": "The braking zone climbs to a crest at the apex and the car goes light as the road dips after it. Cut across most of the apex kerb, then be patient on the throttle over the dip. On exit, aim for where the wall steps back. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "La zone de freinage monte jusqu'à une crête à l'apex, et la voiture s'allège quand la route replonge. Coupe l'essentiel du vibreur d'apex, puis patience à l'accélération dans le creux. En sortie, vise l'endroit où le mur recule. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "gt3": { "marker": "alongside the gap in the fence", "speed": "fast → medium", "gear": "mid gear", "pressure": "Hard initially", "tip": "The braking zone climbs to a crest at the apex and the car goes light as the road dips after it. Cut across most of the apex kerb, then be patient on the throttle over the dip. On exit, aim for where the wall steps back.", "tipFr": "La zone de freinage monte jusqu'à une crête à l'apex, et la voiture s'allège quand la route replonge. Coupe l'essentiel du vibreur d'apex, puis patience à l'accélération dans le creux. En sortie, vise l'endroit où le mur recule." }
        }
      },
      {
        "number": "T6",
        "name": "Turn 6",
        "type": "medium_corner",
        "braking": {
          "hypercar": { "marker": "≈300 board (adjust from the GT3 reference)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Heavy, trail", "tip": "Downhill, off-camber and the trickiest corner: the wall on entry kinks in then straightens — line up with where it straightens. Very easy to clip the inside wall: get close, touching only the flat kerb. Throttle at the apex, a little on-throttle rotation, run out to the outside wall. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "En descente, en dévers, et le plus piégeux : le mur d'entrée rentre puis se redresse — aligne-toi sur l'endroit où il se redresse. Très facile de toucher le mur intérieur : approche-toi en ne touchant que le vibreur plat. Gaz à l'apex, un peu de rotation à l'accélération, sortie jusqu'au mur extérieur. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "lmp2": { "marker": "≈300 board (adjust from the GT3 reference)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Heavy, trail", "tip": "Downhill, off-camber and the trickiest corner: the wall on entry kinks in then straightens — line up with where it straightens. Very easy to clip the inside wall: get close, touching only the flat kerb. Throttle at the apex, a little on-throttle rotation, run out to the outside wall. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "En descente, en dévers, et le plus piégeux : le mur d'entrée rentre puis se redresse — aligne-toi sur l'endroit où il se redresse. Très facile de toucher le mur intérieur : approche-toi en ne touchant que le vibreur plat. Gaz à l'apex, un peu de rotation à l'accélération, sortie jusqu'au mur extérieur. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "gt3": { "marker": "just after the 300 board", "speed": "fast → medium", "gear": "mid gear", "pressure": "Heavy, trail", "tip": "Downhill, off-camber and the trickiest corner: the wall on entry kinks in then straightens — line up with where it straightens. Very easy to clip the inside wall: get close, touching only the flat kerb. Throttle at the apex, a little on-throttle rotation, run out to the outside wall.", "tipFr": "En descente, en dévers, et le plus piégeux : le mur d'entrée rentre puis se redresse — aligne-toi sur l'endroit où il se redresse. Très facile de toucher le mur intérieur : approche-toi en ne touchant que le vibreur plat. Gaz à l'apex, un peu de rotation à l'accélération, sortie jusqu'au mur extérieur." }
        }
      },
      {
        "number": "T8",
        "name": "Turn 8",
        "type": "medium_corner",
        "braking": {
          "hypercar": { "marker": "≈300 board (adjust from the GT3 reference)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Heavy, trail", "tip": "Onto the back straight. The apex is hard to judge in a left-hand-drive car: get as close to the inside wall as you can on the flat kerb without touching it. Throttle at or just after the apex, run out to the exit wall.", "tipFr": "Vers la ligne droite opposée. L'apex est difficile à juger avec une conduite à gauche : approche-toi au maximum du mur intérieur sur le vibreur plat, sans le toucher. Gaz à l'apex ou juste après, sortie jusqu'au mur." },
          "lmp2": { "marker": "≈300 board (adjust from the GT3 reference)", "speed": "fast → medium", "gear": "mid gear", "pressure": "Heavy, trail", "tip": "Onto the back straight. The apex is hard to judge in a left-hand-drive car: get as close to the inside wall as you can on the flat kerb without touching it. Throttle at or just after the apex, run out to the exit wall.", "tipFr": "Vers la ligne droite opposée. L'apex est difficile à juger avec une conduite à gauche : approche-toi au maximum du mur intérieur sur le vibreur plat, sans le toucher. Gaz à l'apex ou juste après, sortie jusqu'au mur." },
          "gt3": { "marker": "just after the 300 board, right next to the wall", "speed": "fast → medium", "gear": "mid gear", "pressure": "Heavy, trail", "tip": "Onto the back straight. The apex is hard to judge in a left-hand-drive car: get as close to the inside wall as you can on the flat kerb without touching it. Throttle at or just after the apex, run out to the exit wall.", "tipFr": "Vers la ligne droite opposée. L'apex est difficile à juger avec une conduite à gauche : approche-toi au maximum du mur intérieur sur le vibreur plat, sans le toucher. Gaz à l'apex ou juste après, sortie jusqu'au mur." }
        }
      },
      {
        "number": "T9",
        "name": "Turn 9",
        "type": "medium_corner",
        "braking": {
          "hypercar": { "marker": "≈300 board (adjust from the GT3 reference)", "speed": "very fast → medium", "gear": "mid gear", "pressure": "Heavy, trail", "tip": "90° right-hander at the end of the back straight, the second overtaking spot. Cut all the inside kerb while keeping the wheels inside the red line. Understeers on worn tyres. Don't drift all the way to the far wall on exit — come back across for Turn 10. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Droite à 90° au bout de la ligne droite opposée, second point de dépassement. Coupe tout le vibreur intérieur en gardant les roues en deçà de la ligne rouge. Sous-vireur en pneus usés. Ne va pas jusqu'au mur opposé en sortie — reviens pour le virage 10. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "lmp2": { "marker": "≈300 board (adjust from the GT3 reference)", "speed": "very fast → medium", "gear": "mid gear", "pressure": "Heavy, trail", "tip": "90° right-hander at the end of the back straight, the second overtaking spot. Cut all the inside kerb while keeping the wheels inside the red line. Understeers on worn tyres. Don't drift all the way to the far wall on exit — come back across for Turn 10. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Droite à 90° au bout de la ligne droite opposée, second point de dépassement. Coupe tout le vibreur intérieur en gardant les roues en deçà de la ligne rouge. Sous-vireur en pneus usés. Ne va pas jusqu'au mur opposé en sortie — reviens pour le virage 10. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "gt3": { "marker": "just before the 300 board, from the left", "speed": "very fast → medium", "gear": "mid gear", "pressure": "Heavy, trail", "tip": "90° right-hander at the end of the back straight, the second overtaking spot. Cut all the inside kerb while keeping the wheels inside the red line. Understeers on worn tyres. Don't drift all the way to the far wall on exit — come back across for Turn 10.", "tipFr": "Droite à 90° au bout de la ligne droite opposée, second point de dépassement. Coupe tout le vibreur intérieur en gardant les roues en deçà de la ligne rouge. Sous-vireur en pneus usés. Ne va pas jusqu'au mur opposé en sortie — reviens pour le virage 10." }
        }
      },
      {
        "number": "T10",
        "name": "Turn 10 (Indy Left)",
        "type": "medium_corner",
        "braking": {
          "hypercar": { "marker": "≈ at the bridge (adjust from the GT3 reference)", "speed": "medium → medium-slow", "gear": "mid gear", "pressure": "Braking while turning in", "tip": "'Indy Left' (135°): start braking mid-track while already committing to the turn, be patient and let the car grip up, cut the inside kerb (wheels inside the red line). Patient on throttle — it feeds straight into the hairpin braking.", "tipFr": "« Indy Left » (135°) : commence à freiner au milieu de la piste en engageant déjà le virage, patiente le temps que la voiture accroche, coupe le vibreur intérieur (roues en deçà de la ligne rouge). Patience à l'accélération : on enchaîne directement sur le freinage de l'épingle." },
          "lmp2": { "marker": "≈ at the bridge (adjust from the GT3 reference)", "speed": "medium → medium-slow", "gear": "mid gear", "pressure": "Braking while turning in", "tip": "'Indy Left' (135°): start braking mid-track while already committing to the turn, be patient and let the car grip up, cut the inside kerb (wheels inside the red line). Patient on throttle — it feeds straight into the hairpin braking.", "tipFr": "« Indy Left » (135°) : commence à freiner au milieu de la piste en engageant déjà le virage, patiente le temps que la voiture accroche, coupe le vibreur intérieur (roues en deçà de la ligne rouge). Patience à l'accélération : on enchaîne directement sur le freinage de l'épingle." },
          "gt3": { "marker": "as you reach the bridge (top or side)", "speed": "medium → medium-slow", "gear": "mid gear", "pressure": "Braking while turning in", "tip": "'Indy Left' (135°): start braking mid-track while already committing to the turn, be patient and let the car grip up, cut the inside kerb (wheels inside the red line). Patient on throttle — it feeds straight into the hairpin braking.", "tipFr": "« Indy Left » (135°) : commence à freiner au milieu de la piste en engageant déjà le virage, patiente le temps que la voiture accroche, coupe le vibreur intérieur (roues en deçà de la ligne rouge). Patience à l'accélération : on enchaîne directement sur le freinage de l'épingle." }
        }
      },
      {
        "number": "T11",
        "name": "Turn 11 (hairpin)",
        "type": "hairpin",
        "braking": {
          "hypercar": { "marker": "≈ same point (adjust from the GT3 reference)", "speed": "medium → very slow", "gear": "lowest gear", "pressure": "Very heavy, straight line", "tip": "Slowest corner of the lap and it leads onto the longest straight — the exit is everything. Don't aim straight at the apex: open the entry, then full lock. Apex tight to the inside wall (just visible); any wider and you hit the exit wall. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Virage le plus lent du tour, qui mène à la plus longue ligne droite — tout se joue en sortie. Ne vise pas directement l'apex : ouvre l'entrée, puis braquage maximal. Apex serré contre le mur intérieur (tout juste visible) ; plus large et tu touches le mur de sortie. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "lmp2": { "marker": "≈ same point (adjust from the GT3 reference)", "speed": "medium → very slow", "gear": "lowest gear", "pressure": "Very heavy, straight line", "tip": "Slowest corner of the lap and it leads onto the longest straight — the exit is everything. Don't aim straight at the apex: open the entry, then full lock. Apex tight to the inside wall (just visible); any wider and you hit the exit wall. No ABS: modulate the pedal to avoid a lock-up.", "tipFr": "Virage le plus lent du tour, qui mène à la plus longue ligne droite — tout se joue en sortie. Ne vise pas directement l'apex : ouvre l'entrée, puis braquage maximal. Apex serré contre le mur intérieur (tout juste visible) ; plus large et tu touches le mur de sortie. Pas d'ABS : dose la pédale pour ne pas bloquer." },
          "gt3": { "marker": "in a straight line, just after the wall juts out", "speed": "medium → very slow", "gear": "lowest gear", "pressure": "Very heavy, straight line", "tip": "Slowest corner of the lap and it leads onto the longest straight — the exit is everything. Don't aim straight at the apex: open the entry, then full lock. Apex tight to the inside wall (just visible); any wider and you hit the exit wall.", "tipFr": "Virage le plus lent du tour, qui mène à la plus longue ligne droite — tout se joue en sortie. Ne vise pas directement l'apex : ouvre l'entrée, puis braquage maximal. Apex serré contre le mur intérieur (tout juste visible) ; plus large et tu touches le mur de sortie." }
        }
      }
    ]
  }
];
