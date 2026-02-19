import { supabase } from "@/integrations/supabase/client";

/**
 * Fetch all rows from a table using recursive pagination to bypass the 1000-row limit.
 */
export async function fetchAllRows(
  table: string,
  select: string = "*",
  options?: {
    filters?: (query: any) => any;
    order?: { column: string; ascending?: boolean };
    pageSize?: number;
  }
): Promise<any[]> {
  const pageSize = options?.pageSize || 500;
  const allRows: any[] = [];
  let from = 0;
  let hasMore = true;

  while (hasMore) {
    let query = (supabase.from as any)(table).select(select);

    if (options?.filters) {
      query = options.filters(query);
    }

    if (options?.order) {
      query = query.order(options.order.column, { ascending: options.order.ascending ?? true });
    }

    query = query.range(from, from + pageSize - 1);

    const { data, error } = await query;
    if (error) throw error;

    if (data && data.length > 0) {
      allRows.push(...data);
      from += pageSize;
      hasMore = data.length === pageSize;
    } else {
      hasMore = false;
    }
  }

  return allRows;
}
