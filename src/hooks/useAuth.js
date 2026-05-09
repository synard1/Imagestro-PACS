// src/hooks/useAuth.js
import { useEffect, useState } from 'react';
import { getCurrentUser, onAuthChanged, setCurrentUser as _set } from '../services/rbac';

export function useAuth() {
  const [currentUser, setUser] = useState(() => getCurrentUser());

  useEffect(() => {
    const off = onAuthChanged((u) => setUser(u));
    return () => off && off();
  }, []);

  // expose setter jika ingin dipakai komponen lain
  const setCurrentUser = (u) => _set(u);

  return { currentUser, setCurrentUser };
}