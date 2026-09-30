/**
 * Pagination Utilities
 * ReviewAI SaaS Platform
 * Helper functions for pagination
 */

export interface PaginationParams {
  page: number;
  limit: number;
  sort?: string;
  order?: 'asc' | 'desc';
}

export interface PaginationResult {
  page: number;
  limit: number;
  offset: number;
  sort?: string;
  order: 'asc' | 'desc';
}

export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;
export const DEFAULT_SORT = 'created_at';
export const DEFAULT_ORDER = 'desc' as const;

export function parsePaginationParams(params: Partial<PaginationParams>): PaginationResult {
  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const limit = Math.min(MAX_LIMIT, Math.max(1, params.limit ?? DEFAULT_LIMIT));
  const offset = (page - 1) * limit;
  const sort = params.sort ?? DEFAULT_SORT;
  const order = params.order ?? DEFAULT_ORDER;

  return { page, limit, offset, sort, order };
}

export function buildPaginationMeta(page: number, limit: number, total: number) {
  const totalPages = Math.ceil(total / limit);
  return {
    page,
    limit,
    total,
    totalPages,
    hasNext: page < totalPages,
    hasPrev: page > 1,
  };
}

export function applyPagination(query: any, { offset, limit, sort, order }: PaginationResult): any {
  return query.range(offset, offset + limit - 1).order(sort, { ascending: order === 'asc' });
}