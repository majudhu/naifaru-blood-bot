import { eq } from "drizzle-orm";
import { Api, GrammyError, HttpError } from "grammy";

import { bloodRequests, users, type BloodRequest, type User } from "../../schema";
import { formatMatchingRequestNotification } from "./format";
import { helpKeyboard } from "./keyboards";
import type { AppDb, TelegramConfig } from "./types";

export const TELEGRAM_DONOR_NOTIFICATION_QUEUE = "naifaru-blood-bot-donor-notifications";

const QUEUE_SEND_BATCH_SIZE = 100;
const MAX_RETRY_DELAY_SECONDS = 3600;

export type DonorNotificationJob = {
  donorId: number;
  requestId: number;
  type: "donor_notification";
};

type NotificationTarget = {
  chatId: number;
  donorId: number;
  request: BloodRequest;
  requester: User;
};

export type DonorNotificationLookup =
  | {
      reason:
        | "donor_not_found"
        | "donor_unreachable"
        | "request_not_found"
        | "requester_not_found"
        | "request_closed";
      status: "skip";
    }
  | { notification: NotificationTarget; status: "ready" };

export type TelegramDeliveryDisposition =
  | { action: "discard" }
  | { action: "retry"; delaySeconds: number };

export async function enqueueDonorNotifications(
  queue: Env["TELEGRAM_DONOR_NOTIFICATIONS"],
  donors: Pick<User, "id" | "telegramUserId">[],
  request: Pick<BloodRequest, "id">,
) {
  const messages: MessageSendRequest<DonorNotificationJob>[] = donors
    .filter((donor) => donor.telegramUserId !== null)
    .map((donor) => ({
      body: {
        donorId: donor.id,
        requestId: request.id,
        type: "donor_notification",
      },
      contentType: "json",
    }));

  for (let index = 0; index < messages.length; index += QUEUE_SEND_BATCH_SIZE) {
    await queue.sendBatch(messages.slice(index, index + QUEUE_SEND_BATCH_SIZE));
  }
}

export function parseDonorNotificationJob(body: unknown): DonorNotificationJob | undefined {
  if (!body || typeof body !== "object") return undefined;

  const job = body as Record<string, unknown>;
  if (
    job.type !== "donor_notification" ||
    !Number.isSafeInteger(job.donorId) ||
    !Number.isSafeInteger(job.requestId)
  ) {
    return undefined;
  }

  return job as DonorNotificationJob;
}

export async function findDonorNotification(
  db: AppDb,
  job: DonorNotificationJob,
): Promise<DonorNotificationLookup> {
  const [request] = await db
    .select()
    .from(bloodRequests)
    .where(eq(bloodRequests.id, job.requestId))
    .limit(1);

  if (!request) return { reason: "request_not_found", status: "skip" };
  if (request.status !== "open") return { reason: "request_closed", status: "skip" };
  if (!request.userId) return { reason: "requester_not_found", status: "skip" };

  const [donor] = await db.select().from(users).where(eq(users.id, job.donorId)).limit(1);
  if (!donor) return { reason: "donor_not_found", status: "skip" };
  if (!donor.telegramUserId) return { reason: "donor_unreachable", status: "skip" };

  const [requester] = await db.select().from(users).where(eq(users.id, request.userId)).limit(1);
  if (!requester) return { reason: "requester_not_found", status: "skip" };

  return {
    notification: {
      chatId: donor.telegramUserId,
      donorId: donor.id,
      request,
      requester,
    },
    status: "ready",
  };
}

export async function sendDonorNotification(
  api: Api,
  config: TelegramConfig,
  notification: NotificationTarget,
) {
  await api.sendMessage(
    notification.chatId,
    formatMatchingRequestNotification(notification.requester, notification.request),
    {
      parse_mode: "HTML",
      reply_markup: helpKeyboard(notification.request.id, config.botUsername),
    },
  );
}

export function classifyTelegramDeliveryError(
  error: unknown,
  attempts: number,
): TelegramDeliveryDisposition | undefined {
  if (error instanceof GrammyError) {
    if (error.error_code === 429) {
      const retryAfter = error.parameters.retry_after;
      return {
        action: "retry",
        delaySeconds:
          typeof retryAfter === "number" && retryAfter > 0
            ? retryAfter
            : retryDelaySeconds(attempts),
      };
    }

    if (error.error_code >= 500) {
      return { action: "retry", delaySeconds: retryDelaySeconds(attempts) };
    }

    if (
      error.error_code === 403 ||
      (error.error_code === 400 && error.description.toLowerCase().includes("chat not found"))
    ) {
      return { action: "discard" };
    }

    return undefined;
  }

  if (error instanceof HttpError) {
    return { action: "retry", delaySeconds: retryDelaySeconds(attempts) };
  }

  return undefined;
}

export function telegramErrorDetails(error: unknown) {
  if (error instanceof GrammyError) {
    return {
      description: error.description,
      errorCode: error.error_code,
      kind: "telegram_api",
      retryAfter: error.parameters.retry_after,
    };
  }

  if (error instanceof HttpError) {
    return {
      cause: error.error instanceof Error ? error.error.message : String(error.error),
      kind: "network",
      message: error.message,
    };
  }

  return {
    kind: "unknown",
    message: error instanceof Error ? error.message : String(error),
  };
}

function retryDelaySeconds(attempts: number) {
  return Math.min(30 * 2 ** Math.max(0, attempts - 1), MAX_RETRY_DELAY_SECONDS);
}
