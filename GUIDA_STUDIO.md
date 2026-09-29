# 📘 Guida di Studio — Microservizio CTI in Node.js

> Documento che ricostruisce l'intero percorso di sviluppo, fase per fase.
> Ogni sezione include: obiettivo, comandi eseguiti, codice prodotto, test e spiegazioni.

---

## Indice

1. [Fase 1 — Setup del progetto e server Express base](#fase-1--setup-del-progetto-e-server-express-base)
2. [Fase 2 — MongoDB con Docker + Mongoose + Rotte CRUD](#fase-2--mongodb-con-docker--mongoose--rotte-crud)
3. [Fase 3 — Raffinamenti (dotenv, Router, Error Handler)](#fase-3--raffinamenti-dotenv-router-error-handler)
4. [Fase 4 — Worker Python (simulatore CTI)](#fase-4--worker-python-simulatore-cti)
5. [Fase 5 — PATCH /calls/:id e ciclo di vita delle chiamate](#fase-5--patch-callsid-e-ciclo-di-vita-delle-chiamate)
6. [Fase 6 — WebSocket con Socket.IO (notifiche real-time)](#fase-6--websocket-con-socketio-notifiche-real-time)
7. [Fase 7 — Paginazione su GET /calls](#fase-7--paginazione-su-get-calls)
8. [Fase 8 — Docker Compose per Node.js e MongoDB](#fase-8--docker-compose-per-nodejs-e-mongodb)
9. [Struttura finale del progetto](#struttura-finale-del-progetto)
10. [Riferimento completo Flask ↔ Express](#riferimento-completo-flask--express)

---

## Fase 1 — Setup del progetto e server Express base

### Obiettivo
Inizializzare un progetto Node.js, installare Express e Nodemon, creare un server minimale con una rotta di test `/ping`.

### 1.1 — Installazione di Node.js

Node.js non era presente sulla macchina. Installato tramite `winget`:

```powershell
winget install OpenJS.NodeJS.LTS --accept-package-agreements --accept-source-agreements
```

**Output:**
```
Trovato Node.js (LTS) [OpenJS.NodeJS.LTS] Versione 24.19.0
Installazione riuscita
```

Verifica:
```powershell
node --version   # → v24.19.0
npm --version    # → 11.17.0
```

### 1.2 — Inizializzazione del progetto

```powershell
npm init -y
```

> **Parallelismo Flask:** `npm init -y` crea il file `package.json`, che è l'equivalente di un mix tra `setup.py` e `requirements.txt`. Il flag `-y` accetta tutti i default (nome progetto, versione 1.0.0, ecc.).

**Output — `package.json` generato:**
```json
{
  "name": "cti",
  "version": "1.0.0",
  "description": "",
  "main": "index.js",
  "scripts": {
    "test": "echo \"Error: no test specified\" && exit 1"
  },
  "keywords": [],
  "author": "",
  "license": "ISC",
  "type": "commonjs"
}
```

### 1.3 — Installazione delle dipendenze

```powershell
npm install express           # dipendenza di produzione
npm install --save-dev nodemon  # dipendenza solo per sviluppo
```

> **Parallelismo Flask:**
> - `npm install express` → equivalente di `pip install flask`
> - `--save-dev` → la dipendenza serve solo in sviluppo (come `pip install pytest` che non va in produzione)
> - npm aggiorna automaticamente `package.json` con le versioni installate

**Differenza chiave con pip:**
- `pip install` installa nel venv globale e basta. Devi fare `pip freeze > requirements.txt` manualmente.
- `npm install` installa nella cartella locale `node_modules/` E aggiorna `package.json` automaticamente.

### 1.4 — Aggiunta degli script npm

Modifica manuale a `package.json` — aggiunta di `start` e `dev`:

```json
"scripts": {
  "start": "node index.js",
  "dev": "nodemon index.js",
  "test": "echo \"Error: no test specified\" && exit 1"
}
```

> **Parallelismo Flask:**
> - `npm start` → `python app.py` (avvio diretto)
> - `npm run dev` → `flask run --debug` (auto-restart quando modifichi un file)
> - `nodemon` osserva i file e riavvia automaticamente il server ad ogni salvataggio, come il `debug=True` di Flask.

### 1.5 — Creazione di `index.js` (versione iniziale)

Questa è la prima versione del server — minimale, con solo la rotta `/ping`:

```javascript
const express = require('express');

// Crea l'applicazione Express (equivalente di `app = Flask(__name__)`)
const app = express();

const PORT = process.env.PORT || 3000;

// Middleware per parsing JSON
// In Flask usi `request.get_json()` per leggere il body JSON.
// In Express devi *abilitare* esplicitamente il parsing del JSON.
app.use(express.json());

// GET /ping — rotta di health-check
app.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// Avvio del server
// In Flask: app.run(host='0.0.0.0', port=5000, debug=True)
app.listen(PORT, () => {
  console.log(`✅ Server CTI in ascolto su http://localhost:${PORT}`);
});
```

> **Concetto chiave — la callback:**
> In Flask scrivi `@app.route('/ping')` e la funzione sotto è il handler.
> In Express passi la funzione direttamente come argomento: `app.get('/ping', (req, res) => {...})`.
> - `req` → equivalente di `flask.request`
> - `res` → oggetto da cui chiami `.json()`, `.status()`, `.send()`
> - `res.json()` → equivalente di `jsonify()`

### 1.6 — Test della Fase 1

```powershell
# Avvio del server
node index.js
# Output: ✅ Server CTI in ascolto su http://localhost:3000

# Test della rotta /ping (in un altro terminale)
Invoke-RestMethod -Uri http://localhost:3000/ping -Method GET
```

**Output:**
```json
{
  "message": "pong",
  "timestamp": "2026-09-18T13:30:56.682Z"
}
```

✅ **Fase 1 completata.**

---

## Fase 2 — MongoDB con Docker + Mongoose + Rotte CRUD

### Obiettivo
Avviare MongoDB in Docker, connettersi tramite Mongoose, creare il modello `Call`, aggiungere rotte POST e GET.

### 2.1 — Avvio di MongoDB con Docker

```powershell
docker run -d --name mongo-cti -p 27017:27017 -v mongo-cti-data:/data/db mongo:7
```

> **Spiegazione dei flag:**
> - `-d` → esegui in background (detached)
> - `--name mongo-cti` → nome del container (per riferirsi ad esso dopo)
> - `-p 27017:27017` → mappa la porta 27017 del container alla porta 27017 locale
> - `-v mongo-cti-data:/data/db` → crea un volume Docker per persistere i dati (sopravvivono al restart del container)
> - `mongo:7` → immagine ufficiale MongoDB versione 7

**Output:**
```
029128731f8f... (ID del container)
```

**Comandi utili per gestire il container:**
```powershell
docker start mongo-cti    # avvia il container se fermo
docker stop mongo-cti     # ferma il container
docker ps                 # mostra i container attivi
docker logs mongo-cti     # log di MongoDB
```

### 2.2 — Installazione di Mongoose

```powershell
npm install mongoose
```

> **Parallelismo Flask:** Mongoose sta a MongoDB come SQLAlchemy sta a PostgreSQL/MySQL.
> È un **ODM** (Object Document Mapper) — l'equivalente document-based di un ORM.

### 2.3 — Creazione di `db.js` (connessione al database)

```javascript
const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cti_db';

async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`📦 MongoDB connesso a: ${MONGO_URI}`);
  } catch (err) {
    console.error('❌ Errore di connessione a MongoDB:', err.message);
    process.exit(1);
  }
}

module.exports = connectDB;
```

> **Concetto chiave — `async/await`:**
>
> In Flask, `db.init_app(app)` si connette al database in modo **sincrono**: il thread resta bloccato fino a che la connessione non è stabilita. Nessun'altra richiesta può essere processata nel frattempo.
>
> In Node.js, `mongoose.connect()` restituisce una **Promise** — il runtime può fare altro nel frattempo. `await` dice: "metti in pausa QUESTA funzione fino a che la Promise non si risolve, ma il resto del programma resta libero di gestire altri eventi".
>
> È concettualmente identico a `asyncio` in Python, ma in Node.js **tutto l'I/O funziona così di default**.
>
> ```python
> # Python sincrono (Flask) — il thread si blocca
> db.init_app(app)
>
> # Python asincrono (aiohttp) — solo la coroutine si sospende
> await db.connect()
>
> # Node.js — si comporta come il Python asincrono
> await mongoose.connect(MONGO_URI);
> ```

> **Nota su `module.exports`:**
> - In Python: `from db import connect_db`
> - In Node.js (CommonJS): `const connectDB = require('./db')`
> - `module.exports = connectDB` dice "quando qualcuno fa `require('./db')`, restituisci questa funzione".

### 2.4 — Creazione di `models/Call.js` (modello Mongoose)

```javascript
const mongoose = require('mongoose');

const callSchema = new mongoose.Schema(
  {
    callerNumber: {
      type: String,
      required: [true, 'Il numero del chiamante è obbligatorio'],
      trim: true,
    },
    agentId: {
      type: String,
      required: [true, "L'ID dell'agente è obbligatorio"],
      trim: true,
    },
    duration: {
      type: Number,
      default: 0,
      min: [0, 'La durata non può essere negativa'],
    },
    status: {
      type: String,
      enum: {
        values: ['queued', 'in-progress', 'completed', 'failed'],
        message: 'Lo status "{VALUE}" non è valido',
      },
      default: 'queued',
    },
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    timestamps: true,  // aggiunge createdAt e updatedAt automaticamente
  }
);

const Call = mongoose.model('Call', callSchema);
module.exports = Call;
```

> **Parallelismo SQLAlchemy ↔ Mongoose Schema:**
>
> | SQLAlchemy | Mongoose | Significato |
> |---|---|---|
> | `db.Column(db.String(20), nullable=False)` | `{ type: String, required: true }` | Campo obbligatorio |
> | `db.Column(db.Integer, default=0)` | `{ type: Number, default: 0 }` | Valore di default |
> | `@validates('duration')` / `CheckConstraint` | `{ min: 0 }` | Validazione inline |
> | Enum Python / `CHECK` SQL | `{ enum: ['queued', ...] }` | Valori ammessi |
> | `nullable=True` (default) | Nessun `required` | Campo opzionale |
> | `default=datetime.utcnow` + `onupdate=...` | `timestamps: true` | Timestamp automatici |
>
> **Differenza chiave SQL vs MongoDB:**
> - SQL: tabelle con righe e colonne fisse. Devi fare `CREATE TABLE`.
> - MongoDB: collezioni con documenti JSON. La collezione si crea automaticamente al primo inserimento.
> - Mongoose: aggiunge uno schema di validazione sopra MongoDB (che nativamente è "schema-less").
>
> **Nota su `mongoose.model('Call', callSchema)`:**
> - Crea un modello associato alla collezione `calls` (Mongoose pluralizza automaticamente: `Call` → `calls`).
> - Da qui in poi: `Call.create({...})`, `Call.find({})`, `Call.findById(id)`.

### 2.5 — Aggiornamento di `index.js` con le rotte CRUD

In questa fase `index.js` conteneva tutto: import del modello, connessione DB, e le 3 rotte (`POST /calls`, `GET /calls`, `GET /calls/:id`). Nella Fase 3 separeremo le rotte in un file dedicato, ma ecco la logica delle rotte come l'abbiamo scritta inizialmente:

#### POST /calls

```javascript
app.post('/calls', async (req, res) => {
  try {
    const call = await Call.create(req.body);
    res.status(201).json(call);
  } catch (err) {
    if (err.name === 'ValidationError') {
      return res.status(400).json({ error: err.message });
    }
    res.status(500).json({ error: 'Errore interno del server' });
  }
});
```

> **Parallelismo Flask:**
> ```python
> @app.route('/calls', methods=['POST'])
> def create_call():
>     data = request.get_json()
>     call = Call(**data)
>     db.session.add(call)
>     db.session.commit()
>     return jsonify(call.to_dict()), 201
> ```
>
> La differenza principale: in Express `Call.create(req.body)` fa tutto in un'unica chiamata (crea, valida, salva). In SQLAlchemy devi fare `add()` + `commit()` separatamente.

#### GET /calls (con filtri)

```javascript
app.get('/calls', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.agentId) filter.agentId = req.query.agentId;
    if (req.query.callerNumber) filter.callerNumber = req.query.callerNumber;

    const calls = await Call.find(filter).sort({ createdAt: -1 }).lean();

    res.json({ count: calls.length, data: calls });
  } catch (err) {
    res.status(500).json({ error: 'Errore interno del server' });
  }
});
```

> **Parallelismo Flask:**
> - `req.query.status` → `request.args.get('status')`
> - `Call.find(filter)` → `Call.query.filter_by(**filter)`
> - `.sort({ createdAt: -1 })` → `.order_by(Call.created_at.desc())`
> - `.lean()` → ottimizzazione Mongoose: restituisce oggetti JS puri invece di documenti Mongoose "pesanti"

#### GET /calls/:id

```javascript
app.get('/calls/:id', async (req, res) => {
  try {
    const call = await Call.findById(req.params.id).lean();
    if (!call) {
      return res.status(404).json({ error: 'Chiamata non trovata' });
    }
    res.json(call);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'ID non valido' });
    }
    res.status(500).json({ error: 'Errore interno del server' });
  }
});
```

> **Parallelismo Flask:**
> - `:id` nell'URL → `<id>` in Flask
> - `req.params.id` → argomento della funzione
> - `Call.findById(id)` → `Call.query.get(id)`
> - Il `CastError` è specifico di MongoDB: scatta quando l'ID non è un ObjectId valido (24 caratteri hex).

#### Avvio con connessione asincrona al DB

```javascript
(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`✅ Server CTI in ascolto su http://localhost:${PORT}`);
  });
})();
```

> Questa è una **IIFE** (Immediately Invoked Function Expression) asincrona. È necessaria perché `await` può essere usato solo dentro una funzione `async`. Prima ci connettiamo al DB, poi avviamo il server.

### 2.6 — Test della Fase 2

```powershell
# Avvio del server
node index.js
# Output:
# 📦 MongoDB connesso a: mongodb://localhost:27017/cti_db
# ✅ Server CTI in ascolto su http://localhost:3000
```

#### Test POST — Creazione di una chiamata

```powershell
$body = @{
  callerNumber="+39 02 1234567"
  agentId="agent-007"
  duration=185
  status="completed"
  notes="Cliente soddisfatto"
} | ConvertTo-Json

