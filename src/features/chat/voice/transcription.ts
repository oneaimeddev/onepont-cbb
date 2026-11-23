// Long enough for a consultation transcript (about 10 minutes of speech). The stored
// conversation keeps at most 4000 characters per message; the report card keeps the full text.
export const messageLimit = 12000;

export function joinSegments(current: string, segment: string) {
  if (!current) return segment;
  if (!segment) return current;
  return `${current} ${segment}`;
}
