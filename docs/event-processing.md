# Traitement et regroupement des événements

Ce document décrit le pipeline actuel de Home Timeline. Il sert de référence
pour comprendre pourquoi un événement apparaît, pourquoi il est masqué ou
pourquoi plusieurs événements apparaissent sous la forme d'une story.

Le principe général est de conserver l'observation Home Assistant comme preuve,
puis de dériver une représentation plus lisible pour la timeline. Un
regroupement ne supprime donc jamais les événements qui le composent.

## Vue d'ensemble

```text
Home Assistant
    |
    v
Observations brutes
    |
    |  déduplication, rétention bornée, live prioritaire sur history
    v
Interprétation sémantique (normalize / interpret)
    |
    |  événements visibles ou supprimés comme bruit technique
    v
Regroupements Jev ajoutés aux événements
    |
    v
Sélection de la vue (période, recherche, pièce, catégorie, exclusions)
    |
    v
Regroupements déterministes (groupEvents)
    |
    v
Événements individuels + stories dans l'API
    |
    v
Timeline et inspecteur de preuve
```

Les principales responsabilités sont réparties ainsi :

| Étape | Module | Responsabilité |
| --- | --- | --- |
| Ingestion | `src/server/adapter.ts` | Lire Home Assistant, valider les réponses et produire des observations. |
| Rétention | `src/server/store.ts` | Dédupliquer, conserver temporairement les observations et évincer d'abord le bruit. |
| Interprétation | `src/lib/engine.ts` | Transformer une transition d'état en événement lisible ou la supprimer. |
| Sélection | `src/lib/query.ts` | Appliquer période, recherche, pièce, catégorie et exclusions. |
| Jev | `src/server/jev.ts`, `src/server/runtime-core.ts` | Confirmer certains rapprochements et proposer une intention. |
| Stories | `src/lib/engine.ts` | Appliquer les règles locales de regroupement. |
| Présentation | `src/components/timeline/` | Afficher l'événement, la story et les éléments de preuve. |

## 1. De Home Assistant à une observation

Une observation est une transition entre un ancien état et un nouvel état.
Elle contient notamment :

- un identifiant stable dérivé de l'entité, de l'heure de mise à jour et de la
  valeur ;
- l'entité Home Assistant et l'heure de la transition ;
- l'état précédent et l'état courant ;
- l'origine (`live`, `history` ou `demo`) ;
- le contexte Home Assistant éventuel, utilisé pour relier une automatisation à
  ses effets.

Les observations arrivent de deux sources :

1. le WebSocket Home Assistant pour les changements en direct ;
2. l'historique Recorder, chargé par lots pour combler la période demandée.

Lorsqu'une observation live et une observation history ont le même identifiant,
la version live est conservée. Deux transitions physiques différentes restent
distinctes, même si elles concernent la même entité.

Le store est uniquement en mémoire. Il est borné à environ 128 MB et évince en
priorité les observations déjà identifiées comme bruit technique. Un redémarrage
ou une déconnexion perd cette rétention locale ; l'historique disponible peut
ensuite être rechargé depuis Home Assistant.

## 2. Interprétation sémantique

`normalize` part d'une observation et produit un `TimelineEvent`. Il conserve
l'observation complète dans le champ `observation`, puis lui attribue :

- un `kind` stable, par exemple `presence.arrived`,
  `motion.detected` ou `lighting.on` ;
- un titre lisible ;
- une catégorie (`presence`, `motion`, `lighting`, etc.) ;
- une importance ;
- les références de pièce, d'appareil ou de personne quand elles sont connues ;
- éventuellement une description, une raison de suppression ou des relations de
  contexte.

### Transitions actuellement reconnues

| Source / condition | Événement produit |
| --- | --- |
| Automatisation exécutée | `automation.started` |
| Personne qui arrive ou quitte une zone | `presence.arrived`, `presence.left` ou `presence.zone` |
| Porte, fenêtre, ouverture ou garage | `security.opening` |
| Mouvement, présence ou occupation | `motion.detected` |
| Serrure ou alarme | `security.state` |
| Lumière allumée/éteinte ou variation significative | `lighting.on`, `lighting.off`, `lighting.dimmed`, `lighting.brightened` |
| Mode, consigne ou action climatique | `climate.mode`, `climate.target`, `climate.action` |
| Début ou changement significatif d'un lecteur multimédia | `media.playing` ou `media.state` |
| Indisponibilité durable d'un appareil | `device.unavailable` |

Les mesures ordinaires de capteurs, les états techniques non interprétés et les
variations insignifiantes deviennent des événements supprimés plutôt que des
événements visibles.