Invoke-RestMethod -Uri http://localhost:3000/calls -Method POST `
  -Body $body -ContentType "application/json"
```

**Output (201 Created):**
```json
{
  "callerNumber": "+39 02 1234567",
  "agentId": "agent-007",
  "duration": 185,
  "status": "completed",
  "notes": "Cliente soddisfatto",
  "_id": "6ab0cdb323b3a45c61e971b7",
  "createdAt": "2026-09-21T06:24:51.957Z",
  "updatedAt": "2026-09-21T06:24:51.957Z",
  "__v": 0
}
```

> **Nota:** `_id` è l'ObjectId generato automaticamente da MongoDB (equivalente della primary key autoincrement in SQL, ma è un hash, non un intero). `__v` è il "version key" usato da Mongoose per il concurrency control.

#### Test POST — Validazione (campi mancanti)

```powershell
$badBody = @{duration=60} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/calls -Method POST `
  -Body $badBody -ContentType "application/json"
```

**Output (400 Bad Request):**
```
Call validation failed: agentId: L'ID dell'agente è obbligatorio,
callerNumber: Il numero del chiamante è obbligatorio
```

#### Test GET — Tutte le chiamate

```powershell
Invoke-RestMethod -Uri http://localhost:3000/calls
```

**Output:**
```json
{
  "count": 2,
  "data": [
    { "_id": "...", "callerNumber": "+39 06 9876543", "status": "queued", ... },
    { "_id": "...", "callerNumber": "+39 02 1234567", "status": "completed", ... }
  ]
}
```

