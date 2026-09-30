import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CallService } from '../../services/call.service';
import { Observable } from 'rxjs';
import { Call } from '../../models/call.model';

import { MatTableModule } from '@angular/material/table';
import { MatCardModule } from '@angular/material/card';
import { MatChipsModule } from '@angular/material/chips';

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, MatTableModule, MatCardModule, MatChipsModule],
  templateUrl: './dashboard.component.html',
  styleUrls: ['./dashboard.component.css']
})
export class DashboardComponent {
  private callService = inject(CallService);
  public calls$: Observable<Call[]> = this.callService.calls$;
  public totalCalls$: Observable<number> = this.callService.totalCalls$;

  public displayedColumns: string[] = ['id', 'caller', 'agent', 'status', 'duration', 'updatedAt'];

  public getStatusColor(status: string): string {
    switch (status) {
      case 'queued': return 'accent';
      case 'in-progress': return 'primary';
      case 'completed': return 'primary';
      case 'failed': return 'warn';
      default: return '';
    }
  }
}
