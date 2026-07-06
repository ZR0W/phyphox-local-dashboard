export type DeviceStatus = 'connected' | 'reconnecting' | 'offline';

export type LogLevel = 'info' | 'warn' | 'error';

export interface LogEntry {
  level: LogLevel;
  message: string;
  timestamp: number;
}

export interface SensorMeta {
  bufferName: string;
  label: string;
  unit?: string;
}

export interface Device {
  id: string;
  name: string;
  baseUrl: string;
  status: DeviceStatus;
  sensors: SensorMeta[];
  selectedBuffers: string[];
  lastSeen?: number;
}

export interface Sample {
  deviceId: string;
  bufferName: string;
  t: number;
  v: number;
}

export interface Session {
  id: string;
  startedAt: number;
  endedAt?: number;
  deviceIds: string[];
}
