/// <reference types="@types/node" />

// ─── Expo EXPO_PUBLIC_* env vars ────────────────────────────────────────────
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_URL?: string;
    EXPO_PUBLIC_WS_URL?: string;
  }
}

// ─── Stub para @react-native-async-storage/async-storage ─────────────────────
// (Se instala automáticamente con expo install)
declare module '@react-native-async-storage/async-storage' {
  const AsyncStorage: {
    getItem(key: string): Promise<string | null>;
    setItem(key: string, value: string): Promise<void>;
    removeItem(key: string): Promise<void>;
    multiGet(keys: string[]): Promise<[string, string | null][]>;
    multiSet(pairs: [string, string][]): Promise<void>;
    clear(): Promise<void>;
    getAllKeys(): Promise<string[]>;
  };
  export default AsyncStorage;
}

// ─── Stub para expo-status-bar ────────────────────────────────────────────────
declare module 'expo-status-bar' {
  import { Component } from 'react';
  interface StatusBarProps { style?: 'auto' | 'inverted' | 'light' | 'dark' }
  export class StatusBar extends Component<StatusBarProps> {}
}
