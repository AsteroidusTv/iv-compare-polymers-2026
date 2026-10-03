# Précisions du responsable de l'étude — 3 octobre 2026

Source : déclarations de l'utilisateur dans la conversation de revue UI/UX,
le 3 octobre 2026. Il s'agit de précisions générales sur l'étude, et non de
certificats de calibration ou de validations individuelles de chaque fichier.

| Sujet | Précision confirmée | Limite restante |
| --- | --- | --- |
| Identité | Un `sample_uid` représente une cellule | Dépendances entre cellules/substrats et indépendance des batches non précisées |
| Valeur retenue | Des JV successives sont réalisées sous light soaking ; le rendement augmente vers un plateau. Le plateau est reconnu lorsque le rendement cesse d'augmenter et sa valeur est retenue | Pas de seuil de variation, nombre de scans ou durée minimale précisé. La variabilité et cette limite méthodologique seront expliquées dans le rapport. Une valeur issue de JV au plateau n'est pas automatiquement une mesure MPP stabilisée indépendante |
| Équipement | [ADTEC Super Solar Simulator](https://www.adtec.com/english/products/detail.html?pdid=10420) | La fiche fabricant décrit une famille de simulateurs à lumière continue utilisant des sources xénon et halogène. Modèle exact, paramètres d'acquisition et calibration de l'appareil utilisé restent à documenter |
| DH | 85 °C, 85 % d'humidité relative | Journaux de conditions, interruptions et dates exactes non fournis |
| TC | −40 à 85 °C | Rampes, paliers et définition opérationnelle du cycle non fournis |
| Light ageing | 1 sun, 40 °C | Conditions nominales déclarées ; cela ne fournit pas une preuve de calibration ou une puissance incidente par mesure. Pout Pearl reste conservé comme Pout |
| Arrêt de suivi | Panne des cellules | Dates et identifiants individuels des pannes non encodés pour chaque absence. Une absence reste une absence, pas un zéro inventé |
| Stockage | Dans le noir, dans une petite boîte sous azote ; durée variable | L'intervalle disponible peut être affiché. Les différences temporelles et l'historique des mesures restent des facteurs de comparaison |
| Labels | Tous les labels confirmés, dont Ag/Cu | Confirmation des labels ≠ équivalence des formulations. Les liens fichier/cellule provisoires restent provisoires |
| PR Outdoor | Normalisation standard selon le responsable | Une comparaison empirique des formules est demandée ; voir le diagnostic PR. La référence et les unités doivent être distinguées de la formule numérique |
| Surface active Outdoor | 1 cm², confirmé après le diagnostic PR | L'utilisateur n'a pas encore précisé l'unité de la colonne Pmpp brute. Avec cette surface, la relation numérique observée est compatible avec Pmpp en mW ; le package utilise actuellement l'étiquette W. Ne pas transformer les bruts sur la seule base d'une étiquette supposée |

La règle du plateau au laboratoire et la sélection représentative proche de
la médiane dans le site répondent à des objectifs différents. Le site ne
détecte pas automatiquement le plateau, ne choisit pas automatiquement le
maximum et ne prétend pas que le sweep affiché est celui retenu par le
laboratoire sans lien source explicite.

Ces précisions mettent à jour le guide et les infobulles, sans modifier les
observations, les filtres QA, les calculs ou le statut de validation des JV.
