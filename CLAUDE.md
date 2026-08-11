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

## Changelog utilisateur

Toute modification visible par l'utilisateur (correctif, nouveauté, changement de
comportement) doit être **loguée dans `src/lib/changelog.ts`** dans la foulée, sans
attendre la publication : entrée de la prochaine version, `dev: true` tant qu'elle
n'est pas sortie, `localized: true` avec les 4 langues. `SUIVI.md` (section 8) est le
journal *technique* — il ne remplace pas le changelog *utilisateur*.

## Règle d'or

La migration depuis la V1 PHP est **terminée** : la V3 fait foi. Les calculs et affichages se basent sur le code TypeScript/Rust actuel et sur `SUIVI.md` (règles métier verrouillées). La V1 PHP n'est plus une référence.

## Langue

- Réponses utilisateur + documentation + commentaires : français.
- Code, variables, noms de fichiers : anglais.
- Strings UI : via `t("key")` (react-i18next), 4 langues FR/EN/ES/DE.
