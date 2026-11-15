import { prisma } from "./prisma";

export async function logAudit(params: {
  userId: string;
  action: string;
  entityType: string;
  entityId: string;
  details?: Record<string, unknown> | string;
}) {
  const detailsText =
    typeof params.details === "string"
      ? params.details
      : params.details
        ? JSON.stringify(params.details)
        : null;

  await prisma.auditLog.create({
    data: {
      userId: params.userId,
      action: params.action,
      entityType: params.entityType,
      entityId: params.entityId,
      details: detailsText,
    },
  });
}

