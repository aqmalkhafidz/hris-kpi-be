export const AVATAR_MIME_EXT: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/gif': '.gif',
};

export const UPLOAD_MIME_EXT: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'text/plain': '.txt',
  'text/markdown': '.md',
};

export async function sniffSignature(buf: Buffer): Promise<string | null> {
  // Minimal magic-byte sniff for the MIME types we accept. Returns the
  // canonical MIME or null if we can't recognise it.
  if (buf.length >= 8) {
    if (
      buf[0] === 0x89 &&
      buf[1] === 0x50 &&
      buf[2] === 0x4e &&
      buf[3] === 0x47
    )
      return 'image/png';
    if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff)
      return 'image/jpeg';
    if (
      buf[0] === 0x47 &&
      buf[1] === 0x49 &&
      buf[2] === 0x46 &&
      buf[3] === 0x38
    )
      return 'image/gif';
    if (
      buf[0] === 0x25 &&
      buf[1] === 0x50 &&
      buf[2] === 0x44 &&
      buf[3] === 0x46
    )
      return 'application/pdf';
  }
  return null;
}
