# Reprise de la remédiation — tâche active, non terminée

Consigne utilisateur du 2026-09-20 : continuer jusqu'à fermeture de tout le
périmètre logiciel, sans s'arrêter volontairement à une tranche intermédiaire.
Si les crédits ou une interruption empêchent l'exécution, reprendre à la prochaine
demande depuis le code présent, sans recommencer l'audit ni revenir au snapshot.

Demande de continuation intégrale :
`/home/achille/.codex/attachments/3426902c-c976-4b63-a31b-61bd193fce26/pasted-text.txt`.
Demande initiale :
`/home/achille/.codex/attachments/4e1dce44-6c11-4c86-b3a5-4eb26dfbb955/pasted-text.txt`.

## État de départ de cette reprise

- HEAD : `71c4238`, précédent commit scientifique `55f66bf`.
- 49 tests unitaires, build, HTML, typecheck, lint et deep validation réussis
  lors de la tranche précédente. Ne pas les confondre avec la validation finale.
- Les gates restent ouvertes dans SCIENTIFIC_REMEDIATION.md.
- Données brutes et pack inchangés. Ne pas écraser les datasets de production.
- Commits locaux cohérents autorisés ; push et déploiement explicitement interdits.

## Prochaine étape immédiate

Scientific Safety : séparer cohérence numérique, validation des unités,
validation de plage et validation expérimentale. Une conversion legacy non
validée ne doit pas suffire à autoriser une JV quantitative. Compléter ensuite
les écarts FF/PCE, répétitions proches/mises à l'échelle et référence Orange R.

### Avancement en cours — 2026-09-20

Implémentés depuis le checkpoint : niveaux de validation JV séparés, exigence
de preuves ciblées avant éligibilité quantitative, contrôle FF/PCE et limites
explicites, détection exacte/proche/multiplicative avec index de candidats,
validation Orange C+R, inspection avant/après explicite, colonnes JV CSV.
Tests unitaires (56), build, HTML et lint réussis. Voir SCIENTIFIC_METHODS.md.
La gate 1 n'est pas encore déclarée fermée : terminer les exclusions et la
traçabilité des normalisations/manifestes de toutes les vues, puis validation UI.
Continuer ensuite la suite obligatoire ci-dessous, sans s'arrêter à ce document.

### Reprise suivante — traçabilité et analyses appariées

Normalisation par observation désormais traçable (valeur absolue, baseline,
observations sources, formule, QA, ambiguïtés). Missingness explicite sans
assimiler zéro mesuré à une panne documentée. CSV complet distinct du CSV figure.
Manifestes appariés : exclusions utilisateur hors contributeurs, masquage visuel
distinct, deltas individuels/médiane/moyenne et ratio des moyennes distincts.
Exports PNG/SVG/CSV/JSON et caption vérifiés dans le navigateur pour POE-2 A1 :
4 contributeurs, hash du pack identique, 4 lignes CSV et en-tête. Les délais
inconnus restent affichés comme inconnus. 65 tests, typecheck et lint réussis à
ce stade. Ne pas confondre avec la validation UI finale de toutes les vues.

En cours : modules `staged-ageing.ts` / `StagedAgeing.tsx` (Before/Post/Aged,
temps exact ou dernier commun, zéros et absences séparés), tests associés.
Puis vue quatre métriques, Outdoor, pipeline non circulaire et validation finale.

## Suite obligatoire

Missingness/cohortes et exclusions traçables ; sensibilités Outdoor ;
Before/Post/Aged et quatre panneaux synchronisés ; exports complets de toutes
les vues ; pipeline raw → processed non circulaire et registry versionné ;
clean-room rebuild ; validations navigateur ; ré-audit ciblé ; rapport final A–G.

Les seules décisions pouvant rester ouvertes à la fin sont les adjudications
expérimentales listées dans LAB_QUESTIONS.md. Elles n'excusent pas une tâche
logicielle inachevée. Un checkpoint n'est pas une déclaration de fin.
