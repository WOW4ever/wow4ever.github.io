# Guilde WoW Forever

L'outil de la guilde (Alliance, sortie le 4 novembre 2026) : fiches des joueurs, questionnaire, spés conseillées, compos, sorties, raids, équipes de leveling et relais Discord.

## Comment ça tourne

- **La page** : `index.html`, un seul fichier servi par GitHub Pages.
- **Les données** : Supabase (projet `izflnnbkxolndzmuhnui`, Francfort), une table `docs` décrite dans `supabase/schema.sql`. Tout le monde lit, les joueurs connectés écrivent, une fiche reliée n'est modifiable que par son propriétaire ou un admin.
- **La connexion** : « Se connecter avec Discord », sans mot de passe.
- **Discord** : la page dépose les annonces dans la file `discord_out`, la fonction `supabase/functions/discord-post` les poste par le webhook du salon (secret `DISCORD_WEBHOOK` dans Supabase).

## Donner les droits d'admin

Après la première connexion de la personne, dans l'éditeur SQL de Supabase :

```sql
insert into public.admins(uid)
select id from auth.users where raw_user_meta_data->>'full_name' ilike 'pseudo-discord';
```

## Mettre à jour

La page est générée par Claude depuis les sources de l'outil puis poussée ici ; ne modifie pas `index.html` à la main, tes changements seraient écrasés au prochain envoi.
