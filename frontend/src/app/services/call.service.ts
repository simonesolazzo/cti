import { Injectable } from '@angular/core';
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
  
  // RxJS: BehaviorSubject è una variabile reattiva. Conserva sempre l'ultimo
  // valore emesso (qui un array vuoto di base) e lo spinge ai nuovi iscritti.
  private callsSubject = new BehaviorSubject<Call[]>([]);
  
  // Esponiamo all'esterno solo l'Observable (che è di sola lettura).
  // La convenzione in Angular è usare il $ finale per indicare uno stream di RxJS.
  public calls$: Observable<Call[]> = this.callsSubject.asObservable();

  constructor() {
    console.log('⚙️ CallService: Inizializzazione in corso...');
    this.socket = io('http://127.0.0.1:3000');
    
    this.socket.on('connect', () => {
      console.log('✅ WebSocket connesso con successo! ID:', this.socket.id);
    });
    
    this.socket.on('connect_error', (err) => {
      console.error('❌ Errore connessione WebSocket:', err);
    });

    this.setupSocketListeners();
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
