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
 * absent are attached at the top level rather than dropped. When several records share a code,
 * the first one is kept (children attach to it) and the rest are dropped. Returns warnings for:
 * duplicate code; missing parent; <Level> not equal to the segment count; <HasSubDomains>
 * disagreeing with whether children actually exist.
 */
export function buildDomainTree<T extends DomainRecord>(
  records: T[]
): { roots: DomainTreeNode<T>[]; warnings: DomainTreeWarning[] } {
  const nodes: DomainTreeNode<T>[] = [];
  const nodesByCode = new Map<string, DomainTreeNode<T>>();
  const roots: DomainTreeNode<T>[] = [];
  const warnings: DomainTreeWarning[] = [];

  for (const record of records) {
    if (nodesByCode.has(record.code)) {
      warnings.push({
        code: record.code,
        message: `Duplicate domain code ${record.code}; keeping the first record and ignoring this one`,
      });
      continue;
    }
    const node: DomainTreeNode<T> = { record, children: [] };
    nodes.push(node);
    nodesByCode.set(record.code, node);
  }

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

/** A domain reference on a sense. The value is the domain label as the lexicon author saw it, always English */
export interface SenseDomainRef {
  taxonomy: string;
  code: string;
  value: string;
}

/** English taxonomy labels by taxonomy id, then by display code such as '1.2.3' or '98' */
export interface TaxonomyLabelIndex {
  [taxonomyId: string]: { [code: string]: string };
}

export interface ConsistencyStats {
  taxonomy: string;
  total: number;
  matched: number;
  /** The code exists in the taxonomy but its label disagrees with the sense's value */
  mismatched: number;
  /** The code is not present in the taxonomy */
  missingCode: number;
  /** (mismatched + missingCode) / total, 0 when total is 0 */
  mismatchRate: number;
  /** The most frequent offending (code, value, label) triples, highest count first */
  examples: { code: string; value: string; label?: string; count: number }[];
}

/**
 * The highest share of a taxonomy's sense domains allowed to disagree with the taxonomy labels.
 * A handful of residual inconsistencies are expected in upstream data, but the failure mode
 * being guarded against (entries and taxonomy numbered out of sync, as in PT-4547) shifts tens
 * of percent of sense domains, so a low threshold separates the two cleanly.
 */
export const MAX_DOMAIN_MISMATCH_RATE = 0.01;

const MAX_EXAMPLES = 10;
const PARTS_PREFIX = 'parts:';
const RELATION_SEPARATOR = /…|\.\.\.|>/;

/**
 * Whether the domain text on a sense agrees with the taxonomy label for its code. Compares
 * case-insensitively after trimming. From the source data: some values carry a "Parts: " prefix,
 * and relation values such as "Divine … Human" or "Human>Artifact" name several domains, so they
 * match when any non-empty part equals the label.
 */
export function domainValueMatchesLabel(value: string, label: string): boolean {
  let normalizedValue = value.trim().toLowerCase();
  const normalizedLabel = label.trim().toLowerCase();
  if (normalizedValue.startsWith(PARTS_PREFIX))
    normalizedValue = normalizedValue.slice(PARTS_PREFIX.length).trim();
  return normalizedValue
    .split(RELATION_SEPARATOR)
    .map(part => part.trim())
    .some(part => part !== '' && part === normalizedLabel);
}

/**
 * Compare each sense domain's value with the label its code has in the taxonomy. Returns one
 * entry per taxonomy id seen in refs, sorted by taxonomy id.
 */
export function checkSenseDomainConsistency(
  refs: Iterable<SenseDomainRef>,
  labels: TaxonomyLabelIndex
): ConsistencyStats[] {
  type Example = ConsistencyStats['examples'][number];
  const byTaxonomy = new Map<string, { stats: ConsistencyStats; examples: Map<string, Example> }>();

  for (const { taxonomy, code, value } of refs) {
    let tally = byTaxonomy.get(taxonomy);
    if (!tally) {
      tally = {
        stats: {
          taxonomy,
          total: 0,
          matched: 0,
          mismatched: 0,
          missingCode: 0,
          mismatchRate: 0,
          examples: [],
        },
        examples: new Map(),
      };
      byTaxonomy.set(taxonomy, tally);
    }
    const { stats, examples } = tally;

    stats.total++;
    const label = labels[taxonomy]?.[code];
    if (label !== undefined && domainValueMatchesLabel(value, label)) {
      stats.matched++;
      continue;
    }
    if (label === undefined) stats.missingCode++;
    else stats.mismatched++;

    const key = JSON.stringify([code, value, label]);
    const example = examples.get(key);
    if (example) example.count++;
    else examples.set(key, { code, value, label, count: 1 });
  }

  return [...byTaxonomy.values()]
    .map(({ stats, examples }) => ({
      ...stats,
      mismatchRate: stats.total === 0 ? 0 : (stats.mismatched + stats.missingCode) / stats.total,
      // Array sort is stable, so equal counts keep first-seen order
      examples: [...examples.values()].sort((a, b) => b.count - a.count).slice(0, MAX_EXAMPLES),
    }))
    .sort((a, b) => a.taxonomy.localeCompare(b.taxonomy));
}

/**
 * Why a taxonomy failed the consistency check: 'not-loaded' when the label index has no English
 * labels for it at all (the domain file was missing or failed to parse), so every sense domain
 * counts as a missing code; otherwise 'mismatch', meaning labels were loaded but disagree.
 */
export function classifyConsistencyFailure(
  stats: ConsistencyStats,
  labels: TaxonomyLabelIndex
): 'not-loaded' | 'mismatch' {
  const taxonomyLabels = labels[stats.taxonomy];
  return taxonomyLabels === undefined || Object.keys(taxonomyLabels).length === 0
    ? 'not-loaded'
    : 'mismatch';
}
