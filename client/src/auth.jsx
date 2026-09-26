import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, token } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!token.get()) { setReady(true); return; }
    api.get('/auth/me').then(setUser).catch(() => token.set(null)).finally(() => setReady(true));
  }, []);

  useEffect(() => {
    const onLogout = () => setUser(null);
    window.addEventListener('stocksense:logout', onLogout);
    return () => window.removeEventListener('stocksense:logout', onLogout);
  }, []);

  const signIn = useCallback(({ token: t, user: u }) => { token.set(t); setUser(u); }, []);
  const signOut = useCallback(() => { token.set(null); setUser(null); }, []);

  return (
    <AuthContext.Provider value={{ user, setUser, ready, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
