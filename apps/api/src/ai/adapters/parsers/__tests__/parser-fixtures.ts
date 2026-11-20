/**
 * Synthetic, unprivileged in-memory test fixtures for PDF, DOCX, Markdown, and TXT parsing tests.
 * Zero external file dependencies or confidential data.
 */

/**
 * Builds an in-memory ZIP buffer with valid local and central directory headers.
 */
export function buildZipArchive(
  entries: Array<{
    name: string;
    content?: Buffer;
    uncompressedSize?: number;
    compressedSize?: number;
  }>,
): Buffer {
  const localHeaders: Buffer[] = [];
  const cdHeaders: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const filenameBuf = Buffer.from(entry.name, 'utf8');
    const data = entry.content ?? Buffer.from('<xml/>', 'utf8');
    const compSize = entry.compressedSize ?? data.length;
    const uncompSize = entry.uncompressedSize ?? data.length;
    const crc = 0x12345678;

    // Local Header (30 bytes + name + data)
    const localHeader = Buffer.alloc(30 + filenameBuf.length);
    localHeader.writeUInt32LE(0x04034b50, 0); // PK\x03\x04
    localHeader.writeUInt16LE(20, 4);
    localHeader.writeUInt16LE(0, 6);
    localHeader.writeUInt16LE(0, 8); // stored (no compression)
    localHeader.writeUInt16LE(0, 10);
    localHeader.writeUInt16LE(0, 12);
    localHeader.writeUInt32LE(crc, 14);
    localHeader.writeUInt32LE(compSize, 18);
    localHeader.writeUInt32LE(uncompSize, 22);
    localHeader.writeUInt16LE(filenameBuf.length, 26);
    localHeader.writeUInt16LE(0, 28);
    filenameBuf.copy(localHeader, 30);

    const localEntry = Buffer.concat([localHeader, data]);
    localHeaders.push(localEntry);

    // Central Directory Header (46 bytes + name)
    const cdHeader = Buffer.alloc(46 + filenameBuf.length);
    cdHeader.writeUInt32LE(0x02014b50, 0); // PK\x01\x02
    cdHeader.writeUInt16LE(20, 4);
    cdHeader.writeUInt16LE(20, 6);
    cdHeader.writeUInt16LE(0, 8);
    cdHeader.writeUInt16LE(0, 10);
    cdHeader.writeUInt16LE(0, 12);
    cdHeader.writeUInt16LE(0, 14);
    cdHeader.writeUInt32LE(crc, 16);
    cdHeader.writeUInt32LE(compSize, 20);
    cdHeader.writeUInt32LE(uncompSize, 24);
    cdHeader.writeUInt16LE(filenameBuf.length, 28);
    cdHeader.writeUInt16LE(0, 30);
    cdHeader.writeUInt16LE(0, 32);
    cdHeader.writeUInt16LE(0, 34);
    cdHeader.writeUInt16LE(0, 36);
    cdHeader.writeUInt32LE(0, 38);
    cdHeader.writeUInt32LE(offset, 42);
    filenameBuf.copy(cdHeader, 46);

    cdHeaders.push(cdHeader);
    offset += localEntry.length;
  }

  const cdBuf = Buffer.concat(cdHeaders);
  const cdOffset = offset;
  const cdSize = cdBuf.length;

  // End of Central Directory (22 bytes)
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0); // PK\x05\x06
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, cdBuf, eocd]);
}

/**
 * Creates a valid single-page digital PDF 1.4 buffer with stream text.
 */
export function createSinglePagePdf(text = 'Protocolo de Rehabilitación'): Buffer {
  const streamData = `BT /F1 12 Tf 100 700 Td (${text}) Tj ET`;
  const streamLen = streamData.length;

  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>
endobj
4 0 obj
<< /Length ${streamLen} >>
stream
${streamData}
endstream
endobj
5 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 6
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000266 00000 n 
0000000360 00000 n 
trailer
<< /Size 6 /Root 1 0 R >>
startxref
441
%%EOF`,
  );
}

/**
 * Creates a valid 2-page digital PDF 1.4 buffer.
 */
export function createMultiPagePdf(
  page1Text = 'Página 1: Evaluación Inicial',
  page2Text = 'Página 2: Tratamiento Kinésico',
): Buffer {
  const stream1 = `BT /F1 12 Tf 100 700 Td (${page1Text}) Tj ET`;
  const stream2 = `BT /F1 12 Tf 100 700 Td (${page2Text}) Tj ET`;

  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R 4 0 R] /Count 2 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 5 0 R /Resources << /Font << /F1 7 0 R >> >> >>
endobj
4 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 6 0 R /Resources << /Font << /F1 7 0 R >> >> >>
endobj
5 0 obj
<< /Length ${stream1.length} >>
stream
${stream1}
endstream
endobj
6 0 obj
<< /Length ${stream2.length} >>
stream
${stream2}
endstream
endobj
7 0 obj
<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>
endobj
xref
0 8
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000123 00000 n 
0000000251 00000 n 
0000000379 00000 n 
0000000475 00000 n 
0000000571 00000 n 
trailer
<< /Size 8 /Root 1 0 R >>
startxref
650
%%EOF`,
  );
}

