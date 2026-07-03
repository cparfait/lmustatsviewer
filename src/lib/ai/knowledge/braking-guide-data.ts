/**
 * Base de référence des freinages idéaux par circuit (Le Mans Ultimate).
 *
 * Source : ApexPoints (apex-brake-flow.base44.app) — guide communautaire des
 * zones de freinage par circuit et par classe (Hypercar / LMP2 / GT3). Donnée
 * de référence utilisée par le Coach IA (cf. `braking-guide.ts`). Crédit à
 * l auteur d origine ; affichage interne, non redistribué tel quel.
 *
 * Fichier GÉNÉRÉ — ne pas éditer à la main.
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
    "id": "portimao",
    "name": "Autódromo do Algarve",
    "location": "Portimão, Portugal",
    "corners": [
      {
        "number": "T1",
        "name": "Turn 1",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "290→110 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Downhill braking — the car gets light. Brake early and progressively. Trail brake to the apex.",
            "tipFr": "Freinage en descente — la voiture s'allège. Freinez tôt et progressivement. Lestage vers l'apex."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "270→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Downhill entry makes braking tricky. Be smooth and progressive on the brake pedal.",
            "tipFr": "L'entrée en descente rend le freinage délicat. Soyez fluide et progressif sur la pédale de frein."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "240→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. Downhill means less grip under braking. Be conservative.",
            "tipFr": "Freinez à 125m. La descente signifie moins d'adhérence au freinage. Soyez conservateur."
          }
        }
      },
      {
        "number": "T3",
        "name": "Turn 3 (Sagres)",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "250→130 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Blind entry over a crest. Brake before the crest, commit through. Trust your reference points.",
            "tipFr": "Entrée aveugle sur une crête. Freinez avant la crête, engagez-vous. Faites confiance à vos repères."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "235→120 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Brake before the crest. The elevation change makes this corner unique — learn the rhythm.",
            "tipFr": "Freinez avant la crête. Le changement d'altitude rend ce virage unique — apprenez le rythme."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "210→100 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m before the crest. Build confidence lap by lap — visibility is limited.",
            "tipFr": "Freinez à 100m avant la crête. Gagnez en confiance tour après tour — la visibilité est limitée."
          }
        }
      },
      {
        "number": "T5",
        "name": "Turn 5",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "280→140 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Uphill approach helps braking. Get the car stopped and rotate into the right-hander.",
            "tipFr": "L'approche en montée aide au freinage. Arrêtez la voiture et faites pivoter vers la droite."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "260→130 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Uphill helps — use it to your advantage for harder braking.",
            "tipFr": "Freinez à 100m. La montée aide — profitez-en pour freiner plus fort."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "230→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. The uphill assists braking — be assertive with the brake pedal.",
            "tipFr": "Freinez à 100m. La montée aide au freinage — soyez assertif avec la pédale de frein."
          }
        }
      },
      {
        "number": "T8",
        "name": "Turn 8 (Lagos)",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "240→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Tight hairpin. Heavy braking, deep trail brake to rotate the car around.",
            "tipFr": "Épingle serrée. Freinage lourd, lestage profond pour faire pivoter la voiture."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "225→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Hairpin — big stop. Trail brake in deep and get a good exit.",
            "tipFr": "Épingle — gros arrêt. Lestage profond et bonne sortie."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "200→55 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Slow the car right down for this tight hairpin.",
            "tipFr": "Freinez à 100m. Ralentissez considérablement pour cette épingle serrée."
          }
        }
      },
      {
        "number": "T11",
        "name": "Turn 11",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "270→130 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Fast left with a blind crest. Brake before the hill, let the car flow over the top.",
            "tipFr": "Gauche rapide avec crête aveugle. Freinez avant la colline, laissez la voiture passer la crête."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "250→120 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Brake before the elevation change. Smooth inputs over the crest.",
            "tipFr": "Freinez avant le changement d'altitude. Gestes fluides sur la crête."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "220→100 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. The blind crest makes this scary — build up to speed gradually.",
            "tipFr": "Freinez à 100m. La crête aveugle rend ça effrayant — montez en vitesse progressivement."
          }
        }
      },
      {
        "number": "T13-T14",
        "name": "Turn 13-14 (Galp)",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "285→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Downhill braking into a tight section. Brake early and hard. The track drops away.",
            "tipFr": "Freinage en descente dans une section serrée. Freinez tôt et fort. La piste plonge."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "265→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Downhill makes this treacherous. Brake early and commit to a late apex.",
            "tipFr": "La descente rend ça dangereux. Freinez tôt et engagez-vous vers un apex tardif."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "235→60 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. Downhill braking is the hardest thing here — be patient.",
            "tipFr": "Freinez à 125m. Le freinage en descente est le plus difficile ici — soyez patient."
          }
        }
      }
    ]
  },
  {
    "id": "bahrain",
    "name": "Bahrain International Circuit",
    "location": "Sakhir, Bahrain",
    "corners": [
      {
        "number": "T1",
        "name": "Turn 1",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "310→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Big braking zone at the end of the main straight. Brake at 100m, downhill slightly. Trail brake to the apex.",
            "tipFr": "Grande zone de freinage en fin de ligne droite principale. Freinez à 100m, légèrement en descente. Lestage vers l'apex."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "290→90 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Sand can blow onto the track — be careful on the first laps.",
            "tipFr": "Freinez à 100m. Le sable peut souffler sur la piste — soyez prudent les premiers tours."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "255→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. Big stop — focus on a clean turn-in after the heavy braking.",
            "tipFr": "Freinez à 125m. Gros arrêt — concentrez-vous sur une entrée propre après le freinage lourd."
          }
        }
      },
      {
        "number": "T2",
        "name": "Turn 2",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "50m board",
            "speed": "190→130 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Quick right continuing from T1 complex. Light brake and rotate, carry speed through.",
            "tipFr": "Droite rapide dans la continuité de T1. Léger frein et rotation, portez la vitesse."
          },
          "lmp2": {
            "marker": "50m board",
            "speed": "175→120 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Brake at 50m. Flow through the T1-T2 complex smoothly.",
            "tipFr": "Freinez à 50m. Enchaînez le complexe T1-T2 avec fluidité."
          },
          "gt3": {
            "marker": "75m board",
            "speed": "160→105 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Don't rush the exit — it leads to a slow T3.",
            "tipFr": "Freinez à 75m. Ne précipitez pas la sortie — ça mène à un T3 lent."
          }
        }
      },
      {
        "number": "T4",
        "name": "Turn 4",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "260→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Right-hander at the end of a short straight. Quick brake and turn-in together.",
            "tipFr": "Droite en fin de courte ligne droite. Freinage rapide et entrée simultanés."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "245→100 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Get the car rotated and carry speed through the following section.",
            "tipFr": "Freinez à 75m. Faites pivoter la voiture et portez la vitesse dans la section suivante."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "220→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Don't overcook the entry — the exit is more important.",
            "tipFr": "Freinez à 100m. Ne surchargez pas l'entrée — la sortie est plus importante."
          }
        }
      },
      {
        "number": "T8",
        "name": "Turn 8",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "250→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Tight left-hander. Heavy braking and deep trail brake. Classic overtaking spot.",
            "tipFr": "Gauche serré. Freinage lourd et lestage profond. Point de dépassement classique."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "235→60 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Big stop. Trail brake deep to rotate. This is where races are won and lost.",
            "tipFr": "Gros arrêt. Lestage profond pour faire pivoter. C'est ici que les courses se gagnent et se perdent."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "210→50 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Tight corner — be prepared for traffic and overtakes.",
            "tipFr": "Freinez à 100m. Virage serré — préparez-vous au trafic et aux dépassements."
          }
        }
      },
      {
        "number": "T10",
        "name": "Turn 10",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "290→120 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Fast right after a long straight section. Brake at 75m, quick direction change.",
            "tipFr": "Droite rapide après une longue section. Freinez à 75m, changement de direction rapide."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "270→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Fast corner — commit and carry the speed through.",
            "tipFr": "Freinez à 100m. Virage rapide — engagez-vous et portez la vitesse."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "240→95 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Get the car pointing right and accelerate hard down the straight.",
            "tipFr": "Freinez à 100m. Pointez la voiture à droite et accélérez fort dans la ligne droite."
          }
        }
      },
      {
        "number": "T14",
        "name": "Turn 14",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "270→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Second-to-last corner. Big braking zone. Get the car stopped and focus on exit for the main straight.",
            "tipFr": "Avant-dernier virage. Grande zone de freinage. Arrêtez la voiture et concentrez-vous sur la sortie vers la ligne droite principale."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "255→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Exit speed is crucial here — it determines your straight speed.",
            "tipFr": "Freinez à 100m. La vitesse de sortie est cruciale ici — elle détermine votre vitesse en ligne droite."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "225→55 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. The most important exit on the circuit — prioritize a clean acceleration zone.",
            "tipFr": "Freinez à 100m. La sortie la plus importante du circuit — priorisez une zone d'accélération propre."
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
  {
    "id": "fuji",
    "name": "Fuji Speedway",
    "location": "Oyama, Japan",
    "corners": [
      {
        "number": "T1",
        "name": "TGR Corner (T1)",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "320→90 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "End of the long main straight. Massive braking zone. Brake at 100m, go very deep.",
            "tipFr": "Fin de la longue ligne droite principale. Énorme zone de freinage. Freinez à 100m, allez très profond."
          },
          "lmp2": {
            "marker": "125m board",
            "speed": "300→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. Huge speed scrub. Stay calm and brake in a straight line.",
            "tipFr": "Freinez à 125m. Énorme réduction de vitesse. Restez calme et freinez en ligne droite."
          },
          "gt3": {
            "marker": "150m board",
            "speed": "265→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 150m. Longest braking zone on the circuit. Be progressive and patient.",
            "tipFr": "Freinez à 150m. Zone de freinage la plus longue du circuit. Soyez progressif et patient."
          }
        }
      },
      {
        "number": "T3",
        "name": "Coca-Cola Corner",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Light brake",
            "speed": "260→200 km/h",
            "gear": "5th",
            "pressure": "Light",
            "tip": "Fast right-hander. Light brake to set the car. Trust the grip and commit.",
            "tipFr": "Droite rapide. Léger frein pour stabiliser la voiture. Faites confiance à l'adhérence et engagez-vous."
          },
          "lmp2": {
            "marker": "Light brake",
            "speed": "245→185 km/h",
            "gear": "4th-5th",
            "pressure": "Light-moderate",
            "tip": "A light brake to scrub speed. Smooth steering input through the long radius.",
            "tipFr": "Un léger frein pour effacer la vitesse. Gestes de direction fluides sur le long rayon."
          },
          "gt3": {
            "marker": "75m before",
            "speed": "215→160 km/h",
            "gear": "4th",
            "pressure": "Moderate",
            "tip": "You'll need a proper brake here. Get the entry speed right and maintain it through.",
            "tipFr": "Il vous faudra un vrai freinage ici. Gérez la vitesse d'entrée et maintenez-la."
          }
        }
      },
      {
        "number": "T5-T7",
        "name": "100R",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Flat / lift",
            "speed": "270→240 km/h",
            "gear": "6th",
            "pressure": "Very light",
            "tip": "Famous fast sweeper. Flat or near-flat. Build up to it — huge consequence if you get it wrong.",
            "tipFr": "Fameux virage rapide. À plat ou presque. Montez en vitesse progressivement — grandes conséquences en cas d'erreur."
          },
          "lmp2": {
            "marker": "Light brake",
            "speed": "255→220 km/h",
            "gear": "5th",
            "pressure": "Light",
            "tip": "Light brake or lift. The car moves around — stay smooth and trust the balance.",
            "tipFr": "Léger frein ou levée de pied. La voiture bouge — restez fluide et faites confiance à l'équilibre."
          },
          "gt3": {
            "marker": "Moderate brake",
            "speed": "225→185 km/h",
            "gear": "4th",
            "pressure": "Moderate",
            "tip": "You need to brake properly here. The GT3 doesn't have enough downforce to take it flat.",
            "tipFr": "Vous devez freiner correctement ici. La GT3 n'a pas assez d'appui pour le prendre à plat."
          }
        }
      },
      {
        "number": "T10",
        "name": "Dunlop Corner",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "250→110 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Right-hander with elevation drop. Brake at 75m, the downhill helps. Get a good exit.",
            "tipFr": "Droite avec dénivellation. Freinez à 75m, la descente aide. Bonne sortie."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "235→100 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Downhill helps slow the car. Focus on a clean exit.",
            "tipFr": "Freinez à 75m. La descente aide à ralentir la voiture. Concentrez-vous sur une sortie propre."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "210→85 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. The downhill makes it easier to stop but harder to judge. Practice the reference.",
            "tipFr": "Freinez à 100m. La descente facilite l'arrêt mais rend le jugement plus difficile. Travaillez vos repères."
          }
        }
      },
      {
        "number": "T13",
        "name": "13th Corner",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "50m board",
            "speed": "200→70 km/h",
            "gear": "2nd",
            "pressure": "Heavy",
            "tip": "Tight right. Short braking zone. Brake at 50m, rotate the car, and get on the power.",
            "tipFr": "Droite serrée. Zone de freinage courte. Freinez à 50m, faites pivoter la voiture et reprenez les gaz."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "190→65 km/h",
            "gear": "2nd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Quick stop into a tight corner. Power out hard for the run to the final corner.",
            "tipFr": "Freinez à 75m. Arrêt rapide dans un virage serré. Accélérez fort vers le dernier virage."
          },
          "gt3": {
            "marker": "75m board",
            "speed": "170→55 km/h",
            "gear": "2nd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Tight corner — slow it down and power out cleanly.",
            "tipFr": "Freinez à 75m. Virage serré — ralentissez et reprenez les gaz proprement."
          }
        }
      },
      {
        "number": "T16",
        "name": "Panasonic / Final Corner",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "260→120 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Last corner before the main straight. Brake at 75m, late apex, and floor it. Exit speed is everything.",
            "tipFr": "Dernier virage avant la ligne droite principale. Freinez à 75m, apex tardif et écrasez l'accélérateur. La vitesse de sortie est tout."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "245→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Late apex and focus 100% on exit speed for the 1.5km straight.",
            "tipFr": "Freinez à 100m. Apex tardif et concentrez-vous à 100% sur la vitesse de sortie pour la ligne droite de 1,5 km."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "220→95 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. The most important corner — exit speed defines your lap time.",
            "tipFr": "Freinez à 100m. Le virage le plus important — la vitesse de sortie définit votre temps au tour."
          }
        }
      }
    ]
  },
  {
    "id": "sebring",
    "name": "Sebring International Raceway",
    "location": "Sebring, USA",
    "corners": [
      {
        "number": "T1",
        "name": "Turn 1",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "290→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "First corner after the start line. Brake at 100m, trail in. The bumpy surface can unsettle braking.",
            "tipFr": "Premier virage après la ligne de départ. Freinez à 100m, lestage. La surface bosselée peut perturber le freinage."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "270→90 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. The tarmac patches make braking unpredictable — be smooth.",
            "tipFr": "Freinez à 100m. Les raccords de tarmac rendent le freinage imprévisible — soyez fluide."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "240→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. Bumps everywhere — be progressive and don't panic-brake.",
            "tipFr": "Freinez à 125m. Bosses partout — soyez progressif et ne freinez pas par panique."
          }
        }
      },
      {
        "number": "T3",
        "name": "Turn 3 (Webster)",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Light brake",
            "speed": "260→200 km/h",
            "gear": "5th",
            "pressure": "Light",
            "tip": "Fast right-hander. Light brake to set the car. The bumps here are legendary — stay calm.",
            "tipFr": "Droite rapide. Léger frein pour stabiliser la voiture. Les bosses ici sont légendaires — restez calme."
          },
          "lmp2": {
            "marker": "Light brake",
            "speed": "245→185 km/h",
            "gear": "4th-5th",
            "pressure": "Light-moderate",
            "tip": "A quick dab of brake to set entry. Smooth inputs — the car gets unsettled over the bumps.",
            "tipFr": "Un rapide coup de frein pour régler l'entrée. Gestes fluides — la voiture est déstabilisée par les bosses."
          },
          "gt3": {
            "marker": "75m before",
            "speed": "215→160 km/h",
            "gear": "4th",
            "pressure": "Moderate",
            "tip": "Brake properly here. The GT3 needs to be slowed and balanced before committing.",
            "tipFr": "Freinez correctement ici. La GT3 doit être ralentie et équilibrée avant de s'engager."
          }
        }
      },
      {
        "number": "T7",
        "name": "Turn 7",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "270→120 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Right-hander with a bumpy entry. Brake at 75m and keep the car stable.",
            "tipFr": "Droite avec entrée bosselée. Freinez à 75m et gardez la voiture stable."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "255→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. Get a clean line through — the bumps can send you wide.",
            "tipFr": "Freinez à 100m. Prenez une trajectoire propre — les bosses peuvent vous éjecter."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "225→95 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 100m. The bumpy surface means you need to be very smooth here.",
            "tipFr": "Freinez à 100m. La surface bosselée signifie que vous devez être très fluide ici."
          }
        }
      },
      {
        "number": "T13-T15",
        "name": "The Esses (T13-T15)",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Lift / light brake",
            "speed": "250→190 km/h",
            "gear": "5th",
            "pressure": "Very light",
            "tip": "Fast, bumpy esses. Light lifts between each section. Trust the downforce and find a rhythm.",
            "tipFr": "Esse rapide et bosselé. Légères levées de pied entre chaque section. Faites confiance à l'appui et trouvez un rythme."
          },
          "lmp2": {
            "marker": "Light brake",
            "speed": "235→175 km/h",
            "gear": "4th-5th",
            "pressure": "Light",
            "tip": "Light braking at each direction change. Sebring's esses are brutal — don't fight the car.",
            "tipFr": "Freinage léger à chaque changement de direction. Les esses de Sebring sont brutaux — ne combattez pas la voiture."
          },
          "gt3": {
            "marker": "Brake at entry",
            "speed": "205→155 km/h",
            "gear": "4th",
            "pressure": "Moderate",
            "tip": "Need a proper brake at entry. The bumps are more punishing in GT3 — stay patient.",
            "tipFr": "Besoin d'un vrai freinage à l'entrée. Les bosses sont plus punitives en GT3 — restez patient."
          }
        }
      },
      {
        "number": "T17",
        "name": "Hairpin (T17)",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "260→60 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Sebring's tightest corner. Heavy braking, trail in deep. Classic overtaking spot on the inside.",
            "tipFr": "Le virage le plus serré de Sebring. Freinage lourd, lestage profond. Point de dépassement classique à l'intérieur."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "245→55 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Big stop. Trail brake to rotate — be patient, late apex.",
            "tipFr": "Freinez à 75m. Gros arrêt. Lestage pour faire pivoter — soyez patient, apex tardif."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "215→45 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Slowest corner on the track — prioritize exit speed.",
            "tipFr": "Freinez à 100m. Virage le plus lent de la piste — priorisez la vitesse de sortie."
          }
        }
      },
      {
        "number": "T16",
        "name": "Turn 16 (Ford Chicane)",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "280→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Last chicane before the start. Big stop at 75m, get both apexes and power out hard.",
            "tipFr": "Dernière chicane avant le départ. Gros arrêt à 75m, visez les deux apex et accélérez fort."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "260→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Clean through the chicane — exits onto the pit straight.",
            "tipFr": "Freinez à 100m. Propre dans la chicane — débouche sur la ligne droite des stands."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "230→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Tight chicane — be tidy and focus on a good exit.",
            "tipFr": "Freinez à 100m. Chicane serrée — soyez propre et concentrez-vous sur une bonne sortie."
          }
        }
      }
    ]
  },
  {
    "id": "paul-ricard",
    "name": "Circuit Paul Ricard",
    "location": "Le Castellet, France",
    "corners": [
      {
        "number": "T1",
        "name": "Sainte Beaume (T1)",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "300→110 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Big stop at the end of the Mistral straight. Brake at the 100m board, trail brake to the apex.",
            "tipFr": "Gros arrêt en fin de ligne droite du Mistral. Freinez au panneau 100m, lestage vers l'apex."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "280→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Heavy and progressive. Don't lock up on the painted runoff strip.",
            "tipFr": "Freinez à 100m. Lourd et progressif. Ne bloquez pas sur les bandes peintes."
          },
          "gt3": {
            "marker": "150m board",
            "speed": "250→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 150m. Long braking zone — stay on the tarmac and off the blue stripes.",
            "tipFr": "Freinez à 150m. Longue zone de freinage — restez sur le tarmac et loin des bandes bleues."
          }
        }
      },
      {
        "number": "T3",
        "name": "Bendor (T3)",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Light brake",
            "speed": "270→210 km/h",
            "gear": "5th",
            "pressure": "Light",
            "tip": "Quick chicane before Signes. Light brake, hit both apexes and commit through.",
            "tipFr": "Chicane rapide avant Signes. Léger frein, visez les deux apex et engagez-vous."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "255→195 km/h",
            "gear": "5th",
            "pressure": "Light-moderate",
            "tip": "Brake at 75m. Flow through the direction changes smoothly.",
            "tipFr": "Freinez à 75m. Enchaînez les changements de direction avec fluidité."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "225→165 km/h",
            "gear": "4th",
            "pressure": "Moderate",
            "tip": "Brake at 100m. More scrub needed in GT3. Be tidy through the chicane.",
            "tipFr": "Freinez à 100m. Plus d'effacement nécessaire en GT3. Soyez propre dans la chicane."
          }
        }
      },
      {
        "number": "T4",
        "name": "Signes",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Flat / slight lift",
            "speed": "290→265 km/h",
            "gear": "6th-7th",
            "pressure": "None / very light",
            "tip": "High-speed right-hander. Nearly flat in a Hypercar. Commit and trust the downforce.",
            "tipFr": "Virage rapide à droite. Presque à plat en Hypercar. Engagez-vous et faites confiance à l'appui."
          },
          "lmp2": {
            "marker": "Slight lift",
            "speed": "270→245 km/h",
            "gear": "6th",
            "pressure": "Very light",
            "tip": "A light lift is enough. The car has enough grip — trust it.",
            "tipFr": "Une légère levée de pied suffit. La voiture a suffisamment d'adhérence — faites-lui confiance."
          },
          "gt3": {
            "marker": "Light brake",
            "speed": "240→210 km/h",
            "gear": "5th",
            "pressure": "Light",
            "tip": "A proper but light brake to settle the car. Big consequences if you get it wrong.",
            "tipFr": "Un freinage correct mais léger pour stabiliser la voiture. Grandes conséquences en cas d'erreur."
          }
        }
      },
      {
        "number": "T6-T7",
        "name": "Club (T6-T7)",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "260→90 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Tight chicane. Brake at 75m, hit both apexes. Good exit is key for the back section.",
            "tipFr": "Chicane serrée. Freinez à 75m, visez les deux apex. Bonne sortie clé pour la section arrière."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "240→85 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Be precise — the chicane rewards smooth technique.",
            "tipFr": "Freinez à 100m. Soyez précis — la chicane récompense la technique fluide."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "215→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Tight chicane — don't rush the entry.",
            "tipFr": "Freinez à 100m. Chicane serrée — ne précipitez pas l'entrée."
          }
        }
      },
      {
        "number": "T10",
        "name": "Beausset (T10)",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "240→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Tight left. Brake hard at 75m, late apex, and power out toward the final section.",
            "tipFr": "Gauche serré. Freinez fort à 75m, apex tardif et accélérez vers la section finale."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "225→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Classic hairpin technique.",
            "tipFr": "Freinez à 75m. Technique classique d'épingle."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "200→55 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Slow it right down — patience is rewarded on exit.",
            "tipFr": "Freinez à 100m. Ralentissez vraiment — la patience est récompensée en sortie."
          }
        }
      },
      {
        "number": "T13-T14",
        "name": "Pont de Fos (T13-T14)",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "270→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Last chicane before the pit straight. Big stop, nail both apexes, and floor it.",
            "tipFr": "Dernière chicane avant la ligne droite des stands. Gros arrêt, visez les deux apex et écrasez l'accélérateur."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "250→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Exit speed matters enormously here.",
            "tipFr": "Freinez à 100m. La vitesse de sortie compte énormément ici."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "220→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Be neat through the chicane — messy exits cost lots of time.",
            "tipFr": "Freinez à 100m. Soyez propre dans la chicane — les sorties brouillonnes coûtent beaucoup de temps."
          }
        }
      }
    ]
  },
  {
    "id": "interlagos",
    "name": "Autódromo José Carlos Pace",
    "location": "São Paulo, Brazil",
    "corners": [
      {
        "number": "T1-T2",
        "name": "Curva 1 / Senna S",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "100m board",
            "speed": "290→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Downhill into the S. Brake at 100m — the gradient helps. Trail brake through the left-right.",
            "tipFr": "Descente dans le S. Freinez à 100m — le dénivelé aide. Lestage dans le gauche-droite."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "270→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Downhill makes it tricky — be progressive and smooth.",
            "tipFr": "Freinez à 100m. La descente rend ça délicat — soyez progressif et fluide."
          },
          "gt3": {
            "marker": "125m board",
            "speed": "240→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 125m. Downhill entry — brake early and keep the car stable.",
            "tipFr": "Freinez à 125m. Entrée en descente — freinez tôt et gardez la voiture stable."
          }
        }
      },
      {
        "number": "T4",
        "name": "Curva do Sol (T4)",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "50m board",
            "speed": "230→120 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Quick right-hander. Short brake at 50m, late apex, power out toward Descida do Lago.",
            "tipFr": "Droite rapide. Court freinage à 50m, apex tardif, accélérez vers Descida do Lago."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "215→110 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Smooth and precise — it flows into a fast section.",
            "tipFr": "Freinez à 75m. Fluide et précis — ça débouche sur une section rapide."
          },
          "gt3": {
            "marker": "75m board",
            "speed": "190→95 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Don't overdo entry speed — exit quality matters more.",
            "tipFr": "Freinez à 75m. Ne surchargez pas la vitesse d'entrée — la qualité de sortie compte plus."
          }
        }
      },
      {
        "number": "T6",
        "name": "Descida do Lago (T6)",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "250→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Downhill right-hander. Heavy brake at 75m. Downhill makes the car light — be smooth.",
            "tipFr": "Droite en descente. Freinage lourd à 75m. La descente allège la voiture — soyez fluide."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "235→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. The downhill entry is deceptive — keep the brake progressive.",
            "tipFr": "Freinez à 75m. L'entrée en descente est trompeuse — gardez le freinage progressif."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "210→55 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Downhill makes this harder than it looks.",
            "tipFr": "Freinez à 100m. La descente rend ça plus difficile qu'il n'y paraît."
          }
        }
      },
      {
        "number": "T8-T9",
        "name": "Pinheirinho (T8-T9)",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "260→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Tricky chicane with camber changes. Brake at 75m, flow through. The bumps can unseat the car.",
            "tipFr": "Chicane délicate avec changements de dévers. Freinez à 75m, enchaînez. Les bosses peuvent désarçonner la voiture."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "245→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Bumpy through here — be smooth on inputs.",
            "tipFr": "Freinez à 100m. Bosselé ici — soyez fluide sur les gestes."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "215→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Take the chicane carefully — the bumps can bite.",
            "tipFr": "Freinez à 100m. Prenez la chicane avec soin — les bosses peuvent mordre."
          }
        }
      },
      {
        "number": "T11",
        "name": "Mergulho (T11)",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "50m board",
            "speed": "220→100 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Blind downhill entry. Brake before you can see the apex. Commit and let it flow.",
            "tipFr": "Entrée aveugle en descente. Freinez avant de voir l'apex. Engagez-vous et laissez couler."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "205→90 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Blind corner — trust your reference points.",
            "tipFr": "Freinez à 75m. Virage aveugle — faites confiance à vos repères."
          },
          "gt3": {
            "marker": "75m board",
            "speed": "185→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Build confidence here — it's blind and quick.",
            "tipFr": "Freinez à 75m. Gagnez en confiance ici — c'est aveugle et rapide."
          }
        }
      },
      {
        "number": "T12-T15",
        "name": "Junção / Subida dos Boxes",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "270→90 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Long uphill section leading to the pit straight. Brake at 75m, nail the exit to maximize straight speed.",
            "tipFr": "Longue section montante vers la ligne droite des stands. Freinez à 75m, soignez la sortie pour maximiser la vitesse en ligne droite."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "255→85 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. The uphill exit is key — get on the power cleanly.",
            "tipFr": "Freinez à 75m. La sortie en montée est clé — reprenez les gaz proprement."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "225→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Uphill section — patience on exit for the main straight.",
            "tipFr": "Freinez à 100m. Section montante — patience en sortie pour la ligne droite principale."
          }
        }
      }
    ]
  },
  {
    "id": "road-atlanta",
    "name": "Road Atlanta",
    "location": "Braselton, USA",
    "corners": [
      {
        "number": "T1",
        "name": "Turn 1",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "290→110 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Right-hander at the top of a hill. Brake at 75m, late apex to set up the downhill exit.",
            "tipFr": "Droite au sommet d'une colline. Freinez à 75m, apex tardif pour préparer la sortie en descente."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "270→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. The crest at entry makes it tricky — be conservative at first.",
            "tipFr": "Freinez à 100m. La crête à l'entrée rend ça délicat — soyez conservateur au début."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "240→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. The crest can unsettle the car — be smooth under braking.",
            "tipFr": "Freinez à 100m. La crête peut déstabiliser la voiture — soyez fluide au freinage."
          }
        }
      },
      {
        "number": "T3",
        "name": "Turn 3 (Bus Stop)",
        "type": "chicane",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "250→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Sharp chicane. Brake hard at 75m, nail both apexes. Tight and technical.",
            "tipFr": "Chicane vive. Freinez fort à 75m, visez les deux apex. Serré et technique."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "235→75 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Tight chicane — be precise.",
            "tipFr": "Freinez à 75m. Chicane serrée — soyez précis."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "210→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Don't cut too aggressively — stay clean.",
            "tipFr": "Freinez à 100m. Ne coupez pas trop agressivement — restez propre."
          }
        }
      },
      {
        "number": "T5",
        "name": "Turn 5 (Esses)",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Flat / lift",
            "speed": "270→230 km/h",
            "gear": "5th-6th",
            "pressure": "Very light",
            "tip": "Famous high-speed esses. Near-flat in a Hypercar. Trust the downforce and find a rhythm.",
            "tipFr": "Célèbre esse à haute vitesse. Presque à plat en Hypercar. Faites confiance à l'appui et trouvez un rythme."
          },
          "lmp2": {
            "marker": "Light brake",
            "speed": "255→215 km/h",
            "gear": "5th",
            "pressure": "Light",
            "tip": "Light brake at entry. The esses flow — don't fight the car.",
            "tipFr": "Léger frein à l'entrée. Les esses s'enchaînent — ne combattez pas la voiture."
          },
          "gt3": {
            "marker": "Brake at entry",
            "speed": "225→185 km/h",
            "gear": "4th",
            "pressure": "Moderate",
            "tip": "A proper brake at entry is needed. The GT3 can't take the esses flat.",
            "tipFr": "Un vrai freinage à l'entrée est nécessaire. La GT3 ne peut pas prendre les esses à plat."
          }
        }
      },
      {
        "number": "T7",
        "name": "Turn 7",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "260→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Downhill into a tight hairpin. Brake at 75m — downhill means extra care with locking.",
            "tipFr": "Descente dans une épingle serrée. Freinez à 75m — la descente exige une attention particulière pour ne pas bloquer."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "245→60 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Downhill approach — stay straight on initial braking.",
            "tipFr": "Freinez à 75m. Approche en descente — restez droit au freinage initial."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "215→50 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Big downhill stop — be very progressive.",
            "tipFr": "Freinez à 100m. Gros arrêt en descente — soyez très progressif."
          }
        }
      },
      {
        "number": "T10A",
        "name": "Turn 10A",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Flat",
            "speed": "300+ km/h",
            "gear": "7th",
            "pressure": "None",
            "tip": "Blind, flat-out kink under the bridge. Huge commitment required. One of the most challenging moments on the calendar.",
            "tipFr": "Déviation aveugle à plein régime sous le pont. Engagement immense requis. L'un des moments les plus difficiles du calendrier."
          },
          "lmp2": {
            "marker": "Flat / very slight lift",
            "speed": "280+ km/h",
            "gear": "6th-7th",
            "pressure": "None / minimal",
            "tip": "Should be flat. The car tracks well — trust it.",
            "tipFr": "Devrait être à plat. La voiture tient bien la trajectoire — faites-lui confiance."
          },
          "gt3": {
            "marker": "Slight lift",
            "speed": "255→240 km/h",
            "gear": "6th",
            "pressure": "Very light",
            "tip": "A slight lift may be needed. Build confidence gradually — big consequences here.",
            "tipFr": "Une légère levée de pied peut être nécessaire. Gagnez en confiance progressivement — grandes conséquences ici."
          }
        }
      },
      {
        "number": "T12",
        "name": "Turn 12",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "280→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Last corner. Brake at 75m, late apex, and power onto the main straight.",
            "tipFr": "Dernier virage. Freinez à 75m, apex tardif et accélérez sur la ligne droite principale."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "260→90 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Exit is critical for the long straight.",
            "tipFr": "Freinez à 100m. La sortie est critique pour la longue ligne droite."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "230→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Focus on the exit — straight speed defines your lap time.",
            "tipFr": "Freinez à 100m. Concentrez-vous sur la sortie — la vitesse en ligne droite définit votre temps au tour."
          }
        }
      }
    ]
  },
  {
    "id": "cota",
    "name": "Circuit of the Americas",
    "location": "Austin, USA",
    "corners": [
      {
        "number": "T1",
        "name": "Turn 1",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "300→110 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Uphill braking into T1. The gradient helps stop the car. Brake at 75m, late apex at the top.",
            "tipFr": "Freinage en montée vers T1. Le dénivelé aide à arrêter la voiture. Freinez à 75m, apex tardif au sommet."
          },
          "lmp2": {
            "marker": "100m board",
            "speed": "280→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Uphill helps — use it. Can't see the apex until late.",
            "tipFr": "Freinez à 100m. La montée aide — profitez-en. Impossible de voir l'apex jusqu'à la fin."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "250→85 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. The hill is your friend — brake hard and climb to the apex.",
            "tipFr": "Freinez à 100m. La colline est votre alliée — freinez fort et montez vers l'apex."
          }
        }
      },
      {
        "number": "T2-T9",
        "name": "Turn 2-9 (Maggots)",
        "type": "fast_corner",
        "braking": {
          "hypercar": {
            "marker": "Light brakes / lifts",
            "speed": "250→180 km/h",
            "gear": "4th-5th",
            "pressure": "Very light",
            "tip": "Long sequence of fast esses flowing downhill. Light brakes at each apex. Find a rhythm — it's a flowing section.",
            "tipFr": "Longue séquence d'esses rapides en descente. Légers freinages à chaque apex. Trouvez un rythme — c'est une section fluide."
          },
          "lmp2": {
            "marker": "Light brakes",
            "speed": "235→165 km/h",
            "gear": "4th",
            "pressure": "Light",
            "tip": "Flow through the esses with light braking. Smooth and rhythmical.",
            "tipFr": "Enchaînez les esses avec de légers freinages. Fluide et rythmé."
          },
          "gt3": {
            "marker": "Brake at each apex",
            "speed": "210→150 km/h",
            "gear": "3rd-4th",
            "pressure": "Moderate",
            "tip": "Need a brake at each major direction change. Don't rush — this section catches out many drivers.",
            "tipFr": "Freinage nécessaire à chaque grand changement de direction. Ne forcez pas — cette section piège beaucoup de pilotes."
          }
        }
      },
      {
        "number": "T6",
        "name": "Turn 6",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "50m board",
            "speed": "220→70 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Tight left after a short straight. Quick brake at 50m, heavy trail brake to rotate.",
            "tipFr": "Gauche serré après une courte ligne droite. Freinage rapide à 50m, lestage lourd pour faire pivoter."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "205→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Tight hairpin — brake hard and turn in late.",
            "tipFr": "Freinez à 75m. Épingle serrée — freinez fort et tournez tard."
          },
          "gt3": {
            "marker": "75m board",
            "speed": "185→55 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Slow the car right down for this tight left.",
            "tipFr": "Freinez à 75m. Ralentissez considérablement pour ce gauche serré."
          }
        }
      },
      {
        "number": "T11",
        "name": "Turn 11",
        "type": "slow_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "280→65 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Hairpin at the end of the back straight. Brake at 75m, deep trail brake. Classic overtaking spot.",
            "tipFr": "Épingle en fin de ligne droite du fond. Freinez à 75m, lestage profond. Point de dépassement classique."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "260→60 km/h",
            "gear": "2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Big stop into a tight hairpin. Perfect your trail braking here.",
            "tipFr": "Freinez à 75m. Gros arrêt dans une épingle serrée. Perfectionnez votre lestage ici."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "230→50 km/h",
            "gear": "1st-2nd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Huge braking zone into the hairpin. Late apex for the exit.",
            "tipFr": "Freinez à 100m. Énorme zone de freinage dans l'épingle. Apex tardif pour la sortie."
          }
        }
      },
      {
        "number": "T12",
        "name": "Turn 12",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "50m board",
            "speed": "240→120 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Fast left after the hairpin. Quick brake and commit. Leads into the fast sector.",
            "tipFr": "Gauche rapide après l'épingle. Freinage rapide et engagement. Mène dans le secteur rapide."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "225→110 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Get it right here to flow through the following section.",
            "tipFr": "Freinez à 75m. Soyez juste ici pour fluidifier la section suivante."
          },
          "gt3": {
            "marker": "75m board",
            "speed": "200→95 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Carry as much speed as you can without running wide.",
            "tipFr": "Freinez à 75m. Portez autant de vitesse que possible sans partir large."
          }
        }
      },
      {
        "number": "T15",
        "name": "Turn 15",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "50m board",
            "speed": "275→130 km/h",
            "gear": "4th",
            "pressure": "Heavy",
            "tip": "Right-hander at the end of a quick section. Brake at 50m, late apex.",
            "tipFr": "Droite en fin de section rapide. Freinez à 50m, apex tardif."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "255→120 km/h",
            "gear": "3rd-4th",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Get the car slowed and turned in together.",
            "tipFr": "Freinez à 75m. Ralentissez la voiture et tournez simultanément."
          },
          "gt3": {
            "marker": "75m board",
            "speed": "230→100 km/h",
            "gear": "3rd",
            "pressure": "Heavy",
            "tip": "Brake at 75m. Don't overdrive — the track gets narrow here.",
            "tipFr": "Freinez à 75m. Ne sur-conduisez pas — la piste se rétrécit ici."
          }
        }
      },
      {
        "number": "T19-T20",
        "name": "Turn 19-20",
        "type": "medium_corner",
        "braking": {
          "hypercar": {
            "marker": "75m board",
            "speed": "290→100 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Penultimate corners. Brake at 75m, flow through left-right. Exit speed onto the main straight is key.",
            "tipFr": "Avant-derniers virages. Freinez à 75m, enchaînez gauche-droite. La vitesse de sortie sur la ligne droite principale est clé."
          },
          "lmp2": {
            "marker": "75m board",
            "speed": "270→90 km/h",
            "gear": "3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 75m. Two quick corners before the straight — nail the exit.",
            "tipFr": "Freinez à 75m. Deux virages rapides avant la ligne droite — soignez la sortie."
          },
          "gt3": {
            "marker": "100m board",
            "speed": "240→80 km/h",
            "gear": "2nd-3rd",
            "pressure": "Very heavy",
            "tip": "Brake at 100m. Focus on carrying the best exit speed you can onto the long straight.",
            "tipFr": "Freinez à 100m. Concentrez-vous sur la meilleure vitesse de sortie possible sur la longue ligne droite."
          }
        }
      }
    ]
  }
];
