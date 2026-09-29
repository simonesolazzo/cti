import { Routes } from '@angular/router';
import { DashboardComponent } from './components/dashboard/dashboard.component';

export const routes: Routes = [
  // Quando andiamo su http://localhost:4200/ (il path vuoto ''), carica il DashboardComponent
  { path: '', component: DashboardComponent },
  // Se la rotta non esiste (wildcard **), reindirizza alla home
  { path: '**', redirectTo: '' }
];
