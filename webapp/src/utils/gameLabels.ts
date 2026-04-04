export function formatGameLabel(value: string): string {
  return value
    .trim()
    .split(/\s+/)
    .map((token) => {
      if (!token) {
        return token;
      }

      if (/^[^a-zA-Z0-9]+$/.test(token)) {
        return token;
      }

      const normalized = token.replaceAll('_', ' ').replaceAll('-', ' ');
      if (normalized.toLowerCase() === 'ai') {
        return 'AI';
      }

      return normalized.charAt(0).toUpperCase() + normalized.slice(1).toLowerCase();
    })
    .join(' ');
}
