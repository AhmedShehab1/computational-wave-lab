/**
 * State persistence utilities for localStorage auto-save
 * Handles debounced saves, versioning, and migration
 */

import { useEffect, useCallback, useRef } from 'react';
import { useGlobalStore, type GlobalState } from './globalStore';
import type { ImageSlotId, MixerChannel, MixerWeights } from '@/types';

const STORAGE_KEY = 'quantum-wave-lab-state';
const STORAGE_VERSION = 1;

// Keys from GlobalState that should be persisted
type PersistableKeys = 
  | 'mixerConfig'
  | 'regionMask'
  | 'brightnessConfig'
  | 'mixerWeights'
  | 'presets'
  | 'scenarios'
  | 'beamConfig'
  | 'fftMode';

// Subset of state that gets persisted
type PersistedState = Pick<GlobalState, PersistableKeys>;

interface StoragePayload {
  version: number;
  timestamp: number;
  data: Partial<PersistedState>;
}

// Keys to persist (excludes large image data, transient state)
const PERSIST_KEYS: PersistableKeys[] = [
  'mixerConfig',
  'regionMask',
  'brightnessConfig',
  'mixerWeights',
  'presets',
  'scenarios',
  'beamConfig',
  'fftMode',
];

/**
 * Extract persistable state from the full store
 */
function extractPersistableState(state: GlobalState): Partial<PersistedState> {
  const persistable: Partial<PersistedState> = {};
  
  for (const key of PERSIST_KEYS) {
    const value = state[key];
    // Skip undefined values and empty arrays/objects
    if (value !== undefined && value !== null) {
      // @ts-expect-error - we know the key is valid
      persistable[key] = value;
    }
  }
  
  return persistable;
}

/**
 * Save state to localStorage
 */
export function saveStateToStorage(state: GlobalState): boolean {
  try {
    const payload: StoragePayload = {
      version: STORAGE_VERSION,
      timestamp: Date.now(),
      data: extractPersistableState(state),
    };
    
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch (error) {
    console.warn('[Persistence] Failed to save state:', error);
    return false;
  }
}

/**
 * Load state from localStorage
 */
export function loadStateFromStorage(): Partial<PersistedState> | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const payload: StoragePayload = JSON.parse(stored);
    
    // Always run migration to handle schema changes within same version
    return migrateState(payload);
  } catch (error) {
    console.warn('[Persistence] Failed to load state:', error);
    return null;
  }
}



/**
 * Migrate mixerConfig to ensure channels array exists
 */
function migrateMixerConfig(config: Partial<MixerWeights> | undefined): MixerWeights | undefined {
  if (!config) return undefined;
  
  // If channels array is missing or empty, create it from legacy values
  if (!config.channels || config.channels.length === 0) {
    const legacyValues = config.values ?? [1, 1, 1, 1];
    const channels: MixerChannel[] = (['A', 'B', 'C', 'D'] as ImageSlotId[]).map((id, i) => ({
      id,
      weight1: legacyValues[i] ?? 1,
      weight2: legacyValues[i] ?? 1,
      locked: true,
      muted: false,
      solo: false,
    }));
    
    return {
      ...config,
      channels,
      mode: config.mode ?? 'mag-phase',
      values: legacyValues,
    } as MixerWeights;
  }
  
  return config as MixerWeights;
}

/**
 * Migrate old state versions to current
 */
function migrateState(payload: StoragePayload): Partial<PersistedState> | null {
  const data = payload.data;
  
  // Migrate mixerConfig if needed
  if (data.mixerConfig) {
    data.mixerConfig = migrateMixerConfig(data.mixerConfig);
  }
  
  return data;
}

/**
 * Clear persisted state
 */
export function clearPersistedState(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.warn('[Persistence] Failed to clear state:', error);
  }
}

/**
 * Check if there's persisted state available
 */
export function hasPersistedState(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

/**
 * Get storage info (size, last saved timestamp)
 */
export function getStorageInfo(): { size: number; lastSaved: Date | null } | null {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    
    const payload: StoragePayload = JSON.parse(stored);
    return {
      size: new Blob([stored]).size,
      lastSaved: new Date(payload.timestamp),
    };
  } catch {
    return null;
  }
}

/**
 * Debounce utility
 */
function debounce<T extends (...args: unknown[]) => void>(
  fn: T,
  delay: number
): { call: (...args: Parameters<T>) => void; cancel: () => void } {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  
  return {
    call: (...args: Parameters<T>) => {
      if (timeoutId) clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        fn(...args);
        timeoutId = null;
      }, delay);
    },
    cancel: () => {
      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }
    },
  };
}

/**
 * React hook for auto-persisting state changes
 */
