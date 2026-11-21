export const DATASET_VERSION = 'KYNERGY_RETRIEVAL_BENCHMARK_V1';

export type QueryCategory =
  | 'exact'
  | 'synonym'
  | 'paraphrase'
  | 'multilingual'
  | 'short'
  | 'contextual'
  | 'section'
  | 'ambiguous'
  | 'distractor';

export interface LabeledChunk {
  readonly chunkId: string;
  readonly documentId: string;
  readonly documentTitle: string;
  readonly content: string;
  readonly department: string;
  readonly category: string;
  readonly section?: string;
  readonly language: string;
}

export interface LabeledQuery {
  readonly queryId: string;
  readonly queryText: string;
  readonly domainCategory: string;
  readonly queryCategory: QueryCategory;
  readonly language: 'es' | 'en';
  /**
   * Ground truth chunk relevance:
   * 3 = Highly relevant (definitive answer / exact protocol match)
   * 2 = Relevant (directly pertinent supporting context)
   * 1 = Marginally relevant (tangentially helpful clinical/operational context)
   * 0 = Irrelevant (distractor, completely out-of-domain)
   */
  readonly groundTruthRelevance: Readonly<Record<string, number | undefined>>;
}

/**
 * Authoritative representative corpus of Kynergy Platform knowledge chunks.
 * Spans 9 distinct knowledge domains:
 * 1. Kinesiology procedures
 * 2. Appointment scheduling
 * 3. Gym memberships
 * 4. Attendance policies
 * 5. Inventory management
 * 6. Sales and payments
 * 7. Room rentals
 * 8. Food services
 * 9. Internal operational documentation
 */
