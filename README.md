# IV Compare

Application de comparaison des polymères d’encapsulation et des courbes IV après vieillissement DH, TC ou Outdoor.

## Données acceptées

- un fichier compact `.ivpack` produit par `scripts/build_ivpack.py` ;
- ou le classeur normalisé `IV_dataset_normalise.xlsx` et le fichier `IV_curve_points.tsv`, sélectionnés ensemble.

Les imports restent dans le navigateur et ne sont pas envoyés vers un serveur. Les fichiers ambigus ou non appariés sont exclus des comparaisons par défaut, et les mesures portant un indicateur QA restent désactivées tant que l’utilisateur ne les inclut pas.

## Fonctions principales

- comparaison de deux familles de polymères ;
- filtres par vieillissement, électrode et recette de lamination ;
- rendement, Jsc, Voc ou FF en valeur absolue ou en rétention par rapport à l’état initial ;
- agrégation par moyenne, médiane ou meilleure valeur ;
- comparaison des courbes IV au temps commun ou le plus proche ;
- export CSV de la sélection.