#### Test GET — Filtro per status

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/calls?status=queued"
```

**Output:** solo le chiamate con `status: "queued"` (count: 1).

#### Test GET — Singola chiamata per ID

```powershell
Invoke-RestMethod -Uri http://localhost:3000/calls/6ab0cdb323b3a45c61e971b7
```

**Output:** il documento completo della chiamata.

#### Test GET — ID inesistente

```powershell
Invoke-RestMethod -Uri http://localhost:3000/calls/000000000000000000000000
# → 404 Not Found: "Chiamata non trovata"
```

✅ **Fase 2 completata.**

---

## Fase 3 — Raffinamenti (dotenv, Router, Error Handler)

### Obiettivo
Migliorare la struttura del progetto: configurazione esternalizzata con `.env`, separazione delle rotte con `express.Router()` (come i Blueprint Flask), e error handler centralizzato.

### 3.1 — Installazione di dotenv

```powershell
npm install dotenv
```

### 3.2 — Creazione del file `.env`

```env
PORT=3000
MONGO_URI=mongodb://localhost:27017/cti_db
NODE_ENV=development
```

> **Parallelismo Flask:**
> - In Flask usi `python-dotenv` e `load_dotenv()`.
> - In Node.js usi `require('dotenv').config()` — identica funzione.
> - `process.env.PORT` → `os.environ.get('PORT')`
>
> **Importante:** il file `.env` non va committato nel repository! Contiene configurazioni specifiche dell'ambiente.

### 3.3 — Creazione di `.gitignore`

```gitignore
# Dipendenze
node_modules/

# Variabili d'ambiente (contengono segreti / config locali)
.env

# Log
*.log

# OS
Thumbs.db
.DS_Store

# Python
workers/.venv/
__pycache__/
*.pyc
```

### 3.4 — Creazione di `routes/calls.js` (Express Router)

Le rotte sono state estratte da `index.js` in un file dedicato, usando `express.Router()`:

```javascript
const express = require('express');
const Call = require('../models/Call');

const router = express.Router();

// POST / (montato su /calls → POST /calls)
router.post('/', async (req, res, next) => {
  try {
    const call = await Call.create(req.body);
    res.status(201).json(call);
  } catch (err) {
    next(err);  // delega all'error handler centralizzato
  }
});

// GET / (montato su /calls → GET /calls)
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.agentId) filter.agentId = req.query.agentId;
    if (req.query.callerNumber) filter.callerNumber = req.query.callerNumber;

    const calls = await Call.find(filter).sort({ createdAt: -1 }).lean();
    res.json({ count: calls.length, data: calls });
  } catch (err) {
    next(err);
  }
});

// GET /:id (montato su /calls → GET /calls/:id)
router.get('/:id', async (req, res, next) => {
  try {
    const call = await Call.findById(req.params.id).lean();
    if (!call) {
      return res.status(404).json({ error: 'Chiamata non trovata' });
    }
    res.json(call);
  } catch (err) {
    next(err);
  }
});

module.exports = router;
```

> **Parallelismo Flask — Blueprint:**
>
> | Flask (Blueprint) | Express (Router) |
> |---|---|
> | `calls_bp = Blueprint('calls', __name__)` | `const router = express.Router()` |
> | `@calls_bp.route('/', methods=['POST'])` | `router.post('/')` |
> | `app.register_blueprint(calls_bp, url_prefix='/calls')` | `app.use('/calls', router)` |
> | Le rotte nel blueprint sono relative al prefisso | Identico! `'/'` diventa `'/calls'` |
> | `raise Exception(...)` → catturato da `@app.errorhandler` | `next(err)` → catturato dall'error handler |
>
> **Cambio chiave:** nella Fase 2 ogni rotta gestiva i propri errori con `try/catch` locale. Ora usiamo `next(err)` per delegare la gestione a un error handler centralizzato in `index.js`.

### 3.5 — Refactoring di `index.js` (versione finale)

Il file è stato snellito — contiene solo: caricamento dotenv, creazione app, middleware, montaggio del router, error handler, avvio.

```javascript
// DEVE essere la prima istruzione
require('dotenv').config();

const express = require('express');
const connectDB = require('./db');
const callsRouter = require('./routes/calls');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());

// Rotte
app.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// Montaggio del router (come register_blueprint)
app.use('/calls', callsRouter);

