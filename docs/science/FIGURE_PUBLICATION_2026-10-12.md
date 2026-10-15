# Publication des figures

Les réglages « Export figure → Publication settings » sont communs aux exports
de cet espace et sauvegardés dans le navigateur. La taille des textes s’applique
aux SVG, PNG et SVG pour le rapport. Les fichiers déjà exportés ne sont pas modifiés.

- La légende des trajectoires individuelles identifie chaque cellule et son lot
  par défaut. Le mode compact formulation/lot reste disponible ; il ne permet
  pas de retrouver tous les styles individuels.
- Les noms commerciaux sont supprimés des libellés publiés, mais conservés dans
  les sources et les métadonnées d’audit. PDMS est le libellé de figure.
- Les couleurs des formulations et des paramètres restent fixes. Les styles des
  cellules sont attribués depuis le registre complet, indépendamment des filtres.
- Les légendes longues reviennent à la ligne sans troncature. Le nombre de
  colonnes et deux tailles de texte sont disponibles.
- Les libellés de ruban homogènes peuvent être masqués sans fusionner les groupes.
  En mode automatique, un ruban n’est ajouté à une cellule que s’il distingue
  des courbes séparées de la même formulation ; les rubans différents à
  l’intérieur d’un agrégat PDMS ne décorent pas les autres matériaux.
- Une courbe en mode médiane issue d’une seule et même cellule est aussi décrite
  comme « Échantillon individuel ». Si n vaut 1 mais que les cellules changent
  entre échéances, la légende conserve n = 1. Les plages de n et Ag / Cu restent
  inchangés. Les effectifs de légende utilisent toutes les observations retenues,
  indépendamment de l’espacement décoratif des points.
- Les titres des courbes de vieillissement et une note documentée peuvent être
  personnalisés dans « Title & documented note ». L’identité réelle reste auditée.
- « Fit all observations » rétablit l’échelle automatique après un cadrage qui
  masque des observations. « Start Y at 0 » n’est proposé que si les valeurs et
  intervalles affichés sont non négatifs. Les rétentions non négatives ne reçoivent
  plus une borne négative uniquement à cause de la marge automatique.
- Les panneaux de paramètres ont des échelles automatiques propres par défaut ;
  une échelle manuelle commune demeure un choix explicite.
- L’espacement des points est expliqué sous la figure et dans la légende copiée :
  il ne réalise aucune agrégation temporelle et ne modifie pas la moyenne aller/retour.
- Les médianes journalières nulles persistantes représentées en fin de sélection
  restent dans les données ; la note d’export n’attribue pas leur cause à une panne.
- La définition des boîtes/médianes/moustaches/points est disponible dans la vue
  avant/après et dans la légende exportable. Les liaisons sont désactivées par défaut.

Ces changements portent sur la présentation. Références, exclusions, calculs,
effectifs et identités des groupes analytiques sont inchangés. Les effectifs et
plages de n restent affichés ; les CSV conservent les observations hors cadre et
les manifestes conservent la sélection ainsi que les réglages de présentation.
