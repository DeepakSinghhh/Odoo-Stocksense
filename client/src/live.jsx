import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { token } from './api.js';
import { useAuth } from './auth.jsx';

// One Server-Sent Events stream per tab. `version` bumps whenever anyone changes stock data,
// and every useApi() call re-fetches on it, so all open screens stay in sync.
const LiveContext = createContext({ version: 0, status: 'off', pulse: 0 });

export function LiveProvider({ children }) {
  const { user } = useAuth();
  const [version, setVersion] = useState(0);
  const [pulse, setPulse] = useState(0);
  const [status, setStatus] = useState('off');
  const timer = useRef(null);

  useEffect(() => {
    if (!user || typeof EventSource === 'undefined') return undefined;
    const es = new EventSource(`/api/events?token=${encodeURIComponent(token.get() || '')}`);
    es.addEventListener('hello', () => setStatus('live'));
    es.addEventListener('change', () => {
      setPulse((p) => p + 1);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setVersion((v) => v + 1), 150);
    });
    es.onerror = () => setStatus('reconnecting');
    // Coming back to a tab: catch up on anything missed while it slept.
    const onFocus = () => setVersion((v) => v + 1);
    window.addEventListener('focus', onFocus);
    return () => { es.close(); clearTimeout(timer.current); window.removeEventListener('focus', onFocus); setStatus('off'); };
  }, [user]);

  return <LiveContext.Provider value={{ version, status, pulse }}>{children}</LiveContext.Provider>;
}

export const useLive = () => useContext(LiveContext);