### Suppression et bruit

Un événement supprimé reste dans le store et peut être révélé par le mode
debug, mais il n'est normalement pas envoyé à la timeline. Exemples :

- la fin d'une détection de mouvement (`on` vers `off`) ;
- une mesure de capteur sans transition physique ;
- une progression de lecture multimédia ;
- une petite variation de luminosité ;
- une interruption d'indisponibilité de moins d'une minute ;
- la première observation d'une entité, qui n'est pas une transition connue.

Les événements supprimés ne participent pas aux regroupements visibles.

`interpret` ajoute aussi les relations de contexte Home Assistant : une
automatisation et ses effets peuvent être liés lorsque leur contexte est
identique ou parent. Cette relation est une relation de preuve, pas encore une
story en elle-même.

## 3. Sélection avant regroupement

La sélection est appliquée avant la création des stories. Elle considère comme
éligible un événement qui :

- n'est pas supprimé, sauf en mode debug ;
- n'appartient pas à une entité exclue ;
- n'appartient pas à un domaine exclu.

La période, la pièce, la personne, la catégorie, l'entité et le texte de
recherche servent ensuite à déterminer si un événement ou une story correspond
à la vue demandée.

Une story est conservée si au moins un de ses événements correspond à la
recherche ou aux filtres. Cela permet de rechercher un événement enfant sans
perdre la story qui lui donne son contexte.

Pour les requêtes d'une période, le runtime charge aussi une marge autour des
bornes : environ dix minutes avant et trois minutes après. Cette marge permet
d'éviter de casser une story au bord de la période. Les résultats sont ensuite
paginés, avec au plus 2 000 événements de base par page et le contexte complet
des stories qui touchent la page.

## 4. Regroupements déterministes

Les règles locales sont dans `groupEvents`. Elles sont reproductibles, rapides
et ne nécessitent aucun appel réseau. Les événements déjà consommés par une
story sont marqués comme `claimed` et ne sont pas réutilisés par une règle
suivante.

L'ordre actuel est important :

1. stories confirmées par Jev ;
2. soirée film ;
3. arrivée au domicile ;
4. allumage coordonné de lumières ;
5. activité liée à des détections de mouvement ;
6. événements restants, affichés individuellement.

### Soirée film

Un début de lecture sur un téléviseur est rapproché des changements de lumière
dans la même pièce et dans une fenêtre de deux minutes. Une lumière déjà utilisée
par une story précédente ne peut pas être réutilisée.

### Arrivée au domicile

Une arrivée de personne peut regrouper les ouvertures de sécurité, le mouvement
et les lumières allumées dans une fenêtre de deux minutes. Le titre de base est
celui de l'arrivée, par exemple `Kevin arrived home`, et les événements enfants
restent consultables.

### Lumières allumées ensemble

Des lumières distinctes de la même pièce peuvent former une story si elles sont
allumées dans une fenêtre de 30 secondes. Une extinction interrompt la séquence.
Les pièces inconnues, les entités répétées et les transitions contradictoires
restent individuelles.

### Détections de mouvement

La règle actuelle est volontairement simple :

- même pièce si la pièce est connue ; sinon même entité ;
- deux détections successives doivent être espacées de deux minutes maximum ;
- toute la séquence doit rester dans une durée maximale de dix minutes ;
- une détection seule n'est pas transformée en story ;
- les transitions de fin de mouvement sont déjà masquées par l'interprétation.

Le résultat est une story `activity`, par exemple `Activity in the living
room`, qui contient les détections individuelles. Cette règle est locale et ne
prouve pas qu'une personne était présente : le mouvement n'est jamais attribué
à une personne sans preuve de présence distincte.

Cette règle est un point d'évolution identifié. Deux minutes peuvent produire
encore trop de stories lorsque le capteur redéclenche pendant une activité
continue. Une évolution possible est de passer à une session de mouvement avec
un silence de cinq minutes et une durée maximale de vingt minutes, puis de
réserver Jev à l'enrichissement sémantique. Tant que cette évolution n'est pas
implémentée, la règle de référence reste celle décrite ci-dessus.

## 5. Jev : rôle et conditions d'appel

Jev n'est pas le moteur principal de la timeline. Il apporte une confirmation
sémantique à des événements déjà interprétés.

### Quand Jev peut être appelé

À chaque nouvelle observation live pertinente, et après un chargement d'historique,
le runtime examine les événements visibles des dix dernières minutes. Jev est
appelé seulement si toutes les conditions suivantes sont réunies :

