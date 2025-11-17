/**
 * JIE Mastery AI Tutor Platform
 * Copyright (c) 2025 JIE Mastery AI, Inc.
 * All Rights Reserved.
 * 
 * This source code is confidential and proprietary.
 * Unauthorized copying, modification, or distribution is strictly prohibited.
 */

import crypto from 'crypto';
import { db } from '../db';
import { registrationTokens } from '@shared/schema';
import { eq, lt } from 'drizzle-orm';

interface RegistrationData {
  accountName: string;
  studentName: string;
  studentAge?: number;
  gradeLevel: string;
  primarySubject?: string;
  email: string;
  password: string; // MUST be hashed before storing! Never store plaintext passwords.
  selectedPlan: 'starter' | 'standard' | 'pro' | 'elite';
  marketingOptIn: boolean;
}

const TOKEN_EXPIRY_MS = 60 * 60 * 1000; // 1 hour

class RegistrationTokenStore {
  generateToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  async storeRegistrationData(token: string, data: RegistrationData): Promise<void> {
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MS);
    
    try {
      await db.insert(registrationTokens).values({
        token,
        accountName: data.accountName,
        studentName: data.studentName,
        studentAge: data.studentAge,
        gradeLevel: data.gradeLevel,
        primarySubject: data.primarySubject,
        email: data.email,
        password: data.password,
        selectedPlan: data.selectedPlan,
        marketingOptIn: data.marketingOptIn,
        expiresAt,
      });
      
      console.log(`[Registration Token] Stored token ${token.substring(0, 8)}... with plan ${data.selectedPlan} in database (expires in 1 hour)`);
    } catch (error: any) {
      console.error('[Registration Token] Failed to store token:', error);
      throw new Error('Failed to store registration token');
    }
  }

  async getRegistrationData(token: string): Promise<RegistrationData | null> {
    try {
      const results = await db
        .select()
        .from(registrationTokens)
        .where(eq(registrationTokens.token, token))
        .limit(1);

      if (results.length === 0) {
        console.log(`[Registration Token] Token not found: ${token.substring(0, 8)}...`);
        return null;
      }

      const tokenData = results[0];

      // Check if expired
      if (new Date() > new Date(tokenData.expiresAt)) {
        console.log(`[Registration Token] Token expired: ${token.substring(0, 8)}...`);
        await this.deleteToken(token);
        return null;
      }

      return {
        accountName: tokenData.accountName,
        studentName: tokenData.studentName,
        studentAge: tokenData.studentAge || undefined,
        gradeLevel: tokenData.gradeLevel,
        primarySubject: tokenData.primarySubject || undefined,
        email: tokenData.email,
        password: tokenData.password,
        selectedPlan: tokenData.selectedPlan as 'starter' | 'standard' | 'pro' | 'elite',
        marketingOptIn: tokenData.marketingOptIn || false,
      };
    } catch (error: any) {
      console.error('[Registration Token] Failed to retrieve token:', error);
      return null;
    }
  }

  async deleteToken(token: string): Promise<void> {
    try {
      await db.delete(registrationTokens).where(eq(registrationTokens.token, token));
      console.log(`[Registration Token] Deleted token ${token.substring(0, 8)}... from database`);
    } catch (error: any) {
      console.error('[Registration Token] Failed to delete token:', error);
    }
  }

  async cleanup(): Promise<void> {
    try {
      const now = new Date();
      const result = await db
        .delete(registrationTokens)
        .where(lt(registrationTokens.expiresAt, now));

      console.log(`[Registration Token] Cleaned up expired tokens from database`);
    } catch (error: any) {
      console.error('[Registration Token] Failed to cleanup expired tokens:', error);
    }
  }
}

export const registrationTokenStore = new RegistrationTokenStore();

// Cleanup expired tokens every 15 minutes
setInterval(() => {
  registrationTokenStore.cleanup();
}, 15 * 60 * 1000);
