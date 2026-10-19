# Banc de reconnaissance vocale : tes enregistrements

But : comparer Vosk (notre moteur actuel), Parakeet et Whisper **sur ta voix, avec ton
micro**. Les mêmes 40 phrases sont aussi dites par les voix de synthèse (premier tri).

## Comment enregistrer (≈ 10 minutes)

1. Prends **le micro avec lequel tu roules** (RØDE, casque SteelSeries ou micro du Pimax
   en VR). Si possible, laisse tourner un peu le son du jeu ou d'un replay, comme en course.
2. Dans un terminal, à la racine du projet :

   ```
   python -I scripts/stt-eval/record.py --list
   ```

   repère le numéro de ton micro, puis :

   ```
   python -I scripts/stt-eval/record.py --device <numéro>
   ```

3. Pour chaque phrase : **Entrée**, tu parles comme à la radio, **Entrée**.
   `r` refait la précédente, `s` la passe, `q` quitte (ça reprend où tu t'es arrêté).
4. Parle naturellement, à ton débit de course : on veut mesurer la vraie vie, pas une
   lecture appliquée. Les fichiers vont dans `stt-eval/wav/moi/`.

## Les 40 phrases

| N° | Famille | Phrase |
|---|---|---|
| 01 | question | Quel est l'écart avec la voiture devant ? |
| 02 | question | Il me reste combien d'essence ? |
| 03 | question | C'était combien mon dernier tour ? |
| 04 | question | Il reste combien de tours ? |
| 05 | question | Je suis en quelle position dans ma classe ? |
| 06 | question | Comment sont mes pneus ? |
| 07 | question | Quand est-ce que je dois m'arrêter ? |
| 08 | question | Qui est derrière moi ? |
| 09 | numéro | Où est la quatorze ? |
| 10 | numéro | Préviens-moi quand la cinquante et un rentre au stand. |
| 11 | numéro | La sept est à combien de moi ? |
| 12 | numéro | Quel est l'écart avec la quatre-vingt-treize ? |
| 13 | numéro | La trente-huit vient de rentrer au stand ? |
| 14 | numéro | Est-ce que la deux est plus rapide que moi ? |
| 15 | virage | Je sous-vire à Tertre Rouge. |
| 16 | virage | Je perds du temps dans les virages Porsche. |
| 17 | virage | La voiture survire en sortie de la Parabolica. |
| 18 | virage | Je bloque les roues au freinage d'Arnage. |
| 19 | virage | Eau Rouge, ça passe à fond ? |
| 20 | virage | Je rate mon freinage au Bus Stop. |
| 21 | virage | Ça glisse à la sortie d'Indianapolis. |
| 22 | virage | Je perds du temps à Lesmo un. |
| 23 | quantité | Mets vingt litres au prochain arrêt. |
| 24 | quantité | Énergie à quatre-vingt-cinq pour cent. |
| 25 | quantité | Préviens-moi quand le carburant passe sous dix pour cent. |
| 26 | quantité | Je fais encore trois tours et je rentre. |
| 27 | quantité | Change les quatre pneus et répare tout. |
| 28 | quantité | Préviens-moi quand il reste cinq minutes. |
| 29 | jargon | Je monte l'antipatinage d'un cran ? |
| 30 | jargon | Il faut assouplir la barre antiroulis avant ? |
| 31 | jargon | On met des pneus pluie ou on reste en medium ? |
| 32 | jargon | Est-ce qu'on fait l'undercut sur la voiture devant ? |
| 33 | jargon | Je baisse le répartiteur de freinage ? |
| 34 | jargon | Combien de relais on fait avec ces gommes ? |
| 35 | commande | Je rentre au stand ce tour. |
| 36 | commande | Je reste dehors. |
| 37 | commande | Répète. |
| 38 | libre | Est-ce que je peux tenir jusqu'à la fin avec ces pneus ? |
| 39 | libre | Pourquoi je perds du temps dans le secteur deux ? |
| 40 | libre | La voiture est instable au freinage, qu'est-ce que je peux changer ? |

La source des phrases (avec les mots qui doivent absolument être compris) est
`scripts/stt-eval/corpus.json`.
