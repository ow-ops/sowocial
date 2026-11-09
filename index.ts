import './src/polyfills';

// The push task must exist before the system runs the app headless for a push.
import './src/push/background';

import 'expo-router/entry';
