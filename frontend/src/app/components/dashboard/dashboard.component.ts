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