/**
 * Creates a valid PDF that has page structure but contains NO text stream (scanned/image-only).
 */
export function createImageOnlyPdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << >> >>
endobj
4 0 obj
<< /Length 6 >>
stream
q
Q
endstream
endobj
xref
0 5
0000000000 65535 f 
0000000009 00000 n 
0000000058 00000 n 
0000000115 00000 n 
0000000234 00000 n 
trailer
<< /Size 5 /Root 1 0 R >>
startxref
290
%%EOF`,
  );
}

/**
 * Creates an encrypted PDF fixture.
 */
export function createEncryptedPdf(): Buffer {
  return Buffer.from(
    `%PDF-1.4
1 0 obj
<< /Type /Catalog /Pages 2 0 R >>
endobj
2 0 obj
<< /Type /Pages /Kids [3 0 R] /Count 1 >>
endobj
3 0 obj
<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>
endobj
4 0 obj
<< /Filter /Standard /V 2 /R 3 /O (hash) /U (hash) /P -4 >>
endobj
trailer
<< /Size 5 /Root 1 0 R /Encrypt 4 0 R >>
startxref
200
%%EOF`,
  );
}

/**
 * Creates a valid DOCX container with headings, paragraphs, and tables.
 */
export function createValidDocx(xmlBody?: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${
      xmlBody ??
      `<w:p>
        <w:pPr><w:pStyle w:val="Heading1"/></w:pPr>
        <w:r><w:t>Manual de Kinesiología y Fisioterapia</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:t>Este documento describe los protocolos clínicos aplicados a pacientes ambulatorios.</w:t></w:r>
      </w:p>
      <w:p>
        <w:pPr><w:pStyle w:val="Heading2"/></w:pPr>
        <w:r><w:t>1. Evaluación Inicial</w:t></w:r>
      </w:p>
      <w:p>
        <w:r><w:t>Medición de rango articular y fuerza muscular según escala Daniels.</w:t></w:r>
      </w:p>`
    }
  </w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  return buildZipArchive([
    { name: '[Content_Types].xml', content: Buffer.from(contentTypesXml, 'utf8') },
    { name: 'word/document.xml', content: Buffer.from(documentXml, 'utf8') },
  ]);
}

/**
 * Creates a DOCX containing embedded tables.
 */
export function createDocxWithTable(): Buffer {
  const tableXml = `
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Tabla de Dosificación</w:t></w:r></w:p>
    <w:tbl>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Tratamiento</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>Duración (min)</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Electroterapia</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>15</w:t></w:r></w:p></w:tc>
      </w:tr>
      <w:tr>
        <w:tc><w:p><w:r><w:t>Cinesiterapia</w:t></w:r></w:p></w:tc>
        <w:tc><w:p><w:r><w:t>30</w:t></w:r></w:p></w:tc>
      </w:tr>
    </w:tbl>`;
  return createValidDocx(tableXml);
}

/**
 * Creates a DOCX containing list items.
 */
export function createDocxWithLists(): Buffer {
  const listXml = `
    <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Lista de Equipamiento</w:t></w:r></w:p>
    <w:p><w:r><w:t>• Camilla hidráulica regulable</w:t></w:r></w:p>
    <w:p><w:r><w:t>• Equipo TENS de 4 canales</w:t></w:r></w:p>
    <w:p><w:r><w:t>• Bandas de resistencia elástica</w:t></w:r></w:p>`;
  return createValidDocx(listXml);
}

/**
 * Sample Markdown fixture with nested headings, code fences, and tables.
 */
export const SAMPLE_MARKDOWN = `# Protocolo de Atención Kine-Deportiva

Guía de manejo y criterios de retorno deportivo tras lesiones musculares.

## 1. Criterios de Ingreso
- Dolor localizado sin rotura completa en ecografía.
- Rango de movimiento superior al 70%.

## 2. Parámetros de Fuerza

| Grupo Muscular | Test Clínico | Meta Simetría (%) |
|---|---|---|
| Cuádriceps | Isocinético 60°/s | > 90% |
| Isquiosurales | Nordic Hamstring | > 95% |

