const SAFE_CODE = /^[A-Za-z0-9_:-]{1,40}$/;
const MAX_SAFE_MESSAGE_LENGTH = 240;

function safeCode(value: unknown): string | undefined {
  return typeof value === "string" && SAFE_CODE.test(value) ? value : undefined;
}

export function safeErrorMetadata(error: unknown) {
  const outer = error as { name?: unknown; code?: unknown; type?: unknown; message?: unknown; error?: unknown; cause?: { name?: unknown; code?: unknown; message?: unknown } } | null;
  const name = typeof outer?.name === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(outer.name)
    ? outer.name
    : error && typeof error === "object"
      ? error.constructor?.name || "UnknownError"
      : typeof error;
  const causeName = typeof outer?.cause?.name === "string" && /^[A-Za-z][A-Za-z0-9]*$/.test(outer.cause.name)
    ? outer.cause.name
    : undefined;
  const code = safeCode(outer?.code) ?? safeCode(outer?.cause?.code);
  const eventType = typeof outer?.type === "string" && /^[A-Za-z][A-Za-z0-9_-]{0,30}$/.test(outer.type)
    ? outer.type
    : undefined;
  const nestedError = outer?.error as { message?: unknown; name?: unknown; code?: unknown } | undefined;
  const rawMessage = typeof outer?.message === "string" && outer.message
    ? outer.message
    : typeof outer?.cause?.message === "string" && outer.cause.message
      ? outer.cause.message
      : typeof nestedError?.message === "string"
        ? nestedError.message
        : undefined;
  const message = rawMessage
    ?.replace(/[a-z][a-z0-9+.-]*:\/\/[^\s"'`]+/gi, "[redacted URL]")
    .replace(/\b(password|passwd|secret|token|api[_-]?key|authorization)(\s*[:=]\s*)([^\s,;]+)/gi, "$1$2[redacted]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [redacted]")
    .slice(0, MAX_SAFE_MESSAGE_LENGTH);

  return {
    errorType: name,
    ...(code ? { errorCode: code } : {}),
    ...(causeName ? { causeType: causeName } : {}),
    ...(eventType ? { eventType } : {}),
    ...(message ? { errorMessage: message } : {}),
  };
}
