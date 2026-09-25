import { classifyDomainFile } from '../domain-taxonomy';

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
  });
});
