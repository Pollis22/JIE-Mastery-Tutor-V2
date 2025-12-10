import { createContext, ReactNode, useContext } from "react";
import {
  useQuery,
  useMutation,
  UseMutationResult,
} from "@tanstack/react-query";
import { insertUserSchema, User as SelectUser, InsertUser } from "@shared/schema";
import { getQueryFn, apiRequest, queryClient } from "../lib/queryClient";
import { useToast } from "@/hooks/use-toast";

type AuthContextType = {
  user: SelectUser | null;
  isLoading: boolean;
  error: Error | null;
  refetch: () => Promise<any>;
  loginMutation: UseMutationResult<SelectUser, Error, LoginData>;
  logoutMutation: UseMutationResult<void, Error, void>;
  registerMutation: UseMutationResult<SelectUser, Error, InsertUser>;
};

type LoginData = { email: string; password: string };

const AuthContext = createContext<AuthContextType | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
  const {
    data: user,
    error,
    isLoading,
    refetch,
  } = useQuery<SelectUser | undefined, Error>({
    queryKey: ["/api/user"],
    queryFn: getQueryFn({ on401: "returnNull" }),
  });

  const loginMutation = useMutation({
    mutationFn: async (credentials: LoginData) => {
      console.log('[AUTH] Making login request with:', credentials);
      const res = await apiRequest("POST", "/api/login", credentials);
      
      // Check if the response has content before parsing
      const contentType = res.headers.get("content-type");
      if (!contentType || !contentType.includes("application/json")) {
        throw new Error("Server error. Please try again.");
      }
      
      const data = await res.json();
      console.log('[AUTH] Login response:', data);
      
      // Handle specific error cases from backend
      if (!res.ok) {
        // Check for email verification error
        if (data.requiresVerification || data.needsVerification) {
          const error: any = new Error(data.message || "Please verify your email before logging in. Check your inbox for the verification link.");
          error.email = data.email; // Capture the actual email from backend
          error.requiresVerification = true;
          throw error;
        }
        // Check for invalid credentials
        if (res.status === 401) {
          throw new Error("Invalid email or password. Please check your credentials and try again.");
        }
        // Server error
        if (res.status === 500) {
          throw new Error("Server error. Please try again in a moment or contact support at hello@jiemastery.ai");
        }
        // Generic error
        throw new Error(data.error || data.message || "Login failed. Please try again.");
      }
      
      return data;
    },
    onSuccess: (user: SelectUser) => {
      console.log('[AUTH] Login successful, setting user data');
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Welcome back!",
        description: `Logged in as ${user.username}`,
      });
    },
    onError: (error: Error) => {
      console.error('[AUTH] Login error:', error);
      toast({
        title: "Login failed",
        description: error.message || "Invalid credentials",
        variant: "destructive",
      });
    },
  });

  const registerMutation = useMutation({
    mutationFn: async (credentials: InsertUser) => {
      console.log('[AUTH] Making registration request with:', {
        email: credentials.email,
        username: credentials.username,
        hasPassword: !!credentials.password,
      });
      
      // apiRequest throws on error, so just await and return the JSON
      // The error message from backend is already extracted by apiRequest's throwIfResNotOk
      const res = await apiRequest("POST", "/api/register", credentials);
      const data = await res.json();
      
      console.log('[AUTH] ✅ Registration successful:', data.email);
      return data;
    },
    onSuccess: (user: SelectUser) => {
      queryClient.setQueryData(["/api/user"], user);
      toast({
        title: "Account created!",
        description: "Please check your email to verify your account.",
      });
    },
    onError: (error: any) => {
      // The error.message already contains the specific error from backend
      // thanks to queryClient.ts throwIfResNotOk extracting errorJson.error
      console.error('[AUTH] ❌ Registration failed:', error.message);
      const errorMessage = error.message || "Unable to create account. Please try again.";
      toast({
        title: "Registration failed", 
        description: errorMessage,
        variant: "destructive",
      });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      await apiRequest("POST", "/api/logout");
    },
    onSuccess: () => {
      queryClient.setQueryData(["/api/user"], null);
    },
    onError: (error: Error) => {
      toast({
        title: "Logout failed",
        description: error.message,
        variant: "destructive",
      });
    },
  });

  return (
    <AuthContext.Provider
      value={{
        user: user ?? null,
        isLoading,
        error,
        refetch,
        loginMutation,
        logoutMutation,
        registerMutation,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
