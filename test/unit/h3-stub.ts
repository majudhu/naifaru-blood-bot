type ErrorInput =
  | string
  | {
      message?: string;
      status?: number;
      statusCode?: number;
      statusMessage?: string;
    };

export function createError(input: ErrorInput) {
  const isObject = typeof input === "object" && input !== null;
  const statusCode = isObject ? (input.statusCode ?? input.status ?? 500) : 500;
  const message = isObject ? (input.statusMessage ?? input.message ?? "Error") : input;
  const error = new Error(message);

  return Object.assign(error, {
    statusCode,
    statusMessage: isObject ? (input.statusMessage ?? message) : message,
  });
}
