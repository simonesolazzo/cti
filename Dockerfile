# --------------------------------------------------
# Dockerfile — Immagine Docker per il server CTI
# --------------------------------------------------
# Parallelismo Flask:
#   In Flask creeresti un Dockerfile molto simile, con:
#     FROM python:3.12-slim
#     COPY requirements.txt .
#     RUN pip install -r requirements.txt
#     COPY . .
#     CMD ["gunicorn", "app:app"]
#
#   In Node.js il flusso è identico, ma con npm.
# --------------------------------------------------

# 1. Immagine base: Node.js 24 su Alpine Linux (leggera, ~50MB)
#    Alpine è una distro Linux minimale, ideale per container.
#    L'equivalente Python sarebbe `python:3.12-alpine`.
FROM node:24-alpine

# 2. Directory di lavoro dentro il container.
#    Tutti i comandi successivi (COPY, RUN, CMD) si eseguono qui.
#    Parallelismo Flask: `WORKDIR /app` — identico.
WORKDIR /app

# 3. Copiamo PRIMA solo package.json e package-lock.json.
#    Perché? Per sfruttare la CACHE dei layer Docker.
#
#    Docker costruisce l'immagine a "layer" (strati). Se un file
#    non cambia, il layer viene riutilizzato dalla cache.
#
#    Se copiassimo tutto (COPY . .) e poi facessimo npm install,
#    ogni modifica a qualsiasi file (es. index.js) invaliderebbe
#    la cache e rieseguirebbe npm install (che è lento).
#
#    Copiando prima solo i file delle dipendenze, npm install
#    viene rieseguito SOLO se cambiano le dipendenze.
#
#    Parallelismo Flask:
#      COPY requirements.txt .
#      RUN pip install -r requirements.txt
#      COPY . .
#    Stessa strategia!
COPY package.json package-lock.json ./

# 4. Installa le dipendenze (solo produzione, senza devDependencies).
#    `--omit=dev` esclude nodemon e altre dipendenze di sviluppo.
#    Parallelismo Flask: `RUN pip install --no-dev -r requirements.txt`
RUN npm ci --omit=dev

# 5. Copia tutto il resto del codice sorgente.
COPY . .

# 6. Espone la porta su cui il server ascolta.
#    È solo documentazione — non apre realmente la porta.
#    La porta viene mappata con `-p` o in docker-compose.yml.
EXPOSE 3000

# 7. Comando di avvio del container.
#    `node index.js` — avvio diretto (non nodemon, siamo in produzione).
#    Parallelismo Flask: CMD ["gunicorn", "-w", "4", "app:app"]
CMD ["node", "index.js"]