// Error Handler Centralizzato (4 parametri = Express lo riconosce come error handler)
app.use((err, req, res, next) => {
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'ID non valido' });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON non valido nel body della richiesta' });
  }
  console.error('❌ Errore non gestito:', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

// Avvio
(async () => {
  await connectDB();
  app.listen(PORT, () => {
    console.log(`✅ Server CTI in ascolto su http://localhost:${PORT}`);
    console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
})();
```

> **Error Handler — concetto chiave:**
>
> In Flask:
> ```python
> @app.errorhandler(Exception)
> def handle_error(error):
>     return jsonify(error=str(error)), 500
> ```
>
> In Express: un middleware con **4 parametri** `(err, req, res, next)` è riconosciuto automaticamente come error handler. Il 4° parametro `next` è necessario nella signature anche se non lo usiamo — è così che Express lo distingue dai middleware normali.
>
> Nelle rotte, `next(err)` è l'equivalente di `raise` in Python.

### 3.6 — Test della Fase 3

```powershell
node index.js
# Output:
# ◇ injected env (3) from .env       ← dotenv ha caricato 3 variabili
# 📦 MongoDB connesso a: mongodb://localhost:27017/cti_db
# ✅ Server CTI in ascolto su http://localhost:3000
#    Ambiente: development
```

Tutti i test della Fase 2 sono stati rieseguiti e confermati funzionanti, incluso il test dell'error handler centralizzato:

```powershell
# Test error handler — ID non valido
Invoke-RestMethod -Uri http://localhost:3000/calls/not-a-valid-id
# → 400: "ID non valido"

# Test error handler — body senza campi required
$body = @{} | ConvertTo-Json
Invoke-RestMethod -Uri http://localhost:3000/calls -Method POST `
  -Body $body -ContentType "application/json"
# → 400: "Call validation failed: agentId: L'ID dell'agente è obbligatorio, ..."
```

✅ **Fase 3 completata.**

---

## Fase 4 — Worker Python (simulatore CTI)

### Obiettivo
Creare un worker Python che simula un sistema CTI di terze parti, generando eventi di chiamata e inviandoli al server Node.js via HTTP POST.

### Architettura

```
┌────────────────────┐    HTTP POST     ┌────────────────────┐    Mongoose    ┌───────────┐
│   CTI Worker(s)    │ ───────────────► │   Server Node.js   │ ─────────────► │  MongoDB  │
│   (Python)         │   /calls         │   (Express)        │               │  (Docker) │
└────────────────────┘                  └────────────────────┘               └───────────┘
```

In produzione avresti N worker Python connessi a N sistemi CTI diversi (Asterisk, 3CX, Twilio, ecc.), tutti che inviano dati allo stesso server Node.js centrale.

### 4.1 — Setup dell'ambiente Python

```powershell
# Creazione del virtual environment
py -m venv workers\.venv

# Installazione delle dipendenze
workers\.venv\Scripts\pip.exe install -r workers\requirements.txt
```

**`workers/requirements.txt`:**
```
requests>=2.31,<3
```

> **Nota:** usiamo solo `requests` — la libreria HTTP standard di Python. Il worker è un client HTTP, non un server.

### 4.2 — Creazione di `workers/config.py`

```python
# URL base del server Node.js CTI
API_BASE_URL = "http://localhost:3000"
CALLS_ENDPOINT = f"{API_BASE_URL}/calls"

# Pool di dati simulati
CALLER_NUMBERS = [
    "+39 02 1234567",   # Milano
    "+39 06 9876543",   # Roma
    "+39 011 5551234",  # Torino
    "+39 055 4443210",  # Firenze
    "+39 081 7776655",  # Napoli
    "+39 091 3332211",  # Palermo
    "+39 040 8889900",  # Trieste
    "+39 051 2224433",  # Bologna
]

AGENT_IDS = ["agent-001", "agent-002", "agent-003", "agent-004", "agent-005"]

# Flusso reale di una chiamata CTI:  queued → in-progress → completed/failed
CALL_STATUSES = ["queued", "in-progress", "completed", "failed"]

# Parametri di simulazione
MIN_DURATION = 15       # secondi
MAX_DURATION = 600
MIN_INTERVAL = 1.0      # pausa tra le chiamate
MAX_INTERVAL = 5.0
```

### 4.3 — Creazione di `workers/cti_simulator.py`

Il simulatore ha 4 funzioni principali:

#### `verify_server()` — pre-flight check

```python
def verify_server() -> bool:
    """Verifica che il server Node.js sia raggiungibile prima di partire."""
    try:
        r = requests.get(f"{config.API_BASE_URL}/ping", timeout=5)
        data = r.json()
        print(f"✅ Server raggiungibile — ping: {data.get('message')}\n")
        return True
    except (requests.ConnectionError, requests.Timeout):
        print(f"❌ Server non raggiungibile su {config.API_BASE_URL}")
        return False
```

#### `generate_call_event()` — generatore di CDR simulati

```python
def generate_call_event() -> dict:
    status = random.choice(config.CALL_STATUSES)
    call = {
        "callerNumber": random.choice(config.CALLER_NUMBERS),
        "agentId": random.choice(config.AGENT_IDS),
        "status": status,
    }
    # La durata ha senso solo per chiamate terminate
    if status in ("completed", "failed"):
        call["duration"] = random.randint(config.MIN_DURATION, config.MAX_DURATION)
    # Note per alcune chiamate
    if status == "failed":
        call["notes"] = random.choice([
            "Chiamata caduta - problema di rete",
            "Cliente ha riagganciato",
            "Timeout - nessuna risposta dall'agente",
        ])
    return call
```

> In un sistema CTI reale, questi dati verrebbero da:
> - **CDR** (Call Detail Record) dal centralino
> - **Webhook** da un provider VoIP
> - **AMI** (Asterisk Manager Interface)
> - **TAPI** (Telephony API)

#### `send_call()` — invio HTTP al server Node.js

```python
def send_call(call_data: dict) -> dict | None:
    try:
        response = requests.post(
            config.CALLS_ENDPOINT,
            json=call_data,    # requests serializza in JSON automaticamente
            timeout=10,
        )
        response.raise_for_status()
        return response.json()
    except requests.ConnectionError:
        print(f"  ❌ Connessione rifiutata")
        return None
    except requests.HTTPError as e:
        print(f"  ❌ Errore HTTP {e.response.status_code}: {e.response.text}")
        return None
```

> **Nota per lo sviluppatore Flask:** qui sei sul lato **client**, non server. `requests.post()` è l'inverso di `@app.route('/calls', methods=['POST'])`. Il tuo server Node.js riceve questa richiesta e la processa.

#### `run_simulation()` — loop principale

```python
def run_simulation(count: int, burst: bool = False):
    for i in range(1, count + 1):
        call_data = generate_call_event()
        result = send_call(call_data)
        # Pausa realistica tra le chiamate
        if not burst and i < count:
            delay = random.uniform(config.MIN_INTERVAL, config.MAX_INTERVAL)
            time.sleep(delay)
```

### 4.4 — Fix encoding Windows

La console Windows usa `cp1252` che non supporta le emoji. Aggiunto dopo gli import:

```python
import sys
sys.stdout.reconfigure(encoding="utf-8")
```

### 4.5 — Test della Fase 4

```powershell
# 1. Avviare il server Node.js (in un terminale)
node index.js

# 2. Lanciare il worker Python (in un altro terminale)
workers\.venv\Scripts\python.exe workers\cti_simulator.py --count 10 --burst
```

**Output del worker:**
```
✅ Server raggiungibile — ping: pong

🚀 CTI Simulator avviato
   Target: http://localhost:3000/calls
   Chiamate da generare: 10
   Modalità: burst (senza pause)
------------------------------------------------------------
[11:19:17] (1/10) +39 051 2224433 → agent-001 [completed]  ✅ id=6ab0f695776e5b5b015cb93b
[11:19:17] (2/10) +39 02 1234567 → agent-003 [in-progress]  ✅ id=6ab0f695776e5b5b015cb93c
[11:19:17] (3/10) +39 040 8889900 → agent-003 [completed]  ✅ id=6ab0f695776e5b5b015cb93d
[11:19:17] (4/10) +39 081 7776655 → agent-002 [failed]  ✅ id=6ab0f695776e5b5b015cb93e
[11:19:17] (5/10) +39 02 1234567 → agent-002 [completed]  ✅ id=6ab0f695776e5b5b015cb93f
[11:19:17] (6/10) +39 040 8889900 → agent-002 [in-progress]  ✅ id=6ab0f695776e5b5b015cb940
[11:19:17] (7/10) +39 040 8889900 → agent-005 [in-progress]  ✅ id=6ab0f695776e5b5b015cb941
[11:19:17] (8/10) +39 081 7776655 → agent-002 [completed]  ✅ id=6ab0f695776e5b5b015cb942
[11:19:17] (9/10) +39 051 2224433 → agent-002 [in-progress]  ✅ id=6ab0f695776e5b5b015cb943
[11:19:17] (10/10) +39 02 1234567 → agent-005 [completed]  ✅ id=6ab0f695776e5b5b015cb944
------------------------------------------------------------
📊 Simulazione completata: 10 OK, 0 errori su 10 totali
```

**Verifica dati lato server:**
```powershell
(Invoke-RestMethod -Uri http://localhost:3000/calls).count
# → 13  (3 test manuali della Fase 2 + 10 dal worker)

(Invoke-RestMethod -Uri "http://localhost:3000/calls?status=failed").data
# → 1 chiamata failed con nota "Chiamata caduta - problema di rete"

(Invoke-RestMethod -Uri "http://localhost:3000/calls?agentId=agent-002").count
# → 5 chiamate gestite da agent-002
```

**Modalità di uso del worker:**
```powershell
python cti_simulator.py                       # 10 chiamate con pause 1-5s
python cti_simulator.py --count 50            # 50 chiamate con pause
python cti_simulator.py --count 100 --burst   # 100 chiamate senza pause
```

✅ **Fase 4 completata.**

---

## Fase 5 — PATCH /calls/:id e ciclo di vita delle chiamate

### Obiettivo
Aggiungere una rotta PATCH per aggiornare parzialmente una chiamata, con **validazione delle transizioni di stato** che implementa il ciclo di vita reale di una chiamata CTI.

### 5.1 — PUT vs PATCH: quale scegliere?

| Metodo | Semantica | Quando usarlo |
|---|---|---|
| **PUT** | Sostituisci l'INTERA risorsa | Devi inviare TUTTI i campi, anche quelli invariati |
| **PATCH** | Modifica ALCUNI campi | Invii solo i campi che vuoi aggiornare |

Per il nostro caso (aggiornare lo status di una chiamata) **PATCH è la scelta corretta**: non vogliamo che il client debba reinviare `callerNumber`, `agentId`, ecc. ogni volta.

> **Parallelismo Flask:**
> In Flask non c'è distinzione sintattica tra PUT e PATCH — usi `methods=['PUT']` o `methods=['PATCH']` nel decoratore e la logica la gestisci tu.
> In Express è lo stesso: `router.put()` vs `router.patch()`.

### 5.2 — Il ciclo di vita di una chiamata CTI

```
queued ──► in-progress ──► completed
                       └──► failed
```

Non tutte le transizioni sono valide:
- ✅ `queued → in-progress` — l'agente prende la chiamata
- ✅ `queued → failed` — la chiamata cade prima di essere presa
- ✅ `in-progress → completed` — conversazione terminata con successo
- ✅ `in-progress → failed` — chiamata caduta durante la conversazione
- ❌ `queued → completed` — non puoi completare una chiamata senza averla presa
- ❌ `completed → qualsiasi` — stato terminale, nessuna transizione ammessa
- ❌ `failed → qualsiasi` — stato terminale, nessuna transizione ammessa

### 5.3 — Codice aggiunto a `routes/calls.js`

#### Mappa delle transizioni

```javascript
const allowedTransitions = {
  'queued':       ['in-progress', 'failed'],
  'in-progress':  ['completed', 'failed'],
  'completed':    [],   // stato terminale
  'failed':       [],   // stato terminale
};
```

> Questa è una **state machine** minima. Ogni chiave è lo stato attuale, il valore è l'array degli stati raggiungibili. Se l'array è vuoto, lo stato è terminale.

#### La rotta PATCH /:id

```javascript
router.patch('/:id', async (req, res, next) => {
  try {
    // 1. Recupera il documento attuale per validare la transizione
    const currentCall = await Call.findById(req.params.id);

    if (!currentCall) {
      return res.status(404).json({ error: 'Chiamata non trovata' });
    }

    // 2. Valida la transizione di stato
    if (req.body.status) {
      const from = currentCall.status;
      const to = req.body.status;

      if (from !== to) {
        const allowed = allowedTransitions[from] || [];
        if (!allowed.includes(to)) {
          return res.status(422).json({
            error: `Transizione di stato non valida: "${from}" → "${to}"`,
            allowedTransitions: allowed.length > 0
              ? allowed
              : 'Nessuna (stato terminale)',
          });
        }
      }
    }

    // 3. Filtra i campi aggiornabili (whitelist)
    const allowedFields = ['status', 'duration', 'notes'];
    const updates = {};
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    }

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({
        error: 'Nessun campo aggiornabile fornito',
        updatableFields: allowedFields,
      });
    }

    // 4. Aggiorna il documento
    const updatedCall = await Call.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    res.json(updatedCall);
  } catch (err) {
    next(err);
  }
});
```

> **Concetti chiave commentati nel codice:**
>
> **Whitelist dei campi aggiornabili:**
> `callerNumber` e `agentId` non sono modificabili — sono dati immutabili del CDR originale. Solo `status`, `duration` e `notes` possono essere aggiornati.
>
> In Flask faresti:
> ```python
> allowed_fields = {'status', 'duration', 'notes'}
> updates = {k: v for k, v in data.items() if k in allowed_fields}
> ```
>
> **`findByIdAndUpdate()` e le sue opzioni:**
>
> | Opzione | Default | Cosa fa |
> |---|---|---|
> | `new: true` | `false` | Restituisce il documento DOPO l'update (non quello vecchio) |
> | `runValidators: true` | `false` | Esegue le validazioni dello schema Mongoose anche sugli update |
>
> **Attenzione:** senza `runValidators: true`, Mongoose NON valida i dati durante gli update! Le validazioni (`enum`, `min`, `required`) funzionano di default solo su `create()` / `save()`. Questa è una trappola comune per chi viene da SQLAlchemy, dove la validazione è sempre attiva.
>
> **Status HTTP 422 — Unprocessable Entity:**
> Usato per le transizioni di stato non valide. A differenza del 400 (Bad Request, "i dati sono malformati"), il 422 indica che "i dati sono sintatticamente validi ma semanticamente non processabili" — il valore `completed` è un status valido, ma la transizione `queued → completed` non lo è.

### 5.4 — Test della Fase 5

#### Test del ciclo di vita completo (happy path)

```powershell
# 1. Creo una chiamata (nasce come "queued" di default)
$body = @{callerNumber="+39 02 9999999"; agentId="agent-lifecycle"} | ConvertTo-Json
$call = Invoke-RestMethod -Uri http://localhost:3000/calls -Method POST `
  -Body $body -ContentType "application/json"
# → Status: queued

# 2. queued → in-progress (l'agente prende la chiamata)
$patch = @{status="in-progress"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/calls/$($call._id)" -Method PATCH `
  -Body $patch -ContentType "application/json"
# → Status: in-progress | updatedAt aggiornato automaticamente

# 3. in-progress → completed + durata e note
$patch2 = @{status="completed"; duration=245; notes="Ticket #789 risolto"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/calls/$($call._id)" -Method PATCH `
  -Body $patch2 -ContentType "application/json"
# → Status: completed | Duration: 245 | Notes: Ticket #789 risolto
```

#### Test transizione non valida (stato terminale)

```powershell
$patch3 = @{status="queued"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/calls/$($call._id)" -Method PATCH `
  -Body $patch3 -ContentType "application/json"
```

**Output (422 Unprocessable Entity):**
```json
{
  "error": "Transizione di stato non valida: \"completed\" → \"queued\"",
  "allowedTransitions": "Nessuna (stato terminale)"
}
```

#### Test salto di stato non valido

```powershell
# Creo una nuova chiamata "queued" e tento di portarla direttamente a "completed"
$patch5 = @{status="completed"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/calls/$id" -Method PATCH `
  -Body $patch5 -ContentType "application/json"
```

**Output (422):** `Transizione di stato non valida: "queued" → "completed"`

#### Test campo non modificabile (immutabilità CDR)

```powershell
$patch6 = @{callerNumber="+39 02 HACKED"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/calls/$id" -Method PATCH `
  -Body $patch6 -ContentType "application/json"
```

**Output (400):** `Nessun campo aggiornabile fornito` — il campo `callerNumber` non è nella whitelist.

#### Test aggiornamento solo note (senza cambio status)

```powershell
$patch8 = @{notes="Aggiornamento note senza toccare lo status"} | ConvertTo-Json
Invoke-RestMethod -Uri "http://localhost:3000/calls/$id" -Method PATCH `
  -Body $patch8 -ContentType "application/json"
# → Status: queued (invariato) | Notes: aggiornate
```

#### Riepilogo test

- ✅ Ciclo completo: `queued → in-progress → completed` con durata e note
- ✅ Transizione da stato terminale rifiutata (422)
- ✅ Salto di stato rifiutato: `queued → completed` (422)
- ✅ Campo immutabile (`callerNumber`) rifiutato (400)
- ✅ ID inesistente restituisce 404
- ✅ Aggiornamento solo note senza toccare lo status

✅ **Fase 5 completata.**

---

## Fase 6 — WebSocket con Socket.IO (notifiche real-time)

### Obiettivo
Aggiungere comunicazione real-time: quando una chiamata viene creata o aggiornata via REST API, il server notifica istantaneamente tutti i client WebSocket connessi.

### 6.1 — HTTP vs WebSocket: quando usare cosa?

| Protocollo | Direzione | Quando usarlo |
|---|---|---|
| **HTTP (REST)** | Client → Server (request/response) | CRUD: creare, leggere, aggiornare dati |
| **WebSocket** | Bidirezionale (connessione persistente) | Notifiche real-time, dashboard live, chat |

Con solo HTTP, un client che vuole sapere se ci sono nuove chiamate deve fare **polling** (richiedere `GET /calls` ogni N secondi). Con WebSocket, il server **push** l'informazione al client appena succede qualcosa.

> **Parallelismo Flask:**
> In Flask useresti **Flask-SocketIO**:
> ```python
> from flask_socketio import SocketIO
> socketio = SocketIO(app)
> socketio.emit('call:created', data)
> socketio.run(app, port=5000)
> ```
> In Node.js usi **Socket.IO** — la stessa libreria, lato server.

### 6.2 — Installazione

```powershell
# Lato server (Node.js)
npm install socket.io

# Lato client Python (per il listener)
workers\.venv\Scripts\pip.exe install "python-socketio[client]"
```

### 6.3 — Modifiche a `index.js`

Il cambiamento architetturale chiave: Express da solo usa `app.listen()`. Socket.IO ha bisogno di un **server HTTP di Node.js** a cui agganciarsi.

```javascript
// PRIMA (solo Express):
app.listen(PORT, () => { ... });

// DOPO (Express + Socket.IO):
const http = require('http');
const { Server } = require('socket.io');

const server = http.createServer(app);     // Server HTTP "puro" di Node.js
const io = new Server(server, {            // Socket.IO si aggancia al server
  cors: { origin: '*' },
});

// Condividi `io` con i router tramite app.set()
app.set('io', io);

// Gestione connessioni WebSocket
io.on('connection', (socket) => {
  console.log(`🔌 Client connesso: ${socket.id}`);
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Client disconnesso: ${socket.id} (${reason})`);
  });
});

// IMPORTANTE: ora è `server.listen()`, non `app.listen()`
server.listen(PORT, () => { ... });
```

> **Parallelismo Flask-SocketIO:**
>
> | Flask-SocketIO | Socket.IO (Node.js) |
> |---|---|
> | `socketio = SocketIO(app)` | `const io = new Server(server)` |
> | `socketio.run(app, port=5000)` | `server.listen(PORT)` |
> | `@socketio.on('connect')` | `io.on('connection', (socket) => {...})` |
> | `request.sid` | `socket.id` |
> | `socketio.emit('event', data)` | `io.emit('event', data)` |
>
> **`app.set('io', io)` / `app.get('io')`:**
> Express ha un registry chiave-valore integrato. Lo usiamo per rendere `io` accessibile da tutti i router tramite `req.app.get('io')`. In Flask l'equivalente sarebbe `current_app.extensions['socketio']`.

### 6.4 — Modifiche a `routes/calls.js`

Nelle rotte POST e PATCH, dopo il salvataggio nel DB, emettiamo un evento WebSocket:

#### POST — evento `call:created`

```javascript
router.post('/', async (req, res, next) => {
  try {
    const call = await Call.create(req.body);

    // Emetti a TUTTI i client connessi
    const io = req.app.get('io');
    io.emit('call:created', call);

    res.status(201).json(call);
  } catch (err) {
    next(err);
  }
});
```

#### PATCH — evento `call:updated`

```javascript
// Dopo findByIdAndUpdate:
const io = req.app.get('io');
io.emit('call:updated', {
  call: updatedCall,
  previousStatus: currentCall.status,  // utile per mostrare la transizione
});
```

> **Nota:** `io.emit()` invia a **tutti** i client connessi (broadcast). Se volessi inviare solo a un client specifico: `io.to(socketId).emit(...)`.

### 6.5 — Client Python: `ws_listener.py`

Creato un nuovo script Python che si connette via WebSocket e ascolta gli eventi in tempo reale:

```python
import socketio

sio = socketio.Client()

@sio.event
def connect():
    print(f"✅ Connesso - Socket ID: {sio.sid}")

@sio.on('call:created')
def on_call_created(data):
    print(f"📞 NUOVA CHIAMATA - {data.get('callerNumber')} → {data.get('agentId')}")

@sio.on('call:updated')
def on_call_updated(data):
    call = data.get('call', {})
    prev = data.get('previousStatus')
    print(f"🔄 AGGIORNAMENTO - {prev} → {call.get('status')}")

sio.connect("http://localhost:3000")
sio.wait()  # Resta in ascolto finché non premi Ctrl+C
```

> **Parallelismo Flask-SocketIO client:**
> La libreria `python-socketio` funziona sia come client che come server. Lato client, usi `socketio.Client()` e decori le funzioni con `@sio.on('evento')` — sintassi identica al lato server Flask.

### 6.6 — Test della Fase 6

Architettura del test (3 terminali):

```
Terminale 1: npm run dev              ← Server (Express + Socket.IO)
Terminale 2: python ws_listener.py    ← Listener WebSocket
Terminale 3: python cti_simulator.py  ← Invia chiamate via POST
```

#### Output del listener (ricevuto in tempo reale):

```
✅ Connesso al server: http://localhost:3000
   Socket ID: qkcJ6y6z2FPRYuD4AAAB
   In attesa di eventi...

----------------------------------------------------------------------
📞 NUOVA CHIAMATA
   ID:      6ab64a79a5ca875ebb7790a9
   Da:      +39 011 5551234
   Agente:  agent-001
   Status:  queued
----------------------------------------------------------------------
📞 NUOVA CHIAMATA
   ID:      6ab64a79a5ca875ebb7790aa
   Da:      +39 06 9876543
   Agente:  agent-004
   Status:  queued
----------------------------------------------------------------------
📞 NUOVA CHIAMATA
   ID:      6ab64a79a5ca875ebb7790ab
   Da:      +39 091 3332211
   Agente:  agent-005
   Status:  in-progress
----------------------------------------------------------------------
🔄 AGGIORNAMENTO CHIAMATA
   ID:          6ab64a79a5ca875ebb7790aa
   Transizione: queued → in-progress
   Agente:      agent-004
----------------------------------------------------------------------
```

#### Riepilogo test

- ✅ Listener connesso e riceve `socket.id` dal server
- ✅ 3 eventi `call:created` ricevuti in tempo reale dal simulatore
- ✅ 1 evento `call:updated` con transizione `queued → in-progress` ricevuto via PATCH
- ✅ Il server loga connessione/disconnessione dei client WebSocket

✅ **Fase 6 completata.**

---


---

## Fase 7 — Paginazione su GET /calls

### Obiettivo
Sostituire la risposta "tutti i documenti in una volta" con una risposta paginata: il client sceglie quale pagina vuole e quanti risultati per pagina.

### 7.1 — Perché la paginazione è necessaria

Senza paginazione, `GET /calls` restituisce **tutti** i documenti. Con 10 chiamate non è un problema, ma con 100.000:
- Il server deve caricare tutto in memoria → **spreco di RAM**
- La risposta JSON pesa megabyte → **rete lenta**
- Il client deve renderizzare tutto → **UI bloccata**

La paginazione divide i risultati in "pagine" di dimensione fissa. Il client chiede una pagina alla volta.

### 7.2 — Come funziona la paginazione in Mongoose

In SQL conosci `LIMIT` e `OFFSET`:
```sql
SELECT * FROM calls ORDER BY created_at DESC LIMIT 20 OFFSET 40
-- "Salta i primi 40, restituisci i prossimi 20"
```

In Mongoose è identico, ma con metodi concatenati:
```javascript
Call.find(filter)
  .sort({ createdAt: -1 })
  .skip(40)      // OFFSET 40 — salta i primi 40 documenti
  .limit(20)     // LIMIT 20  — restituisci max 20 documenti
  .lean()
```

> **Parallelismo Flask + SQLAlchemy:**
>
> SQLAlchemy ha un metodo `.paginate()` built-in:
> ```python
> pagination = Call.query.filter_by(**filters).paginate(page=2, per_page=20)
> pagination.items      # i risultati della pagina
> pagination.total      # conteggio totale
> pagination.pages      # numero totale di pagine
> pagination.has_next   # True/False
> pagination.has_prev   # True/False
> ```
>
> Mongoose **non ha** un `.paginate()` built-in — usiamo `.skip()` + `.limit()` + `countDocuments()` separatamente.

### 7.3 — Codice: la rotta GET / paginata

```javascript
router.get('/', async (req, res, next) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.agentId) filter.agentId = req.query.agentId;
    if (req.query.callerNumber) filter.callerNumber = req.query.callerNumber;

    // Parsing e sanitizzazione dei parametri
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
    const skip = (page - 1) * limit;

    // Due query in parallelo con Promise.all()
    const [calls, total] = await Promise.all([
      Call.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Call.countDocuments(filter),
    ]);

    const totalPages = Math.ceil(total / limit);

    res.json({
      data: calls,
      pagination: {
        total,
        page,
        limit,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
    });
  } catch (err) {
    next(err);
  }
});
```

#### Concetti chiave spiegati

**Sanitizzazione dei parametri:**
```javascript
const page = Math.max(1, parseInt(req.query.page) || 1);
//    │         │           │                        │
//    │         │           │                        └ se parseInt fallisce (NaN), usa 1
//    │         │           └ converte la stringa "3" nel numero 3
//    │         └ pagina minima = 1 (impedisce pagina 0 o negativa)
//    └ risultato finale

