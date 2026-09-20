import { describe, expect, it } from 'vitest';
import { parse } from './parse';
import { readTitleValues, titlePageEdit, type TitleValues } from './titlePage';

const apply = (source: string, values: Partial<TitleValues>) => {
  const edit = titlePageEdit(parse(source), values);
  return edit ? source.slice(0, edit.from) + edit.insert + source.slice(edit.to) : source;
};

const BODY = 'INT. KÖK - DAG\n\nERIK\nHej.\n';

describe('title page form', () => {
  it('reads the known fields, joining a multi-line value', () => {
    const script = parse(`Title: Min film\nAuthor: Vilde\nContact:\n\tVilde AB\n\t070-123\n\n${BODY}`);
    expect(readTitleValues(script)).toMatchObject({ title: 'Min film', author: 'Vilde', contact: 'Vilde AB\n070-123', credit: '' });
  });

  it('changes one field and leaves the rest of the file alone', () => {
    const out = apply(`Title: Min film\nAuthor: Vilde\n\n${BODY}`, { title: 'Ny titel' });
    expect(out).toBe(`Title: Ny titel\nAuthor: Vilde\n\n${BODY}`);
  });

  it('keeps a key the form does not know, in place', () => {
    const out = apply(`Title: A\nRevision: Blue\nAuthor: B\n\n${BODY}`, { author: 'C' });
    expect(out).toBe(`Title: A\nRevision: Blue\nAuthor: C\n\n${BODY}`);
  });

  it('keeps the way a key was written', () => {
    expect(apply(`title: A\n\n${BODY}`, { credit: 'Written by' })).toBe(`title: A\nCredit: Written by\n\n${BODY}`);
  });

  it('writes a multi-line value as an indented block', () => {
    const out = apply(`Title: A\n\n${BODY}`, { contact: 'Vilde AB\n070-123' });
    expect(out).toBe(`Title: A\nContact:\n\tVilde AB\n\t070-123\n\n${BODY}`);
    expect(parse(out).titlePage?.fields.find((f) => f.key === 'contact')?.values).toEqual(['Vilde AB', '070-123']);
  });

  it('starts a title page on a script that has none', () => {
    const out = apply(BODY, { title: 'Min film', author: 'Vilde' });
    expect(out).toBe(`Title: Min film\nAuthor: Vilde\n\n${BODY}`);
    expect(parse(out).scenes).toHaveLength(1);
  });

  it('takes a field away when it is emptied', () => {
    expect(apply(`Title: A\nAuthor: B\n\n${BODY}`, { author: '  ' })).toBe(`Title: A\n\n${BODY}`);
  });

  it('removes the whole block, and the gap after it, when everything is empty', () => {
    expect(apply(`Title: A\n\n${BODY}`, { title: '' })).toBe(BODY);
  });

  it('is a no-op when nothing changed', () => {
    expect(titlePageEdit(parse(`Title: A\n\n${BODY}`), { title: 'A' })).toBeNull();
    expect(titlePageEdit(parse(BODY), {})).toBeNull();
  });

  it('treats a Swedish key as the same field, keeping its spelling', () => {
    const source = `Titel: Min film
Författare: Vilde

${BODY}`;
    expect(readTitleValues(parse(source))).toMatchObject({ title: 'Min film', author: 'Vilde' });
    expect(apply(source, { title: 'Ny' })).toBe(`Titel: Ny
Författare: Vilde

${BODY}`);
  });
});
