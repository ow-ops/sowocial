import { Platform } from 'react-native';

// Selecting text on web ends in a click, which should not open what is under it.
export const selectingText = () => Platform.OS === 'web' && !window.getSelection()?.isCollapsed;