const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));
//    │            │           │
//    │            │           └ limit minimo = 1
//    │            └ limit massimo = 100 (protezione contro query pesanti)
//    └ risultato: 1 ≤ limit ≤ 100
```

> In Flask faresti:
> ```python
> page = max(1, request.args.get('page', 1, type=int))
> limit = min(100, max(1, request.args.get('limit', 20, type=int)))
> ```

**`Promise.all()` — query parallele:**
```javascript
const [calls, total] = await Promise.all([
  Call.find(filter)...,      // Query 1: i documenti della pagina
  Call.countDocuments(filter), // Query 2: conteggio totale
]);
```

Senza `Promise.all()`, le query sarebbero sequenziali:
```javascript
const calls = await Call.find(filter)...;   // aspetta...
const total = await Call.countDocuments(filter); // poi questa
// Tempo totale = tempo query 1 + tempo query 2
```

Con `Promise.all()`:
```javascript
// Le due query partono CONTEMPORANEAMENTE
// Tempo totale = max(tempo query 1, tempo query 2)
```

> **Parallelismo Python:**
> ```python
> import asyncio
> calls, total = await asyncio.gather(
>     db.execute(query.offset(skip).limit(limit)),
>     db.execute(select(func.count()).where(...))
> )
> ```

**Destructuring assignment `const [calls, total] = ...`:**
È lo "spacchettamento" — come il tuple unpacking di Python:
```python
# Python
calls, total = await asyncio.gather(query1, query2)
```

**Formato della risposta:**
```json
{
  "data": [ ... ],
  "pagination": {
    "total": 46,
    "page": 2,
    "limit": 5,
    "totalPages": 10,
    "hasNextPage": true,
    "hasPrevPage": true
  }
}
```

> **Nota:** la risposta precedente era `{ count: 13, data: [...] }`. Ora `count` è sostituito da `pagination.total` — è più informativo e standard nelle API REST paginate.

### 7.4 — Test della Fase 7

Per avere abbastanza dati, abbiamo generato 25 chiamate col simulatore (totale nel DB: 46).

#### Test paginazione base

```powershell
# Default: pagina 1, 20 risultati
Invoke-RestMethod -Uri http://localhost:3000/calls
```

```json
{
  "pagination": {
    "total": 46, "page": 1, "limit": 20,
    "totalPages": 3, "hasNextPage": true, "hasPrevPage": false
  }
}
```

#### Test con page e limit espliciti

```powershell
# Pagina 1, 5 risultati
Invoke-RestMethod -Uri "http://localhost:3000/calls?page=1&limit=5"
# → total: 46, page: 1, limit: 5, totalPages: 10, hasNextPage: true

