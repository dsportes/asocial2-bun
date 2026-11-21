# asocial2-bun

### Test de web-push
Lancer asocial2-pwa

Récupérer dans le log le "subs token OK: {....}"

Dans /src/src-fw/tools, recopier le texte {...}
dans la constante subsJSON =

Lancer le tool:

npm run wptest

Lancer le debug "Attach Bun".

L'arrivée du web-push côté application est une ligne de log.

L'objet correspondant peut être lu dans my-register-sw autour de la ligne 70.
