export const messageLimit = 2000;

export function joinSegments(current: string, segment: string) {
  if (!current) return segment;
  if (!segment) return current;
  return `${current} ${segment}`;
}
