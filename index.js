// --------------------------------------------------
// index.js — Entry-point del server CTI
// --------------------------------------------------
// NOVITÀ Fase 6 — WebSocket con Socket.IO
//
// Parallelismo Flask:
//   In Flask useresti Flask-SocketIO:
//     from flask_socketio import SocketIO
//     socketio = SocketIO(app)
//     socketio.emit('call:created', data)
//     socketio.run(app, port=5000)
//
//   In Node.js usiamo il pacchetto `socket.io`, che è l'equivalente
//   diretto. La differenza è che Express di default usa `app.listen()`,
//   ma Socket.IO ha bisogno di un server HTTP "puro" di Node.js.
//
//   Quindi il flusso cambia da:
//     app.listen(PORT)                          ← solo Express
//   a:
//     const server = http.createServer(app)     ← server HTTP di Node.js
//     const io = new Server(server)             ← Socket.IO si aggancia al server
//     server.listen(PORT)                       ← il server HTTP avvia tutto
//
//   È come passare da:
//     app.run(port=5000)                        ← Flask puro
//   a:
//     socketio = SocketIO(app)
//     socketio.run(app, port=5000)              ← Flask-SocketIO
// --------------------------------------------------

// `require('dotenv').config()` DEVE essere la prima istruzione.
// Carica le variabili dal file .env in process.env.
// Parallelismo Flask:
//   In Flask usi python-dotenv e `load_dotenv()` all'inizio di app.py.
//   Stessa identica cosa.
require('dotenv').config();

const express = require('express');
const cors = require('cors');               // Middleware CORS per Express
const http = require('http');               // Modulo built-in di Node.js
const { Server } = require('socket.io');    // Socket.IO server
const connectDB = require('./db');
const callsRouter = require('./routes/calls');

// Crea l'applicazione Express (equivalente di `app = Flask(__name__)`)
const app = express();

// La porta su cui il server ascolterà.
// process.env.PORT è l'equivalente di os.environ.get('PORT')
const PORT = process.env.PORT || 3000;

// ----- Creazione del server HTTP + Socket.IO -----
// In Flask: socketio = SocketIO(app, cors_allowed_origins="*")
// In Node.js: creiamo il server HTTP, poi ci agganciamo Socket.IO.
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',    // In produzione, specifica i domini permessi
  },
});

// ----- Middleware -----
app.use(cors()); // Abilita CORS per tutte le rotte Express
app.use(express.json());

// Rendiamo `io` accessibile da tutti i router tramite `req.app.get('io')`.
// Parallelismo Flask:
//   In Flask useresti `current_app.extensions['socketio']`
//   o importeresti direttamente l'oggetto socketio.
//   In Express, `app.set()` / `app.get()` è un registry chiave-valore
//   integrato nell'app, utile per condividere oggetti tra moduli.
app.set('io', io);

// ----- Rotte -----

// GET /ping — rotta di health-check
// Parallelismo Flask:
//   @app.route('/ping', methods=['GET'])
//   def ping():
//       return jsonify({ "message": "pong" })
app.get('/ping', (req, res) => {
  res.json({ message: 'pong', timestamp: new Date().toISOString() });
});

// Montaggio router (POST, GET, GET/:id, PATCH/:id)
// Le rotte ora emetteranno eventi WebSocket quando creano/aggiornano chiamate.
app.use('/calls', callsRouter);

// ----- WebSocket — Gestione connessioni -----
// Parallelismo Flask-SocketIO:
//   @socketio.on('connect')
//   def handle_connect():
//       print(f'Client connesso: {request.sid}')
//
//   @socketio.on('disconnect')
//   def handle_disconnect():
//       print(f'Client disconnesso: {request.sid}')
//
// In Socket.IO per Node.js, l'evento 'connection' viene emesso
// ogni volta che un client si connette. Il parametro `socket`
// rappresenta la connessione individuale del singolo client.
io.on('connection', (socket) => {
  console.log(`🔌 Client WebSocket connesso: ${socket.id}`);

  // Quando il client si disconnette
  socket.on('disconnect', (reason) => {
    console.log(`🔌 Client disconnesso: ${socket.id} (${reason})`);
  });
});

// ----- Error Handler Centralizzato -----
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  // Errore di validazione Mongoose (campi required mancanti, enum non valido, ecc.)
  if (err.name === 'ValidationError') {
    return res.status(400).json({ error: err.message });
  }

  // ID MongoDB malformato (non è un ObjectId valido di 24 caratteri hex)
  if (err.name === 'CastError') {
    return res.status(400).json({ error: 'ID non valido' });
  }

  // JSON body malformato (il client ha inviato JSON non parsabile)
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'JSON non valido nel body della richiesta' });
  }

  // Qualsiasi altro errore → 500 Internal Server Error
  console.error('❌ Errore non gestito:', err);
  res.status(500).json({ error: 'Errore interno del server' });
});

// ----- Avvio -----
// IMPORTANTE: ora usiamo `server.listen()` invece di `app.listen()`.
// `server` è il server HTTP che gestisce sia Express (HTTP) che Socket.IO (WS).
(async () => {
  await connectDB();

  server.listen(PORT, () => {
    console.log(`✅ Server CTI in ascolto su http://localhost:${PORT}`);
    console.log(`🔌 WebSocket attivo sulla stessa porta`);
    console.log(`   Ambiente: ${process.env.NODE_ENV || 'development'}`);
  });
})();