export function usePersistence(options: {
  enabled?: boolean;
  debounceMs?: number;
  onSave?: () => void;
  onLoad?: (data: Partial<PersistedState>) => void;
} = {}) {
  const { 
    enabled = true, 
    debounceMs = 1000,
    onSave,
    onLoad,
  } = options;
  
  const saveCallbackRef = useRef(onSave);
  const loadCallbackRef = useRef(onLoad);
  
  // Update refs
  useEffect(() => {
    saveCallbackRef.current = onSave;
    loadCallbackRef.current = onLoad;
  }, [onSave, onLoad]);
  
  // Create debounced save function inside effect to avoid ref access during render
  const debouncedSaveRef = useRef<ReturnType<typeof debounce> | null>(null);
  
  // Subscribe to store changes
  useEffect(() => {
    if (!enabled) return;
    
    // Create debounced function inside effect
    const debouncedSave = debounce(() => {
      const state = useGlobalStore.getState();
      const success = saveStateToStorage(state);
      if (success) {
        saveCallbackRef.current?.();
      }
    }, debounceMs);
    
    debouncedSaveRef.current = debouncedSave;
    
    const unsubscribe = useGlobalStore.subscribe(() => {
      debouncedSave.call();
    });
    
    return () => {
      unsubscribe();
      debouncedSave.cancel();
    };
  }, [enabled, debounceMs]);
  
  // Manual save function
  const saveNow = useCallback(() => {
    const state = useGlobalStore.getState();
    return saveStateToStorage(state);
  }, []);
  
  // Load and restore state
  const loadAndRestore = useCallback(() => {
    const data = loadStateFromStorage();
    if (!data) return false;
    
    const store = useGlobalStore.getState();
    
    // Apply persisted state (with migration for mixerConfig)
    if (data.mixerConfig) {
      const migratedConfig = migrateMixerConfig(data.mixerConfig);
      if (migratedConfig) store.setMixerConfig(migratedConfig);
    }
    if (data.regionMask) store.setRegionMask(data.regionMask);
    if (data.brightnessConfig) store.setBrightnessConfig(data.brightnessConfig);
    if (data.mixerWeights) store.setMixerWeights(data.mixerWeights);
    if (data.beamConfig) store.setBeamConfig(data.beamConfig);
    if (data.fftMode) store.setFftMode(data.fftMode);
    if (data.scenarios) store.setScenarios(data.scenarios);
    
    loadCallbackRef.current?.(data);
    return true;
  }, []);
  
  return {
    saveNow,
    loadAndRestore,
    clearState: clearPersistedState,
    hasState: hasPersistedState,
    getInfo: getStorageInfo,
  };
}

/**
 * Export state as JSON file
 */
export function exportStateAsJson(): void {
  const state = useGlobalStore.getState();
  const payload: StoragePayload = {
    version: STORAGE_VERSION,
    timestamp: Date.now(),
    data: extractPersistableState(state),
  };
  
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `quantum-wave-lab-export-${new Date().toISOString().split('T')[0]}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Import state from JSON file
 */
export function importStateFromJson(file: File): Promise<boolean> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    
    reader.onload = (e) => {
      try {
        const payload: StoragePayload = JSON.parse(e.target?.result as string);
        
        // Validate structure
        if (!payload.data || typeof payload.data !== 'object') {
          console.error('[Persistence] Invalid import file structure');
          resolve(false);
          return;
        }
        
        // Save to localStorage and restore
        localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
        
        const store = useGlobalStore.getState();
        const data = payload.data;
        
        if (data.mixerConfig) store.setMixerConfig(data.mixerConfig);
        if (data.regionMask) store.setRegionMask(data.regionMask);
        if (data.brightnessConfig) store.setBrightnessConfig(data.brightnessConfig);
        if (data.mixerWeights) store.setMixerWeights(data.mixerWeights);
        if (data.beamConfig) store.setBeamConfig(data.beamConfig);
        if (data.fftMode) store.setFftMode(data.fftMode);
        if (data.scenarios) store.setScenarios(data.scenarios);
        
        resolve(true);
      } catch (error) {
        console.error('[Persistence] Failed to import:', error);
        resolve(false);
      }
    };
    
    reader.onerror = () => resolve(false);
    reader.readAsText(file);
  });
}

/**
 * Scenario-specific persistence
 */
export interface ScenarioSnapshot {
  id: string;
  name: string;
  description?: string;
  timestamp: number;
  thumbnail?: string;
  data: {
    beamConfig: GlobalState['beamConfig'];
    mixerConfig?: GlobalState['mixerConfig'];
  };
}

const SCENARIOS_KEY = 'quantum-wave-lab-scenarios';

export function saveScenario(scenario: ScenarioSnapshot): void {
  try {
    const existing = loadAllScenarios();
    const updated = [...existing.filter(s => s.id !== scenario.id), scenario];
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('[Persistence] Failed to save scenario:', error);
  }
}

export function loadAllScenarios(): ScenarioSnapshot[] {
  try {
    const stored = localStorage.getItem(SCENARIOS_KEY);
    return stored ? JSON.parse(stored) : [];
  } catch {
    return [];
  }
}

export function deleteScenario(id: string): void {
  try {
    const existing = loadAllScenarios();
    const updated = existing.filter(s => s.id !== id);
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(updated));
  } catch (error) {
    console.warn('[Persistence] Failed to delete scenario:', error);
  }
}

export function applyScenario(scenario: ScenarioSnapshot): void {
  const store = useGlobalStore.getState();
  store.setBeamConfig(scenario.data.beamConfig);
  if (scenario.data.mixerConfig) {
    store.setMixerConfig(scenario.data.mixerConfig);
  }
}
