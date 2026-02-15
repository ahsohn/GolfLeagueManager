'use client';

import { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { Team } from '@/types';

interface AuthState {
  team: Team | null;
  isCommissioner: boolean;
  isLoading: boolean;
}

interface AuthContextType extends AuthState {
  login: (email: string) => Promise<{ success: boolean; error?: string }>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    team: null,
    isCommissioner: false,
    isLoading: true,
  });

  useEffect(() => {
    // Check localStorage on mount
    const stored = localStorage.getItem('auth');
    if (stored) {
      try {
        const parsed = JSON.parse(stored);
        setState({
          team: parsed.team,
          isCommissioner: parsed.isCommissioner,
          isLoading: false,
        });
      } catch {
        setState((s) => ({ ...s, isLoading: false }));
      }
    } else {
      setState((s) => ({ ...s, isLoading: false }));
    }
  }, []);

  const login = async (email: string) => {
    const res = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (data.success && data.team) {
      const authData = { team: data.team, isCommissioner: data.isCommissioner };
      localStorage.setItem('auth', JSON.stringify(authData));
      setState({
        team: data.team,
        isCommissioner: data.isCommissioner,
        isLoading: false,
      });
      return { success: true };
    }

    return { success: false, error: data.error };
  };

  const logout = () => {
    localStorage.removeItem('auth');
    setState({ team: null, isCommissioner: false, isLoading: false });
  };

  return (
    <AuthContext.Provider value={{ ...state, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
