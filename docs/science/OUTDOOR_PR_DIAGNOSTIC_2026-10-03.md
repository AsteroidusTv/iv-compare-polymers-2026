# Diagnostic de la formule PR Outdoor — 3 octobre 2026

## Conclusion

Les données sont très fortement compatibles avec une normalisation instantanée
proportionnelle à Pmpp / irradiance, avec une référence constante propre à chaque
cellule. Pour les 21 fichiers testables, la référence numérique retrouvée correspond
à la PCE Unaged de l'inventaire. Cette seconde vérification n'ajuste aucun paramètre.
Le calcul interne du logger et ses réglages ne sont pas directement observés.

Relation numérique observée (les unités brutes de Pmpp restent à confirmer) :

`PR_pct ≈ 100000 × Pmpp_brut / (G_W_m2 × PCE_Unaged_pct)`

Avec la surface active déclarée de **1 cm²**, cette relation est physiquement
cohérente si Pmpp est en **mW** : Pin_mW = 0,1 × G_W_m2, eta_outdoor_pct =
1000 × Pmpp_mW / G, puis PR_pct = 100 × eta_outdoor_pct / eta_Unaged_pct.
Le package interprète actuellement Pmpp comme W, alors que le CSV n'affiche
pas d'unité dans son en-tête. C'est une incohérence d'unité à résoudre, pas une
autorisation de changer silencieusement les valeurs sources.

Le PR du logger ainsi normalisé et la rétention du site (PR / référence B7)
sont deux normalisations distinctes. Cette analyse ne remplace ni l'un ni l'autre.

## Méthode et couverture

