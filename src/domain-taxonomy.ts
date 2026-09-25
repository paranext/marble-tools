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

/** One entry from a domain taxonomy file, as far as building the hierarchy is concerned */
export interface DomainRecord {
  /** Raw source code: digits, length a multiple of 3, e.g. '001002003' */
  code: string;
  /** Source <Level>, used only as a cross-check */
  level?: number;
  /** Source <HasSubDomains>, used only as a cross-check */
  hasSubDomains?: boolean;
}

export interface DomainTreeNode<T extends DomainRecord = DomainRecord> {
  record: T;
  children: DomainTreeNode<T>[];
}

export interface DomainTreeWarning {
  code: string;
  message: string;
}

const SEGMENT_LENGTH = 3;

/**
 * Build the domain tree from code structure: a domain's parent is its code minus the last
 * 3-digit segment. Source order is preserved among siblings. Records whose parent code is
 * absent are attached at the top level rather than dropped. Returns warnings for: missing
 * parent; <Level> not equal to the segment count; <HasSubDomains> disagreeing with whether
 * children actually exist.
 */
export function buildDomainTree<T extends DomainRecord>(
  records: T[]
): { roots: DomainTreeNode<T>[]; warnings: DomainTreeWarning[] } {
  const nodes = records.map(record => ({ record, children: [] as DomainTreeNode<T>[] }));
  const nodesByCode = new Map(nodes.map(node => [node.record.code, node]));
  const roots: DomainTreeNode<T>[] = [];
  const warnings: DomainTreeWarning[] = [];

  for (const node of nodes) {
    const { code, level } = node.record;
    const segments = code.length / SEGMENT_LENGTH;
    if (level !== undefined && level !== segments)
      warnings.push({
        code,
        message: `Domain ${code} has Level ${level} but its code has ${segments} segments`,
      });

    if (code.length <= SEGMENT_LENGTH) {
      roots.push(node);
      continue;
    }
    const parentCode = code.slice(0, -SEGMENT_LENGTH);
    const parent = nodesByCode.get(parentCode);
    if (parent) parent.children.push(node);
    else {
      roots.push(node);
      warnings.push({
        code,
        message: `Domain ${code} has no parent domain ${parentCode}; attaching it at the top level`,
      });
    }
  }

  for (const { record, children } of nodes) {
    if (record.hasSubDomains !== undefined && record.hasSubDomains !== children.length > 0)
      warnings.push({
        code: record.code,
        message: `Domain ${record.code} has HasSubDomains ${record.hasSubDomains} but has ${children.length} child domains`,
      });
  }

  return { roots, warnings };
}
