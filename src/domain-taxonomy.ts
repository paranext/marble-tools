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
const VALID_CODE = /^(\d{3})+$/;

/**
 * Parse a <HasSubDomains> value. Accepts any case and surrounding whitespace; returns undefined
 * when the element is absent or empty.
 */
export function parseHasSubDomains(text: string | null | undefined): boolean | undefined {
  const normalized = text?.trim().toLowerCase();
  return normalized ? normalized === 'true' : undefined;
}

/**
 * Build the domain tree from code structure: a domain's parent is its code minus the last
 * 3-digit segment. Source order is preserved among siblings. Records whose parent code is
 * absent are attached at the top level rather than dropped. When several records share a code,
 * the first one is kept (children attach to it) and the rest are dropped. Records whose code is
 * not a sequence of 3-digit segments are dropped. Returns warnings for: invalid code; duplicate
 * code; missing parent; <Level> not equal to the segment count; <HasSubDomains> disagreeing with
 * whether children actually exist.
 */
export function buildDomainTree<T extends DomainRecord>(
  records: T[]
): { roots: DomainTreeNode<T>[]; warnings: DomainTreeWarning[] } {
  const nodes: DomainTreeNode<T>[] = [];
  const nodesByCode = new Map<string, DomainTreeNode<T>>();
  const roots: DomainTreeNode<T>[] = [];
  const warnings: DomainTreeWarning[] = [];

  for (const record of records) {
    if (!VALID_CODE.test(record.code)) {
      warnings.push({
        code: record.code,
        message: `Domain code ${record.code} is not a sequence of 3-digit segments; ignoring it`,
      });
      continue;
    }
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

const MAX_EXAMPLES = 10;
const RELATION_SEPARATOR = /…|\.\.\.|>/;

/**
 * Whether the domain text on a sense agrees with the taxonomy label for its code. Compares
 * case-insensitively after trimming. Domain text can be more than a single label (see the
 * semantic domain notes in docs/current_lexicon_specification.md):
 * - "A … B" is a relation between an agent A and an object B; either side may be empty
 *   ("Human …", "… Human"). A code such as "084.051" lists the two codes in the same order.
 * - "A>B" is an extension of meaning, a mapping from source domain A to target domain B. The
 *   code keeps only B.
 * The value matches when any non-empty part equals the label. Pairing each code with its own part
 * would add nothing: the output keeps only the set of codes on a sense, not the relation between
 * them, and a code shifted out of sync also disagrees on its many single-label senses.
 */
export function domainValueMatchesLabel(value: string, label: string): boolean {
  const normalizedLabel = label.trim().toLowerCase();
  return value
    .trim()
    .toLowerCase()
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

/** A domain in a built taxonomy, reduced to what the label index needs */
export interface LabeledDomain {
  code: string;
  label: string;
  subDomains?: LabeledDomain[];
}

/** Index one language's taxonomy labels by taxonomy id and display code */
export function buildLabelIndex(
  taxonomies: { [taxonomyId: string]: { subDomains: LabeledDomain[] } } | undefined
): TaxonomyLabelIndex {
  const index: TaxonomyLabelIndex = {};
  const addLabels = (labels: Record<string, string>, domains: LabeledDomain[]): void => {
    for (const domain of domains) {
      labels[domain.code] = domain.label;
      if (domain.subDomains) addLabels(labels, domain.subDomains);
    }
  };
  for (const [taxonomyId, taxonomy] of Object.entries(taxonomies ?? {})) {
    index[taxonomyId] = {};
    addLabels(index[taxonomyId], taxonomy.subDomains);
  }
  return index;
}

/**
 * Yield the domains of each sense once, by sense id. Every output language carries the same
 * senses under the same ids with the same domains, so walking all languages without this would
 * multiply every count by the number of languages the sense appears in.
 */
export function* uniqueSenseDomains(
  senses: Iterable<{ id: string; domains?: SenseDomainRef[] }>
): Generator<SenseDomainRef> {
  const seen = new Set<string>();
  for (const sense of senses) {
    if (seen.has(sense.id)) continue;
    seen.add(sense.id);
    yield* sense.domains ?? [];
  }
}

export interface DomainCheckResult {
  /** No domain directory was given, so there was nothing to check against */
  skipped: boolean;
  stats: ConsistencyStats[];
  /** Taxonomies that failed because no English labels were loaded for them */
  notLoaded: string[];
  /** Taxonomies that failed because their English labels disagree with sense text */
  mismatched: string[];
}

/**
 * Decide whether the sense domains pass the consistency check. A taxonomy fails if any sense
 * domain in it is mismatched or has a missing code: even one code shifted out of sync shows users
 * the wrong domain, so there is no tolerance. Skips only when domains were not requested. When
 * they were, a missing English taxonomy is not a reason to skip: every sense domain in it counts
 * as a missing code, so the taxonomy fails as not loaded.
 */
export function evaluateDomainCheck(
  refs: Iterable<SenseDomainRef>,
  labels: TaxonomyLabelIndex,
  domainsRequested: boolean
): DomainCheckResult {
  if (!domainsRequested) return { skipped: true, stats: [], notLoaded: [], mismatched: [] };

  const stats = checkSenseDomainConsistency(refs, labels);
  const failed = stats.filter(s => s.mismatched + s.missingCode > 0);
  const notLoaded = failed.filter(s => classifyConsistencyFailure(s, labels) === 'not-loaded');
  return {
    skipped: false,
    stats,
    notLoaded: notLoaded.map(s => s.taxonomy),
    mismatched: failed.filter(s => !notLoaded.includes(s)).map(s => s.taxonomy),
  };
}

/** GitHub Actions workflow commands for a failed check, one per kind of failure */
export function domainCheckAnnotations(result: DomainCheckResult): string[] {
  const annotations: string[] = [];
  if (result.notLoaded.length > 0)
    annotations.push(
      `::error::Sense domain check failed: ${result.notLoaded.join(', ')} not loaded ` +
        `(no English domain labels)`
    );
  if (result.mismatched.length > 0)
    annotations.push(
      `::error::Sense domain check failed: ${result.mismatched.join(', ')} ` +
        `(sense domain text disagrees with the taxonomy labels)`
    );
  return annotations;
}
