# Instructions pour Claude (et tout assistant IA) — LMU Stats Viewer V3

## À lire en premier

**Avant toute action sur ce projet, lire `SUIVI.md` à la racine.**
Il contient : objectif, décisions verrouillées, règles métier extraites de la V1, inventaire des pages, plan par phases, journal de bord.

## Maintenance de SUIVI.md

À **chaque** session de travail :
1. Nouvelle décision structurante → section 2.
2. Phase démarrée / terminée → section 5.
3. Point ouvert résolu/découvert → section 7.
4. **Toujours** : ajouter une entrée datée au Journal de bord (section 8) avec une « Prochaine étape » concrète.

## Règle d'or

La **V1 PHP** (`C:\tmp\__DEV__\OLDLMU_Stats_Viewer_095\htdocs\`) est la **source de vérité fonctionnelle**.
Avant d'implémenter un calcul ou un affichage, consulter le fichier PHP correspondant. Le visuel et la stack viennent de la V2.

## Langue

- Réponses utilisateur + documentation + commentaires : français.
- Code, variables, noms de fichiers : anglais.
- Strings UI : via `t("key")` (react-i18next), 4 langues FR/EN/ES/DE.
