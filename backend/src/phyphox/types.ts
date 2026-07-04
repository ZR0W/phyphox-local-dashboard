export type PhyphoxControlCommand = 'start' | 'stop' | 'clear';

export interface PhyphoxControlResponse {
  result: boolean;
}

export interface PhyphoxBufferEntry {
  size: number;
  updateMode: string;
  buffer: number[];
}

export interface PhyphoxGetResponse {
  buffer: Record<string, PhyphoxBufferEntry>;
  status: {
    measuring: boolean;
    [key: string]: unknown;
  };
}

export interface PhyphoxConfigBuffer {
  name: string;
  size?: number;
}

export interface PhyphoxConfig {
  buffers?: PhyphoxConfigBuffer[];
  [key: string]: unknown;
}

export type PhyphoxMeta = Record<string, unknown>;