export const REPRESENTATIVE_CORPUS: readonly LabeledChunk[] = Object.freeze([
  // --- 1. Kinesiology Procedures ---
  {
    chunkId: 'chk_acl_phase1',
    documentId: 'doc_acl_protocol',
    documentTitle: 'Protocolo de Rehabilitación LCA',
    content:
      'Fase 1 LCA (Semanas 0-2): Control de inflamación y dolor mediante crioterapia intermitente. Activación isométrica de cuádriceps en extensión completa y bombeo de tobillo para prevención de trombosis.',
    department: 'kinesiology',
    category: 'protocols',
    section: 'Fase Aguda',
    language: 'es',
  },
  {
    chunkId: 'chk_acl_phase2',
    documentId: 'doc_acl_protocol',
    documentTitle: 'Protocolo de Rehabilitación LCA',
    content:
      'Fase 2 LCA (Semanas 3-6): Reeducación de la marcha en descarga parcial con muletas. Ejercicios en cadena cinética cerrada: sentadillas unipodales asistidas y prensa de piernas con rango protegido 0-60 grados.',
    department: 'kinesiology',
    category: 'protocols',
    section: 'Fase Intermedia',
    language: 'es',
  },
  {
    chunkId: 'chk_shoulder_impingement',
    documentId: 'doc_shoulder_impingement',
    documentTitle: 'Manejo del Síndrome Subacromial',
    content:
      'Tratamiento conservador de impingement subacromial: Fortalecimiento del manguito rotador externo (infraespinoso y redondo menor) en decúbito lateral con banda elástica y estabilización escapular en plano escapular.',
    department: 'kinesiology',
    category: 'protocols',
    section: 'Tratamiento Conservador',
    language: 'es',
  },
  {
    chunkId: 'chk_lumbar_core',
    documentId: 'doc_lumbar_stabilization',
    documentTitle: 'Guía de Estabilización Lumbopélvica',
    content:
      'Prescripción para lumbalgia inespecífica: Maniobra de bracing abdominal activando transverso abdominal y multífidos. Progresión a bird-dog y planchas laterales minimizando momento flexor lumbar.',
    department: 'kinesiology',
    category: 'protocols',
    section: 'Ejercicios Terapéuticos',
    language: 'es',
  },
  {
    chunkId: 'chk_hamstring_strain',
    documentId: 'doc_hamstring_rehab',
    documentTitle: 'Readaptación de Desgarros Isquiosurales',
    content:
      'Rehabilitación de desgarro en bíceps femoral: Priorizar contracciones excéntricas progresivas (Nordic Hamstring Curl y peso muerto rumano a una pierna) una vez restaurado el rango articular completo sin dolor.',
    department: 'kinesiology',
    category: 'protocols',
    section: 'Readaptación Excéntrica',
    language: 'es',
  },

  // --- 2. Appointment Scheduling ---
  {
    chunkId: 'chk_booking_rules',
    documentId: 'doc_scheduling_rules',
    documentTitle: 'Reglamento de Agendamiento y Reservas',
    content:
      'Reglas de agendamiento de turnos: Las sesiones de kinesiología y kinefilaxia pueden reservarse con hasta 14 días de anticipación mediante la aplicación móvil. Cada socio puede tener un máximo de 3 citas activas simultáneas.',
    department: 'scheduling',
    category: 'policy',
    section: 'Ventana de Reserva',
    language: 'es',
  },
  {
    chunkId: 'chk_rescheduling_turn',
    documentId: 'doc_scheduling_rules',
    documentTitle: 'Reglamento de Agendamiento y Reservas',
    content:
      'Procedimiento de reprogramación de turnos: Para modificar fecha u hora de una sesión sin penalidad, el paciente debe solicitar el cambio con al menos 12 horas de antelación. Se envía confirmación automática por WhatsApp y correo.',
    department: 'scheduling',
    category: 'policy',
    section: 'Reprogramaciones',
    language: 'es',
  },

  // --- 3. Gym Memberships ---
  {
    chunkId: 'chk_gym_plans',
    documentId: 'doc_gym_memberships',
    documentTitle: 'Planes y Membresías de Gimnasio',
    content:
      'Membresías Kynergy Gym: Plan Black incluye acceso ilimitado a zona de pesas, clases grupales y sauna. Plan Silver permite ingreso únicamente en horario valle de 10:00 a 16:00. El ingreso se valida por torniquete biométrico.',
    department: 'membership',
    category: 'pricing',
    section: 'Planes y Horarios',
    language: 'es',
  },
  {
    chunkId: 'chk_guest_passes',
    documentId: 'doc_gym_memberships',
    documentTitle: 'Planes y Membresías de Gimnasio',
    content:
      'Pases de invitado: Los titulares de Plan Black disponen de 2 invitaciones mensuales gratuitas para acompañantes. El invitado debe presentar documento de identidad y firmar el deslinde de responsabilidad física en recepción.',
    department: 'membership',
    category: 'policy',
    section: 'Beneficios Invitados',
    language: 'es',
  },

  // --- 4. Attendance Policies ---
  {
    chunkId: 'chk_client_attendance',
    documentId: 'doc_attendance_policy',
    documentTitle: 'Política de Asistencia y Tolerancia',
    content:
      'Control de asistencia de alumnos: Se otorga una tolerancia de 15 minutos de retraso para el inicio de la clase o sesión clínica. Pasado ese tiempo, el turno se registra como inasistencia injustificada y se descuenta del abono.',
    department: 'attendance',
    category: 'policy',
    section: 'Tolerancia y Tardanzas',
    language: 'es',
  },
  {
    chunkId: 'chk_staff_shifts',
    documentId: 'doc_attendance_policy',
    documentTitle: 'Política de Asistencia y Tolerancia',
    content:
      'Protocolo de ausencias de kinesiólogos y entrenadores: El profesional debe notificar su ausencia con un mínimo de 4 horas previas para coordinar kinesiólogo sustituto o reubicar pacientes sin alterar su tratamiento.',
    department: 'attendance',
    category: 'operations',
    section: 'Guardias y Reemplazos',
    language: 'es',
  },

  // --- 5. Inventory Management ---
  {
    chunkId: 'chk_physio_supplies',
    documentId: 'doc_inventory_management',
    documentTitle: 'Gestión y Reposición de Insumos Kinésicos',
    content:
      'Stock mínimo de insumos de fisioterapia: El gabinete debe mantener siempre al menos 10 rollos de kinesiotape neuromuscular, 5 cajas de agujas de punción seca esterilizadas y 3 galones de gel conductor de ultrasonido.',
    department: 'inventory',
    category: 'guidelines',
    section: 'Insumos Clínicos',
    language: 'es',
  },
  {
    chunkId: 'chk_equipment_maintenance',
    documentId: 'doc_inventory_management',
    documentTitle: 'Gestión y Reposición de Insumos Kinésicos',
    content:
      'Mantenimiento preventivo de maquinaria: Revisión semanal de cables de acero en poleas dobles, lubricación con silicona de guías en máquinas selectorizadas y calibración quincenal de dinamómetros isocinéticos.',
    department: 'inventory',
    category: 'maintenance',
    section: 'Mantenimiento Preventivo',
    language: 'es',
  },

  // --- 6. Sales and Payments ---
  {
    chunkId: 'chk_billing_pos',
    documentId: 'doc_billing_manual',
    documentTitle: 'Manual de Procedimientos de Caja y Facturación',
    content:
      'Procedimiento de cierre diario POS: Conciliar pagos en tarjeta de crédito, débito y transferencias bancarias contra el reporte X en el sistema de ventas antes de generar el balance Z fiscal obligatorio.',
    department: 'billing',
    category: 'procedures',
    section: 'Cierre de Caja',
    language: 'es',
  },
  {
    chunkId: 'chk_refund_policy',
    documentId: 'doc_billing_manual',
    documentTitle: 'Manual de Procedimientos de Caja y Facturación',
    content:
      'Política de devoluciones y reembolsos: Los reembolsos de paquetes de sesiones no utilizados aplican dentro de los primeros 10 días hábiles posteriores a la compra, aplicando una deducción del 10% por gastos administrativos.',
    department: 'billing',
    category: 'policy',
    section: 'Reembolsos',
    language: 'es',
  },

  // --- 7. Room Rentals ---
  {
    chunkId: 'chk_studio_rental',
    documentId: 'doc_room_rentals',
    documentTitle: 'Reglamento de Alquiler de Espacios y Salas',
    content:
      'Alquiler de sala multiuso para yoga y pilates: Tarifa de $35 USD por hora o bloque de 4 horas por $120 USD. Incluye uso de colchonetas, sistema de sonido bluetooth y climatización. Depósito de garantía requerido del 30%.',
    department: 'rentals',
    category: 'pricing',
    section: 'Sala Multiuso',
    language: 'es',
  },
  {
    chunkId: 'chk_equipment_rental',
    documentId: 'doc_room_rentals',
    documentTitle: 'Reglamento de Alquiler de Espacios y Salas',
    content:
      'Alquiler domiciliario de tecnología de recuperación: Botas de presoterapia NormaTec y electroestimuladores Compex disponibles por $25 USD/día con firma de pagaré y cheque de garantía por valor de reposición.',
    department: 'rentals',
    category: 'pricing',
    section: 'Equipamiento Domiciliario',
    language: 'es',
  },

  // --- 8. Food Services & Nutrition ---
  {
    chunkId: 'chk_smoothie_bar',
    documentId: 'doc_food_services',
    documentTitle: 'Operación del Bar Saludable y Cafetería',
    content:
      'Normas de higiene en Juice & Protein Bar: Manipulación obligatoria con guantes y cofia. La leche vegetal y de vaca deben almacenarse a menos de 4°C. Registro diario de temperatura en heladeras y etiquetado FIFO.',
    department: 'food_services',
    category: 'hygiene',
    section: 'Manipulación de Alimentos',
    language: 'es',
  },
  {
    chunkId: 'chk_nutrition_hypertrophy',
    documentId: 'doc_food_services',
    documentTitle: 'Operación del Bar Saludable y Cafetería',
    content:
      'Suplementación proteica en cafetería: Los batidos post-entrenamiento ofrecen opciones de proteína whey isolate y proteína vegana de arveja con 25g de proteína neta por porción y 5g de BCAA.',
    department: 'food_services',
    category: 'nutrition',
    section: 'Batidos Proteicos',
    language: 'es',
  },

  // --- 9. Internal Operational Documentation ---
  {
    chunkId: 'chk_emergency_aed',
    documentId: 'doc_emergency_operations',
    documentTitle: 'Protocolo de Emergencias y Seguridad Interna',
    content:
      'Ubicación y uso de Desfibrilador Externo Automático (DEA): Ubicado en pared principal junto al mostrador de recepción. En caso de paro cardiorrespiratorio, iniciar RCP (30:2) mientras un segundo socorrista activa el DEA y llama al 911.',
    department: 'operations',
    category: 'emergency',
    section: 'Primeros Auxilios DEA',
    language: 'es',
  },
  {
    chunkId: 'chk_incident_report',
    documentId: 'doc_emergency_operations',
    documentTitle: 'Protocolo de Emergencias y Seguridad Interna',
    content:
      'Reporte de incidentes y accidentes: Todo traumatismo, descompensación o caída dentro de las instalaciones debe asentarse en el Formulario F-09 antes de las 4 horas del suceso, adjuntando declaración de testigos.',
    department: 'operations',
    category: 'emergency',
    section: 'Reporte de Accidentes',
    language: 'es',
  },
]);

