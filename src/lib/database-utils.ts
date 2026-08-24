import { supabase } from "@/integrations/supabase/client";

/** Valeurs acceptées par les filtres PostgREST utilisés dans l'app. */
export type FilterValue = string | number | boolean | null;

/**
 * Vue structurelle minimale d'un query builder Supabase, suffisante pour la
 * pagination générique ci-dessous (évite les `any` sur le builder complet).
 */
export interface PaginatedQuery {
  eq(column: string, value: FilterValue): PaginatedQuery;
  neq(column: string, value: FilterValue): PaginatedQuery;
  gte(column: string, value: FilterValue): PaginatedQuery;
  lte(column: string, value: FilterValue): PaginatedQuery;
  in(column: string, values: readonly FilterValue[]): PaginatedQuery;
  is(column: string, value: boolean | null): PaginatedQuery;
  not(column: string, operator: string, value: FilterValue): PaginatedQuery;
  or(filters: string): PaginatedQuery;
  order(column: string, options?: { ascending?: boolean }): PaginatedQuery;
  range(from: number, to: number): PromiseLike<{ data: unknown[] | null; error: { message: string } | null }>;
}

/**
 * Fetch all rows from a table using recursive pagination to bypass the 1000-row limit.
 */
export async function fetchAllRows<T = Record<string, unknown>>(
  table: string,
  select: string = "*",
  options?: {
    filters?: (query: PaginatedQuery) => PaginatedQuery;
    order?: { column: string; ascending?: boolean };
    pageSize?: number;
  }
): Promise<T[]> {
  const pageSize = options?.pageSize || 500;
  const allRows: T[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    // Table dynamique : on passe par une vue structurelle typée du builder.
    let query = supabase
      .from(table as never)
      .select(select) as unknown as PaginatedQuery;

    if (options?.filters) {
      query = options.filters(query);
    }

    if (options?.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
    }

    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) throw error;

    if (data && data.length > 0) {
      allRows.push(...(data as T[]));
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}
