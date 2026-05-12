# Instructions pour Claude (et tout assistant IA)

## À lire en premier

**Avant toute action sur ce projet, lis `HANDOFF.md` à la racine.**
Il contient tout le contexte : décisions prises, état actuel, architecture cible, plan d'implémentation, points ouverts.

## Maintenance de HANDOFF.md

**À chaque session de travail, mets à jour `HANDOFF.md`** :

1. Si tu prends une nouvelle décision structurante → met à jour la section 2 (Décisions verrouillées)
2. Si tu termines / commences une phase → met à jour la section 4 (État actuel) et 6 (Plan)
3. Si tu résous un point ouvert ou en découvres un nouveau → met à jour la section 7
4. **Toujours** : ajoute une entrée datée dans la section 11 (Journal de bord) résumant ce qui a été fait

Format de l'entrée du journal :
```
### YYYY-MM-DD — Titre court
- ✅ Ce qui a été fait
- ⏳ Ce qui est en attente
- ❌ Ce qui a échoué / a été bloqué (et pourquoi)
- 📋 Prochaine étape concrète
```

## Langue

- **Réponses à l'utilisateur** : français
- **Documentation et commentaires de code** : français
- **Code, variables, noms de fichiers** : anglais
- **Strings UI** : français pour le POC, à passer en `t("key")` (react-i18next) dans la v2 réelle

## Conventions techniques

Cf. section 10 de HANDOFF.md.
