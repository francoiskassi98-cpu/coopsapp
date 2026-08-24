/**
 * Utilitaires de typage des erreurs (remplace les `catch (e: any)`).
 * L'application n'affiche jamais `error.message` à l'utilisateur :
 * ces helpers servent uniquement au diagnostic interne.
 */

export interface NormalizedError {
  message: string;
  status?: number;
  code?: string;
}

const asRecord = (e: unknown): Record<string, unknown> =>
  typeof e === "object" && e !== null ? (e as Record<string, unknown>) : {};

export function normalizeError(e: unknown): NormalizedError {
  if (e instanceof Error) {
    const r = asRecord(e);
    return {
      message: e.message,
      status: typeof r.status === "number" ? r.status : undefined,
      code: typeof r.code === "string" ? r.code : undefined,
    };
  }
  const r = asRecord(e);
  const rawStatus = r.status ?? r.statusCode;
  return {
    message: typeof r.message === "string" ? r.message : String(e ?? ""),
    status:
      typeof rawStatus === "number"
        ? rawStatus
        : typeof rawStatus === "string" && rawStatus.trim() !== ""
          ? Number(rawStatus)
          : undefined,
    code: typeof r.code === "string" ? r.code : undefined,
  };
}

/** Vrai lorsque l'erreur correspond à un refus d'accès (RLS / storage policy). */
export function isPermissionError(e: unknown): boolean {
  const { status, message, code } = normalizeError(e);
  if (status === 403 || status === 401) return true;
  if (code === "42501") return true;
  return /policy|unauthorized|denied|permission/i.test(message);
}
