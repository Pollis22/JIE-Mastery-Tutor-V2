import { Router } from 'express';
import { db } from '../db';
import { users } from '@shared/schema';
import { eq } from 'drizzle-orm';

const router = Router();

router.get('/', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = req.user!.id;

    const user = await db.query.users.findFirst({
      where: eq(users.id, userId),
      columns: {
        interfaceLanguage: true,
        voiceLanguage: true,
        emailNotifications: true,
        marketingEmails: true,
      }
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      interfaceLanguage: user.interfaceLanguage ?? 'en',
      voiceLanguage: user.voiceLanguage ?? 'en',
      emailNotifications: user.emailNotifications ?? true,
      marketingEmails: user.marketingEmails ?? false,
    });

  } catch (error) {
    console.error('[Preferences] Error fetching preferences:', error);
    res.status(500).json({ error: 'Failed to fetch preferences' });
  }
});

router.patch('/', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = req.user!.id;
    
    // Handle multiple possible field name formats from frontend
    // Frontend sends "preferredLanguage" for voice language
    const interfaceLanguage = req.body.interfaceLanguage || req.body.interface_language || req.body.language;
    const voiceLanguage = req.body.voiceLanguage || req.body.voice_language || req.body.preferredLanguage;
    const emailNotifications = req.body.emailNotifications ?? req.body.email_notifications;
    const marketingEmails = req.body.marketingEmails ?? req.body.marketing_emails;

    const updateData: any = {};
    
    // Map frontend fields to database columns
    if (interfaceLanguage !== undefined) {
      updateData.interface_language = interfaceLanguage;  // Database column name
    }
    if (voiceLanguage !== undefined) {
      updateData.voice_language = voiceLanguage;  // Database column name
    }
    if (emailNotifications !== undefined) {
      updateData.email_notifications = emailNotifications;  // Database column name
    }
    if (marketingEmails !== undefined) {
      updateData.marketing_emails = marketingEmails;  // Database column name
    }

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No preferences provided' });
    }

    await db.update(users)
      .set(updateData)
      .where(eq(users.id, userId));

    console.log('[Preferences] ✅ Updated successfully');

    res.json({ 
      success: true,
      message: 'Preferences updated successfully' 
    });

  } catch (error) {
    console.error('[Preferences] Error updating:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
