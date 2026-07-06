import { createContext, useContext, useState, useEffect, ReactNode, useCallback } from 'react';
import { jwtDecode } from 'jwt-decode';
import { setAuthTokenGetter } from '../services/api/authFetch';

const ALLOWED_DOMAIN = 'risalabs.ai';
const IS_DEV = import.meta.env.DEV;

const DEV_USER: User = {
  email: 'dev@risalabs.ai',
  name: 'Dev User',
};

interface User {
  email: string;
  name: string;
  picture?: string;
}

interface DecodedToken extends User {
  exp: number;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: (credential: string) => void;
  logout: () => void;
  getIdToken: () => string | null;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Bypass auth in dev mode
    if (IS_DEV) {
      setUser(DEV_USER);
      setLoading(false);
      return;
    }

    // Check for stored token on mount
    const storedToken = localStorage.getItem('auth_token');
    if (storedToken) {
      try {
        const decoded = jwtDecode<DecodedToken>(storedToken);
        const isExpired = decoded.exp * 1000 < Date.now();

        if (!isExpired && decoded.email?.endsWith(`@${ALLOWED_DOMAIN}`)) {
          setToken(storedToken);
          setUser({
            email: decoded.email,
            name: decoded.name,
            picture: decoded.picture,
          });
        } else {
          localStorage.removeItem('auth_token');
        }
      } catch {
        localStorage.removeItem('auth_token');
      }
    }
    setLoading(false);
  }, []);

  const login = (credential: string) => {
    try {
      setError(null);
      const decoded = jwtDecode<DecodedToken>(credential);
      const email = decoded.email || '';

      if (!email.endsWith(`@${ALLOWED_DOMAIN}`)) {
        setError(`Access restricted to @${ALLOWED_DOMAIN} accounts`);
        return;
      }

      localStorage.setItem('auth_token', credential);
      setToken(credential);
      setUser({
        email: decoded.email,
        name: decoded.name,
        picture: decoded.picture,
      });
    } catch (err) {
      console.error('Login error:', err);
      setError('Failed to sign in');
    }
  };

  const logout = () => {
    localStorage.removeItem('auth_token');
    setToken(null);
    setUser(null);
  };

  const getIdToken = useCallback((): string | null => {
    return token;
  }, [token]);

  // Set up the auth token getter for API calls
  useEffect(() => {
    setAuthTokenGetter(getIdToken);
  }, [getIdToken]);

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, getIdToken }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
