/** Smallest valid PNG (1x1 pixel). Enough for the signature upload, which only checks type and size. */
export const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
  'base64',
);

/** A PNG-typed payload over the 500 KB signature limit. */
export function oversizedPng(): Buffer {
  return Buffer.concat([TINY_PNG, Buffer.alloc(501 * 1024)]);
}