## 3. Algoritmo de Decisión
\`\`\`typescript
function isReadyForReturn(limbSymmetryIndex: number): boolean {
  return limbSymmetryIndex >= 0.90;
}
\`\`\`

> **Nota:** La progresión funcional requiere alta del médico tratante.
`;

/**
 * Creates an empty DOCX container with no extractable text.
 */
export function createEmptyDocx(): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body/>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  return buildZipArchive([
    { name: '[Content_Types].xml', content: Buffer.from(contentTypesXml, 'utf8') },
    { name: 'word/document.xml', content: Buffer.from(documentXml, 'utf8') },
  ]);
}

/**
 * Creates a corrupted DOCX zip missing [Content_Types].xml.
 */
export function createCorruptDocx(): Buffer {
  return buildZipArchive([
    { name: 'word/document.xml', content: Buffer.from('<w:document/>', 'utf8') },
  ]);
}

/**
 * Creates a DOCX file with embedded VBA macros.
 */
export function createMacroDocx(): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body><w:p><w:r><w:t>Documento con Macro</w:t></w:r></w:p></w:body>
</w:document>`;

  const contentTypesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

  return buildZipArchive([
    { name: '[Content_Types].xml', content: Buffer.from(contentTypesXml, 'utf8') },
    { name: 'word/document.xml', content: Buffer.from(documentXml, 'utf8') },
    { name: 'word/vbaProject.bin', content: Buffer.from('VBA_MACRO_PAYLOAD', 'utf8') },
  ]);
}

/**
 * Creates a synthetic ZIP bomb buffer where CD header claims excessive uncompressed size.
 */
export function createZipBombDocx(): Buffer {
  const content = Buffer.from('small content');
  const fileName = 'word/document.xml';
  const nameBuf = Buffer.from(fileName, 'utf8');

  // Local header
  const lh = Buffer.alloc(30 + nameBuf.length + content.length);
  lh.writeUInt32LE(0x04034b50, 0);
  lh.writeUInt16LE(20, 4);
  lh.writeUInt16LE(0, 6);
  lh.writeUInt16LE(0, 8);
  lh.writeUInt16LE(0, 10);
  lh.writeUInt16LE(0, 12);
  lh.writeUInt32LE(0, 14);
  lh.writeUInt32LE(content.length, 18); // comp size
  lh.writeUInt32LE(60 * 1024 * 1024, 22); // uncomp size: 60MB (exceeds 50MB limit)
  lh.writeUInt16LE(nameBuf.length, 26);
  lh.writeUInt16LE(0, 28);
  nameBuf.copy(lh, 30);
  content.copy(lh, 30 + nameBuf.length);

  // Central directory header
  const cd = Buffer.alloc(46 + nameBuf.length);
  cd.writeUInt32LE(0x02014b50, 0);
  cd.writeUInt16LE(20, 4);
  cd.writeUInt16LE(20, 6);
  cd.writeUInt16LE(0, 8);
  cd.writeUInt16LE(0, 10);
  cd.writeUInt16LE(0, 12);
  cd.writeUInt16LE(0, 14);
  cd.writeUInt32LE(0, 16);
  cd.writeUInt32LE(content.length, 20); // comp size
  cd.writeUInt32LE(60 * 1024 * 1024, 24); // uncomp size: 60MB
  cd.writeUInt16LE(nameBuf.length, 28);
  cd.writeUInt16LE(0, 30);
  cd.writeUInt16LE(0, 32);
  cd.writeUInt16LE(0, 34);
  cd.writeUInt16LE(0, 36);
  cd.writeUInt32LE(0, 38);
  cd.writeUInt32LE(0, 42); // offset
  nameBuf.copy(cd, 46);

  // EOCD
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(1, 8);
  eocd.writeUInt16LE(1, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(lh.length, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([lh, cd, eocd]);
}

/**
 * Spanish Plain Text fixture with UTF-8 accents and formatting.
 */
export const SAMPLE_SPANISH_TXT = `MANUAL DE PROCEDIMIENTOS CLÍNICOS

El presente instructivo establece las pautas para la atención fisioterapéutica de pacientes con lumbalgia mecánica.

1. Evaluación Postural
Se valorará la estática pélvica, longitud de miembros inferiores y presencia de contracturas paravertebrales. El kinesiólogo registrará los hallazgos en la ficha SOAP.

2. Crioterapia y Termoterapia
En etapas agudas (primeras 48 horas), aplicar frío local durante 15 minutos. En etapas crónicas o contracturas miotendinosas, emplear calor superficial o parafina.
`;
