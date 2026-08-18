import type { FastifyReply, FastifyRequest } from 'fastify';
import { paginate, type Paginated } from '@attendiq/shared';
import { z } from 'zod';

export function ok<T>(reply: FastifyReply, data: T, statusCode = 200): void {
  reply.code(statusCode).send({ data });
}

export function okList<T>(reply: FastifyReply, items: T[], total: number, page: number, pageSize: number): void {
  const paged: Paginated<T> = paginate(items, page, pageSize);
  reply.send({ data: { items: paged.items, page, pageSize, total, totalPages: paged.totalPages } });
}

export const listQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('asc'),
  q: z.string().max(200).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export type ListQuery = z.infer<typeof listQuerySchema>;

export function parseListQuery(query: unknown): ListQuery {
  return listQuerySchema.parse(query);
}

export function parseId(req: FastifyRequest): string {
  const { id } = req.params as { id: string };
  if (!id) throw new Error('Missing id param');
  return id;
}

export function takeSkip(query: ListQuery): { take: number; skip: number } {
  return { take: query.pageSize, skip: (query.page - 1) * query.pageSize };
}