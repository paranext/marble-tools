import { errorReport } from '../helpers';

describe('errorReport', () => {
  test('prints only the message of a data error', () => {
    const error = new Error('Error processing file a.XML: bad Id', { cause: new Error('bad Id') });

    expect(errorReport(error)).toBe('Error processing file a.XML: bad Id');
  });

  test('adds the stack of an unexpected error that is the cause', () => {
    const cause = new TypeError("Cannot read properties of undefined (reading 'id')");
    const report = errorReport(
      new Error(`Error processing file a.XML: ${cause.message}`, { cause })
    );

    expect(report).toMatch(/^Error processing file a\.XML: Cannot read/);
    expect(report).toContain('TypeError');
    expect(report).toMatch(/^\s+at /m);
  });

  test('prints a thrown value that is not an error', () => {
    expect(errorReport('just text')).toBe('just text');
  });
});
