# Rapport final de remédiation scientifique — 21 septembre 2026

> Rapport historique daté. Les effectifs, résultats de tests et indications sur
> le déploiement ci-dessous décrivent l'état du 21 septembre 2026.

Référence : `7300b5cb170c2eb034a9e445ba4ede3cbeb3e22a`.
Périmètre logiciel A/B et quatre gates terminés ; adjudications expérimentales
explicitement non résolues. Aucun push, déploiement ou remplacement du pack
historique. Ceci n'est pas une certification expérimentale des données.

## A. Corrections appliquées

| Commits locaux | Responsabilités principales |
| --- | --- |
| 55f66bf, 71c4238 | Garde-fous JV/cohortes, regroupement conservateur, export traçable. |
| ae3639f | `jv-science.ts` : validations séparées, cohérence sévère, répétitions exactes/proches/multiplicatives ; contrôles Orange C/R. |
| 12a0362 | Normalisation et missingness traçables ; analyses appariées, `staged-ageing.ts`, `synchronized-metrics.ts` et interfaces associées. |
| 453a77e | `rebuild-from-raw.ts`, parsers, boundary et registry ; sensibilité Outdoor et flags métriques ; rapport de reconstruction. |
| 9e11f83 | `trendDisplayValues`/`trendIntervalVisible`, styles déterministes, `figureManifest`/`figureCsv`, `jvSelectionLedger`, exports complets JV, UI Outdoor et régressions finales. |

Les règles et seuils sont décrits dans [SCIENTIFIC_METHODS.md](../science/SCIENTIFIC_METHODS.md).
Les calculs restent dans les modules de domaine ; React possède les sélections
d'affichage. Les diagnostics ne réécrivent pas les mesures instrumentales.

## B. Problèmes résolus et preuves

- **Validation JV implicite** : cohérence numérique, unités, plage et validation
  expérimentale sont distinctes. Les conversions legacy ne suffisent plus à
  rendre une courbe quantitativement éligible. Le jeu actuel comporte 5 116
  diagnostics et aucune JV quantitativement éligible sans adjudication.
- **Segments suspects et représentativité** : 6 936 segments sur 3 468 mesures
  sont signalés par le dépistage conservateur. Cela ne prouve pas leur origine.
  Ils ne peuvent pas devenir automatiquement principaux. Dupliquer 100 sweeps
  et leurs courbes ne change pas le specimen représentatif SMP-222.
- **17 avril** : les 138 sweeps des 12 fichiers V–I restent en quarantaine.
- **Orange** : référence R correcte, contradictoire, absente et ambiguë testées ;
  une contradiction future échoue explicitement au lieu de réutiliser le lien.
- **Remontée EVA TC** : les entrées/sorties de cohorte sont traçables ; la
  remontée à 100 cycles porte un avertissement de composition, sans diagnostic
  automatique de biais de survie. Une absence n'est ni un zéro ni une panne.
- **Petits effectifs** : tous les points sont visibles, médiane par défaut ;
  n=1 sans intervalle, n=2 sans IQR. L'IC optionnel reste non tronqué et averti.
  Les échelles suivent les éléments dessinés, y compris les points hors IQR.
- **Appariement** : deltas individuels, médiane/moyenne et ratio des moyennes
  sont distincts. Dates inconnues, dénominateurs nuls et temps exact absent ne
  reçoivent aucune valeur inventée. Les quatre métriques partagent une grille.
- **Exports** : CSV de figure et sélection complète séparés ; vrais V/J et
  indices sources pour JV ; contributeurs analytiques et visibles distincts.
  Graph end est analytique, le viewport visuel. Captions et manifestes tracent
  hypothèses, QA, sources, version, normalisation, filtres et exclusions.
- **Reproductibilité** : reconstruction raw + code + registry, sans lecture du
  pack final comme entrée analytique ; deux candidats de hash identique.

## C. Questions encore ouvertes — laboratoire uniquement

Voir [LAB_QUESTIONS.md](../science/LAB_QUESTIONS.md) : unités/surface des fichiers V–I du
17 avril ; origine et plage des segments répétés ; hiérarchie specimen/pixel/
substrate/channel ; indépendance des batches ; équivalence formulations/recettes
et validité des électrodes Ag ; causes de disparition ; conditions de mesure,
stockage et vieillissement ; définition instrumentale du PR Outdoor.

Tous ces points restent unresolved. Une décision future exige une source, un
motif, une cible et une version ; elle ne sera pas appliquée implicitement.

## D. Résultats et sélections qui changent

| Diagnostic | Résultat actuel et interprétation |
| --- | --- |
| EVA TC, observations disponibles | À 20/50/100 cycles : n=2/5/2 et moyennes 99,0471 / 39,9467 / 98,4990 %. La composition change. |
| EVA TC, cohorte constante 0–100 | n=2 ; moyenne à 50 cycles 99,8668 %. Ce n'est pas une correction des cellules disparues mais une autre population analytique. |
| Exemple IC avec valeurs 60 et 120 | Moyenne 90 ; IC95 de Student n=2 ≈ −291,18 à 471,18. La borne haute n'est pas une mesure de cellule à 471 %. |
| Outdoor 100/200/300 W/m² | 126 163 / 105 343 / 91 217 lignes retenues avant les diagnostics par métrique ; B3/B7/B14 sont explicites. |
| Before/Post/Aged EVA/TF4 TC | Temps exact 50 : n=4/9/9 ; temps exact 51 : n=4/9/0. Trois zéros mesurés conservés à 50. |
| JV legacy | Quantitatif par défaut indisponible ; inspection volontaire et signalée, pas suppression des sources. |
| Candidat reconstruit | Valeurs numériques/IDs/matching/courbes comparés identiques ; métadonnées différentes, dont 58 nouveaux flags QA conservateurs. Non publié, non substitué au pack actuel. |

