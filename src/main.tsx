import React from 'react';
import ReactDOM from 'react-dom/client';
import { App } from './App';
import { applyDisplaySettings, getInitialDisplaySettings } from './displaySettings';
import '@fontsource-variable/lexend/wght.css';
import '@fontsource-variable/inter/wght.css';
import '@fontsource/comic-neue/latin-400.css';
import '@fontsource/comic-neue/latin-700.css';
import '@fontsource/fredoka/latin-600.css';
import '@fontsource/fredoka/latin-700.css';
import './styles.css';

// Stamp theme/accent/text-size/language/ui-style onto <html>. This does NOT
// run before the first paint — this module is deferred, so the stylesheet has
// already painted by the time it executes. The four attributes styles.css keys
// on (theme/accent/text-size/ui) are therefore stamped earlier, by the inline
// fouc-1 script in index.html; this call re-applies the same values (identical
// by construction — see the pinning test in bootTheme.test.ts) and additionally
// sets `lang`/`dir`, which no stylesheet rule depends on and so cannot flash
// the wrong styling.
applyDisplaySettings(getInitialDisplaySettings());

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
