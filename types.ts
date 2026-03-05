
export interface Message {
  id: string;
  role: 'user' | 'model';
  text: string;
  timestamp: number;
}

export enum VoiceName {
  Puck = 'Puck',
  Charon = 'Charon',
  Kore = 'Kore',
  Fenrir = 'Fenrir',
  Zephyr = 'Zephyr'
}

export interface LiveSessionConfig {
  voice: VoiceName;
  systemInstruction: string;
}
