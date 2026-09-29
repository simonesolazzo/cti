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
