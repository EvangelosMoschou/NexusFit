# 🚀 Οδηγός Ανεβάσματος στον Host (Nexus Athletics / NexusFit)

> Για μια καθαρή, ενημερωμένη εγκατάσταση σε Hetzner χρησιμοποιήστε το
> [`HETZNER.md`](./HETZNER.md). Ο οδηγός που ακολουθεί κρατά τις παλιότερες
> επιλογές (PM2 / χειροκίνητο backup).

Αυτός ο οδηγός περιγράφει πώς να ανεβάσετε το site στον host σας εύκολα και γρήγορα.

---

## 📋 Ποια αρχεία του project ανεβάζουμε στον Server / Git:

Ανεβάζετε ολόκληρο τον φάκελο του project **ΕΚΤΟΣ** από το `node_modules/` και το `.next/` (τα οποία δημιουργούνται αυτόματα στον server κατά το build):

```text
NexusFit/
├── src/                    # Όλος ο κώδικας (Components, API, SQLite, AI Safety)
├── public/                 # Εικόνες, λογότυπα, PWA manifest
├── package.json            # Εξαρτήσεις
├── package-lock.json
├── next.config.ts          # Security Headers & βελτιστοποιήσεις
├── tsconfig.json
├── tailwind.config.ts
├── postcss.config.mjs
├── .env.local              # (Δημιουργείται στον server με τα κλειδιά)
└── deploy/                 # Dockerfile & scripts
```

---

## 🎯 ΕΠΙΛΟΓΗ 1: Ανέβασμα σε Vercel / Netlify / Cloudflare (Η πιο εύκολη μέθοδος)

1. Συνδέετε το repository στο GitHub.
2. Κάνετε Import το project στο [Vercel](https://vercel.com).
3. Στα **Environment Variables** προσθέτετε:
   * `GEMINI_API_KEY` = `το_κλειδι_σας_απο_google_ai_studio`
4. Πατάτε **Deploy**. Το site είναι live σε 60 δευτερόλεπτα με αυτόματο HTTPS!

---

## 🐳 ΕΠΙΛΟΓΗ 2: Ανέβασμα σε δικό σας VPS με Docker (1-Click Run)

Αν έχετε VPS (π.χ. Hetzner, DigitalOcean, OVH):

1. Αντιγράφετε τα αρχεία του project στον server:
   ```bash
   scp -r NexusFit user@your-server-ip:/var/www/nexusfit
   ```
2. Μπαίνετε στον φάκελο στον server:
   ```bash
   cd /var/www/nexusfit
   cp deploy/.env.production.example deploy/.env
   # Συμπληρώστε SITE_DOMAIN, SESSION_SECRET, ADMIN_PASSWORD, CRON_SECRET
   ```
3. Εκτελείτε το Docker Compose:
   ```bash
   docker compose --env-file deploy/.env -f deploy/docker-compose.yml up -d --build
   ```
4. Το site τρέχει στο port `3000` με την τοπική βάση SQLite έτοιμη στο `data/nexusfit.db`!

---

## ⚡ ΕΠΙΛΟΓΗ 3: Ανέβασμα σε Linux VPS χωρίς Docker (με PM2)

1. Εγκατάσταση Node.js 22.13+ στον server (απαιτείται για το `node:sqlite`).
2. Μπαίνετε στον φάκελο και εκτελείτε:
   ```bash
   npm install
   npm run build
   ```
3. Εκκίνηση με PM2 (ώστε να μην κλείνει ποτέ):
   ```bash
   npm install -g pm2
   pm2 start deploy/ecosystem.config.js
   pm2 save
   pm2 startup
   ```

---

## 💾 Πώς παίρνετε Backup της Βάσης Δεδομένων (SQLite)
Η βάση αποθηκεύεται τοπικά στο αρχείο:
📍 **`data/nexusfit.db`**

Για backup, απλά αντιγράφετε αυτό το ένα αρχείο στον υπολογιστή σας ή σε ένα cloud storage.

---

## 🔒 HTTPS & Αυτόματα Backups (Production)

Με το Docker Compose deployment, η εφαρμογή τρέχει πλέον πίσω από το **Caddy** reverse proxy που εκδίδει αυτόματα Let's Encrypt πιστοποιητικά:

1. Στο `.env` δίπλα στο compose αρχείο ορίζετε `SITE_DOMAIN=nexusathletics.gr` — το Caddy εκδίδει αυτόματα Let's Encrypt πιστοποιητικά στον τομέα σας.
2. Η θύρα **3000 είναι πλέον localhost-only** (`127.0.0.1:3000`) — η πρόσβαση από το internet γίνεται μόνο μέσω Caddy στις θύρες 80/443.
3. Το service **db_backup** (`node:22-alpine`) τρέχει μέσα στο compose stack και γράφει **consistent snapshots** (`VACUUM INTO`) όλων των βάσεων στο `deploy/backups/`, με **14-day retention** — χωρίς cron, με απλό container loop.
4. Για standalone (PM2, Option 3) χρησιμοποιήστε το script `deploy/backup-db.sh` — ίδια λογική, χωρίς Docker.
5. **Επαναφορά (restore):**
   ```bash
   docker compose --env-file deploy/.env -f deploy/docker-compose.yml stop nexusfit_app
   docker run --rm -v nexusfit_data:/data -v "$PWD/deploy/backups:/backups" alpine \
     sh -c "cp /backups/nexusfit-<timestamp>.db /data/nexusfit.db"
   docker compose --env-file deploy/.env -f deploy/docker-compose.yml start nexusfit_app
   ```
   Τα αρχεία tenants είναι flattened (`tenants_<id>-<timestamp>.db`), και το
   `registry-<timestamp>.db` επαναφέρεται επίσης όταν αλλάζει η λίστα tenants.
