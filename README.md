# CTI Call Logging Microservice 📞⚡

Microservizio RESTful & Real-time sviluppato in **Node.js (Express)** e **MongoDB (Mongoose)** per la gestione, il tracciamento e il monitoraggio in tempo reale dei log di chiamate telefoniche in un'infrastruttura **CTI** (*Computer Telephony Integration*).

Il progetto include inoltre **worker Python** per simulare flussi di eventi da centralini CTI terzi e ascoltare notifiche in streaming tramite WebSocket.

---

## 🏗️ Architettura

```
┌───────────────────────────┐         HTTP POST /calls
│   Python CTI Simulator    │ ──────────────────────────────┐
│ (simulazione flussi CTI)  │                               │
└───────────────────────────┘                               ▼
                                               ┌─────────────────────────┐
                                               │   Node.js Core Server   │
                                               │    (Express + Mongoose) │
                                               └─────────────────────────┘
                                                  │                   │
                                   Mongoose (ODM) │                   │ Socket.IO
                                                  ▼                   ▼
                                           ┌─────────────┐     ┌───────────────────────┐
                                           │   MongoDB   │     │  Python WS Listener   │
                                           │  (Database) │     │ (dashboard / monitor) │
                                           └─────────────┘     └───────────────────────┘
```

---

## ✨ Funzionalità Principali

- **Core REST API**: Operazioni CRUD per la gestione delle chiamate con validazione rigorosa dei payload Mongoose.
- **Macchina a Stati (Lifecycle)**: Validazione controllata delle transizioni di stato di una chiamata:
  - `queued` ➔ `in-progress` ➔ `completed` / `failed` (stati terminali).
  - Protezione e immutabilità di campi sensibili (`callerNumber`, `agentId`).
- **Paginazione & Filtri Avanzati**:
  - `GET /calls` con supporto a query params `page` e `limit` (con sanitizzazione e capping).
  - Query parallele ad alte prestazioni con `Promise.all` (`.skip()`, `.limit()`, `countDocuments()`).
  - Filtri per `status`, `agentId`, `callerNumber`.
- **Notifiche Real-Time via WebSocket**:
  - Integrazione con **Socket.IO** sullo stesso server HTTP.
  - Emissione di eventi `call:created` (nuove chiamate) e `call:updated` (cambi di stato con storico transizione).
- **Simulatore & Client CTI in Python**:
  - `cti_simulator.py`: genera e invia flussi realistici di chiamate (singole, burst o continue).
  - `ws_listener.py`: client WebSocket per l'ascolto e la stampa in streaming in console degli eventi emessi.
- **Containerizzazione & Orchestrazione**:
  - `Dockerfile` ottimizzato con multi-layer caching e immagine leggera Alpine.
  - `docker-compose.yml` con healthcheck per MongoDB e networking interno isolato.

---

## 🛠️ Stack Tecnologico

- **Runtime Backend**: Node.js (v20+)
- **Framework Web**: Express.js 5
- **Database & ODM**: MongoDB 7, Mongoose 9
- **Comunicazione Real-Time**: Socket.IO
- **Simulazione / Client**: Python 3.10+, `requests`, `python-socketio`
- **DevOps**: Docker, Docker Compose

---

## 📂 Struttura del Repository

```
cti/
├── Dockerfile                  # Build immagine Docker per il microservizio Node.js
├── docker-compose.yml          # Orchestrazione container server + MongoDB
├── .dockerignore               # Esclusioni per build context Docker
├── .env                        # Variabili d'ambiente (non committato / template)
├── .gitignore                  # Esclusioni Git
├── package.json                # Dipendenze Node.js e script npm
├── index.js                    # Entrypoint Express + HTTP Server + Socket.IO
├── db.js                       # Connessione asincrona a MongoDB
├── GUIDA_STUDIO.md             # Guida didattica step-by-step con parallelismi Flask
│
├── models/
│   └── Call.js                 # Schema Mongoose per le chiamate (validazioni & lifecycle)
│
├── routes/
│   └── calls.js                # Router Express (/calls) con CRUD, paginazione e WebSocket emit
│
└── workers/                    # Simulatore e listener in Python
    ├── requirements.txt        # Dipendenze Python (requests, python-socketio)
    ├── config.py               # Configurazione simulatore
    ├── cti_simulator.py        # Generatore e client HTTP POST per eventi CTI
    └── ws_listener.py          # Listener WebSocket per streaming real-time
```

