import "server-only";

export interface NotificationPayload {
  to: string | string[];
  subject: string;
  template?: string;
  body?: string;
  variables?: Record<string, unknown>;
}

export interface INotificationProvider {
  send(payload: NotificationPayload): Promise<{ success: boolean; id?: string }>;
}

export class ConsoleNotificationProvider implements INotificationProvider {
  async send(payload: NotificationPayload): Promise<{ success: boolean; id?: string }> {
    if (process.env.NODE_ENV !== "test") {
      const recipient = Array.isArray(payload.to) ? payload.to.join(", ") : payload.to;
      console.log(`[Notification] To: ${recipient} | Subject: ${payload.subject}`);
    }
    return { success: true, id: `console-${Date.now()}` };
  }
}

export class ResendNotificationProvider implements INotificationProvider {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  async send(payload: NotificationPayload): Promise<{ success: boolean; id?: string }> {
    try {
      const res = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from:
            process.env.NOTIFICATION_FROM_EMAIL ||
            process.env.EMAIL_FROM ||
            "VeriDoc <notifications@veridoc.app>",
          to: payload.to,
          subject: payload.subject,
          text: payload.body || `Notification: ${payload.subject}`,
        }),
        signal: AbortSignal.timeout(5000),
      });

      if (!res.ok) {
        console.error(`Resend notification failed with status ${res.status}`);
        return { success: false };
      }

      const data = (await res.json()) as { id?: string };
      return { success: true, id: data.id };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown error";
      console.error("Resend error:", message);
      return { success: false };
    }
  }
}

let customProvider: INotificationProvider | null = null;

export function setNotificationProvider(provider: INotificationProvider | null): void {
  customProvider = provider;
}

export function getNotificationProvider(): INotificationProvider {
  if (customProvider) {
    return customProvider;
  }
  if (process.env.RESEND_API_KEY && process.env.NODE_ENV === "production") {
    return new ResendNotificationProvider(process.env.RESEND_API_KEY);
  }
  return new ConsoleNotificationProvider();
}

/**
 * Dispatches transactional notifications strictly after a database transaction commits.
 */
export async function dispatchPostCommitNotifications(
  notifications: NotificationPayload[],
  provider: INotificationProvider = getNotificationProvider()
): Promise<void> {
  if (!notifications || notifications.length === 0) return;

  const results = await Promise.allSettled(
    notifications.map((notification) =>
      Promise.resolve().then(() => provider.send(notification))
    )
  );

  for (const result of results) {
    if (result.status === "rejected") {
      const message =
        result.reason instanceof Error ? result.reason.message : "Unknown error";
      console.error("Failed to send notification post-commit:", message);
    } else if (!result.value.success) {
      console.error("Notification provider failed to deliver post-commit message");
    }
  }
}
