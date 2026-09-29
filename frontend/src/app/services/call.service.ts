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
    // 1. Inizializziamo la connessione WebSocket
    this.socket = io('http://localhost:3000');

    // 2. Registriamo i listener
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    // In un'app reale, il backend potrebbe inviarci le chiamate già attive al momento della connessione
    this.socket.on('initial-calls', (calls: Call[]) => {
      this.callsSubject.next(calls);
    });

    // Quando arriva un aggiornamento di una singola chiamata o una nuova chiamata
    this.socket.on('call-updated', (updatedCall: Call) => {
      // Preleviamo lo stato corrente dell'array
      const currentCalls = this.callsSubject.getValue();
      const index = currentCalls.findIndex(c => c._id === updatedCall._id);
      
      if (index !== -1) {
        // La chiamata esiste già: la aggiorniamo
        currentCalls[index] = updatedCall;
        // In Angular, per scatenare il ridisegno visivo spesso è necessario creare
        // un nuovo riferimento in memoria dell'array, quindi usiamo lo spread operator [...]
        this.callsSubject.next([...currentCalls]);
      } else {
        // Nuova chiamata: la mettiamo in cima alla lista
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
