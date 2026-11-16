import { parseXmlStrict } from '../helpers';

describe('parseXmlStrict', () => {
  test('parses well-formed XML', () => {
    const doc = parseXmlStrict('<Root><Child Id="1"/></Root>', 'ok.xml');
    expect(doc.documentElement.nodeName).toBe('Root');
  });

  test('throws, naming the file, when the XML is truncated', () => {
    expect(() => parseXmlStrict('<Root><Child Id="1"', 'broken.xml')).toThrow(/broken\.xml/);
  });
});