# Pagina 2, 5 risultati
Invoke-RestMethod -Uri "http://localhost:3000/calls?page=2&limit=5"
# → total: 46, page: 2, totalPages: 10, hasNextPage: true, hasPrevPage: true
```

#### Test ultima pagina (residuo)

```powershell
# Ultima pagina: potrebbe avere meno di 5 risultati
Invoke-RestMethod -Uri "http://localhost:3000/calls?page=10&limit=5"
# → data.Count: 1, hasNextPage: false, hasPrevPage: true
```

#### Test pagina oltre il totale

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/calls?page=999&limit=5"
# → data.Count: 0 (nessun risultato), total: 46
```

#### Test sanitizzazione parametri

```powershell
# limit=500 → cappato a 100
Invoke-RestMethod -Uri "http://localhost:3000/calls?limit=500"
# → pagination.limit: 100

# page=0 → corretto a 1
Invoke-RestMethod -Uri "http://localhost:3000/calls?page=0&limit=5"
# → pagination.page: 1

# limit=-5 → corretto a 1
Invoke-RestMethod -Uri "http://localhost:3000/calls?limit=-5"
# → pagination.limit: 1, data.Count: 1
```

#### Test filtro + paginazione combinati

```powershell
Invoke-RestMethod -Uri "http://localhost:3000/calls?status=queued&page=1&limit=3"
# → total: 13 (solo le queued), totalPages: 5
```

