# 📘 Guida di Studio — Frontend Angular CTI

> Documento che ricostruisce l'intero percorso di sviluppo del frontend in Angular, fase per fase.
> Ogni sezione include: obiettivo, comandi eseguiti, codice prodotto e spiegazioni strutturate.

---

## Indice

1. [Fase 1 — Inizializzazione del progetto Angular e integrazione Docker](#fase-1--inizializzazione-del-progetto-angular-e-integrazione-docker)

---

## Fase 1 — Inizializzazione del progetto Angular e integrazione Docker

### Obiettivo
Inizializzare un progetto Angular tramite CLI configurandolo con componenti *Standalone*, ripulire il codice boilerplate iniziale generato automaticamente e integrare il frontend nel file `docker-compose.yml` esistente per avere l'intera infrastruttura gestita da un unico comando.

### 1.1 — Creazione del progetto Angular

Abbiamo utilizzato la Angular CLI (Command Line Interface) per generare lo scheletro del progetto all'interno della cartella `frontend`.

```powershell
npx @angular/cli new frontend --routing --style=css --standalone
```

> **Parallelismo Flask ↔ Angular:**
> A differenza di Flask, dove l'architettura è molto destrutturata (puoi creare un file `app.py` vuoto e sei a posto), Angular è un framework altamente *opinionated*.
> Impone una struttura di directory, configurazioni di build (tramite `angular.json`) e dipendenze rigorose. L'utilizzo dell'approccio **Standalone** (introdotto di recente in Angular) elimina la necessità dei vecchi `NgModules`, rendendo la struttura più snella e simile all'Inversion of Control granulare che potresti aver visto in .NET (dove ogni classe o servizio gestisce da solo le proprie dipendenze dirette).

### 1.2 — Pulizia del boilerplate iniziale

La CLI di Angular genera una pagina di benvenuto ricca di HTML e CSS. Per iniziare a lavorare al nostro progetto "CTI", abbiamo svuotato il file principale dell'applicazione, lasciando solo l'essenziale.

**Modifica al file `frontend/src/app/app.html`:**
```html
<main>
  <h1>CTI Dashboard</h1>
  <router-outlet></router-outlet>
</main>
```

> **Il `<router-outlet>`:** In Angular, questo tag funziona come un "segnaposto". Indica al router di Angular dove deve inserire dinamicamente i componenti a seconda dell'URL visitato.

### 1.3 — Integrazione in Docker Compose

Per permetterti di avviare l'intero stack (Database MongoDB, Server Node.js e Frontend Angular) con un solo comando `docker compose up -d`, abbiamo aggiunto il frontend al nostro `docker-compose.yml`.

**Aggiunta al file `docker-compose.yml`:**
```yaml
  # ---- Frontend Angular ----
  # Utilizziamo un'immagine Node, montiamo il volume per l'hot-reload
  # e avviamo il server esposto su 0.0.0.0
  frontend:
    image: node:22-alpine
    container_name: cti-frontend
    working_dir: /app
    volumes:
      - ./frontend:/app
    ports:
      - "4200:4200"
    command: sh -c "npm install && npm run start -- --host 0.0.0.0 --poll 2000"
    restart: unless-stopped
```

> **Concetto chiave — Hot Reloading in Docker:**
> Il comando `npm run start` in Angular esegue `ng serve`. 
> - `--host 0.0.0.0`: È obbligatorio nei container Docker per rendere il server web raggiungibile dal di fuori del container stesso.
> - `--poll 2000`: In alcuni ambienti (specialmente su Windows tramite WSL2 o virtualizzazione), i classici eventi del file system (inotify) non vengono propagati al container. Il *polling* forza Angular a controllare fisicamente ogni 2 secondi (2000ms) se un file è stato modificato, garantendo che l'auto-refresh nel browser funzioni sempre.

✅ **Fase 1 completata.**
