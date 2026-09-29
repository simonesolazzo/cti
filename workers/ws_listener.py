"""
workers/ws_listener.py — Client WebSocket per monitoraggio real-time
=====================================================================

Questo script si connette al server Node.js via WebSocket (Socket.IO)
e ascolta gli eventi in tempo reale:
  - call:created  → nuova chiamata inserita
  - call:updated  → chiamata aggiornata (cambio di stato, durata, ecc.)

Architettura completa:

  ┌──────────────┐   POST    ┌──────────────┐  WebSocket  ┌──────────────┐
  │ CTI Worker   │ ────────► │  Server Node  │ ──────────► │ WS Listener  │
  │ (simulator)  │  /calls   │  (Express +   │  emit()     │ (questo file)│
  └──────────────┘           │  Socket.IO)   │             └──────────────┘
                             └──────────────┘
                                    │
                                    ▼
                              ┌──────────┐
                              │ MongoDB  │
                              └──────────┘

  In produzione, il listener potrebbe essere:
  - Una dashboard web (React, Vue, ecc.)
  - Un sistema di alerting (invia notifiche Slack, email, ecc.)
  - Un altro microservizio che reagisce agli eventi

Uso:
    cd workers
    .venv\\Scripts\\activate
    python ws_listener.py
    # In un altro terminale, lancia il simulatore:
    python cti_simulator.py --count 5
"""

import sys
import socketio

# Fix encoding console Windows + forza flush per cattura log
sys.stdout.reconfigure(encoding="utf-8", line_buffering=True)
sys.stderr.reconfigure(encoding="utf-8", line_buffering=True)

# Crea un client Socket.IO.
# Parallelismo Flask:
#   In Python con Flask-SocketIO useresti:
#     from flask_socketio import SocketIO
#   Come CLIENT, usi la libreria `python-socketio`.
sio = socketio.Client()

SERVER_URL = "http://localhost:3000"


# ----- Event Handlers -----

@sio.event
def connect():
    """Chiamato quando la connessione WebSocket è stabilita."""
    print(f"✅ Connesso al server: {SERVER_URL}")
    print(f"   Socket ID: {sio.sid}")
    print(f"   In attesa di eventi...\n")
    print("-" * 70)


@sio.event
def disconnect():
    """Chiamato quando la connessione viene chiusa."""
    print("\n🔌 Disconnesso dal server")


@sio.on('call:created')
def on_call_created(data):
    """
    Riceve l'evento 'call:created' emesso dal server quando
    una nuova chiamata viene inserita tramite POST /calls.

    Parallelismo Flask-SocketIO:
        @socketio.on('call:created')
        def handle_call_created(data):
            print(data)
    """
    print(f"📞 NUOVA CHIAMATA")
    print(f"   ID:      {data.get('_id')}")
    print(f"   Da:      {data.get('callerNumber')}")
    print(f"   Agente:  {data.get('agentId')}")
    print(f"   Status:  {data.get('status')}")
    if data.get('notes'):
        print(f"   Note:    {data.get('notes')}")
    print("-" * 70)


@sio.on('call:updated')
def on_call_updated(data):
    """
    Riceve l'evento 'call:updated' emesso dal server quando
    una chiamata viene aggiornata tramite PATCH /calls/:id.

    Il payload include sia la chiamata aggiornata che lo stato precedente.
    """
    call = data.get('call', {})
    prev_status = data.get('previousStatus', '?')
    curr_status = call.get('status', '?')

    print(f"🔄 AGGIORNAMENTO CHIAMATA")
    print(f"   ID:          {call.get('_id')}")
    print(f"   Transizione: {prev_status} → {curr_status}")
    print(f"   Agente:      {call.get('agentId')}")
    if call.get('duration'):
        print(f"   Durata:      {call.get('duration')}s")
    if call.get('notes'):
        print(f"   Note:        {call.get('notes')}")
    print("-" * 70)


def main():
    print(f"🔌 Connessione a {SERVER_URL}...")

    try:
        # sio.connect() stabilisce la connessione WebSocket.
        # Socket.IO gestisce automaticamente:
        #   - Handshake HTTP iniziale (upgrade da HTTP a WebSocket)
        #   - Reconnect automatico se la connessione cade
        #   - Heartbeat per mantenere la connessione attiva
        sio.connect(SERVER_URL)

        # sio.wait() blocca il thread principale e resta in ascolto
        # degli eventi fino a che la connessione non viene chiusa
        # (Ctrl+C per interrompere).
        sio.wait()

    except socketio.exceptions.ConnectionError:
        print(f"❌ Impossibile connettersi a {SERVER_URL}")
        print("   Assicurati che il server sia avviato con: npm run dev")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n👋 Listener interrotto dall'utente")
        sio.disconnect()


if __name__ == "__main__":
    main()
