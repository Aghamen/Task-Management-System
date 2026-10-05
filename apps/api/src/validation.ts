import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

export const id = z.string().min(1).max(64);
export const title = z.string().trim().min(1, 'Title is required').max(512);
export const color = z.string().regex(/^#[0-9a-fA-F]{6}$/, 'Invalid color');
export const position = z.number().finite();
export const nullableDate = z.coerce.date().nullable();

/** Board background: a hex color or a CSS gradient from the preset list. */
export const BACKGROUNDS = [
  '#0079bf', '#d29034', '#519839', '#b04632', '#89609e',
  '#cd5a91', '#4bbf6b', '#00aecc', '#838c91', '#172b4d',
  'linear-gradient(135deg, #0c66e4 0%, #37b4c3 100%)',
  'linear-gradient(135deg, #6e5dc6 0%, #e774bb 100%)',
  'linear-gradient(135deg, #e34935 0%, #faa53d 100%)',
  'linear-gradient(135deg, #1f845a 0%, #94c748 100%)',
  'linear-gradient(135deg, #172b4d 0%, #6e5dc6 100%)',
  'linear-gradient(135deg, #0055cc 0%, #09326c 100%)',
] as const;
export const background = z.string().refine((v) => (BACKGROUNDS as readonly string[]).includes(v), 'Invalid background');

export const username = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9._-]{3,32}$/, 'Username must be 3–32 characters: letters, numbers, dot, dash or underscore');
export const email = z.string().trim().toLowerCase().email('Invalid email');
export const password = z.string().min(8, 'Password must be at least 8 characters').max(200);
export const fullName = z.string().trim().min(1, 'Full name is required').max(100);

export const boardRole = z.enum(['ADMIN', 'MEMBER', 'OBSERVER']);

export function parse<T extends z.ZodType>(schema: T, data: unknown): z.infer<T> {
  return schema.parse(data ?? {});
}

export const params = <T extends z.ZodRawShape>(req: FastifyRequest, shape: T) =>
  z.object(shape).parse(req.params);

/** Socket id of the client that made the request, so it doesn't get its own change echoed back. */
export const originSocket = (req: FastifyRequest) => {
  const v = req.headers['x-socket-id'];
  return typeof v === 'string' && v.length < 64 ? v : undefined;
};
