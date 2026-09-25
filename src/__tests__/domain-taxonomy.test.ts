import {
  buildDomainTree,
  checkSenseDomainConsistency,
  classifyConsistencyFailure,
  classifyDomainFile,
  ConsistencyStats,
  DomainRecord,
  DomainTreeNode,
  domainValueMatchesLabel,
  SenseDomainRef,
  TaxonomyLabelIndex,
} from '../domain-taxonomy';

describe('classifyDomainFile', () => {
  test('classifies DOMAINS1 as lexical and DOMAINS2 as contextual', () => {
    expect(classifyDomainFile('SDBH-DOMAINS1.XML', 'SDBH')).toBe('Lexical');
    expect(classifyDomainFile('SDBH-DOMAINS2.XML', 'SDBH')).toBe('Contextual');
  });

  test('compares case-insensitively', () => {
    expect(classifyDomainFile('sdbg-domains1.xml', 'SDBG')).toBe('Lexical');
  });

  test('uses only the basename, ignoring digits elsewhere in the path', () => {
    expect(classifyDomainFile('/tmp/dir1/with1/SDBH-DOMAINS2.XML', 'SDBH')).toBe('Contextual');
  });

  test('ignores stray copies, other dictionaries, and unknown numbers', () => {
    expect(classifyDomainFile('SDBH-DOMAINS1 - Copy.XML', 'SDBH')).toBeUndefined();
    expect(classifyDomainFile('SDBG-DOMAINS1.XML', 'SDBH')).toBeUndefined();
    expect(classifyDomainFile('SDBH-DOMAINS3.XML', 'SDBH')).toBeUndefined();
    expect(classifyDomainFile('SDBH-DOMAINS1.JSON', 'SDBH')).toBeUndefined();
  });
});

