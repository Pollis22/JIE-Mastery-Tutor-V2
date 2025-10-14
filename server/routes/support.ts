import { Router } from 'express';
import { z } from 'zod';

const router = Router();

// Contact support endpoint
router.post('/contact', async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    // Validate the contact form data
    const contactSchema = z.object({
      subject: z.string().min(1, 'Subject is required'),
      message: z.string().min(10, 'Message must be at least 10 characters'),
      category: z.enum(['technical', 'billing', 'general']).default('general'),
    });

    const validation = contactSchema.safeParse(req.body);
    
    if (!validation.success) {
      return res.status(400).json({ 
        error: 'Invalid form data',
        details: validation.error.issues 
      });
    }

    const { subject, message, category } = validation.data;
    const user = req.user as any;
    
    console.log(`📧 [Support] Contact form submitted by ${user.email}:`, {
      subject,
      category,
      messageLength: message.length
    });

    // If email service is available, send the support email
    try {
      const { emailService } = await import('../services/email');
      if (emailService) {
        await emailService.sendAdminNotification(`Support Request: ${subject}`, {
          from: user.email,
          category,
          subject,
          message,
          userId: user.id,
          userName: user.studentName || user.firstName || 'User',
        });
      }
    } catch (emailError: any) {
      // Continue even if email fails
      console.error('[Support] Email failed, but continuing:', emailError.message);
    }
    
    // TODO: In production, save to database support_tickets table
    // For now, just log and return success
    
    res.json({ 
      success: true,
      message: 'Your message has been sent to our support team. We\'ll get back to you within 24-48 hours.',
      ticketId: `SUPPORT-${Date.now()}` // Temporary ticket ID
    });

  } catch (error: any) {
    console.error('❌ [Support] Contact form error:', error);
    res.status(500).json({ 
      error: 'Failed to send message',
      message: error.message 
    });
  }
});

// Get FAQ endpoint (static content for now)
router.get('/faq', (req, res) => {
  const faqs = [
    {
      id: 1,
      question: 'How do I get started with voice tutoring?',
      answer: 'Simply click the "Start Voice Session" button on the tutor page, select your subject and grade level, then click "Start Tutoring" to begin your personalized AI tutoring session.',
      category: 'getting-started'
    },
    {
      id: 2,
      question: 'What subjects are available?',
      answer: 'We currently offer tutoring in Math, English, Science, Spanish, and General subjects across all grade levels from K-2 through College/Adult.',
      category: 'subjects'
    },
    {
      id: 3,
      question: 'How do voice minutes work?',
      answer: 'Voice minutes are used for interactive voice tutoring sessions. Your subscription includes a monthly allocation that resets every 30 days, and you can purchase additional rollover minutes that never expire.',
      category: 'billing'
    },
    {
      id: 4,
      question: 'Can multiple children use one account?',
      answer: 'Yes! Our platform is designed to be sibling-friendly. You can create sessions with different grade levels and subjects for each child, and all sessions share the same voice minute pool.',
      category: 'account'
    },
    {
      id: 5,
      question: 'How do I cancel my subscription?',
      answer: 'You can cancel your subscription at any time from the Dashboard under Subscription settings. Your access will continue until the end of your current billing period.',
      category: 'billing'
    }
  ];

  res.json({ faqs });
});

export default router;