#### Riepilogo test

- ✅ Default `page=1`, `limit=20` con metadati completi
- ✅ Navigazione tra pagine (`hasNextPage`/`hasPrevPage` corretti)
- ✅ Ultima pagina con residuo (1 risultato su 5)
- ✅ Pagina oltre il totale → array vuoto, `total` corretto
- ✅ `limit` cappato a 100 (protezione)
- ✅ `page=0` / `limit=-5` → corretti automaticamente
- ✅ Filtri + paginazione funzionano insieme

✅ **Fase 7 completata.**

---
## Fase 8 — Docker Compose per Node.js e MongoDB

### Obiettivo
Dockerizzare l'applicazione Node.js e utilizzare Docker Compose per orchestrare automaticamente sia il server API che il database MongoDB, superando la gestione manuale di container multipli.

### 8.1 — Paragone PRIMA e DOPO

**PRIMA (Gestione manuale):**
- Terminale 1: Esecuzione manuale di MongoDB: `docker run -d --name mongo-cti -p 27017:27017 -v mongo-cti-data:/data/db mongo:7`
- Terminale 2: Avvio del server Node.js: `npm run dev` o `node index.js`
- `MONGO_URI` nel file `.env` puntava a `localhost`.

**DOPO (Orchestrazione con Docker Compose):**
- Un singolo comando: `docker compose up -d` avvia tutto.
- Il server e MongoDB girano in container isolati ma comunicano tramite una **rete virtuale Docker interna**.
- `MONGO_URI` sfrutta il DNS interno di Docker e punta al nome del servizio: `mongodb://mongo:27017/cti_db`.

> **Parallelismo Flask:**
> L'esperienza di utilizzo di Docker e Docker Compose è identica indipendentemente dal linguaggio di programmazione backend. In Flask faresti esattamente la stessa cosa per containerizzare un'app Python (es. Gunicorn) e connetterla a un database (PostgreSQL/MongoDB) tramite Compose.

### 8.2 — Dockerfile e .dockerignore

Abbiamo creato un **Dockerfile** per l'applicazione Express sfruttando il caching dei layer per ottimizzare le build:

```dockerfile
FROM node:24-alpine
WORKDIR /app

# Copia solo i file delle dipendenze per sfruttare il caching dei layer
COPY package.json package-lock.json ./
# Installa solo dipendenze di produzione (senza nodemon)
RUN npm ci --omit=dev

COPY . .
EXPOSE 3000
CMD ["node", "index.js"]
```

> **Parallelismo Flask (`Dockerfile`):**
> ```dockerfile
> FROM python:3.12-slim
> WORKDIR /app
> COPY requirements.txt .
> RUN pip install --no-cache-dir -r requirements.txt
> COPY . .
> CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:3000", "app:app"]
> ```

Abbiamo anche aggiunto un **`.dockerignore`** per escludere file non necessari o pesanti:
```text
node_modules
.env
.git
.gitignore
GUIDA_STUDIO.md
workers
*.log
```

### 8.3 — docker-compose.yml

Il file Compose orchestra entrambi i servizi, gestendo volumi, porte e la sequenza di avvio (`depends_on`).

```yaml
services:
  mongo:
    image: mongo:7
    container_name: cti-mongo
    ports:
      - "27017:27017"
    volumes:
      - mongo-data:/data/db
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "mongosh", "--eval", "db.adminCommand('ping')"]
      interval: 10s
      timeout: 5s
      retries: 5
      start_period: 10s

  server:
    build: .
    container_name: cti-server
    ports:
      - "3000:3000"
    environment:
      # Punta al nome del servizio 'mongo' invece che 'localhost'
      - MONGO_URI=mongodb://mongo:27017/cti_db
      - PORT=3000
      - NODE_ENV=production
    depends_on:
      mongo:
        condition: service_healthy
    restart: unless-stopped

volumes:
  mongo-data:
```

