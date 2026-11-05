# Modèle de confirmation DroMap

Dans Supabase → Authentication → Email Templates → Confirm sign up :

- Objet : `Confirme ton adresse e-mail — DroMap`
- Corps HTML : `confirmation.html`

Le bouton et le lien de secours utilisent `{{ .ConfirmationURL }}`. Dans Authentication → URL Configuration, définir l’URL du site sur `https://dromap.fr` et autoriser `https://dromap.fr/**` pour les redirections DroMap, y compris leurs paramètres de confirmation.
