export function toUUID(mongoId: string | null | undefined): string | null {
  if (!mongoId) return null;
  const str = mongoId.toString().replace(/[^a-fA-F0-9]/g, '');
  if (str.length === 24) {
    const padded = str + '00000000';
    return `${padded.substring(0, 8)}-${padded.substring(8, 12)}-${padded.substring(12, 16)}-${padded.substring(16, 20)}-${padded.substring(20, 32)}`.toLowerCase();
  }
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(mongoId)) {
    return mongoId.toLowerCase();
  }
  return null;
}