### 8.4 — Test della Fase 8

Abbiamo stoppato e rimosso il container MongoDB manuale. Abbiamo poi avviato il sistema orchestrato:
```powershell
docker compose up --build -d
```

#### Risultati dei test eseguiti sul container in esecuzione:
- ✅ **Network Interno**: Il server `cti-server` si è connesso correttamente a `cti-mongo` usando l'host interno `mongo`.
- ✅ **REST API**: Tutte le operazioni CRUD (POST, paginazione della GET, PATCH) funzionano come previsto con la porta `3000` mappata verso l'esterno.
- ✅ **WebSocket**: Il listener Python (`ws_listener.py`) ha ricevuto correttamente eventi in tempo reale generati da richieste dirette al container.
- ✅ **Python Workers**: `cti_simulator.py` è riuscito a iniettare le 3 chiamate generate direttamente nel server containerizzato senza errori.

✅ **Fase 8 completata.**

---

## Struttura finale del progetto

```
cti/
├── .env                        ← Variabili host (PORT, MONGO_URI, NODE_ENV)
├── .dockerignore               ← Esclusioni file dalla build Docker
├── Dockerfile                  ← Istruzioni di build per l'immagine Node.js
├── docker-compose.yml          ← Configurazione servizi (mongo + server)
├── .gitignore                  ← esclude node_modules, .env, .venv, ecc.
├── package.json                ← dipendenze: express, mongoose, dotenv, socket.io (+ nodemon)
├── package-lock.json           ← versioni bloccate
│
├── index.js                    ← entry-point: HTTP server + Express + Socket.IO + error handler
├── db.js                       ← connessione asincrona a MongoDB via Mongoose
│
├── models/
│   └── Call.js                 ← schema Mongoose con validazione
│
├── routes/
│   └── calls.js                ← Express Router (POST, GET paginato, GET/:id, PATCH/:id) + emit WS
│
├── node_modules/               ← dipendenze installate (non committare!)
│
├── GUIDA_STUDIO.md             ← questo documento
│
└── workers/                    ← worker Python
    ├── .venv/                  ← virtual environment Python
    ├── requirements.txt        ← requests, python-socketio[client]
    ├── config.py               ← endpoint + pool dati
    ├── cti_simulator.py        ← generatore di call events (POST)
    └── ws_listener.py          ← listener WebSocket real-time
```

### API Endpoints

| Metodo | Endpoint      | Descrizione                          | Evento WS emesso | Paginazione |
|--------|---------------|--------------------------------------|-------------------|-------------|
| GET    | `/ping`       | Health check                         | —                 | —           |
| POST   | `/calls`      | Crea un nuovo log chiamata           | `call:created`    | —           |
| GET    | `/calls`      | Lista chiamate (filtri + paginazione)| —                 | ✅           |
| GET    | `/calls/:id`  | Dettaglio singola chiamata           | —                 | —           |
| PATCH  | `/calls/:id`  | Aggiorna status/duration/notes       | `call:updated`    | —           |

### Parametri query per GET /calls

| Parametro | Default | Descrizione |
|---|---|---|
| `page` | 1 | Pagina da visualizzare (min: 1) |
| `limit` | 20 | Risultati per pagina (min: 1, max: 100) |
| `status` | — | Filtra per status (`queued`, `in-progress`, `completed`, `failed`) |
| `agentId` | — | Filtra per agente |
| `callerNumber` | — | Filtra per numero chiamante |

---

## Riferimento completo Flask ↔ Express

| Concetto | Flask (Python) | Express (Node.js) |
|---|---|---|
| **Creare l'app** | `app = Flask(__name__)` | `const app = express()` |
| **Variabili d'ambiente** | `load_dotenv()` + `os.environ.get()` | `require('dotenv').config()` + `process.env` |
| **Parsing JSON** | `request.get_json()` (automatico) | `app.use(express.json())` (middleware) |
| **Definire rotta GET** | `@app.route('/x')` | `app.get('/x', callback)` |
| **Definire rotta POST** | `@app.route('/x', methods=['POST'])` | `app.post('/x', callback)` |
| **Definire rotta PATCH** | `@app.route('/x', methods=['PATCH'])` | `app.patch('/x', callback)` |
| **Risposta JSON** | `return jsonify({...}), 201` | `res.status(201).json({...})` |
| **Query string** | `request.args.get('key')` | `req.query.key` |
| **Parametri URL** | `@app.route('/<id>')` → arg funzione | `'/:id'` → `req.params.id` |
| **Modularizzazione** | Blueprint | `express.Router()` |
| **Registrare blueprint** | `app.register_blueprint(bp, url_prefix=...)` | `app.use('/prefix', router)` |
| **Error handler globale** | `@app.errorhandler(Exception)` | `app.use((err, req, res, next) => {...})` |
| **Propagare errore** | `raise` | `next(err)` |
| **ORM/ODM** | SQLAlchemy (SQL) | Mongoose (MongoDB) |
| **Definire modello** | `class Call(db.Model)` con `db.Column` | `new mongoose.Schema({...})` |
| **Campo obbligatorio** | `nullable=False` | `required: true` |
| **Valore default** | `default=0` | `default: 0` |
| **Validazione enum** | `CheckConstraint` / Enum | `enum: [...]` |
| **Timestamp automatici** | `default=datetime.utcnow` (manuale) | `timestamps: true` (una riga) |
| **Creare record** | `db.session.add(x)` + `db.session.commit()` | `await Model.create(data)` |
| **Leggere tutti** | `Model.query.all()` | `await Model.find({})` |
| **Leggere per ID** | `Model.query.get(id)` | `await Model.findById(id)` |
| **Aggiornare record** | `call.status = 'x'` + `db.session.commit()` | `await Model.findByIdAndUpdate(id, updates, opts)` |
| **Filtrare** | `Model.query.filter_by(**kw)` | `Model.find(filter)` |
| **Ordinare** | `.order_by(Model.col.desc())` | `.sort({ col: -1 })` |
| **Paginazione** | `.paginate(page=p, per_page=n)` | `.skip((p-1)*n).limit(n)` + `countDocuments()` |
| **Query parallele** | `asyncio.gather(q1, q2)` | `Promise.all([q1, q2])` |
| **Destructuring** | `a, b = tuple` | `const [a, b] = array` |
| **WebSocket setup** | `SocketIO(app)` + `socketio.run(app)` | `http.createServer(app)` + `new Server(server)` + `server.listen()` |
| **WS emit (broadcast)** | `socketio.emit('event', data)` | `io.emit('event', data)` |
| **WS on connect** | `@socketio.on('connect')` | `io.on('connection', (socket) => {...})` |
| **WS client Python** | `socketio.Client()` + `sio.connect()` | — (stessa libreria `python-socketio`) |
| **Condividere oggetti tra moduli** | `current_app.extensions[...]` | `app.set('key', val)` / `req.app.get('key')` |
| **Avviare server** | `app.run(port=5000)` | `server.listen(3000, callback)` |
| **Auto-restart dev** | `debug=True` (built-in) | `nodemon` (pacchetto esterno) |
| **File dipendenze** | `requirements.txt` | `package.json` |
| **Cartella dipendenze** | `venv/lib/` | `node_modules/` |
| **I/O** | Sincrono (blocca il thread) | Asincrono (`async/await`) |
| **Exit** | `sys.exit(1)` | `process.exit(1)` |
| **Docker (Immagine)** | `python:3.12-slim` + `pip install` | `node:24-alpine` + `npm ci` |
| **Docker Compose** | `docker compose up -d` | `docker compose up -d` |

---

> **Progetto completato! Tutte le funzionalità pianificate sono state implementate con successo.**