Le candidat normalise aussi des commentaires nuls, flags Outdoor manquants,
identifiants numériques formatés et métadonnées d'une courbe vide. Ces écarts
sont énumérés dans le rapport de reconstruction ; l'équivalence analytique
n'est pas une identité binaire avec l'ancien pack.

## E. Tests et validations

- 87 tests unitaires réussis, zéro échec ; un test HTML serveur réussi.
- `pnpm typecheck`, `pnpm test` (incluant build), `pnpm lint`,
  `pnpm data:verify:deep` réussis ; `git diff --check` sans erreur.
- Régressions synthétiques et données réelles : métrologie non validée,
  incohérences, répétitions, duplication, cohortes, QA, zéros/absences,
  statistiques n=1/2/3, Outdoor, appariement, exports et frontières du rebuild.
- Neuf vues exercées dans le navigateur : [UI_VALIDATION.md](UI_VALIDATION.md).
  Reconstruction CSV/manifeste vérifiée pour DH, Outdoor et JV ; PNG décodés et
  SVG inspectés. **Livraison native dans Downloads non confirmée dans l'IAB** :
  panneau de fichiers préparés, copie des contenus et aperçus vérifiés. Ne pas
  confondre cette limite de vérification du navigateur avec un export calculé faux.
- Deux clean-room runs : candidat SHA-256
  `4877f0e58762e2b15e17eac93432e8e2972bbc3377456c4eab4b54f9339c5f10`.
  135 specimens, 22 recettes, 1 587 observations, 409 fichiers, 5 116 mesures,
  1 043 400 points, 5 115 courbes non vides ; 203 122 lignes Outdoor brutes.
- Pack historique toujours SHA-256
  `cb64ac75e1eca0f6c6ba3fa55405cea13dd5c264e6d535a311d90c035820b344`.
  Détails et procédure : [RAW_REBUILD.md](../data/RAW_REBUILD.md).

Analyse adverse : un pack cohérent peut rester métrologiquement faux ; une
absence peut être informative sans cause connue ; un regroupement peut masquer
un effet de batch ; un IC avec très petit n peut être immense. Les garde-fous
signalent/excluent selon le cas, sans inventer une correction physique. Le
rebuild refuse les sorties dans le dépôt, les chemins détournés par symlink,
les répertoires occupés, les hashes modifiés et les décisions non prises en
charge. Aucune nouvelle dépendance ni mutation de production n'est requise.

## F. Figures utilisables dans le TM comme résultats descriptifs

Chaque vue fournit PNG/SVG, CSV analytique, sélection complète, manifeste et
caption méthodologique. Conserver ensemble la figure, sa caption et son manifeste.

| Figure | Conditions et limites à conserver dans la caption |
| --- | --- |
| Before/Post PCE | Même cellule, formulation/batch/process séparés, QA, n et dates connues ; les délais ne sont pas des durées de lamination. Pas de causalité attribuée au seul encapsulant. |
| Before/Post/Aged | PCE absolue ou aged/post explicitement nommé ; protocole et temps exact/dernier commun, effectifs des trois étapes et absences visibles. |
| DH/TC individuel ou cohorte constante | Référence Unaged, fenêtre, unités, identités ; ne pas comparer silencieusement des populations ou durées différentes. |
| DH/TC agrégat disponible | Nommer le mode, n variable et composition ; montrer les observations, médiane/IQR ; IC optionnel non robuste à petit n. |
| PCE/Jsc/Voc/FF synchronisés | Même grille specimen/temps/protocole, QA métrique explicite ; diagnostic descriptif, pas preuve de mécanisme. |
| Outdoor sensibilité | Seuils, Daily Median, B7 principal et B3/B14 diagnostics ; les dernières dates peuvent différer. PR dépend de la définition logger non adjudicée. |

Les captions sont générées à partir des sélections effectives ; les limites
scientifiques peuvent figurer dans le texte du rapport plutôt que surcharger
le dessin. Couleurs, motifs, unités et styles d'export restent déterministes.

## G. Figures ou données encore conditionnelles

- **JV quantitative, avant/après ou vieillissement** : unités, plage acquise et
  preuves expérimentales manquent. Les vues d'inspection peuvent illustrer une
  question à discuter au labo, pas soutenir seules une perte de Jsc/Voc causale.
- **Classement causal des matériaux/batches** : indépendance, recettes et
  conditions non établies. Comparaisons descriptives possibles, attribution
  causale non établie.
- **PR Outdoor absolu interprété métrologiquement** : définition instrumentale
  à confirmer. Sensibilité calculable, mais pas validation du PR lui-même.
- **Pannes/disparitions** : les causes inconnues ne sont pas imputées. Une
  remontée associée à une composition changeante reste une alerte, non une preuve.
- **Inférence populationnelle à petits n** : pas de robustesse garantie par un
  boxplot ou un IC calculable ; les observations individuelles restent centrales.

Fin du périmètre logiciel demandé. Les données brutes, sauvegardes et service
en production sont conservés ; une publication nécessite une demande distincte.
