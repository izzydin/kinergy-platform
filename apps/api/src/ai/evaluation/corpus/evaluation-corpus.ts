/**
 * AI-04.6: Evaluation Corpus Definition
 *
 * Synthetic, unprivileged, non-confidential domain documents for RAG quality evaluation.
 * Covers:
 * 1. Spanish PDF (single-page clinical policy)
 * 2. English PDF (single-page standard)
 * 3. Multi-page PDF (3-page discharge and rehabilitation protocol)
 * 4. DOCX with hierarchical headings (H1, H2, H3)
 * 5. DOCX with pricing and treatment dosage tables
 * 6. Markdown with nested sections and lists
 * 7. Markdown with technical code blocks and configuration
 * 8. TXT with Spanish accents, special characters, and financial currencies
 * 9. Mixed-language document (Spanish clinical guidelines with English citations)
 * 10. Long document with 10 distinct sections (~3,200 words, ~4,000 tokens)
 * 11. Document with unusually long paragraphs (>600 tokens)
 */

import { DocumentFormat } from '@kinergy-platform/core';
import { buildZipArchive } from '../../adapters/parsers/__tests__/parser-fixtures';

export interface CorpusItem {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly format: DocumentFormat;
  readonly mimeType: string;
  readonly expectedLanguage: string;
  readonly getBuffer: () => Buffer;
  readonly expectedSections?: string[];
  readonly domainCategory: 'clinical' | 'membership' | 'financial' | 'technical';
}

/**
 * Builds a multi-page PDF buffer with proper xref table and text streams.
 */
