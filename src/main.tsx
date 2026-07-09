import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';

import '@xyflow/react/dist/style.css';
import './styles/tokens.css';
import './styles/board.css';
import './styles/cards.css';

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
