import React from 'react';
import ReactDOM from 'react-dom/client';

import '@fontsource/source-code-pro/400.css';
import '@fontsource/source-code-pro/500.css';

import App from './App';
import './styles.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
