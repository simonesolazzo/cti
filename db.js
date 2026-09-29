// --------------------------------------------------
// db.js — Connessione a MongoDB tramite Mongoose
// --------------------------------------------------
// Parallelismo Flask:
//   In Flask+SQLAlchemy fai:
//     db = SQLAlchemy()
//     db.init_app(app)
//   e configuri app.config['SQLALCHEMY_DATABASE_URI'].
//
//   In Node.js+Mongoose, la connessione è un'operazione
//   ASINCRONA (restituisce una Promise), perché Node.js
//   non blocca mai il thread principale durante l'I/O.
//
//   In Flask, SQLAlchemy si connette in modo sincrono al DB
//   e il tuo thread resta bloccato fino a che non è pronto.
//   In Node.js, `mongoose.connect()` ritorna subito una
//   Promise: il runtime può fare altro nel frattempo.
// --------------------------------------------------

const mongoose = require('mongoose');

// URI di connessione a MongoDB locale (il container Docker).
// "cti_db" è il nome del database — Mongo lo crea automaticamente
// al primo inserimento (niente `CREATE DATABASE` come in SQL).
const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/cti_db';

/**
 * Connette l'applicazione a MongoDB.
 *
 * Questa funzione è `async` perché `mongoose.connect()` è un'operazione
 * di I/O che ritorna una Promise.
 *
 * Parallelismo Flask:
 *   In Flask scriveresti:
 *     def init_db(app):
 *         db.init_app(app)
 *   e lo chiameresti in modo sincrono.
 *
 *   In Node.js, `await` dice al runtime: "metti in pausa QUESTA funzione
 *   fino a che la Promise non si risolve, ma lascia il resto del programma
 *   libero di gestire altri eventi".
 *
 *   È come se Python avesse un `time.sleep()` che NON blocca gli altri
 *   thread — ed è esattamente ciò che fa `asyncio.sleep()` in Python.
 *   In Node.js, TUTTO l'I/O funziona così di default.
 */
async function connectDB() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log(`📦 MongoDB connesso a: ${MONGO_URI}`);
  } catch (err) {
    console.error('❌ Errore di connessione a MongoDB:', err.message);
    // Se il DB non è raggiungibile, il server non ha senso di esistere.
    // process.exit(1) è l'equivalente di sys.exit(1) in Python.
    process.exit(1);
  }
}

// Esportiamo la funzione per poterla importare in index.js.
// Parallelismo Flask:
//   In Python: `from db import init_db`
//   In Node.js (CommonJS): `const connectDB = require('./db')`
module.exports = connectDB;

