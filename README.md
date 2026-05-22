# Deals Bot iOS

Wrapper iOS de la Mini App Deals Bot. L'app affiche l'interface Mini App connectée au bot Flask qui tourne sur ton PC.

## Build & install

### 1. Pousser sur GitHub

```bash
cd ios-app
git init
git add .
git commit -m "Initial iOS app"
git branch -M main
git remote add origin https://github.com/TON_USERNAME/DealsBot-iOS.git
git push -u origin main
```

### 2. Récupérer l'.ipa

Le workflow `Build iOS .ipa` se déclenche au push. ~10 min de build.

GitHub → Actions → dernier run → télécharger l'artifact `DealsBot-unsigned-ipa` → dézipper → tu as `DealsBot.ipa`.

### 3. Sideload

1. Télécharge Sideloadly : https://sideloadly.io
2. Branche iPhone en USB
3. Glisse-dépose `DealsBot.ipa` → entre ton Apple ID gratuit
4. Sur iPhone : Réglages → Général → VPN et gestion d'appareil → fais confiance
5. Au 1er lancement, l'app demande l'URL du serveur → colle l'URL Cloudflare du DealsBot launcher

⚠️ Les apps signées avec Apple ID gratuit expirent tous les **7 jours**. Re-fais Sideloadly à ce moment.
