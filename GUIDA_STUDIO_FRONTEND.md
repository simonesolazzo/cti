# 📘 Guida di Studio — Frontend Angular CTI

> Documento che ricostruisce l'intero percorso di sviluppo del frontend in Angular, fase per fase.
> Ogni sezione include: obiettivo, comandi eseguiti, codice prodotto e spiegazioni strutturate.

---

## Indice

1. [Fase 1 — Inizializzazione del progetto Angular e integrazione Docker](#fase-1--inizializzazione-del-progetto-angular-e-integrazione-docker)
2. [Fase 2 — Definizione delle interfacce TypeScript](#fase-2--definizione-delle-interfacce-typescript)
3. [Fase 3 — Core Service (WebSocket e RxJS)](#fase-3--core-service-websocket-e-rxjs)

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


---

## Fase 2 — Definizione delle interfacce TypeScript

### Obiettivo
Analizzare i modelli del database creati nel backend (tramite Mongoose) e rifletterli nel frontend sotto forma di interfacce TypeScript. Questo garantisce la *Type Safety* e riduce gli errori a runtime.

### 2.1 — Creazione dell'interfaccia Call

Abbiamo creato il file `frontend/src/app/models/call.model.ts` per mappare esattamente il JSON restituito dalle API Node.js.

```typescript
export type CallStatus = 'queued' | 'in-progress' | 'completed' | 'failed';

export interface Call {
  _id: string;
  callerNumber: string;
  agentId: string;
  duration: number;
  status: CallStatus;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}
```

> **Parallelismo Python/Flask ↔ TypeScript/Angular:**
> In Python (specialmente senza annotazioni o pydantic), una chiamata JSON in ingresso diventa spesso un semplice `dict`. Puoi accedere a `call['durata']` anziché `call['duration']` e accorgertene solo a runtime (quando il programma crasha).
> In TypeScript, grazie all'uso rigoroso delle `interface`, stiamo istruendo il compilatore: "questo oggetto deve avere questi precisi campi". Il compilatore (o l'IDE) ci impedirà di compiere errori di battitura o di accedere a proprietà inesistenti *prima* che il codice venga mai eseguito. Questa è la vera forza dei framework strongly-typed come Angular e .NET.

✅ **Fase 2 completata.**


---

## Fase 3 — Core Service (WebSocket e RxJS)

### Obiettivo
Gestire la comunicazione in tempo reale con il backend tramite `socket.io-client` ed esporre i dati ai componenti visivi sfruttando il pattern reattivo di **RxJS** tramite l'uso degli **Observable**.

### 3.1 — Installazione dipendenze

Ci siamo spostati nella cartella del frontend e abbiamo installato il client WebSocket:
```powershell
npm install socket.io-client
```

### 3.2 — Creazione del CallService

Abbiamo generato un servizio core `frontend/src/app/services/call.service.ts` incaricato di gestire in esclusiva la connessione al backend. Nessun componente parlerà mai direttamente con il WebSocket, tutti passeranno dal `CallService`.

```typescript
import { Injectable } from '@angular/core';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { Call } from '../models/call.model';

@Injectable({
  providedIn: 'root'
})
export class CallService {
  private socket: Socket;
  
  private callsSubject = new BehaviorSubject<Call[]>([]);
  public calls$: Observable<Call[]> = this.callsSubject.asObservable();

  constructor() {
    this.socket = io('http://localhost:3000');
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    this.socket.on('initial-calls', (calls: Call[]) => {
      this.callsSubject.next(calls);
    });

    this.socket.on('call-updated', (updatedCall: Call) => {
      const currentCalls = this.callsSubject.getValue();
      const index = currentCalls.findIndex(c => c._id === updatedCall._id);
      
      if (index !== -1) {
        currentCalls[index] = updatedCall;
        this.callsSubject.next([...currentCalls]);
      } else {
        this.callsSubject.next([updatedCall, ...currentCalls]);
      }
    });
  }
}
```

> **Parallelismo con .NET / Spring e l'uso di RxJS:**
> 1. **`@Injectable({ providedIn: 'root' })`**: Questo decoratore fa sì che Angular registri automaticamente questa classe nel suo sistema di Dependency Injection come Singleton (un'unica istanza condivisa per tutta l'app). È l'equivalente di registrare un servizio come `AddSingleton<CallService>()` nello `Startup.cs` di .NET o usare l'annotazione `@Service` in Spring Boot.
> 2. **`BehaviorSubject` e `Observable`**: Anziché avere i componenti visivi che chiamano in continuazione metodi o pollano il database (come si faceva spesso con vecchie app MVC o con JQuery), qui usiamo il pattern Publisher/Subscriber di RxJS.
>    - Il `BehaviorSubject` (privato) è il "Publisher". Quando arriva un messaggio dal WebSocket, il servizio "spinge" i nuovi dati usando `.next()`.
>    - L'`Observable` (pubblico, solitamente con il suffisso `$`) è il canale di lettura a cui i componenti visivi si "iscriveranno" (Subscribe). Quando i dati cambiano nel Service, l'interfaccia grafica reagirà automaticamente in tempo reale senza dover essere rinfrescata manualmente, portando il concetto di reattività all'estremo rispetto a quello che si farebbe su una vista standard in Jinja/Flask.

✅ **Fase 3 completata.**
