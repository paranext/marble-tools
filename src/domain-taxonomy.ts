/**
 * Pure helpers for reading MARBLE domain taxonomy files. No I/O here so the logic is unit-testable.
 */
import * as path from 'path';

export type SenseType = 'Lexical' | 'Contextual';

/**
 * Classify a domain taxonomy file by its basename. DOMAINS1 holds lexical domains,
 * DOMAINS2 holds contextual domains. Anything else (including stray copies such as
 * "SDBH-DOMAINS1 - Copy.XML") is ignored and returns undefined.
 */
export function classifyDomainFile(
  filename: string,
  dictionaryType: 'SDBG' | 'SDBH'
): SenseType | undefined {
  const basename = path.basename(filename).toUpperCase();
  if (basename === `${dictionaryType}-DOMAINS1.XML`) return 'Lexical';
  if (basename === `${dictionaryType}-DOMAINS2.XML`) return 'Contextual';
  return undefined;
}
