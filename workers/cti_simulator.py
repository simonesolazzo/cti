"""
workers/cti_simulator.py — Simulatore di flusso chiamate CTI
=============================================================

Questo script simula un sistema CTI di terze parti (es. un centralino
Asterisk, 3CX, o un provider SIP) che genera eventi di chiamata e li
invia al server Node.js tramite richieste HTTP POST.

Architettura:
    ┌──────────────┐    HTTP POST     ┌──────────────┐    Mongoose    ┌─────────┐
    │  CTI Worker   │ ──────────────► │  Server Node  │ ────────────► │ MongoDB │
    │  (Python)     │   /calls        │  (Express)    │               │         │
    └──────────────┘                  └──────────────┘               └─────────┘

    In produzione, avresti N worker Python connessi a N sistemi CTI
    diversi, tutti che inviano dati allo stesso server Node.js centrale.

Uso:
    cd workers
    .venv\\Scripts\\activate       (Windows)
    python cti_simulator.py              → genera 10 chiamate (default)
    python cti_simulator.py --count 50   → genera 50 chiamate
    python cti_simulator.py --burst      → tutte insieme, senza pausa
"""

import argparse
import random
import sys
import time
from datetime import datetime

import requests

# Fix encoding console Windows (cp1252 non supporta le emoji)
sys.stdout.reconfigure(encoding="utf-8")

import config


def generate_call_event() -> dict:
    """
    Genera un singolo evento di chiamata con dati casuali realistici.

    In un sistema CTI reale, questi dati arriverebbero da eventi come:
    - CDR (Call Detail Record) dal centralino
    - Webhook da un provider VoIP
    - Messaggi AMI (Asterisk Manager Interface)
    - Eventi TAPI (Telephony API)

    Returns:
        dict con i campi attesi dal modello Mongoose `Call`.
    """
    # Una chiamata appena arrivata parte come "queued".
    # Ma simuliamo anche chiamate già in corso o concluse,
    # come se il worker stesse sincronizzando lo storico.
    status = random.choice(config.CALL_STATUSES)

    call = {
        "callerNumber": random.choice(config.CALLER_NUMBERS),
        "agentId": random.choice(config.AGENT_IDS),
        "status": status,
    }

    # La durata ha senso solo per chiamate completate o fallite
    if status in ("completed", "failed"):
        call["duration"] = random.randint(config.MIN_DURATION, config.MAX_DURATION)

    # Aggiungiamo note per alcune chiamate
    if status == "failed":
        call["notes"] = random.choice([
            "Chiamata caduta - problema di rete",
            "Cliente ha riagganciato",
            "Timeout - nessuna risposta dall'agente",
        ])
    elif status == "completed" and random.random() > 0.6:
        call["notes"] = random.choice([
            "Cliente soddisfatto",
            "Richiesta assistenza tecnica",
            "Richiamata programmata per domani",
            "Ticket #12345 aperto",
        ])

    return call


def send_call(call_data: dict) -> dict | None:
    """
    Invia un evento di chiamata al server Node.js via HTTP POST.

    Questa è la parte cruciale: il worker Python comunica con il server
    Node.js usando lo stesso protocollo HTTP che useresti con Flask.
    La differenza è che qui sei il CLIENT, non il server.

    Args:
        call_data: dizionario con i dati della chiamata.

    Returns:
        La risposta del server (dict) o None in caso di errore.
    """
    try:
        response = requests.post(
            config.CALLS_ENDPOINT,
            json=call_data,          # requests serializza in JSON (come jsonify in Flask)
            timeout=10,
        )
        response.raise_for_status()  # Lancia un'eccezione per status 4xx/5xx
        return response.json()

    except requests.ConnectionError:
        print(f"  ❌ Connessione rifiutata — il server Node.js è in ascolto su {config.API_BASE_URL}?")
        return None
    except requests.Timeout:
        print("  ❌ Timeout — il server non ha risposto entro 10 secondi")
        return None
    except requests.HTTPError as e:
        print(f"  ❌ Errore HTTP {e.response.status_code}: {e.response.text}")
        return None


def run_simulation(count: int, burst: bool = False):
    """
    Esegue la simulazione generando `count` chiamate.

    Args:
        count: numero di chiamate da generare.
        burst: se True, invia tutte le chiamate senza pause.
    """
    print(f"🚀 CTI Simulator avviato")
    print(f"   Target: {config.CALLS_ENDPOINT}")
    print(f"   Chiamate da generare: {count}")
    print(f"   Modalità: {'burst (senza pause)' if burst else 'realistica (con pause casuali)'}")
    print("-" * 60)

    successes = 0
    failures = 0

    for i in range(1, count + 1):
        call_data = generate_call_event()

        timestamp = datetime.now().strftime("%H:%M:%S")
        print(f"[{timestamp}] ({i}/{count}) {call_data['callerNumber']} → "
              f"{call_data['agentId']} [{call_data['status']}]", end="")

        result = send_call(call_data)

        if result:
            print(f"  ✅ id={result['_id']}")
            successes += 1
        else:
            failures += 1

        # Pausa realistica tra le chiamate (a meno che non sia burst mode)
        if not burst and i < count:
            delay = random.uniform(config.MIN_INTERVAL, config.MAX_INTERVAL)
            time.sleep(delay)

    # Riepilogo
    print("-" * 60)
    print(f"📊 Simulazione completata: {successes} OK, {failures} errori su {count} totali")


def verify_server() -> bool:
    """Verifica che il server Node.js sia raggiungibile prima di partire."""
    try:
        r = requests.get(f"{config.API_BASE_URL}/ping", timeout=5)
        data = r.json()
        print(f"✅ Server raggiungibile — ping: {data.get('message')}\n")
        return True
    except (requests.ConnectionError, requests.Timeout):
        print(f"❌ Server non raggiungibile su {config.API_BASE_URL}")
        print("   Assicurati che il server Node.js sia avviato con: npm run dev\n")
        return False


def main():
    parser = argparse.ArgumentParser(description="Simulatore CTI — invia call events al server Node.js")
    parser.add_argument("--count", type=int, default=10, help="Numero di chiamate da generare (default: 10)")
    parser.add_argument("--burst", action="store_true", help="Invia tutte le chiamate senza pause")
    args = parser.parse_args()

    if not verify_server():
        sys.exit(1)

    run_simulation(count=args.count, burst=args.burst)


if __name__ == "__main__":
    main()
