export interface Account {
  id: string;
  displayName: string | null;
  email: string | null;
}

export interface AuthProvider {
  currentAccount(): Account | null;
  signInWithEmail(email: string, password: string): Promise<Account>;
  signOut(): Promise<void>;
  onAuthChange(listener: (account: Account | null) => void): () => void;
}
