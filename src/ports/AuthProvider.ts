export interface Account {
  id: string;
  displayName: string | null;
  email: string | null;
}

export interface AuthProvider {
  currentAccount(): Account | null;
  registerWithEmail(email: string, password: string): Promise<Account>;
  signInWithEmail(email: string, password: string): Promise<Account>;
  sendPasswordResetEmail(email: string): Promise<void>;
  signOut(): Promise<void>;
  onAuthChange(listener: (account: Account | null) => void): () => void;
}
