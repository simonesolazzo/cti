# 📘 Guida di Studio — Frontend Angular CTI

> Documento che ricostruisce l'intero percorso di sviluppo del frontend in Angular, fase per fase.
> Ogni sezione include: obiettivo, comandi eseguiti, codice prodotto e spiegazioni strutturate.

---

## Indice

1. [Fase 1 — Inizializzazione del progetto Angular e integrazione Docker](#fase-1--inizializzazione-del-progetto-angular-e-integrazione-docker)
2. [Fase 2 — Definizione delle interfacce TypeScript](#fase-2--definizione-delle-interfacce-typescript)
3. [Fase 3 — Core Service (WebSocket e RxJS)](#fase-3--core-service-websocket-e-rxjs)
4. [Fase 4 — Sviluppo del Dashboard Component visivo](#fase-4--sviluppo-del-dashboard-component-visivo)

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
    // 1. Inizializziamo la connessione WebSocket usando 127.0.0.1
    // (Bypassiamo 'localhost' per evitare conflitti con IPv6 in Docker su Windows)
    this.socket = io('http://127.0.0.1:3000');
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    // Il backend emette 'call:created' quando arriva una POST
    this.socket.on('call:created', (newCall: Call) => {
      const currentCalls = this.callsSubject.getValue();
      // Inseriamo la nuova chiamata in cima all'array
      this.callsSubject.next([newCall, ...currentCalls]);
    });

    // Il backend emette 'call:updated' (payload con call e previousStatus) quando arriva una PATCH
    this.socket.on('call:updated', (payload: { call: Call; previousStatus: string }) => {
      const updatedCall = payload.call;
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

> **Nota di Troubleshooting (Risoluzione problemi):**
> Durante l'integrazione ci siamo scontrati con due classici problemi di sviluppo locale con Docker e WebSocket:
> 1. **Errore WebSocket `transport close`:** Usando `http://localhost:3000`, il browser (su host Windows) cercava di connettersi usando il protocollo IPv6 (`::1`), ma Docker esponeva il container in IPv4 (`0.0.0.0`). Risultato: il server faceva cadere la connessione istantaneamente. Usando esplicitamente `127.0.0.1` abbiamo aggirato il problema.
> 2. **Missmatch dei nomi degli eventi:** All'inizio la dashboard non riceveva i dati perché ascoltava eventi chiamati `initial-calls` e `call-updated`, mentre il backend Node.js emetteva eventi chiamati `call:created` e `call:updated`. Ascoltare il canale sbagliato in una comunicazione Publisher/Subscriber equivale ad avere la radio sintonizzata sulla frequenza errata!

> **Parallelismo con .NET / Spring e l'uso di RxJS:**
> 1. **`@Injectable({ providedIn: 'root' })`**: Questo decoratore fa sì che Angular registri automaticamente questa classe nel suo sistema di Dependency Injection come Singleton (un'unica istanza condivisa per tutta l'app). È l'equivalente di registrare un servizio come `AddSingleton<CallService>()` nello `Startup.cs` di .NET o usare l'annotazione `@Service` in Spring Boot.
> 2. **`BehaviorSubject` e `Observable`**: Anziché avere i componenti visivi che chiamano in continuazione metodi o pollano il database (come si faceva spesso con vecchie app MVC o con JQuery), qui usiamo il pattern Publisher/Subscriber di RxJS.
>    - Il `BehaviorSubject` (privato) è il "Publisher". Quando arriva un messaggio dal WebSocket, il servizio "spinge" i nuovi dati usando `.next()`.
>    - L'`Observable` (pubblico, solitamente con il suffisso `$`) è il canale di lettura a cui i componenti visivi si "iscriveranno" (Subscribe). Quando i dati cambiano nel Service, l'interfaccia grafica reagirà automaticamente in tempo reale senza dover essere rinfrescata manualmente, portando il concetto di reattività all'estremo rispetto a quello che si farebbe su una vista standard in Jinja/Flask.

✅ **Fase 3 completata.**


---

## Fase 4 — Sviluppo del Dashboard Component visivo

### Obiettivo
Creare il primo componente grafico (la Dashboard), iniettare il nostro `CallService` e "ascoltare" in tempo reale lo stream dei dati per disegnare una tabella che si aggiorna da sola.

### 4.1 — Creazione e Logica del Componente

Abbiamo creato tre file per il componente in `frontend/src/app/components/dashboard`:
- `dashboard.component.ts` (La Logica)
- `dashboard.component.html` (La Vista)
- `dashboard.component.css` (Lo Stile)

Nel file TypeScript abbiamo usato l'approccio reattivo puro:

```typescript
import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallService } from '../../services/call.service';
import { Observable } from 'rxjs';
import { Call } from '../../models/call.model';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  private callService = inject(CallService);
  public calls$: Observable<Call[]> = this.callService.calls$;
}
```

> **Il salto mentale: zero variabili di stato locali!**
> Avrai notato che nel componente **non** abbiamo creato un array vuoto `calls = []` in cui salvare i dati. Abbiamo semplicemente preso l'altoparlante (Observable) del servizio e lo abbiamo passato all'interfaccia HTML così com'è. 

### 4.2 — Sottoscrizione tramite "Async Pipe" nel Template

Anziché fare il `.subscribe()` manualmente nel TypeScript (cosa che ci avrebbe costretto a ricordarci di fare `.unsubscribe()` alla chiusura della pagina per evitare memory leaks), abbiamo usato una *best practice* assoluta di Angular: il pipe `async`.

```html
@for (call of calls$ | async; track call._id) {
  <tr>
    <td>{{ call.callerNumber }}</td>
    <td>{{ call.status }}</td>
  </tr>
}
```

> **Cosa fa l'Async Pipe (`| async`)?**
> Svolge tre compiti fondamentali automaticamente:
> 1. Accende la radio (esegue il `.subscribe()` al momento del rendering).
> 2. Estrae il dato puro dall'Observable e lo passa all'HTML (permettendoci di ciclarci sopra col `@for`).
> 3. Spegne la radio (esegue l'`.unsubscribe()` non appena l'utente cambia pagina e il componente viene distrutto).

### 4.3 — Configurazione del Routing

Infine, abbiamo detto ad Angular che quando l'utente naviga all'URL di base (`/`), deve inserire questo componente all'interno del `<router-outlet>` che avevamo preparato nella Fase 1.

File `app.routes.ts`:
```typescript
export const routes: Routes = [
  { path: '', component: DashboardComponent },
  { path: '**', redirectTo: '' }
];
```

✅ **Fase 4 completata.**
