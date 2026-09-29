// --------------------------------------------------
// routes/calls.js — Rotte per la gestione delle chiamate
// --------------------------------------------------
// Parallelismo Flask — Blueprint:
//
//   In Flask, quando il tuo app.py diventa troppo grande,
//   separi le rotte in Blueprint:
//
//     # routes/calls.py
//     from flask import Blueprint
//     calls_bp = Blueprint('calls', __name__)
//
//     @calls_bp.route('/calls', methods=['POST'])
//     def create_call(): ...
//
//     # app.py
//     from routes.calls import calls_bp
//     app.register_blueprint(calls_bp)
//
//   In Express, l'equivalente del Blueprint è il Router.
//   `express.Router()` crea un mini-app con le sue rotte,
//   che poi viene "montato" sull'app principale con `app.use()`.
// --------------------------------------------------

const express = require('express');
const Call = require('../models/Call');

// Crea un Router — l'equivalente di `Blueprint('calls', __name__)`
const router = express.Router();

// -----------------------------------------------------------------
// POST / — Crea un nuovo log di chiamata
// -----------------------------------------------------------------
// Nota: la rotta è `/` e non `/calls` perché questo router
// verrà montato sul prefisso `/calls` in index.js.
// È come in Flask:
//   calls_bp = Blueprint('calls', __name__, url_prefix='/calls')
//   @calls_bp.route('/', methods=['POST'])  ← rotta relativa al prefisso
// -----------------------------------------------------------------
router.post('/', async (req, res, next) => {
  try {
    const call = await Call.create(req.body);

    // Emetti un evento WebSocket a TUTTI i client connessi.
    // Parallelismo Flask-SocketIO:
    //   socketio.emit('call:created', call.to_dict())
    //
    // `req.app.get('io')` recupera l'istanza di Socket.IO
    // che abbiamo salvato in index.js con `app.set('io', io)`.
    //
    // `io.emit()` invia a TUTTI i client connessi (broadcast).
    // Se volessi inviare solo a un client specifico:
    //   io.to(socketId).emit('call:created', call)
    const io = req.app.get('io');
    io.emit('call:created', call);

    res.status(201).json(call);
  } catch (err) {
    // Invece di gestire l'errore qui, lo passiamo al prossimo
    // middleware con `next(err)`. Verrà catturato dall'error handler
    // centralizzato in index.js.
    //
    // Parallelismo Flask:
    //   In Flask faresti `raise` e l'errorhandler registrato
    //   con @app.errorhandler(Exception) lo catturerebbe.
    //   Qui, `next(err)` è l'equivalente di quel `raise`.
    next(err);
  }
});

// -----------------------------------------------------------------
// GET / — Legge i log con filtri e PAGINAZIONE
// -----------------------------------------------------------------
// Senza paginazione, `Call.find({})` restituisce TUTTI i documenti.
// Con migliaia di chiamate, questo è lento e spreca memoria.
//
// La paginazione divide i risultati in "pagine" di dimensione fissa.
// Il client specifica quale pagina vuole e quanti risultati per pagina.
//
// Parametri query string:
//   ?page=1&limit=20           → prima pagina, 20 risultati
//   ?page=3&limit=10           → terza pagina, 10 risultati
//   ?status=completed&page=2   → filtro + paginazione combinati
//
// Parallelismo Flask + SQLAlchemy:
//   query = Call.query.filter_by(**filters)
//   pagination = query.paginate(page=page, per_page=limit)
//   # pagination.items  → i risultati della pagina
//   # pagination.total  → conteggio totale
//   # pagination.pages  → numero totale di pagine
//
// In Mongoose non c'è un metodo `.paginate()` built-in.
// Usiamo `.skip()` e `.limit()` — che sono l'equivalente di
// SQL `OFFSET` e `LIMIT`:
//   SELECT * FROM calls ORDER BY created_at DESC LIMIT 20 OFFSET 40
//   equivale a: Call.find().sort({createdAt:-1}).skip(40).limit(20)
// -----------------------------------------------------------------
router.get('/', async (req, res, next) => {
  try {
    // --- Filtri (invariati) ---
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    if (req.query.agentId) filter.agentId = req.query.agentId;
    if (req.query.callerNumber) filter.callerNumber = req.query.callerNumber;

    // --- Paginazione ---
    // parseInt() converte la stringa della query in numero.
    // `|| 1` e `|| 20` sono i valori di default se il client non li specifica.
    //
    // Math.max(1, ...) e Math.min(100, ...) impediscono valori assurdi:
    //   - pagina 0 o negativa → diventa 1
    //   - limit 500 → cappato a 100 (protezione contro query troppo pesanti)
    const page = Math.max(1, parseInt(req.query.page) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit) || 20));

    // `skip` è il numero di documenti da saltare.
    // Pagina 1 → skip 0, Pagina 2 → skip 20, Pagina 3 → skip 40, ecc.
    const skip = (page - 1) * limit;

    // Eseguiamo DUE query in parallelo:
    //   1. I documenti della pagina corrente (con skip + limit)
    //   2. Il conteggio totale dei documenti che matchano il filtro
    //
    // `Promise.all()` le esegue in parallelo — non aspetta che la prima
    // finisca prima di lanciare la seconda. È un'ottimizzazione importante.
    //
    // Parallelismo Python:
    //   In asyncio faresti:
    //     results, total = await asyncio.gather(
    //         db.execute(query.offset(skip).limit(limit)),
    //         db.execute(count_query)
    //     )
    //
    // La sintassi `const [calls, total] = await Promise.all([...])` è
    // un "destructuring assignment": assegna il primo risultato a `calls`
    // e il secondo a `total`.
    const [calls, total] = await Promise.all([
      Call.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
      Call.countDocuments(filter),
    ]);

    // Calcoliamo i metadati di paginazione
    const totalPages = Math.ceil(total / limit);

    res.json({
      data: calls,
      pagination: {
        total,                          // documenti totali che matchano il filtro
        page,                           // pagina corrente
        limit,                          // risultati per pagina
        totalPages,                     // numero totale di pagine
        hasNextPage: page < totalPages, // esiste una pagina successiva?
        hasPrevPage: page > 1,          // esiste una pagina precedente?
      },
    });
  } catch (err) {
    next(err);
  }
});

