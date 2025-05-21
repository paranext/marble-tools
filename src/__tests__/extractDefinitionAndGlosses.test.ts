// NOTE: Most code in this file is AI generated. Some human adjustments were made.
import { extractDefinitionAndGlosses } from '../helpers';
import { DOMParser } from '@xmldom/xmldom';

describe('extractDefinitionAndGlosses function', () => {
  // Helper function to create mock XML elements
  function createMockElement(xmlString: string): Element {
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlString, 'text/xml');
    return doc.documentElement;
  }

  // Test with complete definition and glosses
  test('should extract definition and glosses from complete element', () => {
    const xmlString = `
      <Sense>
        <DefinitionShort>Test definition</DefinitionShort>
        <Glosses>
          <Gloss>gloss 1</Gloss>
          <Gloss>gloss 2</Gloss>
          <Gloss>gloss 3</Gloss>
        </Glosses>
      </Sense>
    `;
    const element = createMockElement(xmlString);
    const result = extractDefinitionAndGlosses(element);

    expect(result.definition).toBe('Test definition');
    expect(result.glosses).toEqual(['gloss 1', 'gloss 2', 'gloss 3']);
  });

  // Test with only definition
  test('should extract only definition when no glosses are present', () => {
    const xmlString = `
      <Sense>
        <DefinitionShort>Only definition</DefinitionShort>
      </Sense>
    `;
    const element = createMockElement(xmlString);
    const result = extractDefinitionAndGlosses(element);

    expect(result.definition).toBe('Only definition');
    expect(result.glosses).toEqual([]);
  });

  // Test with only glosses
  test('should extract only glosses when no definition is present', () => {
    const xmlString = `
      <Sense>
        <Glosses>
          <Gloss>only gloss</Gloss>
        </Glosses>
      </Sense>
    `;
    const element = createMockElement(xmlString);
    const result = extractDefinitionAndGlosses(element);

    expect(result.definition).toBe('');
    expect(result.glosses).toEqual(['only gloss']);
  });

  // Test with empty element
  test('should return empty results for empty element', () => {
    const xmlString = `<Sense></Sense>`;
    const element = createMockElement(xmlString);
    const result = extractDefinitionAndGlosses(element);

    expect(result.definition).toBe('');
    expect(result.glosses).toEqual([]);
  });

  // Test with whitespace handling
  test('should properly trim whitespace in definitions and glosses', () => {
    const xmlString = `
      <Sense>
        <DefinitionShort>  Definition with spaces  </DefinitionShort>
        <Glosses>
          <Gloss>  Gloss with spaces  </Gloss>
          <Gloss>Another gloss</Gloss>
        </Glosses>
      </Sense>
    `;
    const element = createMockElement(xmlString);
    const result = extractDefinitionAndGlosses(element);

    expect(result.definition).toBe('Definition with spaces');
    expect(result.glosses).toEqual(['Gloss with spaces', 'Another gloss']);
  });

  // Test with empty glosses (should be filtered out)
  test('should filter out empty glosses', () => {
    const xmlString = `
      <Sense>
        <DefinitionShort>Test definition</DefinitionShort>
        <Glosses>
          <Gloss>valid gloss</Gloss>
          <Gloss></Gloss>
          <Gloss>  </Gloss>
        </Glosses>
      </Sense>
    `;
    const element = createMockElement(xmlString);
    const result = extractDefinitionAndGlosses(element);

    expect(result.definition).toBe('Test definition');
    expect(result.glosses).toEqual(['valid gloss']);
  });

  // Test with duplicate glosses (should be filtered out)
  test('should filter out duplicate glosses', () => {
    const xmlString = `
      <Sense>
        <DefinitionShort>Test definition</DefinitionShort>
        <Glosses>
          <Gloss>valid gloss</Gloss>
          <Gloss>valid gloss</Gloss>
        </Glosses>
      </Sense>
    `;
    const element = createMockElement(xmlString);
    const result = extractDefinitionAndGlosses(element);

    expect(result.definition).toBe('Test definition');
    expect(result.glosses).toEqual(['valid gloss']);
  });
});
