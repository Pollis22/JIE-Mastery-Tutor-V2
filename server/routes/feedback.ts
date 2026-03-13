import { Router, Request, Response } from "express";
import { z } from "zod";

const router = Router();

const feedbackSchema = z.object({
  category: z.enum(["general", "suggestion", "bug", "praise"]),
  rating: z.number().int().min(0).max(5),
  message: z.string().min(1).max(500),
});

router.post("/", async (req: Request, res: Response) => {
  try {
    const validation = feedbackSchema.safeParse(req.body);
    if (!validation.success) {
      return res.status(400).json({ error: validation.error.errors[0].message });
    }

    const { category, rating, message } = validation.data;

    // Gather user context if authenticated
    const user = (req as any).user;
    const userInfo = user
      ? `<b>User:</b> ${user.email || "unknown"} (ID: ${user.id})<br>
         <b>Plan:</b> ${user.subscriptionStatus || "unknown"}<br>`
      : `<b>User:</b> Not logged in (anonymous)<br>`;

    const categoryLabels: Record<string, string> = {
      praise: "⭐ What I love",
      suggestion: "💡 Suggestion",
      bug: "🔧 Something's off",
      general: "💬 General feedback",
    };

    const ratingLabels = ["", "Poor", "Fair", "Good", "Great", "Excellent"];
    const ratingDisplay =
      rating > 0
        ? `${"★".repeat(rating)}${"☆".repeat(5 - rating)} (${rating}/5 — ${ratingLabels[rating]})`
        : "Not provided";

    const now = new Date().toLocaleString("en-US", {
      timeZone: "America/Chicago",
      dateStyle: "full",
      timeStyle: "short",
    });

    const htmlBody = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 600px; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1a56db 0%, #0e3fa0 100%); padding: 24px 28px; border-radius: 12px 12px 0 0;">
          <h1 style="color: white; margin: 0; font-size: 20px; font-weight: 700;">
            📬 New Tutor Feedback
          </h1>
          <p style="color: rgba(255,255,255,0.8); margin: 6px 0 0; font-size: 13px;">${now}</p>
        </div>

        <div style="background: #ffffff; border: 1px solid #e5e7eb; border-top: none; border-radius: 0 0 12px 12px; padding: 24px 28px;">

          <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6; width: 130px;">
                <span style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Category</span>
              </td>
              <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-size: 14px; color: #111827; font-weight: 500;">${categoryLabels[category]}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">Rating</span>
              </td>
              <td style="padding: 8px 0; border-bottom: 1px solid #f3f4f6;">
                <span style="font-size: 14px; color: ${rating >= 4 ? "#059669" : rating === 3 ? "#d97706" : rating > 0 ? "#dc2626" : "#9ca3af"};">${ratingDisplay}</span>
              </td>
            </tr>
            <tr>
              <td style="padding: 8px 0;">
                <span style="font-size: 12px; font-weight: 600; color: #6b7280; text-transform: uppercase; letter-spacing: 0.05em;">From</span>
              </td>
              <td style="padding: 8px 0; font-size: 14px; color: #111827;">${userInfo}</td>
            </tr>
          </table>

          <div style="background: #f9fafb; border-left: 4px solid #1a56db; border-radius: 0 8px 8px 0; padding: 16px 18px; margin-top: 4px;">
            <p style="margin: 0 0 6px; font-size: 11px; font-weight: 700; color: #6b7280; text-transform: uppercase; letter-spacing: 0.08em;">Message</p>
            <p style="margin: 0; font-size: 15px; color: #111827; line-height: 1.6; white-space: pre-wrap;">${message.replace(/</g, "&lt;").replace(/>/g, "&gt;")}</p>
          </div>

          <p style="margin: 20px 0 0; font-size: 12px; color: #9ca3af; text-align: center;">
            Sent via JIE Mastery Tutor • Feedback Widget
          </p>
        </div>
      </div>
    `;

    const textBody = `NEW TUTOR FEEDBACK
==================
Category: ${categoryLabels[category]}
Rating: ${ratingDisplay}
User: ${user ? `${user.email} (ID: ${user.id}, Plan: ${user.subscriptionStatus || "unknown"})` : "Anonymous"}
Time: ${now}

Message:
${message}

--
Sent via JIE Mastery Tutor Feedback Widget`;

    const { emailService } = await import("../services/email-service");
    await emailService.sendEmail({
      to: "pollis@jiemastery.ai",
      subject: `[Feedback] ${categoryLabels[category]} — JIE Mastery Tutor`,
      html: htmlBody,
      text: textBody,
    });

    console.log(
      `[Feedback] ✅ Feedback sent — category: ${category}, rating: ${rating}, user: ${user?.email || "anonymous"}`
    );

    return res.json({ success: true });
  } catch (error: any) {
    console.error("[Feedback] ❌ Error:", error);
    return res.status(500).json({ error: "Failed to send feedback. Please try again." });
  }
});

export default router;
