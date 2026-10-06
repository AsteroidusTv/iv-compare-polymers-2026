# Adjudications scientifiques attendues du laboratoire

État : **partiellement résolu**, mis à jour le 3 octobre 2026 selon les réponses
du responsable de l'étude dans cette conversation. Voir les
[précisions sourcées](LAB_CLARIFICATIONS_2026-10-03.md) et le
[diagnostic empirique du PR](OUTDOOR_PR_DIAGNOSTIC_2026-10-03.md).

Confirmé : un UID correspond à une cellule ; valeur retenue au plateau de
light soaking lorsque le rendement cesse d'augmenter ; DH 85 °C / 85 % HR ;
TC −40 à 80 °C ; Light ageing 1 sun / 40 °C ; arrêt de suivi dû à une panne ;
stockage dans le noir sous azote avec durée variable ; tous les labels
confirmés ; PR déclaré standard ; surface active Outdoor de 1 cm².

Restent à préciser : dépendances entre cellules et batches, critère chiffré du
plateau et sweep retenu, conditions/calibration JV par acquisition, rampes et
paliers TC, dates individuelles des pannes et interruptions, équivalences
entre formulations, origine des segments répétés. Le diagnostic PR retrouve
une référence numérique égale à la PCE Unaged pour 21 cellules ; avec 1 cm²,
il suggère Pmpp en mW alors que le package indique W. L'unité brute et la
configuration du logger restent à confirmer avant toute correction.

## Liste initiale conservée pour traçabilité

Certaines questions ci-dessous ont désormais une réponse dans les précisions
du 3 octobre. Elles ne doivent pas être présentées comme toutes ouvertes.
Toute adjudication individuelle doit conserver sa source, sa date, son auteur,
les identifiants concernés et la règle approuvée. Les bruts restent inchangés.

1. Que représente `sample_uid` : cellule électrique, pixel, patch ou substrat ?
   Cette unité détermine n et l'indépendance statistique, pas seulement le libellé.
2. Plusieurs `cell_number` d'un fichier sont-ils des pixels d'un même substrat ?
   Quelle est la correspondance avec les canaux et les identifiants d'inventaire ?
3. Que représentent les batches #1, S2, A1, etc. : fabrication, dépôt,
   encapsulation ou campagne de mesure ? Sont-ils indépendants ?
4. Pour les 12 fichiers V–I du 17 avril : courant ou densité de courant ?
   La surface 0,1 cm² est-elle active, masquée, une aperture ou un réglage ?
   Les 138 sweeps incohérents restent exclus des JV quantitatives par défaut ;
   aucune règle globale liée à la surface ne corrige leurs amplitudes.
5. Quelle est l'origine des segments identiques de 30/50 points répétés dans
   des centaines de fichiers ? Quels indices correspondent réellement à
   l'acquisition ? La répétition ne prouve pas à elle seule un résidu.
6. EVA 406 et EVA 806 sont-elles des formulations distinctes ou des références
   de procédé ? Ne pas les fusionner automatiquement.
7. Quelles équivalences sont confirmées entre générations silicone, variantes
   TPO, Cybrid et autres aliases ? Fournir aussi les différences de recette.
8. Les 14 échantillons d'inventaire marqués Ag sont-ils réellement en argent ?
   Si non, préciser chaque identifiant et la preuve, sans remplacer globalement.
9. Pourquoi chaque cellule cesse-t-elle d'être suivie après une faible valeur :
   panne, casse, contact, mesure non prévue, arrêt de suivi ou cause inconnue ?
   Une absence ne vaut ni zéro ni preuve de défaillance.
10. Quelles conditions DH effectives : température, RH, interruptions et début ?
11. Quelles conditions TC : températures, rampes, paliers et définition du cycle ?
12. Quelles conditions de stockage entre Before et Post, et pourquoi des délais
    de 7–15 jours ? Peut-on séparer stockage, encapsulation et mesure ?
13. Les PCE/Jsc/Voc/FF d'inventaire désignent-ils un sweep, une moyenne, le
    meilleur pixel ou une mesure stabilisée ? Quelle mesure source exacte ?
14. Quelles conditions JV : irradiance, température, vitesse, sens,
    préconditionnement, surface/masque et calibration ? Sans puissance incidente
    documentée, la PCE reconstruite reste indisponible.
15. Quelle définition exacte du PR Outdoor : normalisation, irradiance de
    référence, température, unités et traitement interne du logger ?

Ces inconnues limitent uniquement les analyses concernées. Les distributions PCE
appariées ne doivent pas perdre leurs dates parce qu'une JV est incohérente.