describe('buildDomainTree', () => {
  /** Reduce a tree to nested [code, children] pairs for easy comparison */
  function shape(nodes: DomainTreeNode[]): unknown[] {
    return nodes.map(node => [node.record.code, shape(node.children)]);
  }

  test('nests by code structure alone, keeping siblings in input order', () => {
    const records: DomainRecord[] = [
      { code: '001' },
      { code: '001002' },
      { code: '001001' },
      { code: '001001001' },
    ];
    const { roots, warnings } = buildDomainTree(records);
    expect(shape(roots)).toEqual([
      [
        '001',
        [
          ['001002', []],
          ['001001', [['001001001', []]]],
        ],
      ],
    ]);
    expect(warnings).toEqual([]);
  });

  test('nests children under a parent wrongly flagged as having no subdomains', () => {
    const records: DomainRecord[] = [
      { code: '001', level: 1, hasSubDomains: true },
      { code: '001001', level: 2, hasSubDomains: false },
      { code: '001001001', level: 3, hasSubDomains: false },
      { code: '001001002', level: 3, hasSubDomains: false },
    ];
    const { roots, warnings } = buildDomainTree(records);
    expect(shape(roots)).toEqual([
      [
        '001',
        [
          [
            '001001',
            [
              ['001001001', []],
              ['001001002', []],
            ],
          ],
        ],
      ],
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('001001');
    expect(warnings[0].message).toContain('001001');
  });

  test('warns when a parent is flagged as having subdomains but has none', () => {
    const { warnings } = buildDomainTree([{ code: '001', hasSubDomains: true }]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('001');
  });

  test('attaches a record with a missing parent at the top level and warns', () => {
    const records: DomainRecord[] = [{ code: '001' }, { code: '001001' }, { code: '001002001' }];
    const { roots, warnings } = buildDomainTree(records);
    expect(shape(roots)).toEqual([
      ['001', [['001001', []]]],
      ['001002001', []],
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('001002001');
    expect(warnings[0].message).toContain('001002001');
  });

  test('warns when level disagrees with the segment count without changing the tree', () => {
    const records: DomainRecord[] = [
      { code: '001', level: 1 },
      { code: '001001', level: 3 },
    ];
    const { roots, warnings } = buildDomainTree(records);
    expect(shape(roots)).toEqual([['001', [['001001', []]]]]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].code).toBe('001001');
    expect(warnings[0].message).toContain('001001');
  });

  test('treats flat contextual-style codes as roots with no warnings', () => {
    const records: DomainRecord[] = [
      { code: '001', level: 1, hasSubDomains: false },
      { code: '002', level: 1, hasSubDomains: false },
      { code: '003', level: 1, hasSubDomains: false },
    ];
    const { roots, warnings } = buildDomainTree(records);
    expect(shape(roots)).toEqual([
      ['001', []],
      ['002', []],
      ['003', []],
    ]);
    expect(warnings).toEqual([]);
  });

  test('keeps raw codes and the original records in the tree', () => {
    const records = [
      { code: '001', label: 'Objects' },
      { code: '001002', label: 'Parts' },
    ];
    const { roots } = buildDomainTree(records);
    expect(roots[0].record).toBe(records[0]);
    expect(roots[0].children[0].record).toBe(records[1]);
    expect(roots[0].children[0].record.code).toBe('001002');
  });

  test('keeps the first of two records sharing a code and warns about the duplicate', () => {
    const records = [
      { code: '001', label: 'First' },
      { code: '001', label: 'Second' },
      { code: '001001', label: 'Child' },
    ];
    const { roots, warnings } = buildDomainTree(records);
    expect(shape(roots)).toEqual([['001', [['001001', []]]]]);
    expect(roots[0].record).toBe(records[0]);
    expect(warnings).toEqual([{ code: '001', message: expect.stringContaining('001') }]);
    expect(warnings[0].message).toMatch(/duplicate/i);
  });
});

describe('domainValueMatchesLabel', () => {
  test('matches exactly', () => {
    expect(domainValueMatchesLabel('Land', 'Land')).toBe(true);
  });

  test('compares case-insensitively after trimming', () => {
    expect(domainValueMatchesLabel('Health and SIckness', 'Health and Sickness')).toBe(true);
    expect(domainValueMatchesLabel('  Land ', 'Land')).toBe(true);
  });

  test('strips a leading "Parts: " from the value', () => {
    expect(domainValueMatchesLabel('Parts: Buildings', 'Buildings')).toBe(true);
  });

  test('a relation value matches when any separated part equals the label', () => {
    expect(domainValueMatchesLabel('Divine … Human', 'Divine')).toBe(true);
    expect(domainValueMatchesLabel('Divine … Human', 'Human')).toBe(true);
    expect(domainValueMatchesLabel('Divine … Human', 'Destruction')).toBe(false);
    expect(domainValueMatchesLabel('Divine ... Human', 'Human')).toBe(true);
    expect(domainValueMatchesLabel('Human>Artifact', 'Human')).toBe(true);
    expect(domainValueMatchesLabel('Human>Artifact', 'Artifact')).toBe(true);
  });

  test('ignores empty relation parts', () => {
    expect(domainValueMatchesLabel('Divine …', 'Divine')).toBe(true);
    expect(domainValueMatchesLabel('Divine …', '')).toBe(false);
  });

  test('anything else is a mismatch', () => {
    expect(domainValueMatchesLabel('Land', 'Law')).toBe(false);
    expect(domainValueMatchesLabel('Divine Human', 'Divine')).toBe(false);
  });
});

describe('checkSenseDomainConsistency', () => {
  const labels: TaxonomyLabelIndex = {
    'SDBH-Lexical': { '1': 'Objects', '1.2': 'Animals', '1.2.3': 'Birds' },
    'SDBH-Contextual': { '98': 'Land', '99': 'Law' },
  };

  function ref(taxonomy: string, code: string, value: string): SenseDomainRef {
    return { taxonomy, code, value };
  }

  test('counts matches, mismatches, and missing codes per taxonomy, sorted by taxonomy id', () => {
    const refs: SenseDomainRef[] = [
      ref('SDBH-Lexical', '1', 'Objects'),
      ref('SDBH-Lexical', '1.2', 'animals'),
      ref('SDBH-Lexical', '1.2.3', 'Birds'),
      ref('SDBH-Lexical', '1.2.3', 'Fish'),
      ref('SDBH-Contextual', '98', 'Land'),
      ref('SDBH-Contextual', '98', 'Law'),
      ref('SDBH-Contextual', '99', 'Land'),
      ref('SDBH-Contextual', '99', 'Land'),
      ref('SDBH-Contextual', '100', 'Sea'),
    ];

    const stats = checkSenseDomainConsistency(refs, labels);

    expect(stats.map(s => s.taxonomy)).toEqual(['SDBH-Contextual', 'SDBH-Lexical']);
    const [contextual, lexical] = stats;
    expect(contextual).toMatchObject({
      total: 5,
      matched: 1,
      mismatched: 3,
      missingCode: 1,
      mismatchRate: 0.8,
    });
    expect(contextual.examples).toEqual([
      { code: '99', value: 'Land', label: 'Law', count: 2 },
      { code: '98', value: 'Law', label: 'Land', count: 1 },
      { code: '100', value: 'Sea', label: undefined, count: 1 },
    ]);
    expect(lexical).toMatchObject({
      total: 4,
      matched: 3,
      mismatched: 1,
      missingCode: 0,
      mismatchRate: 0.25,
    });
    expect(lexical.examples).toEqual([{ code: '1.2.3', value: 'Fish', label: 'Birds', count: 1 }]);
  });

  test('counts every code as missing for a taxonomy with no labels at all', () => {
    const [stats] = checkSenseDomainConsistency([ref('SDBG-Lexical', '1', 'Objects')], labels);
    expect(stats).toMatchObject({
      taxonomy: 'SDBG-Lexical',
      total: 1,
      missingCode: 1,
      mismatchRate: 1,
    });
  });

  test('keeps only the top 10 examples by count', () => {
    const refs: SenseDomainRef[] = [];
    for (let i = 0; i < 12; i++)
      for (let n = 0; n <= i; n++) refs.push(ref('SDBH-Contextual', '98', `Wrong ${i}`));

    const [stats] = checkSenseDomainConsistency(refs, labels);

    expect(stats.examples).toHaveLength(10);
    expect(stats.examples[0]).toEqual({ code: '98', value: 'Wrong 11', label: 'Land', count: 12 });
    expect(stats.examples[9].value).toBe('Wrong 2');
  });

  test('omits taxonomies with no sense domains', () => {
    const stats = checkSenseDomainConsistency([ref('SDBH-Contextual', '98', 'Land')], labels);
    expect(stats).toEqual([
      {
        taxonomy: 'SDBH-Contextual',
        total: 1,
        matched: 1,
        mismatched: 0,
        missingCode: 0,
        mismatchRate: 0,
        examples: [],
      },
    ]);
    expect(checkSenseDomainConsistency([], labels)).toEqual([]);
  });
});

describe('classifyConsistencyFailure', () => {
  const labels: TaxonomyLabelIndex = {
    'SDBH-Lexical': { '1': 'Objects' },
    'SDBH-Empty': {},
  };

  function stats(taxonomy: string): ConsistencyStats {
    return {
      taxonomy,
      total: 10,
      matched: 5,
      mismatched: 5,
      missingCode: 0,
      mismatchRate: 0.5,
      examples: [],
    };
  }

  test('a taxonomy with English labels that disagree is a mismatch', () => {
    expect(classifyConsistencyFailure(stats('SDBH-Lexical'), labels)).toBe('mismatch');
  });

  test('a taxonomy absent from the label index was not loaded', () => {
    expect(classifyConsistencyFailure(stats('SDBH-Contextual'), labels)).toBe('not-loaded');
  });

  test('a taxonomy with no labels at all was not loaded', () => {
    expect(classifyConsistencyFailure(stats('SDBH-Empty'), labels)).toBe('not-loaded');
  });
});