/**
 * 1. Development Dataset (Dev Split): 10 queries for rapid parameter iteration.
 */
export const DEV_SPLIT_QUERIES: readonly LabeledQuery[] = Object.freeze([
  {
    queryId: 'dev_q1_acl_crio',
    queryText: 'crioterapia e isométricos para ligamento cruzado fase 1',
    domainCategory: 'kinesiology',
    queryCategory: 'exact',
    language: 'es',
    groundTruthRelevance: { chk_acl_phase1: 3, chk_acl_phase2: 1 },
  },
  {
    queryId: 'dev_q2_hombro_rotadores',
    queryText: 'ejercicios manguito rotador síndrome subacromial',
    domainCategory: 'kinesiology',
    queryCategory: 'synonym',
    language: 'es',
    groundTruthRelevance: { chk_shoulder_impingement: 3 },
  },
  {
    queryId: 'dev_q3_horario_silver',
    queryText: 'a qué hora puedo entrenar con membresía plan silver',
    domainCategory: 'membership',
    queryCategory: 'section',
    language: 'es',
    groundTruthRelevance: { chk_gym_plans: 3 },
  },
  {
    queryId: 'dev_q4_alquiler_sala',
    queryText: 'precio por hora alquiler salón pilates y yoga',
    domainCategory: 'rentals',
    queryCategory: 'exact',
    language: 'es',
    groundTruthRelevance: { chk_studio_rental: 3 },
  },
  {
    queryId: 'dev_q5_cierre_pos_caja',
    queryText: 'pasos para cuadrar caja y balance Z fiscal del POS',
    domainCategory: 'billing',
    queryCategory: 'paraphrase',
    language: 'es',
    groundTruthRelevance: { chk_billing_pos: 3 },
  },
  {
    queryId: 'dev_q6_emergencia_dea',
    queryText: 'dónde está el desfibrilador automático en el gimnasio',
    domainCategory: 'operations',
    queryCategory: 'exact',
    language: 'es',
    groundTruthRelevance: { chk_emergency_aed: 3 },
  },
  {
    queryId: 'dev_q7_tardanza_turno',
    queryText: 'cuántos minutos de tolerancia hay antes de perder el turno',
    domainCategory: 'attendance',
    queryCategory: 'contextual',
    language: 'es',
    groundTruthRelevance: { chk_client_attendance: 3 },
  },
  {
    queryId: 'dev_q8_stock_agujas',
    queryText: 'cuántas cajas de agujas de punción seca deben quedar de stock mínimo',
    domainCategory: 'inventory',
    queryCategory: 'section',
    language: 'es',
    groundTruthRelevance: { chk_physio_supplies: 3 },
  },
  // Distractors
  {
    queryId: 'dev_q9_distractor_jardineria',
    queryText: 'cómo podar plantas de jardín con tijeras telescópicas',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
  {
    queryId: 'dev_q10_distractor_vuelo',
    queryText: 'aerolíneas internacionales vuelos baratos a roma y parís',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
]);

/**
 * 2. Validation Dataset (Val Split): 15 queries for threshold tuning and calibration.
 */
export const VALIDATION_SPLIT_QUERIES: readonly LabeledQuery[] = Object.freeze([
  // Positive Queries
  {
    queryId: 'val_q1_acl_fase_inicial',
    queryText: 'ejercicios fase inicial lca crioterapia e isométricos',
    domainCategory: 'kinesiology',
    queryCategory: 'exact',
    language: 'es',
    groundTruthRelevance: { chk_acl_phase1: 3, chk_acl_phase2: 1 },
  },
  {
    queryId: 'val_q2_hombro_manguito',
    queryText: 'rehabilitación manguito rotador síndrome subacromial decúbito lateral',
    domainCategory: 'kinesiology',
    queryCategory: 'exact',
    language: 'es',
    groundTruthRelevance: { chk_shoulder_impingement: 3 },
  },
  {
    queryId: 'val_q3_lumbalgia_core',
    queryText: 'fortalecimiento zona media lumbalgia ejercicios sin flexión lumbar',
    domainCategory: 'kinesiology',
    queryCategory: 'synonym',
    language: 'es',
    groundTruthRelevance: { chk_lumbar_core: 3 },
  },
  {
    queryId: 'val_q4_reagendar_sesion',
    queryText: 'con cuántas horas de anticipación puedo reprogramar una cita médica',
    domainCategory: 'scheduling',
    queryCategory: 'paraphrase',
    language: 'es',
    groundTruthRelevance: { chk_rescheduling_turn: 3, chk_booking_rules: 1 },
  },
  {
    queryId: 'val_q5_invitaciones_amigos',
    queryText: 'puedo llevar un acompañante gratis con mi plan de entrenamiento',
    domainCategory: 'membership',
    queryCategory: 'paraphrase',
    language: 'es',
    groundTruthRelevance: { chk_guest_passes: 3, chk_gym_plans: 1 },
  },
  {
    queryId: 'val_q6_reemplazo_profesional',
    queryText: 'aviso de ausencia de kinesiólogo para buscar sustituto',
    domainCategory: 'attendance',
    queryCategory: 'section',
    language: 'es',
    groundTruthRelevance: { chk_staff_shifts: 3 },
  },
  {
    queryId: 'val_q7_insumos_kinesiotape',
    queryText: 'reposición periódica rollos de cinta neuromuscular y gel',
    domainCategory: 'inventory',
    queryCategory: 'synonym',
    language: 'es',
    groundTruthRelevance: { chk_physio_supplies: 3 },
  },
  {
    queryId: 'val_q8_devolucion_paquete',
    queryText: 'plazo para pedir reintegro de dinero por clases no tomadas',
    domainCategory: 'billing',
    queryCategory: 'synonym',
    language: 'es',
    groundTruthRelevance: { chk_refund_policy: 3 },
  },
  {
    queryId: 'val_q9_alquiler_normatec',
    queryText: 'cómo alquilar botas de presoterapia para usar en mi casa',
    domainCategory: 'rentals',
    queryCategory: 'contextual',
    language: 'es',
    groundTruthRelevance: { chk_equipment_rental: 3 },
  },
  {
    queryId: 'val_q10_proteina_batidos',
    queryText: 'cuántos gramos de proteína traen los licuados del bar',
    domainCategory: 'food_services',
    queryCategory: 'exact',
    language: 'es',
    groundTruthRelevance: { chk_nutrition_hypertrophy: 3, chk_smoothie_bar: 1 },
  },
  {
    queryId: 'val_q11_accidente_socio',
    queryText: 'tiempo límite para presentar reporte por caída de paciente en recepción',
    domainCategory: 'operations',
    queryCategory: 'contextual',
    language: 'es',
    groundTruthRelevance: { chk_incident_report: 3 },
  },
  // Distractors
  {
    queryId: 'val_q12_distractor_cocina',
    queryText: 'receta para preparar pasta carbonara italiana con panceta y queso',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
  {
    queryId: 'val_q13_distractor_vuelo',
    queryText: 'reserva de pasajes de avión internacionales en clase ejecutiva',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
  {
    queryId: 'val_q14_distractor_cripto',
    queryText: 'minería de bitcoin y contratos inteligentes en blockchain ethereum',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
  {
    queryId: 'val_q15_distractor_astronomia',
    queryText: 'telescopio james webb distancia galaxias lejanas nebulosa',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
]);

/**
 * 3. Held-out Test Dataset (Test Split): 15 unseen queries for final verification.
 * Tests exact terminology, synonyms, paraphrasing, English, short, contextual, ambiguous, and distractors.
 */
export const HELD_OUT_TEST_SPLIT_QUERIES: readonly LabeledQuery[] = Object.freeze([
  // Positive Queries (In-domain)
  {
    queryId: 'test_q1_isquios_nordic',
    queryText: 'Nordic Hamstring Curl y contracciones excéntricas desgarro',
    domainCategory: 'kinesiology',
    queryCategory: 'exact',
    language: 'es',
    groundTruthRelevance: { chk_hamstring_strain: 3 },
  },
  {
    queryId: 'test_q2_acl_acute_en',
    queryText: 'Physical therapy exercises for acute anterior cruciate ligament sprain',
    domainCategory: 'kinesiology',
    queryCategory: 'multilingual',
    language: 'en',
    groundTruthRelevance: { chk_acl_phase1: 3, chk_acl_phase2: 1 },
  },
  {
    queryId: 'test_q3_cadena_cerrada',
    queryText: 'sentadilla unipodal y prensa semanas 3 a 6 ligamento cruzado',
    domainCategory: 'kinesiology',
    queryCategory: 'exact',
    language: 'es',
    groundTruthRelevance: { chk_acl_phase2: 3, chk_acl_phase1: 1 },
  },
  {
    queryId: 'test_q4_cuantas_citas_max',
    queryText: 'cuántos turnos puedo agendar al mismo tiempo en la app',
    domainCategory: 'scheduling',
    queryCategory: 'paraphrase',
    language: 'es',
    groundTruthRelevance: { chk_booking_rules: 3 },
  },
  {
    queryId: 'test_q5_plan_black_beneficios',
    queryText: 'qué incluye el plan black gimnasio sauna y clases',
    domainCategory: 'membership',
    queryCategory: 'section',
    language: 'es',
    groundTruthRelevance: { chk_gym_plans: 3, chk_guest_passes: 1 },
  },
  {
    queryId: 'test_q6_llego_tarde_sesion',
    queryText: 'qué pasa si llego 20 minutos tarde a mi kinesiología',
    domainCategory: 'attendance',
    queryCategory: 'contextual',
    language: 'es',
    groundTruthRelevance: { chk_client_attendance: 3 },
  },
  {
    queryId: 'test_q7_lubricacion_maquinas',
    queryText: 'frecuencia de engrase periodico para aparatos de musculacion',
    domainCategory: 'inventory',
    queryCategory: 'synonym',
    language: 'es',
    groundTruthRelevance: { chk_equipment_maintenance: 3 },
  },
  {
    queryId: 'test_q8_pos_cierre_diario',
    queryText: 'reporte X y balance Z facturación fiscal',
    domainCategory: 'billing',
    queryCategory: 'short',
    language: 'es',
    groundTruthRelevance: { chk_billing_pos: 3 },
  },
  {
    queryId: 'test_q9_rent_studio_en',
    queryText: 'Hourly booking rates for empty group fitness and dance room',
    domainCategory: 'rentals',
    queryCategory: 'multilingual',
    language: 'en',
    groundTruthRelevance: { chk_studio_rental: 3 },
  },
  {
    queryId: 'test_q10_leche_vegetal_temp',
    queryText: 'temperatura máxima de conservación leche en el bar',
    domainCategory: 'food_services',
    queryCategory: 'section',
    language: 'es',
    groundTruthRelevance: { chk_smoothie_bar: 3 },
  },
  {
    queryId: 'test_q11_paro_cardiaco_rcp',
    queryText: 'procedimiento de reanimación cardiopulmonar y desfibrilador',
    domainCategory: 'operations',
    queryCategory: 'paraphrase',
    language: 'es',
    groundTruthRelevance: { chk_emergency_aed: 3 },
  },
  // Distractor Queries (Out-of-domain)
  {
    queryId: 'test_q12_distractor_mecanica',
    queryText: 'reemplazo de bujías y filtro de aceite motor v6 automóvil',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
  {
    queryId: 'test_q13_distractor_jardin',
    queryText: 'poda de orquídeas y fertilizante para césped en primavera',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
  {
    queryId: 'test_q14_distractor_gaming',
    queryText: 'trucos para subir de nivel en elden ring jefe final dlc',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
  {
    queryId: 'test_q15_distractor_cuantica',
    queryText: 'entrelazamiento cuántico experimento de la doble rendija fotones',
    domainCategory: 'out_of_domain',
    queryCategory: 'distractor',
    language: 'es',
    groundTruthRelevance: {},
  },
]);
