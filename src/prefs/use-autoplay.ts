import { NetworkStateType, useNetworkState } from 'expo-network';
import { Platform } from 'react-native';

import { usePref } from './store';

const UNMETERED = [NetworkStateType.WIFI, NetworkStateType.ETHERNET];

export function useMediaAutoplay() {
  const setting = usePref('mediaAutoplay');
  const { type } = useNetworkState();
  return setting === 'always' || (setting === 'wifi' && (Platform.OS === 'web' || (!!type && UNMETERED.includes(type))));
}
