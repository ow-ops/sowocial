import { useSyncExternalStore } from 'react';
import { AccessibilityInfo, type EventSubscription } from 'react-native';

let enabled = false;
let subscription: EventSubscription | undefined;
const listeners = new Set<() => void>();

function setEnabled(on: boolean) {
  if (on === enabled) return;
  enabled = on;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  if (listeners.size === 0) {
    void AccessibilityInfo.isScreenReaderEnabled().then(setEnabled);
    subscription = AccessibilityInfo.addEventListener('screenReaderChanged', setEnabled);
  }
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) subscription?.remove();
  };
}

const getSnapshot = () => enabled;

// One system subscription shared by every row of every list.
export const useScreenReader = () => useSyncExternalStore(subscribe, getSnapshot);
