import { and, count, desc, eq, like, or, sql } from "drizzle-orm";
import * as v from "valibot";
import {
  auditActionLabels,
  auditEntityLabels,
  type AuditAction,
  type AuditEntity,
} from "../../shared/utils/audit";
import { PER_PAGE } from "../../shared/utils/const";

const AuditQueryParser = v.parser(
  v.object({
    page: v.optional(
      v.pipe(
        v.string(),
        v.regex(/^[1-9]\d*$/),
        v.transform(Number),
        v.integer(),
        v.maxValue(Math.floor(Number.MAX_SAFE_INTEGER / PER_PAGE)),
      ),
      "1",
    ),
    search: v.optional(v.pipe(v.string(), v.trim(), v.maxLength(200)), ""),
    action: v.optional(
      v.picklist(["all", ...(Object.keys(auditActionLabels) as AuditAction[])]),
      "all",
    ),
    entity: v.optional(
      v.picklist(["all", ...(Object.keys(auditEntityLabels) as AuditEntity[])]),
      "all",
    ),
  }),
);

export default defineEventHandler(async (event) => {
  const { user } = await requireUserSession(event);
  if (user.role !== "admin") throw createError({ statusCode: 403, statusMessage: "Forbidden" });

  const { page, search, action, entity } = await getValidatedQuery(event, AuditQueryParser);
  const db = useDb(event);
  const filters = and(
    search
      ? or(
          like(schema.auditLogs.actorName, `%${search}%`),
          like(sql`cast(${schema.auditLogs.entityId} as text)`, `%${search}%`),
          like(schema.auditLogs.details, `%${search}%`),
        )
      : undefined,
    action !== "all" ? eq(schema.auditLogs.action, action) : undefined,
    entity !== "all" ? eq(schema.auditLogs.entityType, entity) : undefined,
  );

  const [data, [total]] = await Promise.all([
    db
      .select()
      .from(schema.auditLogs)
      .where(filters)
      .orderBy(desc(schema.auditLogs.createdAt), desc(schema.auditLogs.id))
      .limit(PER_PAGE)
      .offset((page - 1) * PER_PAGE),
    db.select({ count: count() }).from(schema.auditLogs).where(filters),
  ]);

  return { data, total: total!.count };
});