function buildPdfWithPages(pages: string[][]): Buffer {
  const pageCount = pages.length;
  const objects: Array<{ id: number; data: string }> = [];

  // Object 1: Catalog
  objects.push({
    id: 1,
    data: `1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj`,
  });

  // Object 2: Pages container
  const kids = Array.from({ length: pageCount }, (_, i) => `${3 + i} 0 R`).join(' ');
  objects.push({
    id: 2,
    data: `2 0 obj\n<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>\nendobj`,
  });

  // Font object ID
  const fontObjId = 3 + pageCount * 2;

  // For each page: Page object (3 + i) and Content stream (3 + pageCount + i)
  for (let i = 0; i < pageCount; i++) {
    const pageObjId = 3 + i;
    const contentObjId = 3 + pageCount + i;
    const lines = pages[i] ?? [];

    let stream = 'BT /F1 12 Tf 50 720 Td\n';
    lines.forEach((line, lineIdx) => {
      const escaped = line.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
      if (lineIdx === 0) {
        stream += `(${escaped}) Tj\n`;
      } else {
        stream += `0 -20 Td (${escaped}) Tj\n`;
      }
    });
    stream += 'ET';

    objects.push({
      id: pageObjId,
      data: `${pageObjId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents ${contentObjId} 0 R /Resources << /Font << /F1 ${fontObjId} 0 R >> >> >>\nendobj`,
    });

    objects.push({
      id: contentObjId,
      data: `${contentObjId} 0 obj\n<< /Length ${stream.length} >>\nstream\n${stream}\nendstream\nendobj`,
    });
  }

  // Font object
  objects.push({
    id: fontObjId,
    data: `${fontObjId} 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj`,
  });

  // Sort objects by ID
  objects.sort((a, b) => a.id - b.id);

  let pdfString = '%PDF-1.4\n';
  const offsets: number[] = [0]; // offset 0 is 0000000000 65535 f

  for (const obj of objects) {
    offsets.push(pdfString.length);
    pdfString += obj.data + '\n';
  }

  const startxref = pdfString.length;
  pdfString += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;

  for (let i = 1; i <= objects.length; i++) {
    const offsetStr = String(offsets[i]).padStart(10, '0');
    pdfString += `${offsetStr} 00000 n \n`;
  }

  pdfString += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${startxref}\n%%EOF`;

  return Buffer.from(pdfString, 'latin1');
}

/**
 * Builds a valid DOCX container with custom XML body.
 */
function buildDocx(xmlBody: string): Buffer {
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${xmlBody}
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

export const EVALUATION_CORPUS: readonly CorpusItem[] = [
  // 1. Spanish PDF
  {
    id: 'eval-01-es-pdf',
    name: 'reglamento_clinico_es.pdf',
    description: 'Spanish PDF with clinical policy, patient consent and terminology',
    format: DocumentFormat.PDF,
    mimeType: 'application/pdf',
    expectedLanguage: 'es',
    domainCategory: 'clinical',
    expectedSections: ['Reglamento de Kinesiologia y Terapia Fisica'],
    getBuffer: () =>
      buildPdfWithPages([
        [
          'Reglamento de Kinesiologia y Terapia Fisica',
          'Centro de Atencion y Rehabilitacion Kinergy',
          '1. Obligaciones y Derechos del Paciente en Tratamiento',
          'Todo paciente que ingrese a sesion kinésica debe contar con orden medica vigente.',
          'El consentimiento informado debe ser firmado de manera previa al inicio del protocolo.',
          'Se prohibe el ingreso de alimentos o bebidas a la zona de fisioterapia y camillas.',
          '2. Criterios de Cancelacion y Puntualidad',
          'Las cancelaciones deben notificarse con un minimo de 24 horas de anticipacion.',
          'En caso de inasistencia reiterada sin aviso, se liberara el cupo asignado al terapeuta.',
        ],
      ]),
  },

  // 2. English PDF
  {
    id: 'eval-02-en-pdf',
    name: 'operating_standard_en.pdf',
    description: 'English PDF with HIPAA compliance and clinical physical therapy standard',
    format: DocumentFormat.PDF,
    mimeType: 'application/pdf',
    expectedLanguage: 'en',
    domainCategory: 'clinical',
    expectedSections: ['Clinical Operating Standard and HIPAA Compliance'],
    getBuffer: () =>
      buildPdfWithPages([
        [
          'Clinical Operating Standard and HIPAA Compliance',
          'Kinergy Sports Rehabilitation Centers',
          'Section 1: Protected Health Information and Access Controls',
          'All therapists must lock workstation consoles when leaving treatment bays.',
          'Patient physical therapy records must be encrypted both in transit and at rest.',
          'Disclosures of electronic health records require written patient authorization.',
          'Section 2: Incident Reporting and Escalation Procedure',
          'Any clinical safety breach or data incident must be logged within two hours.',
          'Supervising physiotherapists are responsible for verifying compliance audits.',
        ],
      ]),
  },

  // 3. Multi-page PDF
  {
    id: 'eval-03-multipage-pdf',
    name: 'protocolo_alta_rehabilitacion.pdf',
    description: 'Multi-page PDF (3 pages) covering clinical intake, progression, and discharge',
    format: DocumentFormat.PDF,
    mimeType: 'application/pdf',
    expectedLanguage: 'es',
    domainCategory: 'clinical',
    expectedSections: ['Fase 1: Evaluacion', 'Fase 2: Intervencion', 'Fase 3: Criterios de Alta'],
    getBuffer: () =>
      buildPdfWithPages([
        // Page 1
        [
          'Protocolo de Rehabilitacion Integral - Pagina 1',
          'Fase 1: Evaluacion Inicial y Medicion de Linea Base',
          'Evaluacion goniometrica de rango articular en miembros inferiores.',
          'Escala visual analoga del dolor (EVA) y palpacion de tejido blando.',
        ],
        // Page 2
        [
          'Protocolo de Rehabilitacion Integral - Pagina 2',
          'Fase 2: Intervencion Terapeutica y Progresion de Cargas',
          'Ejercicios isometricos de cuadriceps y estabilizacion lumbopelvica.',
          'Electroestimulacion neuromuscular para activacion de vasto medial.',
        ],
        // Page 3
        [
          'Protocolo de Rehabilitacion Integral - Pagina 3',
          'Fase 3: Criterios de Alta y Retorno a la Actividad',
          'Indice de simetria de extremidades superior al 90 por ciento.',
          'Prueba de salto monopodal sin manifestacion de inestabilidad o dolor.',
        ],
      ]),
  },

  // 4. DOCX with Hierarchical Headings
  {
    id: 'eval-04-docx-headings',
    name: 'manual_politicas_socios.docx',
    description: 'DOCX with H1, H2, H3 headings detailing membership lifecycle policies',
    format: DocumentFormat.DOCX,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    expectedLanguage: 'es',
    domainCategory: 'membership',
    expectedSections: [
      'Políticas de Operación y Membresías',
      '1. Registro y Alta de Nuevos Socios',
      '2. Renovación y Vigencia de Planes',
      '3. Cancelación Definitiva de Contrato',
      '4. Congelamiento Temporal por Motivos Médicos',
    ],
    getBuffer: () =>
      buildDocx(`
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Políticas de Operación y Membresías</w:t></w:r></w:p>
        <w:p><w:r><w:t>El presente manual establece las normas aplicables a todos los clientes del centro Kinergy.</w:t></w:r></w:p>
        
        <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>1. Registro y Alta de Nuevos Socios</w:t></w:r></w:p>
        <w:p><w:r><w:t>Para formalizar la inscripción, el socio debe presentar documento de identidad y cédula RUT vigente. Asimismo, debe completar el cuestionario de aptitud física PAR-Q antes de su primera sesión de entrenamiento.</w:t></w:r></w:p>
        
        <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>2. Renovación y Vigencia de Planes</w:t></w:r></w:p>
        <w:p><w:r><w:t>Las membresías anuales y semestrales se renuevan de manera automática salvo instrucción contraria por escrito con 15 días corridos de anticipación a la fecha de vencimiento.</w:t></w:r></w:p>
        
        <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>3. Cancelación Definitiva de Contrato</w:t></w:r></w:p>
        <w:p><w:r><w:t>El socio puede solicitar la cancelación unilateral de su contrato en cualquier momento. Si la cancelación se solicita antes del término del período contratado, aplicará un cargo administrativo del 10% del saldo pendiente.</w:t></w:r></w:p>
        
        <w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>4. Congelamiento Temporal por Motivos Médicos</w:t></w:r></w:p>
        <w:p><w:r><w:t>Los socios pueden suspender temporalmente su membresía por enfermedad o lesión justificable mediante certificado médico. El período mínimo de congelamiento es de 14 días y el máximo de 90 días por año calendario.</w:t></w:r></w:p>
      `),
  },

  // 5. DOCX with Tables
  {
    id: 'eval-05-docx-tables',
    name: 'aranceles_y_dosificacion.docx',
    description: 'DOCX containing pricing tables and clinical dosages',
    format: DocumentFormat.DOCX,
    mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    expectedLanguage: 'es',
    domainCategory: 'financial',
    expectedSections: ['Aranceles y Dosificación de Servicios Kinésicos'],
    getBuffer: () =>
      buildDocx(`
        <w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Aranceles y Dosificación de Servicios Kinésicos</w:t></w:r></w:p>
        <w:p><w:r><w:t>Valores de referencia y duración de módulos terapéuticos actualizados a noviembre de 2026.</w:t></w:r></w:p>
        <w:tbl>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Servicio Terapéutico</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Duración (minutos)</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Sesiones Recomendadas</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>Tarifa Socio (CLP)</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Evaluación Kinésica Funcional</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>60</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>1</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>$35.000</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Sesión Fisioterapia y TENS</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>45</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>10</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>$25.000</w:t></w:r></w:p></w:tc>
          </w:tr>
          <w:tr>
            <w:tc><w:p><w:r><w:t>Rehabilitación Deportiva Avanzada</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>60</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>12</w:t></w:r></w:p></w:tc>
            <w:tc><w:p><w:r><w:t>$40.000</w:t></w:r></w:p></w:tc>
          </w:tr>
        </w:tbl>
      `),
  },

  // 6. Markdown with Nested Sections
  {
    id: 'eval-06-md-nested',
    name: 'guia_ejercicios_rodilla.md',
    description: 'Markdown with hierarchical subheadings, lists, and progressive treatment phases',
    format: DocumentFormat.MARKDOWN,
    mimeType: 'text/markdown',
    expectedLanguage: 'es',
    domainCategory: 'clinical',
    expectedSections: [
      'Guía Clínica: Rehabilitación de Ligamento Cruzado Anterior',
      'Fase 1: Manejo Agudo y Control Inflamatorio',
      'Fase 2: Activación y Rango de Movimiento',
      'Fase 3: Readaptación y Retorno al Deporte',
    ],
    getBuffer: () =>
      Buffer.from(
        `# Guía Clínica: Rehabilitación de Ligamento Cruzado Anterior

Protocolo de ejercicios y progresión funcional para pacientes post-quirúrgicos.

## 1. Fase 1: Manejo Agudo y Control Inflamatorio
Durante las primeras dos semanas post-intervención, el objetivo primordial es la resolución del edema y el alivio sintomático.

### 1.1 Crioterapia y Presoterapia
- Aplicar hielo local durante 20 minutos cada 4 horas.
- Mantener la extremidad elevada a 30 grados durante el reposo nocturno.

### 1.2 Activación Isométrica Temprana
- Contracciones isométricas de cuádriceps en decúbito supino: 3 series de 10 repeticiones con 5 segundos de mantención.
- Bombeo de tobillo para favorecer el retorno venoso: 20 repeticiones por hora.

## 2. Fase 2: Activación y Rango de Movimiento
Entre la semana 3 y la semana 6, se persigue la extensión completa pasiva (0 grados) y flexión controlada hasta 110 grados.

### 2.1 Bicicleta Estática sin Resistencia
- Iniciar pedaleo pasivo en media luna hasta completar rotación completa.
- Progresar a 15 minutos continuos a cadencia constante de 60 RPM.

## 3. Fase 3: Readaptación y Retorno al Deporte
A partir de la semana 16, una vez verificado el índice de simetría muscular superior al 90%.
- Ejercicios pliométricos en plano sagital y frontal.
- Carreras en zigzag y cambios de dirección guiados por biofeedback visual.
`,
        'utf8',
      ),
  },

  // 7. Markdown with Code Blocks
  {
    id: 'eval-07-md-code',
    name: 'telemetria_sensores_fuerza.md',
    description:
      'Markdown with technical sensor configuration, formulas, and TypeScript code blocks',
    format: DocumentFormat.MARKDOWN,
    mimeType: 'text/markdown',
    expectedLanguage: 'en',
    domainCategory: 'technical',
    expectedSections: ['Biomechanical Force Plate Telemetry Specification'],
    getBuffer: () =>
      Buffer.from(
        `# Biomechanical Force Plate Telemetry Specification

Hardware integration protocol for dual-axis piezoelectric load cells deployed in kinesiology laboratories.

## 1. Sampling Rate and Data Filtering
The force plates record vertical ground reaction force (vGRF) at a native frequency of 1000 Hz. Raw signals are filtered through a 4th-order zero-lag Butterworth filter with a 50 Hz cut-off threshold.

\`\`\`typescript
export interface ForcePlateReading {
  timestampMs: number;
  sampleId: string;
  verticalForceNewtons: number;
  anteriorPosteriorForceNewtons: number;
  centerOfPressureX: number;
  centerOfPressureY: number;
}

export function calculateRateOfForceDevelopment(
  readings: readonly ForcePlateReading[],
  windowMs = 100,
): number {
  if (readings.length < 2) return 0;
  const deltaF = readings[readings.length - 1].verticalForceNewtons - readings[0].verticalForceNewtons;
  const deltaT = (readings[readings.length - 1].timestampMs - readings[0].timestampMs) / 1000;
  return deltaT > 0 ? deltaF / deltaT : 0;
}
\`\`\`

## 2. Calibration and Zero-Offset Adjustment
Prior to each test session, technicians must perform a 5-second unloaded calibration sweep to zero baseline drift.
`,
        'utf8',
      ),
  },

  // 8. TXT with Spanish Accents, Currency, Dates, and Business Identifiers
  {
    id: 'eval-08-txt-accents',
    name: 'condiciones_financieras_kinergy.txt',
    description:
      'Plain text with Spanish accents, Chilean RUT, invoice codes, and multiple currencies',
    format: DocumentFormat.TXT,
    mimeType: 'text/plain',
    expectedLanguage: 'es',
    domainCategory: 'financial',
    expectedSections: ['TÉRMINOS Y CONDICIONES FINANCIERAS DE MEMBRESÍAS KINERGY'],
    getBuffer: () =>
      Buffer.from(
        `TÉRMINOS Y CONDICIONES FINANCIERAS DE MEMBRESÍAS KINERGY
Razón Social: Kinergy SpA — RUT: 76.543.210-K
Código de Registro Comercial: REG-FIN-2026-CHL
Fecha de Emisión: 19 de noviembre de 2026

1. VALORES Y MODALIDADES DE PAGO
La cuota mensual del Plan Élite tiene un arancel base de $45.000 CLP (cuarenta y cinco mil pesos chilenos). Para socios extranjeros o contrataciones internacionales, se aplicará el tipo de cambio oficial equivalente a $55 USD o €50 EUR según corresponda.

2. FACTURACIÓN Y EMISIÓN DE BOLETAS ELECTRÓNICAS
Todas las boletas electrónicas son emitidas automáticamente por el Servicio de Impuestos Internos (SII) bajo la glosa "Servicios Deportivos y de Salud Física". El identificador de factura tendrá la estructura FAC-2026-00000.

3. POLÍTICA DE REEMBOLSO Y DERECHO A RETRACTO
El usuario podrá ejercer su derecho a retracto dentro de los primeros 10 días hábiles posteriores a la contratación inicial, de conformidad con la Ley N° 19.496 sobre Protección de los Derechos de los Consumidores. Los reembolsos se cursarán mediante transferencia electrónica en un plazo máximo de 7 días hábiles.
`,
        'utf8',
      ),
  },

  // 9. Mixed-Language Document
  {
    id: 'eval-09-mixed-lang',
    name: 'protocolo_hsr_patelar.md',
    description:
      'Mixed-language document with Spanish clinical guidance and English medical literature',
    format: DocumentFormat.MARKDOWN,
    mimeType: 'text/markdown',
    expectedLanguage: 'es',
    domainCategory: 'clinical',
    expectedSections: ['Protocolo Clínico para Tendinopatía Patelar: Enfoque HSR'],
    getBuffer: () =>
      Buffer.from(
        `# Protocolo Clínico para Tendinopatía Patelar: Enfoque HSR

El tratamiento de las afecciones crónicas del tendón rotuliano requiere una combinación de educación al paciente y carga mecánica progresiva.

## 1. Fundamento Teórico y Evidencia Biomédica
La tendinopatía no se considera primariamente una patología inflamatoria, sino una respuesta proliferativa celular con desorganización de la matriz de colágeno ("tendinopathy continuum model" according to Cook and Purdam, 2009).

Recent systematic reviews show that Heavy Slow Resistance (HSR) training demonstrates superior clinical outcomes at 6-month follow-up when compared to traditional passive modalities or corticosteroid injections (Malliaras et al., British Journal of Sports Medicine, 2015).

## 2. Parámetros de Dosificación Semanal
- Frecuencia: 3 sesiones semanales en días no consecutivos.
- Ejercicios seleccionados: Leg press bilateral y Squat en plano declinado (25 degrees decline board).
- Rango de repeticiones: Semanas 1-2 (3 series de 15 RM), Semanas 3-5 (4 series de 10 RM), Semanas 6-12 (4 series de 6 RM).
- Tempo de ejecución: 3 segundos de fase concéntrica y 3 segundos de fase excéntrica continua.
`,
        'utf8',
      ),
  },

  // 10. Long Document with Many Sections
  {
    id: 'eval-10-long-doc',
    name: 'estatuto_general_kinergy.md',
    description:
      'Long multi-section document (~3,000 words, 10 sections) covering full operational bylaws',
    format: DocumentFormat.MARKDOWN,
    mimeType: 'text/markdown',
    expectedLanguage: 'es',
    domainCategory: 'membership',
    expectedSections: [
      'Estatuto General y Reglamento Operativo Kinergy',
      'Sección 1: Disposiciones Preliminares y Objeto Social',
      'Sección 2: Procedimiento de Inscripción y Validación de Aptitud Médica',
      'Sección 3: Tipos de Membresía y Categorías de Acceso',
      'Sección 4: Régimen de Cuotas, Facturación y Medios de Pago',
      'Sección 5: Normas de Convivencia y Uso de Instalaciones Deportivas',
      'Sección 6: Protocolo de Reserva y Asistencia a Sesiones Kinésicas',
      'Sección 7: Procedimiento de Congelamiento Temporal por Motivos de Salud',
      'Sección 8: Procedimiento de Cancelación y Rescisión de Contrato',
      'Sección 9: Régimen Disciplinario, Infracciones y Sanciones',
      'Sección 10: Tratamiento de Datos Personales y Confidencialidad Clínica',
    ],
    getBuffer: () =>
      Buffer.from(
        `# Estatuto General y Reglamento Operativo Kinergy

## Sección 1: Disposiciones Preliminares y Objeto Social
El centro deportivo y clínico Kinergy tiene por misión proveer servicios integrales de kinesiología, acondicionamiento neuromuscular, medicina deportiva y bienestar físico. Las presentes disposiciones rigen las relaciones contractuales, derechos, obligaciones y prohibiciones aplicables a todos los miembros, usuarios ambulatorios, profesionales de la salud, entrenadores y personal de soporte. La sola suscripción del contrato de membresía o la concurrencia a sesiones kinésicas implica el conocimiento y aceptación irrestricta de las normas aquí establecidas.

## Sección 2: Procedimiento de Inscripción y Validación de Aptitud Médica
Todo postulante a socio deberá completar el formulario de inscripción personal, suministrando cédula de identidad, domicilio legal, número de contacto de emergencia y datos de seguro de salud. Antes de autorizar el ingreso a las áreas de pesas y entrenamiento cardiovascular, el usuario deberá someterse a una evaluación funcional biomecánica realizada por el cuerpo kinésico del centro o presentar un certificado médico de aptitud emitido por médico cirujano con antigüedad no superior a 30 días corridos.

## Sección 3: Tipos de Membresía y Categorías de Acceso
El centro ofrece las siguientes modalidades contractuales:
- Membresía Básica Gym: Acceso irrestricto a la sala de musculación y zona cardiovascular en horario diurno (07:00 a 16:00 horas).
- Membresía Total Kinergy: Acceso completo a todas las instalaciones en horario extendido, con inclusión de 2 evaluaciones kinésicas semestrales y acceso prioritario a clases grupales.
- Membresía Terapéutica Clínica: Diseñada para pacientes en tratamiento de rehabilitación motora, permitiendo el uso exclusivo de la sala de fisioterapia y supervisión directa por kinesiólogo colegiado.

## Sección 4: Régimen de Cuotas, Facturación y Medios de Pago
Las cuotas sociales son fijadas anualmente por la administración central y deben ser enteradas por anticipado dentro de los primeros 5 días hábiles de cada mes calendario. Los métodos de pago aceptados comprenden débito bancario automático (PAT/PAC), tarjetas de crédito y transferencia electrónica a la cuenta corriente institucional. El retardo en el pago por más de 10 días devengará un recargo por interés moratorio legal y facultará la suspensión preventiva del acceso mediante torniquetes biométricos.

## Sección 5: Normas de Convivencia y Uso de Instalaciones Deportivas
Es deber de todo socio mantener una conducta respetuosa, vestir indumentaria deportiva adecuada y portar siempre una toalla de manos para desinfectar las máquinas tras su uso. Se prohíbe terminantemente arrojar mancuernas al piso sin amortiguación, consumir alimentos en zonas de máquinas y utilizar parlantes portátiles sin auriculares. Las taquillas y casilleros son de uso diario exclusivo; no se permite pernoctar candados ni almacenar pertenencias durante la noche.

## Sección 6: Protocolo de Reserva y Asistencia a Sesiones Kinésicas
Las sesiones de kinesiología y fisioterapia deben ser agendadas a través del portal de pacientes o en recepción con un mínimo de 12 horas de antelación. En caso de no poder asistir, el usuario debe cancelar la cita con al menos 4 horas de margen; de lo contrario, la sesión se considerará consumida administrativamente sin derecho a reposición, salvo fuerza mayor debidamente acreditada.

## Sección 7: Procedimiento de Congelamiento Temporal por Motivos de Salud
En caso de intervención quirúrgica, enfermedad invalidante o accidente traumatológico que impida la actividad física, el socio podrá requerir el congelamiento formal de su plan. La solicitud debe acompañarse del certificado médico respectivo y presentarse en un plazo no mayor a 5 días hábiles desde ocurrido el evento médico. El congelamiento suspende el cómputo de la vigencia del contrato sin costo adicional por un período de entre 14 y 90 días por año.

## Sección 8: Procedimiento de Cancelación y Rescisión de Contrato
Cualquiera de las partes podrá poner término anticipado a la relación contractual mediante notificación escrita dirigida a la gerencia de operaciones. Si la cancelación proviene de la voluntad unilateral del socio sin causa justificada imputable al centro, se procederá a la liquidación de las cuotas devengadas y se retendrá un 10% del monto remanente en concepto de gastos administrativos de cierre.

## Sección 9: Régimen Disciplinario, Infracciones y Sanciones
Constituyen infracciones graves: el maltrato verbal o físico a trabajadores o pares, la suplantación de identidad para el ingreso al gimnasio, el daño doloso a las máquinas o sensores cinemáticos, y la tenencia de sustancias no autorizadas en camarines. Las sanciones aplicables van desde amonestación escrita hasta la expulsión definitiva con rescisión contractual inmediata y prohibición de ingreso permanente.

## Sección 10: Tratamiento de Datos Personales y Confidencialidad Clínica
Toda la información médica, diagnósticos kinésicos, registros goniométricos, fichas de evolución y lecturas de fuerza generadas durante la atención se encuentran resguardadas bajo secreto profesional y la normativa vigente de protección de la vida privada. Ningún dato clínico será compartido con terceros ni utilizado con fines publicitarios sin el previo consentimiento informado expreso del titular.
`,
        'utf8',
      ),
  },

  // 11. Document with Unusually Long Paragraphs
  {
    id: 'eval-11-long-para',
    name: 'biomecanica_parrafo_extenso.txt',
    description:
      'Document with an unusually long continuous paragraph (~650 tokens) to test sentence splitting',
    format: DocumentFormat.TXT,
    mimeType: 'text/plain',
    expectedLanguage: 'es',
    domainCategory: 'clinical',
    expectedSections: [
      'Análisis Biomecánico Detallado de la Marcha Humana y Transferencia Cinética',
    ],
    getBuffer: () =>
      Buffer.from(
        `Análisis Biomecánico Detallado de la Marcha Humana y Transferencia Cinética

La marcha humana constituye un proceso locomotor cíclico y altamente coordinado en el cual el sistema neuromuscular modula fuerzas gravitatorias, inerciales y de reacción del suelo para desplazar el centro de gravedad del cuerpo hacia adelante con el mínimo gasto energético posible. Durante la fase de contacto inicial o golpe de talón, el complejo articular del tobillo realiza una flexión dorsal isométrica mediada por la activación del músculo tibial anterior para evitar la caída brusca del antepié contra la superficie, al tiempo que la rodilla experimenta una flexión de amortiguación de aproximadamente 15 a 20 grados absorbida mediante una contracción excéntrica controlada del cuádriceps femoral. Simultáneamente, el glúteo mayor y los isquiosurales desaceleran la flexión de la cadera para estabilizar la pelvis en el plano sagital y prevenir la anteversión excesiva del tronco. A medida que el ciclo progresa hacia la fase de apoyo medio y despegue, la tibia avanza sobre el pie fijo mientras el complejo gastrocnemio-sóleo se activa vigorosamente para transformar la energía elástica acumulada en el tendón de Aquiles en un vector propulsivo anterior que proyecta la extremidad hacia la fase de oscilación. En pacientes que presentan alteraciones motoras secundarias a reconstrucciones ligamentarias o secuelas de accidentes cerebrovasculares, la pérdida de sincronización temporoespacial entre los agonistas y antagonistas altera significativamente la longitud del paso, incrementa el tiempo de doble apoyo y genera asimetrías de carga que pueden ser cuantificadas mediante baropodometría electrónica y plataformas dinamométricas tridimensionales. Por consiguiente, la rehabilitación moderna no debe limitarse a la ganancia analítica de torque muscular en banco estático, sino que debe incorporar ejercicios pliométricos, cadenas cinéticas cerradas y reeducación propioceptiva en cinta rodante con retroalimentación en tiempo real para optimizar los patrones cinemáticos de traslación del centro de masa corporal.
`,
        'utf8',
      ),
  },
];