---

## 🚀 Avvio Rapido

### Opzione 1: Con Docker Compose (Consigliato)

È sufficiente avere installato Docker:

```bash
# Costruisce l'immagine e avvia MongoDB + Node.js Server in background
docker compose up --build -d

# Visualizza lo stato dei container
docker compose ps

# Visualizza i log del server
docker compose logs -f server
```

L'API sarà disponibile su: `http://localhost:3000`

Per spegnere i container:
```bash
docker compose down
# Per rimuovere anche i volumi dati: docker compose down -v
```

---

### Opzione 2: Avvio Locale (Senza Docker per Node.js)

1. **Avvia un'istanza di MongoDB** (es. via Docker):
   ```bash
   docker run -d --name mongo-cti -p 27017:27017 -v mongo-cti-data:/data/db mongo:7
   ```

2. **Configura le variabili d'ambiente** (crea un file `.env`):
   ```env
   PORT=3000
   MONGO_URI=mongodb://localhost:27017/cti_db
   NODE_ENV=development
   ```

3. **Installa le dipendenze e avvia il server**:
   ```bash
   npm install
   npm run dev    # con Nodemon per auto-reload
   # oppure: npm start
   ```

---

## 🐍 Utilizzo dei Worker Python

I worker si trovano nella cartella `workers/`.

1. **Setup dell'ambiente virtuale**:
   ```bash
   cd workers
   python -m venv .venv

   # Windows:
   .venv\Scripts\activate
   # Linux/macOS:
   source .venv/bin/activate

   pip install -r requirements.txt
   ```

2. **Avvia il Listener WebSocket** (lascialo aperto in un terminale):
   ```bash
   python ws_listener.py
   ```

3. **Invia chiamate simulate** (in un altro terminale):
   ```bash
   # Invia 10 chiamate con brevi pause
   python cti_simulator.py --count 10

   # Invia 25 chiamate in modalità burst (istantanee)
   python cti_simulator.py --count 25 --burst
   ```

---

## 📡 API Endpoints

| Metodo | Endpoint | Descrizione | Parametri Query / Body | Evento WebSocket |
| :--- | :--- | :--- | :--- | :--- |
| `GET` | `/ping` | Healthcheck del servizio | - | - |
| `POST` | `/calls` | Registra una nuova chiamata | `{ callerNumber, agentId, status?, notes? }` | `call:created` |
| `GET` | `/calls` | Elenco chiamate paginato e filtrabile | `?page=1&limit=20&status=queued&agentId=...` | - |
| `GET` | `/calls/:id` | Dettaglio singola chiamata | `:id` (MongoDB ObjectId) | - |
| `PATCH`| `/calls/:id` | Aggiornamento stato/durata/note | `{ status?, duration?, notes? }` | `call:updated` |

### Esempio risposta paginata (`GET /calls?page=1&limit=5`):
```json
{
  "data": [
    {
      "_id": "6abb7585155ae913408cb414",
      "callerNumber": "+39 02 1234567",
      "agentId": "agent-001",
      "status": "in-progress",
      "duration": 45,
      "createdAt": "2026-09-29T08:23:01.000Z",
      "updatedAt": "2026-09-29T08:23:46.000Z"
    }
  ],
  "pagination": {
    "total": 46,
    "page": 1,
    "limit": 5,
    "totalPages": 10,
    "hasNextPage": true,
    "hasPrevPage": false
  }
}
```

---

## 🔌 Eventi WebSocket (Socket.IO)

Il server espone WebSocket sulla stessa porta HTTP (`ws://localhost:3000`):

- **`call:created`**: Emesso alla creazione di una nuova chiamata via `POST /calls`.
  - **Payload**: Oggetto `Call` completo.
- **`call:updated`**: Emesso all'aggiornamento di una chiamata via `PATCH /calls/:id`.
  - **Payload**: `{ call: Object, previousStatus: String }`.

---

## 📚 Materiale Didattico

Se stai approcciando Node.js ed Express provenendo da **Python (Flask / SQLAlchemy)**, consulta il file [`GUIDA_STUDIO.md`](file:///c:/Users/Administrator/Work/Tesys/cti/GUIDA_STUDIO.md) incluso nel repository: contiene un percorso teorico-pratico dettagliato diviso in 8 fasi con tavole comparative passo per passo tra Flask ed Express.