- 406346 lignes dans le TSV actif, 23 fichiers sources, 303544 triplets positifs et finis PR/Pmpp/G.
- Analyse principale : G ≥200 W/m², flags QA enregistrés dans les lignes brutes exclus. Pas d'exclusion fondée sur le résidu, ni application additionnelle des heuristiques de QA quotidienne du site.
- 21 fichiers testés. Deux fichiers n'ont pas assez de triplets/dates éligibles pour le diagnostic.
- Par fichier : première moitié des dates pour ajuster une constante, seconde moitié pour vérifier (91167 mesures d'ajustement, 93425 de vérification). Aucun jour partagé entre les deux moitiés d'un même fichier.
- Un fichier doit fournir au moins quatre dates et quarante mesures, avec au moins vingt mesures dans chaque moitié.
- Référence ajustée : médiane des PR × G / Pmpp sur les jours d'ajustement. Même constante conservée pour les jours ultérieurs.
- Validation indépendante de l'inventaire : référence PCE Unaged unique et positive ; aucun paramètre estimé sur les valeurs PR.
- Première et dernière ligne éligibles de chacun des 21 fichiers réconciliées avec les CSV archivés (42 triplets). Hashes du TSV, de l'inventaire et de ces CSV enregistrés dans le JSON associé.

## Comparaison sur les mesures réservées

Les erreurs sont des **points de pourcentage de PR**.

| Relation | Erreur absolue moyenne | Erreur absolue au 95e percentile |
| --- | ---: | ---: |
| PR instantané, référence ajustée sur jours antérieurs | 0.003056 | 0.008635 |
| Référence PCE Unaged de l'inventaire, sans ajustement | 0.003055 | 0.008637 |
| Ratio de rendements cumulés dans la journée | 7.878516 | 23.138294 |
| Pmpp seule (contrôle négatif) | 19.340026 | 47.015222 |
| Exposant d'irradiance libre (diagnostic) | 0.007345 | 0.034252 |
| Pmpp/G avec offset (diagnostic) | 0.005543 | 0.017107 |

Le ratio énergétique cumulé est intégré par trapèzes sur les intervalles
contigus éligibles (écart maximal de quinze minutes), depuis le premier point
éligible de chaque journée. Le premier point utilise le ratio instantané.
Ce test ne reproduit pas un calcul énergétique journalier sur des nuits,
trous ou périodes exclues : son écart porte sur la compatibilité avec les
PR enregistrés mesure par mesure, pas sur la validité de la définition énergétique.

Les versions à exposant ou offset libre servent à examiner un écart au modèle
simple. Elles ne constituent pas d'autres définitions standards. Les exposants
estimés par fichier restent proches de 1 et n'améliorent pas la vérification
globale par rapport à la relation simple.

## Sensibilité au seuil d'irradiance

| Seuil G (W/m²), QA brute exclue | Mesures de vérification | Erreur moyenne, modèle simple (pp) |
| --- | ---: | ---: |
| 100 | 108581 | 0.004175 |
| 200 | 93425 | 0.003056 |
| 300 | 80939 | 0.002542 |

Les dates de séparation et les observations éligibles changent entre scénarios.
Ces chiffres testent la robustesse de la relation, pas un effet causal du seuil.
Une quatrième analyse incluant les flags bruts est conservée dans le JSON.

## Références par cellule

La colonne « retrouvée » est une constante numérique conditionnelle à la
convention Gref =1000. Ce n'est pas une puissance STC calibrée en W.

| Cellule | Référence numérique retrouvée | PCE Unaged (%) | Observation source |
| --- | ---: | ---: | --- |
| SMP-160 | 12.400012 | 12.4 | OBS-0197 |
| SMP-177 | 15.300019 | 15.3 | OBS-0220 |
| SMP-179 | 13.800008 | 13.8 | OBS-0223 |
| SMP-103 | 17.200001 | 17.2 | OBS-0127 |
| SMP-112 | 17.099993 | 17.1 | OBS-0139 |
| SMP-114 | 17.599997 | 17.6 | OBS-0142 |
| SMP-063 | 17.299984 | 17.3 | OBS-0076 |
| SMP-066 | 13.699996 | 13.7 | OBS-0081 |
| SMP-067 | 13.400005 | 13.4 | OBS-0083 |
| SMP-080 | 15.099998 | 15.1 | OBS-0099 |
| SMP-048 | 18.799973 | 18.8 | OBS-0057 |
| SMP-021 | 16.899999 | 16.9 | OBS-0026 |
| SMP-062 | 16.900006 | 16.9 | OBS-0074 |
| SMP2-003 | 16.300020 | 16.3 | OBS-0296 |
| SMP2-013 | 15.100008 | 15.1 | OBS-0310 |
| SMP2-036 | 16.299969 | 16.3 | OBS-0344 |
| SMP2-040 | 17.499992 | 17.5 | OBS-0350 |
| SMP2-023 | 16.399982 | 16.4 | OBS-0324 |
| SMP2-024 | 16.000021 | 16 | OBS-0326 |
| SMP2-031 | 16.899999 | 16.9 | OBS-0336 |
| SMP2-032 | 16.700047 | 16.7 | OBS-0338 |

## Définitions et limites

Le PR standard est un rapport de rendements électriques et d'irradiation
normalisés. Son analogue instantané utilise P/P_ref et G/G_ref.
Références : [Sandia PVPMC](https://pvpmc.sandia.gov/modeling-guide/5-ac-system-output/pv-performance-metrics/performance-ratio/)
et [IEA PVPS, Performance Loss Rate, 2021](https://pvpmc.sandia.gov/app/uploads/sites/243/2022/10/IEA-PVPS-T13-22_2021-Assessment-of-Performance-Loss-Rate-of-PV-Power-Systems-report.pdf).

- Un PR corrigé en température ne peut pas être testé indépendamment sans température cellule et coefficient thermique. La compatibilité avec un modèle simple n'est pas une preuve de calibration ou d'absence de toute correction.
- L'accord numérique avec Unaged constitue une forte indication sur la référence utilisée, sans accès à la configuration du logger.
- La médiane quotidienne de PR affichée par le site ne se confond pas avec un PR énergétique calculé par ratio d'intégrales.
- Les fichiers sans irradiance ou PR ne permettent pas ce diagnostic.
- Aucune valeur brute, agrégation quotidienne, QA ou unité du package n'a été modifiée.

Reproduction : `node scripts/analyze-outdoor-pr.mjs`.
Résultats détaillés : `OUTDOOR_PR_DIAGNOSTIC_2026-10-03.json`.
