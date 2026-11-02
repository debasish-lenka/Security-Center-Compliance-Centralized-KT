import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import { authApi } from '@/lib/api';
import { setAuthToken, clearAuth, getStoredUser, setStoredUser, isAuthenticated } from '@/lib/auth';
import { toast } from '@/hooks/use-toast';

interface User {
  id: string;
  email: string;
  fullName: string;
  department: string | null;
  role: string;
  status: string;
}

interface AuthContextType {
  user: User | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const initAuth = async () => {
      if (isAuthenticated()) {
        try {
          const storedUser = getStoredUser();
          if (storedUser) {
            setUser(storedUser);
          }
          const response = await authApi.me();
          setUser(response.data.data);
          setStoredUser(response.data.data);
        } catch {
          clearAuth();
        }
      }
      setIsLoading(false);
    };
    initAuth();
  }, []);

  const login = async (email: string, password: string): Promise<boolean> => {
    try {
      const response = await authApi.login(email, password);
      const { user: userData, token } = response.data.data;
      setAuthToken(token);
      setUser(userData);
      setStoredUser(userData);
      toast({ title: 'Welcome back!', description: `Logged in as ${userData.fullName}` });
      return true;
    } catch (error: any) {
      const message = error.response?.data?.error?.message || 'Login failed';
      toast({ title: 'Login Failed', description: message, variant: 'destructive' });
      return false;
    }
  };

  const logout = async () => {
    try {
      await authApi.logout();
    } catch {
      // Ignore logout errors
    } finally {
      clearAuth();
      setUser(null);
      toast({ title: 'Logged out', description: 'You have been successfully logged out' });
    }
  };

  const refreshUser = async () => {
    try {
      const response = await authApi.me();
      setUser(response.data.data);
      setStoredUser(response.data.data);
    } catch {
      clearAuth();
      setUser(null);
    }
  };

  return (
    <AuthContext.Provider value={{ user, isLoading, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}