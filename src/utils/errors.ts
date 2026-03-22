type ErrorWithMessage = { message?: unknown };
type ErrorWithStatus = { status?: unknown };

export const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export const getErrorMessage = (error: unknown, fallback = ''): string => {
  if (error instanceof Error) {
    return error.message || fallback;
  }
  if (isRecord(error) && typeof (error as ErrorWithMessage).message === 'string') {
    return (error as ErrorWithMessage).message as string;
  }
  return typeof error === 'string' ? error : fallback;
};

export const getErrorStatus = (error: unknown): number | undefined => {
  if (!isRecord(error)) return undefined;
  const status = (error as ErrorWithStatus).status;
  return typeof status === 'number' ? status : undefined;
};

export const parseJsonRecord = (value: string): Record<string, unknown> | null => {
  try {
    const parsed: unknown = JSON.parse(value);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
};
