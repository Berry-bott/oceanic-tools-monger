import { prisma } from "./prisma.js";

export interface SendEmailOptions {
  businessId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
  kind?: string;
}

export async function sendEmail(options: SendEmailOptions) {
  const { businessId, to, subject, text, html, kind = "STAFF_INVITATION" } = options;

  const key = process.env.RESEND_API_KEY;
  let from = process.env.REMINDER_FROM_EMAIL || "Oceanic Tools Monger <notifications@oceanictoolsmonger.com>";
  if (from.includes("example.com")) {
    from = "Oceanic Tools Monger <notifications@oceanictoolsmonger.com>";
  }

  let sent = false;
  let lastError: string | null = null;

  // If real Resend key is configured, attempt direct send
  if (key && key !== "re_replace_me" && !key.includes("replace_me")) {
    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: [to],
          subject,
          text,
          html,
        }),
        signal: AbortSignal.timeout(10_000),
      });

      const body = (await response.json().catch(() => null)) as { id?: string; message?: string } | null;
      if (response.ok && body?.id) {
        sent = true;
        console.info(`[Mailer] Email sent successfully to ${to} (Message ID: ${body.id})`);
      } else {
        lastError = body?.message || `Resend API returned HTTP ${response.status}`;
        console.warn(`[Mailer] Resend API notification: ${lastError}`);
      }
    } catch (err) {
      lastError = err instanceof Error ? err.message : "Network error contacting Resend API";
      console.warn(`[Mailer] Failed sending email via Resend: ${lastError}`);
    }
  } else {
    lastError = "Resend API key not configured (set RESEND_API_KEY in backend/.env to deliver live emails).";
    console.info(`[Mailer Sandbox] Simulated email to: ${to}`);
    console.info(`[Mailer Sandbox] Subject: ${subject}`);
    console.info(`[Mailer Sandbox] Text Content:\n${text}`);
  }

  // Record in EmailOutbox for background worker and audit log
  try {
    const record = await prisma.emailOutbox.create({
      data: {
        businessId,
        kind,
        destination: to,
        subject,
        text,
        html,
        status: sent ? "SENT" : "PENDING",
        sentAt: sent ? new Date() : null,
        lastError,
      },
    });
    return { success: sent, outboxId: record.id, error: lastError };
  } catch (dbErr) {
    console.error("[Mailer] Could not record email in outbox:", dbErr);
    return { success: sent, error: lastError };
  }
}
