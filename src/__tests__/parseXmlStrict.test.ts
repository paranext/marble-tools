import { parseXmlStrict } from '../helpers';

describe('parseXmlStrict', () => {
  test('parses well-formed XML', () => {
    const doc = parseXmlStrict('<Root><Child Id="1"/></Root>', 'ok.xml');
    expect(doc.documentElement.nodeName).toBe('Root');
  });

  test('throws, naming the file, when the XML is truncated', () => {
    expect(() => parseXmlStrict('<Root><Child Id="1"', 'broken.xml')).toThrow(/broken\.xml/);
  });

  test('throws on an end tag that does not match its start tag', () => {
    expect(() =>
      parseXmlStrict('<Root><Entry Id="1"><R>a</X></Entry></Root>', 'mismatch.xml')
    ).toThrow(/mismatch\.xml.*<\/X>.*<R>/);
  });

  test('throws when an end tag closes an element while an inner one is open', () => {
    expect(() =>
      parseXmlStrict('<Root><Entry Id="1"><R>a</Entry><Entry Id="2"/></Root>', 'nested.xml')
    ).toThrow(/nested\.xml/);
  });

  test('throws on a start tag that is never closed', () => {
    expect(() => parseXmlStrict('<Root><A>', 'open.xml')).toThrow(/never closed/);
  });

  test('throws on an end tag without a start tag', () => {
    expect(() => parseXmlStrict('<Root/></Root>', 'extra.xml')).toThrow(/open|no matching/);
  });

  test('fails on an xmldom warning', () => {
    expect(() => parseXmlStrict('<Root><A b="1" b="2"/></Root>', 'warn.xml')).toThrow(/warn\.xml/);
  });

  test('accepts comments, CDATA, processing instructions, DOCTYPE and quoted > characters', () => {
    const xml =
      '<?xml version="1.0"?><!DOCTYPE Root [<!ELEMENT Root ANY>]><Root a="x>y"><!-- </Nope> --><C><![CDATA[</Nope>]]></C><D/></Root>';
    expect(parseXmlStrict(xml, 'ok.xml').documentElement.nodeName).toBe('Root');
  });
});