// -----------------------------------------------------------------
// GET /:id — Legge un singolo log per ID
// -----------------------------------------------------------------
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

// -----------------------------------------------------------------
// PATCH /:id — Aggiorna parzialmente un log di chiamata
// -----------------------------------------------------------------
// Perché PATCH e non PUT?
//
//   - PUT   = sostituisci l'INTERA risorsa (devi inviare TUTTI i campi)
//   - PATCH = modifica ALCUNI campi della risorsa
//
//   In Flask+SQLAlchemy aggiorneresti così:
//     call = Call.query.get_or_404(call_id)
//     call.status = data.get('status', call.status)
//     call.duration = data.get('duration', call.duration)
//     db.session.commit()
//
//   In Express+Mongoose, `findByIdAndUpdate()` fa tutto in una chiamata.
//
// Ciclo di vita delle chiamate CTI:
//
//   queued ──► in-progress ──► completed
//                          └──► failed
//
//   Non tutte le transizioni sono valide. Es:
//   - Una chiamata "completed" non può tornare "queued"
//   - Una chiamata "queued" non può diventare "completed" direttamente
//
//   La mappa `allowedTransitions` implementa questa logica.
// -----------------------------------------------------------------

// Mappa delle transizioni di stato ammesse.
// Ogni chiave è lo stato attuale, il valore è un array di stati
// verso cui è lecito transitare.
const allowedTransitions = {
  'queued':       ['in-progress', 'failed'],
  'in-progress':  ['completed', 'failed'],
  'completed':    [],   // stato terminale — nessuna transizione ammessa
  'failed':       [],   // stato terminale — nessuna transizione ammessa
};

router.patch('/:id', async (req, res, next) => {
  try {
    // 1. Recupera il documento attuale dal DB.
    //    Serve per validare la transizione di stato PRIMA di aggiornare.
    const currentCall = await Call.findById(req.params.id);

    if (!currentCall) {
      return res.status(404).json({ error: 'Chiamata non trovata' });
    }

    // 2. Se il client vuole aggiornare lo status, valida la transizione.
    if (req.body.status) {
      const from = currentCall.status;
      const to = req.body.status;

      // Se il nuovo status è uguale a quello attuale, non serve transitare
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

    // 3. Campi che il client può aggiornare.
    //    NON permettiamo di cambiare callerNumber o agentId
    //    (sono dati immutabili del CDR originale).
    //
    //    Parallelismo Flask:
    //      In Flask filtreresti i campi manualmente:
    //        allowed_fields = {'status', 'duration', 'notes'}
    //        updates = {k: v for k, v in data.items() if k in allowed_fields}
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

    // 4. Aggiorna il documento nel DB.
    //
    //    `findByIdAndUpdate(id, updates, options)` è l'equivalente di:
    //      call.status = new_status
    //      db.session.commit()
    //      return call  (aggiornato)
    //
    //    Opzioni:
    //      - `new: true`            → restituisce il documento DOPO l'update
    //                                  (default: restituisce quello PRIMA)
    //      - `runValidators: true`  → esegue le validazioni dello schema
    //                                  anche sugli update (default: no!)
    const updatedCall = await Call.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );

    // Emetti un evento WebSocket con i dettagli dell'aggiornamento.
    // Includiamo anche lo stato precedente, utile per le dashboard
    // che vogliono mostrare la transizione (es. "queued → in-progress").
    const io = req.app.get('io');
    io.emit('call:updated', {
      call: updatedCall,
      previousStatus: currentCall.status,
    });

    res.json(updatedCall);
  } catch (err) {
    next(err);
  }
});

// Esportiamo il router per montarlo in index.js.
// Parallelismo Flask: `from routes.calls import calls_bp`
module.exports = router;

