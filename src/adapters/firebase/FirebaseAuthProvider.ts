import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type Auth,
  type User,
} from "firebase/auth";

import type { Account, AuthProvider } from "../../ports/AuthProvider";

function toAccount(user: User): Account {
  return {
    id: user.uid,
    displayName: user.displayName,
    email: user.email,
  };
}

export class FirebaseAuthProvider implements AuthProvider {
  constructor(private readonly auth: Auth) {}

  currentAccount(): Account | null {
    return this.auth.currentUser ? toAccount(this.auth.currentUser) : null;
  }

  async registerWithEmail(email: string, password: string): Promise<Account> {
    const credential = await createUserWithEmailAndPassword(this.auth, email, password);
    return toAccount(credential.user);
  }

  async signInWithEmail(email: string, password: string): Promise<Account> {
    const credential = await signInWithEmailAndPassword(this.auth, email, password);
    return toAccount(credential.user);
  }

  async sendPasswordResetEmail(email: string): Promise<void> {
    await sendPasswordResetEmail(this.auth, email);
  }

  async signOut(): Promise<void> {
    await signOut(this.auth);
  }

  onAuthChange(listener: (account: Account | null) => void): () => void {
    return onAuthStateChanged(this.auth, (user) => listener(user ? toAccount(user) : null));
  }
}
