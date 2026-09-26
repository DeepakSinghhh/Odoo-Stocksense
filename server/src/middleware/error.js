import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

export const fail = (status, message, details) => { throw new HttpError(status, message, details); };

// Parse a request payload with a zod schema; surfaces the first message per field.
export function parse(schema, data) {
  const result = schema.safeParse(data);
  if (result.success) return result.data;
  const fields = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join('.') || '_';
    fields[key] ??= issue.message;
  }
  throw new HttpError(422, Object.values(fields)[0], fields);
}

export function errorHandler(err, req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, fields: err.details });
  }
  if (err instanceof ZodError) {
    return res.status(422).json({ error: err.issues[0]?.message });
  }
  if (err?.code?.startsWith?.('SQLITE_CONSTRAINT')) {
    const msg = /UNIQUE.*sku/i.test(err.message) ? 'SKU already exists'
      : /UNIQUE.*code/i.test(err.message) ? 'Short code already exists'
      : /UNIQUE/i.test(err.message) ? 'That value already exists'
      : /FOREIGN KEY/i.test(err.message) ? 'This record is referenced elsewhere and cannot be changed'
      : 'Invalid data';
    return res.status(409).json({ error: msg });
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong on our side' });
}
