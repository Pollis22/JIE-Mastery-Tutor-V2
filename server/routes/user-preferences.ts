import { Router } from 'express';
import { storage } from '../storage';

const router = Router();

router.get('/', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const userId = req.user!.id;
    const user = await storage.getUserById(userId);

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json({
      interfaceLanguage: user.interfaceLanguage || 'en',
      voiceLanguage: user.voiceLanguage || user.preferredLanguage || 'en',
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
    const {
      interfaceLanguage,
      voiceLanguage,
      emailNotifications,
      marketingEmails,
    } = req.body;

    console.log('[Preferences] Updating preferences for user:', userId);
    console.log('[Preferences] New preferences:', req.body);

    await storage.updateUserPreferences(userId, {
      interfaceLanguage,
      voiceLanguage,
      emailNotifications,
      marketingEmails,
    });

    console.log('[Preferences] ✅ Preferences updated successfully');

    res.json({ 
      success: true,
      message: 'Preferences updated successfully' 
    });

  } catch (error) {
    console.error('[Preferences] Error updating preferences:', error);
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

export default router;
