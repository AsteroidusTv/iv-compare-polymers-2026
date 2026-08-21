# IV Compare

Application interne de comparaison des polymères d’encapsulation, des courbes IV et des mesures Outdoor après vieillissement DH, TC ou exposition extérieure.

## Données acceptées

- un fichier compact `.ivpack` produit par `scripts/build_ivpack.py` ;
- ou le classeur normalisé `data/processed/IV_dataset_normalise_Outdoor.xlsx` et le fichier `data/processed/IV_curve_points.tsv`, sélectionnés ensemble.

Les imports restent dans le navigateur et ne sont pas envoyés vers un serveur. Les fichiers ambigus ou non appariés sont exclus des comparaisons par défaut, et les mesures portant un indicateur QA restent désactivées tant que l’utilisateur ne les inclut pas.

## Fonctions principales

- comparaison de deux familles de polymères ou davantage ;
- filtres par vieillissement, électrode et recette de lamination ;
- rendement, Jsc, Voc ou FF en valeur absolue ou en rétention par rapport à l’état initial ;
- agrégation par moyenne, médiane ou meilleure valeur ;
- comparaison des courbes IV au temps commun ou le plus proche ;
- export CSV de la sélection.

## Organisation des données

- `data/raw/IV/` : inventaire `Summary.xlsx` et fichiers `.xls` originaux du simulateur solaire ;
- `data/raw/Outdoor/` : fichiers CSV originaux des loggers Outdoor ;
- `data/processed/IV_dataset_normalise_Outdoor.xlsx` : inventaire relationnel, appariements, métadonnées IV et agrégats Outdoor journaliers ;
- `data/processed/IV_curve_points.tsv` : 743 140 points de courbe IV normalisés ;
- `data/processed/Outdoor_raw_measurements.tsv` : 203 122 mesures Outdoor brutes normalisées et traçables ;
- `data/processed/IV_Compare_DOWSIL.ivpack` : paquet compact directement importable dans le site ;
- `data/context/` : présentation et publication utilisées comme contexte scientifique.

Les sources ne sont pas modifiées. Chaque observation normalisée conserve les identifiants et chemins nécessaires pour revenir au patch et au fichier d’origine. Les fichiers volumineux sont versionnés avec Git LFS.

## Développement

```bash
pnpm install
pnpm run dev
```
