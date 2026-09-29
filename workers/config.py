# ------------------------------------------------------------------
# workers/config.py — Configurazione centralizzata dei worker
# ------------------------------------------------------------------
# Qui definisci i parametri che i worker usano per comunicare
# con il server Node.js. In un progetto reale, questi verrebbero
# da variabili d'ambiente o da un file .env dedicato ai worker.
# ------------------------------------------------------------------

# URL base del server Node.js CTI
API_BASE_URL = "http://localhost:3000"

# Endpoint specifici
CALLS_ENDPOINT = f"{API_BASE_URL}/calls"

# ------------------------------------------------------------------
# Dati di simulazione — Pool di valori realistici
# ------------------------------------------------------------------
# In un sistema CTI reale, questi dati verrebbero dal centralino
# (PBX), da un SIP trunk, o da un'API di un provider VoIP come
# Twilio, Asterisk, 3CX, ecc.
#
# Qui li simuliamo con pool di valori casuali per testare il server.
# ------------------------------------------------------------------

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

AGENT_IDS = [
    "agent-001",
    "agent-002",
    "agent-003",
    "agent-004",
    "agent-005",
]

# Possibili transizioni di stato di una chiamata.
# Il flusso reale di una chiamata CTI è:
#   queued → in-progress → completed/failed
CALL_STATUSES = ["queued", "in-progress", "completed", "failed"]

# Range di durata delle chiamate (in secondi)
MIN_DURATION = 15
MAX_DURATION = 600

# Intervallo tra le chiamate simulate (in secondi)
MIN_INTERVAL = 1.0
MAX_INTERVAL = 5.0

