import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { io, Socket } from 'socket.io-client';
import { BehaviorSubject, Observable } from 'rxjs';
import { Call } from '../models/call.model';

@Injectable({
  // 'root' istruisce il sistema di Dependency Injection di Angular
  // di creare una singola istanza globale (Singleton) di questo servizio.
  providedIn: 'root'
})
export class CallService {
  private socket: Socket;
  private http = inject(HttpClient);
  
  // RxJS: BehaviorSubject è una variabile reattiva. Conserva sempre l'ultimo
  // valore emesso (qui un array vuoto di base) e lo spinge ai nuovi iscritti.
  private callsSubject = new BehaviorSubject<Call[]>([]);
  private totalCallsSubject = new BehaviorSubject<number>(0);
  
  // Esponiamo all'esterno solo l'Observable (che è di sola lettura).
  // La convenzione in Angular è usare il $ finale per indicare uno stream di RxJS.
  public calls$: Observable<Call[]> = this.callsSubject.asObservable();
  public totalCalls$: Observable<number> = this.totalCallsSubject.asObservable();

  constructor() {
    console.log('⚙️ CallService: Inizializzazione in corso...');
    
    // 1. Recupero chiamate storiche dal database con paginazione
    this.loadInitialCalls();

    // 2. Inizializziamo la connessione WebSocket
    this.socket = io('http://127.0.0.1:3000');
    
    this.socket.on('connect', () => {
      console.log('✅ WebSocket connesso con successo! ID:', this.socket.id);
    });
    
    this.socket.on('connect_error', (err) => {
      console.error('❌ Errore connessione WebSocket:', err);
    });

    this.setupSocketListeners();
  }

  private loadInitialCalls(): void {
    // Sfruttiamo la paginazione implementata nel backend tramite HttpParams.
    // Chiediamo la prima pagina con un limite per popolare la dashboard.
    const params = new HttpParams()
      .set('page', '1')
      .set('limit', '10'); // Impostato a 10 per renderlo evidente

    this.http.get<{ data: Call[], pagination: any }>('http://127.0.0.1:3000/calls', { params })
      .subscribe({
        next: (response) => {
          console.log(`📥 Storico chiamate recuperato via HTTP: ${response.data.length} (su un totale di ${response.pagination.total})`);
          this.callsSubject.next(response.data);
          this.totalCallsSubject.next(response.pagination.total);
        },
        error: (err) => {
          console.error('❌ Errore recupero storico chiamate:', err);
        }
      });
  }

  private setupSocketListeners(): void {
    // Listener universale per debuggare TUTTI gli eventi in arrivo
    this.socket.onAny((eventName, ...args) => {
      console.log(`[Socket.IO DEBUG] Evento '${eventName}' ricevuto con dati:`, args);
    });

    // Il backend emette 'call:created' quando arriva una POST
    this.socket.on('call:created', (newCall: Call) => {
      console.log('📡 Ricevuta nuova chiamata dal WebSocket:', newCall);
      const currentCalls = this.callsSubject.getValue();
      
      // Mettiamo la nuova chiamata in cima alla lista
      this.callsSubject.next([newCall, ...currentCalls]);
      
      // Aggiorniamo il totale delle chiamate (+1)
      this.totalCallsSubject.next(this.totalCallsSubject.getValue() + 1);
    });

    // Il backend emette 'call:updated' (payload con call e previousStatus) quando arriva una PATCH
    this.socket.on('call:updated', (payload: { call: Call; previousStatus: string }) => {
      console.log(`📡 Aggiornamento chiamata (da ${payload.previousStatus} a ${payload.call.status}):`, payload.call);
      const updatedCall = payload.call;
      const currentCalls = this.callsSubject.getValue();
      const index = currentCalls.findIndex(c => c._id === updatedCall._id);
      
      if (index !== -1) {
        currentCalls[index] = updatedCall;
        this.callsSubject.next([...currentCalls]);
      } else {
        // Se non l'avevamo in memoria, la aggiungiamo comunque
        this.callsSubject.next([updatedCall, ...currentCalls]);
        this.totalCallsSubject.next(this.totalCallsSubject.getValue() + 1);
      }
    });
  }

  // Metodo utile per eventuale pulizia delle risorse
  public disconnect(): void {
    if (this.socket) {
      this.socket.disconnect();
    }
  }
}
