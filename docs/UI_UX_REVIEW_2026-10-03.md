# Revue UI/UX du 3 octobre 2026

## Périmètre et architecture

Le site est une application React 19 servie par Vinext/Vite, avec des routes de
type App Router. `app/page.tsx` orchestre les sélections, les données chargées
localement, la normalisation, les cohortes et les trois analyses. Les composants
de graphiques dessinent des SVG et préparent des exports scientifiques.
`app/lib` sépare les calculs, la QA, les références, le regroupement et la
provenance. Les scripts de reconstruction et de vérification relient les bruts,
les entrées dérivées et les packages du navigateur. Les sources originales,
les données transformées et les packages publics ont des rôles distincts.

La revue s'appuie sur le README, la documentation scientifique et les questions
du laboratoire, ainsi que sur les chemins de calcul effectivement utilisés :
statistiques, QA laboratoire et Outdoor, regroupements, cohortes, sélection JV,
comparaisons appariées et exports. Elle ne constitue pas une nouvelle
adjudication des mesures ni une calibration du laboratoire.

## Problèmes constatés et traitement

| Constat | Conséquence | Modification |
| --- | --- | --- |
| Navigation des analyses située après les réglages | Les utilisateurs devaient comprendre les contrôles avant de choisir leur question | Les trois analyses sont placées immédiatement après le titre, avec une phrase d'orientation propre à chaque vue |
| Filtres de provenance et réglages courants au même niveau | Charge visuelle et lecture difficile | Formulation, batch, recette et électrode passent dans « Refine selection » ; les contrôles scientifiques et rubans disposent de panneaux distincts |
| Réglages de tendance visibles dans la vue JV | Apparence trompeuse d'un effet sur les courbes | Rétention, affichage des trajectoires et agrégation sont limités à la vue de tendance |
| Agrégation proposée en mode individuel | Ambiguïté sur le calcul affiché | Le menu statistique apparaît lorsque les agrégats sont affichés |
| Choix analytiques difficiles à vérifier après fermeture des panneaux | Risque d'oublier un regroupement ou une inclusion QA | Résumé persistant de la méthode avec mise en évidence de l'inclusion QA ou du pooling |
| Indépendance des cellules/batches présentée comme acquise dans une infobulle | La formulation dépassait les preuves indiquées dans la documentation | Explication corrigée : identifiants descriptifs et confirmation du laboratoire encore nécessaire |
| Explication Outdoor mentionnant seulement les pics élevés | Description incomplète des règles réellement exécutées | Les baisses isolées suivies de récupération sont également explicitées |
| Bouton d'information simulé par un span | Activation tactile et clavier imparfaite | Bouton natif, activation par clic, maintien de la bulle au survol, fermeture par Escape ou clic extérieur |
| Infobulles risquant de dépasser la fenêtre | Explication inaccessible sur petite fenêtre | Position bornée horizontalement et verticalement, hauteur limitée et contenu défilable |
| Explications distribuées entre README et documents internes | Pas de parcours pédagogique directement dans le site | Nouvelle route `/guide`, indépendante du chargement de données, avec dix chapitres et sommaire |
| Hiérarchie typographique, densité et surfaces peu différenciées | Parcours difficile à scanner | Palette bleu/gris, titres hiérarchisés, cartes et contrôles plus sobres, guide adapté au mobile |

## Guide scientifique intégré

Le guide détaille le workflow, les unités, DH/TC/Outdoor/Light ageing,
les références Unaged/B3/B7/B14/premier point Pearl, les ratios individuels,
les groupes conservateurs et le pooling, les cohortes disponibles/constantes,
la médiane/IQR, la moyenne/IC95, les petits effectifs, les seuils QA,
les zéros et les absences, la classification des rubans, la sélection et la
validation JV, les paires avant/après, les exports et la provenance.

Les conventions sont accompagnées de leurs limites. Par exemple : une
rétention de 100 % n'implique pas une PCE élevée ; une cohorte constante peut
sélectionner des survivants ; la cohérence numérique d'une JV ne prouve ni sa
calibration ni sa validation expérimentale. Les questions ouvertes du
laboratoire sont exposées séparément. Les règles numériques et les données
sources ne sont pas modifiées par cette refonte.

## Validation

- TypeScript et ESLint : aucune erreur.
- 118 tests scientifiques existants : réussis.
- Build de production : réussi ; routes `/` et `/guide` produites.
- Deux tests HTML : shell applicatif, guide indépendant du dataset et validité
  des cibles du sommaire.
- Vérification navigateur : données chargées, trois vues accessibles, résumé
  QA mis à jour, ouverture d'une infobulle, panneaux scientifiques et ancres
  du guide.
- Vérification responsive : bureau 1440 × 1000 et mobile 390 × 844 ; pas de
  débordement horizontal global constaté. Les tableaux larges défilent dans
  leur conteneur.

Les preuves attendues du laboratoire restent celles de
`docs/science/LAB_QUESTIONS.md`. Le guide devra être mis à jour lorsqu'une règle
de calcul, un seuil ou une adjudication change. Cette livraison concerne le
code et l'aperçu local ; aucun déploiement externe n'a été effectué.