1. `JEV_TOKEN` est présent côté serveur ;
2. aucun autre calcul Jev n'est déjà en cours ;
3. il existe au moins une paire d'événements visibles ;
4. les deux événements de la paire sont espacés de deux minutes maximum ;
5. cette paire n'a pas déjà été évaluée dans la session.

Un appel traite au maximum 24 nouvelles paires. Chaque paire reçoit une
question `noul` demandant si les deux événements appartiennent au même moment
humain cohérent. Une réponse est considérée positive à partir d'une probabilité
de 0,8. Les résultats sont conservés en mémoire, avec une limite de 2 048
paires.

Important : dans l'état actuel du code, les détections de mouvement visibles
peuvent donc faire partie des paires envoyées à Jev si elles satisfont ces
conditions. La règle locale de mouvement reste néanmoins appliquée
indépendamment ; Jev ne remplace pas cette règle.

### Construction d'une story Jev

Les paires positives sont fusionnées transitivement : si A est lié à B et B à C,
les trois événements forment un groupe. Un groupe de moins de deux événements
n'est pas une story.

Les groupes Jev sont traités avant les règles locales. Cela leur permet de
prendre la priorité et d'éviter qu'un de leurs événements soit repris par une
story déterministe. Les événements originaux restent disponibles dans la story
et dans l'inspecteur.

Après la formation d'un groupe, Jev peut recevoir une seconde requête `choice`
pour choisir une intention prédéfinie :

- `movie_start` ;
- `welcome_home` ;
- `welcome_home_with_door` ;
- `lights_together` ;
- `room_activity` ;
- `automation_sequence` ;
- `unclear`.

Cette intention ne décide pas du regroupement. Elle sert uniquement à choisir un
titre contrôlé, comme `Soirée film qui commence` ou `Kevin est rentré et a
fermé la porte`. Une intention insuffisamment probable devient `unclear` et
le titre retombe sur `Un moment connecté`.

### Échec ou absence de Jev

Si le token manque, si Jev répond en erreur, si le délai de 1,5 seconde est
dépassé ou si la réponse ne respecte pas le schéma attendu, les règles locales
continuent normalement. L'interface expose alors l'état Jev (`idle`,
`evaluating`, `ready` ou `error`) ainsi que le nombre de paires évaluées et
confirmées.

Jev est donc une amélioration opportuniste : son indisponibilité ne doit jamais
vider la timeline ni empêcher l'affichage des événements.

## 6. Ce qui est affiché dans l'interface

Une story affiche :

- son titre et sa description ;
- sa plage temporelle, du premier au dernier événement ;
- le nombre d'événements regroupés ;
- la possibilité de développer les événements enfants ;
- les preuves et différences d'état de chaque événement.

Un événement individuel affiche directement son titre et peut être inspecté de
la même manière. Le regroupement change la présentation, pas la preuve
sous-jacente.

Le statut Jev est visible dans la zone de couverture de la timeline. Il indique
si Jev est configuré, en cours d'évaluation, prêt, ou en erreur. Un statut prêt
ne signifie pas qu'une story Jev a été créée : il signifie seulement qu'au moins
une tentative a abouti. Le nombre de paires confirmées est le meilleur indice
pour savoir si Jev a effectivement rapproché des événements.

## 7. Points d'attention pour les futurs agents

- Ne pas déplacer l'interprétation dans React : les règles appartiennent à
  `src/lib/engine.ts`.
- Ne pas confondre observation, événement et story : ce sont trois niveaux
  différents, et l'observation doit rester inspectable.
- Ne pas utiliser Jev pour masquer une panne Home Assistant ou pour fabriquer un
  événement absent des données.
- Toute nouvelle règle de story doit être déterministe en l'absence de Jev,
  préciser sa fenêtre temporelle, sa portée (pièce, entité ou contexte) et son
  comportement pour un événement isolé.
- Lorsqu'une règle consomme un événement, vérifier son ordre par rapport aux
  autres règles et l'effet de `claimed`.
- Si un regroupement est modifié, ajouter un test sur le résultat observable,
  notamment les événements enfants conservés et la stabilité quel que soit
  l'ordre d'entrée.
- Toute modification des données envoyées à Jev doit rester côté serveur et ne
  jamais exposer `JEV_TOKEN` au navigateur.

## Sources de vérité

- Interprétation et stories : `src/lib/engine.ts`
- Sélection et filtres : `src/lib/query.ts`
- Runtime, historique, cache et orchestration Jev : `src/server/runtime-core.ts`
- Client Jev et schémas de réponse : `src/server/jev.ts`
- Rétention des observations : `src/server/store.ts`
- Modèle de données : `src/lib/types.ts`
- Affichage des stories : `src/components/timeline/timeline-list.tsx`
