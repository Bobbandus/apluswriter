/** File types Importera fil accepts, and what turns each into Fountain. */
export const IMPORT_EXTENSIONS = ['fountain', 'spmd', 'txt', 'fdx', 'highland', 'docx'] as const;
export const IMPORT_ACCEPT = IMPORT_EXTENSIONS.map((extension) => `.${extension}`).join(',');
export const IMPORT_PATTERN = new RegExp(`\.(${IMPORT_EXTENSIONS.join('|')})$`, 'i');

/**
 * The Fountain text of a script file. Readers for the other formats are loaded
 * on demand: a writer who only ever opens `.fountain` files should not carry
 * the zip library.
 */
export async function readScriptFile(file: File): Promise<string> {
  const extension = /\.([a-z]+)$/i.exec(file.name)?.[1]?.toLowerCase();

  if (extension === 'fdx') {
    return (await import('@aplus/fountain/importFdx')).fdxToFountain(await file.text());
  }
  if (extension === 'highland') {
    return (await import('@aplus/fountain/importZip')).highlandToFountain(new Uint8Array(await file.arrayBuffer()));
  }
  if (extension === 'docx') {
    return (await import('@aplus/fountain/importZip')).docxToFountain(new Uint8Array(await file.arrayBuffer()));
  }
  return file.text();
}
