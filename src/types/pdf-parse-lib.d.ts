/* @types/pdf-parse only covers the package's index.js entry point.
   src/lib/extract-date.ts imports the internal lib/pdf-parse.js directly
   (see the comment there for why) — this declares that subpath with the
   same signature. */
declare module 'pdf-parse/lib/pdf-parse.js' {
  import PdfParse = require('pdf-parse');
  export = PdfParse;
}
