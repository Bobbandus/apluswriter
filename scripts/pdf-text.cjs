/**
 * Minimal PDF text extractor for the reference screenplays in fixtures/.
 *
 * Not a general PDF parser — just enough to read the text-drawing operators
 * page by page out of the official sample PDFs, so the paginator's golden
 * tests can check *where* pages break, not only how many there are.
 *
 *   node scripts/pdf-text.cjs fixtures/official/Big-Fish.pdf > out.json
 *
 * Writes a JSON array: one entry per page, each an array of text runs.
 */
const fs = require('fs');
const zlib = require('zlib');

function extract(file) {
  const s = fs.readFileSync(file).toString('latin1');
  const objs = new Map();
  const objRe = /(\d+)\s+0\s+obj([\s\S]*?)endobj/g;
  let m;
  while ((m = objRe.exec(s))) {
    const body = m[2];
    const si = body.indexOf('stream');
    let stream = null;
    if (si >= 0) {
      let start = si + 6;
      if (body[start] === '\r') start += 1;
      if (body[start] === '\n') start += 1;
      const end = body.lastIndexOf('endstream');
      const raw = Buffer.from(body.slice(start, end), 'latin1');
      const compressed = /FlateDecode/.test(body.slice(0, si));
      try {
        stream = compressed ? zlib.inflateSync(raw) : raw;
      } catch {
        stream = null;
      }
    }
    objs.set(Number(m[1]), { dict: si >= 0 ? body.slice(0, si) : body, stream });
  }

  const rootRef = Number(s.match(/\/Root\s+(\d+)\s+0\s+R/)[1]);
  const pagesRef = Number(objs.get(rootRef).dict.match(/\/Pages\s+(\d+)\s+0\s+R/)[1]);

  const order = [];
  (function walk(n) {
    const d = objs.get(n).dict;
    if (/\/Type\s*\/Pages/.test(d)) {
      const kids = d.match(/\/Kids\s*\[([^\]]*)\]/)[1].match(/(\d+)\s+0\s+R/g);
      for (const kid of kids) walk(Number(kid.split(/\s/)[0]));
    } else {
      order.push(n);
    }
  })(pagesRef);

  const unescape = (value) => value.replace(/\\([\\()])/g, '$1').replace(/\\(\d{3})/g, (_, o) => String.fromCharCode(parseInt(o, 8)));

  return order.map((page) => {
    const d = objs.get(page).dict;
    const contents = d.match(/\/Contents\s*(\[[^\]]*\]|\d+\s+0\s+R)/);
    if (!contents) return [];
    const refs = (contents[1].match(/(\d+)\s+0\s+R/g) || []).map((x) => Number(x.split(/\s/)[0]));
    let ops = '';
    for (const r of refs) {
      const o = objs.get(r);
      if (o && o.stream) ops += o.stream.toString('latin1');
    }
    const runs = [];
    const textRe = /\(((?:\\.|[^\\)])*)\)\s*Tj|\[((?:\\.|[^\]])*)\]\s*TJ/g;
    let t;
    while ((t = textRe.exec(ops))) {
      const text =
        t[1] !== undefined
          ? t[1]
          : (t[2].match(/\(((?:\\.|[^\\)])*)\)/g) || []).map((x) => x.slice(1, -1)).join('');
      runs.push(unescape(text));
    }
    return runs;
  });
}

module.exports = { extract };

if (require.main === module) {
  process.stdout.write(JSON.stringify(extract(process.argv[2])));
}
