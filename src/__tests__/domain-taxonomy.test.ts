import {
  buildDomainTree,
  classifyDomainFile,
  DomainRecord,
  DomainTreeNode,
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
});
