// --------------------------------------------------
// models/Call.js — Modello Mongoose per i log delle chiamate
// --------------------------------------------------
// Parallelismo Flask + SQLAlchemy:
//
//   SQLAlchemy (relazionale, schema rigido):
//     class Call(db.Model):
//         id         = db.Column(db.Integer, primary_key=True)
//         caller     = db.Column(db.String(20), nullable=False)
//         agent_id   = db.Column(db.String(50), nullable=False)
//         duration   = db.Column(db.Integer, default=0)
//         status     = db.Column(db.String(20), default='queued')
//         created_at = db.Column(db.DateTime, default=datetime.utcnow)
//
//   Mongoose (document-based, schema flessibile):
//     Lo Schema definisce la FORMA del documento JSON che verrà
//     salvato in MongoDB. Ogni documento è come un dict Python
//     che viene salvato direttamente come JSON (BSON in realtà).
//
//   Differenza chiave:
//     - In SQL hai tabelle con righe e colonne fisse.
//     - In MongoDB hai collezioni con documenti JSON flessibili.
//     - Mongoose aggiunge validazione allo schema, che MongoDB
//       nativamente non impone (è "schema-less" di default).
// --------------------------------------------------

const mongoose = require('mongoose');

// Lo Schema è la definizione della struttura del documento.
// È l'equivalente della classe del modello SQLAlchemy,
// ma descrive un documento JSON, non una riga di tabella SQL.
const callSchema = new mongoose.Schema(
  {
    // `callerNumber` — numero del chiamante.
    // `required: true` è l'equivalente di `nullable=False` in SQLAlchemy.
    // `trim: true` rimuove spazi bianchi iniziali/finali (comodo per i numeri di telefono).
    callerNumber: {
      type: String,
      required: [true, 'Il numero del chiamante è obbligatorio'],
      trim: true,
    },

    // `agentId` — identificativo dell'operatore che gestisce la chiamata.
    agentId: {
      type: String,
      required: [true, "L'ID dell'agente è obbligatorio"],
      trim: true,
    },

    // `duration` — durata della chiamata in secondi.
    // `default: 0` funziona esattamente come in SQLAlchemy.
    // `min: 0` è una validazione Mongoose (non esiste un equivalente diretto in SQLAlchemy,
    // dovresti usare un @validates o un CheckConstraint).
    duration: {
      type: Number,
      default: 0,
      min: [0, 'La durata non può essere negativa'],
    },

    // `status` — stato della chiamata.
    // `enum` limita i valori accettabili, come un Enum Python o un CHECK constraint SQL.
    status: {
      type: String,
      enum: {
        values: ['queued', 'in-progress', 'completed', 'failed'],
        message: 'Lo status "{VALUE}" non è valido',
      },
      default: 'queued',
    },

    // `notes` — campo opzionale per annotazioni.
    // Nessun `required`, quindi è opzionale (come `nullable=True` in SQLAlchemy).
    notes: {
      type: String,
      trim: true,
    },
  },
  {
    // ----- Opzioni dello Schema -----

    // `timestamps: true` aggiunge automaticamente `createdAt` e `updatedAt`
    // a ogni documento. È l'equivalente di:
    //   created_at = db.Column(db.DateTime, default=datetime.utcnow)
    //   updated_at = db.Column(db.DateTime, onupdate=datetime.utcnow)
    // Ma in Mongoose è una singola opzione — molto più comodo!
    timestamps: true,
  }
);

// `mongoose.model('Call', callSchema)` fa due cose:
//   1. Crea un "modello" (una classe con cui interagire con il DB).
//   2. Associa questo modello alla collezione "calls" in MongoDB.
//      (Mongoose pluralizza automaticamente il nome: "Call" → "calls")
//
// È l'equivalente di `db.create_all()` che crea la tabella in SQL,
// ma in MongoDB la collezione viene creata al primo inserimento.
//
// Da qui in poi, `Call` è la tua interfaccia per le operazioni CRUD:
//   Call.create({...})    →  equivalente di db.session.add(call) + db.session.commit()
//   Call.find({})         →  equivalente di Call.query.all()
//   Call.findById(id)     →  equivalente di Call.query.get(id)
const Call = mongoose.model('Call', callSchema);

module.exports = Call;

