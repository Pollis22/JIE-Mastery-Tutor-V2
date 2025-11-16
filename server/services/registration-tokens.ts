import crypto from 'crypto';

interface RegistrationData {
  accountName: string;
  studentName: string;
  studentAge?: number;
  gradeLevel: string;
  primarySubject?: string;
  email: string;
  password: string;
  marketingOptIn: boolean;
  expiresAt: number;
}

const TOKEN_EXPIRY_MS = 60 * 60 * 1000;

class RegistrationTokenStore {
  private store: Map<string, RegistrationData> = new Map();

  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  storeRegistrationData(token: string, data: Omit<RegistrationData, 'expiresAt'>): void {
    const expiresAt = Date.now() + TOKEN_EXPIRY_MS;
    this.store.set(token, { ...data, expiresAt });
    console.log(`[Registration Token] Stored token ${token.substring(0, 8)}... (expires in 1 hour)`);
  }

  getRegistrationData(token: string): RegistrationData | null {
    const data = this.store.get(token);
    
    if (!data) {
      console.log(`[Registration Token] Token not found: ${token.substring(0, 8)}...`);
      return null;
    }

    if (Date.now() > data.expiresAt) {
      console.log(`[Registration Token] Token expired: ${token.substring(0, 8)}...`);
      this.store.delete(token);
      return null;
    }

    return data;
  }

  deleteToken(token: string): void {
    this.store.delete(token);
    console.log(`[Registration Token] Deleted token ${token.substring(0, 8)}...`);
  }

  cleanup(): void {
    const now = Date.now();
    let deletedCount = 0;

    for (const [token, data] of this.store.entries()) {
      if (now > data.expiresAt) {
        this.store.delete(token);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`[Registration Token] Cleaned up ${deletedCount} expired tokens`);
    }
  }
}

export const registrationTokenStore = new RegistrationTokenStore();

setInterval(() => {
  registrationTokenStore.cleanup();
}, 15 * 60 * 1000);
