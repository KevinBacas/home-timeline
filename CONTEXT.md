# Home Timeline

Home Timeline transforme l'activité observée dans un domicile en une timeline
lisible, tout en conservant les transitions Home Assistant comme preuves.

## Vocabulaire

**Observation** : une transition brute fournie par Home Assistant, avec son état
précédent, son état courant, son heure et son origine.

_À éviter_ : événement brut, story brute.

**Événement** : l'interprétation lisible d'une observation, avec une catégorie,
un type sémantique et éventuellement une raison de masquage.

_À éviter_ : donnée Home Assistant, transition affichée.

**Événement supprimé** : un événement conservé comme preuve mais exclu de la
vue normale parce qu'il représente du bruit technique ou une transition sans
intérêt utilisateur.

_À éviter_ : événement supprimé du système, événement perdu.

**Story** : une présentation compacte de plusieurs événements qui décrivent un
moment ou une séquence cohérente. Une story ne remplace pas ses événements
enfants et ne constitue pas une preuve de causalité.

_À éviter_ : événement agrégé, événement fusionné.

**Regroupement déterministe** : une règle locale, reproductible et sans appel
réseau qui décide quels événements peuvent former une story.

_À éviter_ : déduction certaine, corrélation prouvée.

**Confirmation Jev** : un avis sémantique externe, optionnel et mis en cache,
utilisé pour confirmer ou nommer un groupe déjà formé à partir d'événements
visibles.

_À éviter_ : source primaire, moteur obligatoire, suppression Jev.
