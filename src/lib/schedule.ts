import * as XLSX from 'xlsx';

export type ShiftCode = 'D' | 'C' | 'P' | 'N';
export type ShiftEvent = { auxiliary: string; date: string; codes: ShiftCode[]; zones: string[]; originalValue: string };
export type ParsedSchedule = { names: string[]; events: ShiftEvent[]; sourceName: string; monthLabel?: string };

const MONTHS: Record<string, number> = {
  enero: 0, ene: 0, january: 0, jan: 0,
  febrero: 1, feb: 1, february: 1,
  marzo: 2, mar: 2, march: 2,
  abril: 3, abr: 3, april: 3, apr: 3,
  mayo: 4, may: 4,
  junio: 5, jun: 5, june: 5,
  julio: 6, jul: 6, july: 6,
  agosto: 7, ago: 7, august: 7, aug: 7,
  septiembre: 8, setiembre: 8, sep: 8, sept: 8, september: 8,
  octubre: 9, oct: 9, october: 9,
  noviembre: 10, nov: 10, november: 10,
  diciembre: 11, dic: 11, december: 11, dec: 11
};

const IGNORE_LABELS = new Set([
  'AUXILIAR', 'AUXILIARES', 'NOMBRE', 'NOMBRES', 'TURNO', 'TURNOS', 'FECHA',
  'DIA', 'DÍA', 'NOVIEMBRE', 'OCTUBRE', 'SEPTIEMBRE', 'AGOSTO', 'JULIO',
  'JUNIO', 'MAYO', 'ABRIL', 'MARZO', 'FEBRERO', 'ENERO', 'DICIEMBRE',
  'TOTAL', 'OBSERVACIONES', 'OBSERVACION', 'OBSERVACIÓN', 'SEDE', 'URGENCIAS'
]);

const clean = (value: unknown) => String(value ?? '').replace(/\s+/g, ' ').trim();
const upper = (value: unknown) => clean(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

function parseMonthYear(grid: unknown[][], fallback = new Date()): { month: number; year: number } {
  const text = grid.slice(0, 12).flat().map(clean).join(' ').toLowerCase();
  const monthPattern = new RegExp(`(${Object.keys(MONTHS).sort((a,b) => b.length-a.length).join('|')})[\\s./-]*(20\\d{2})`, 'i');
  const match = text.match(monthPattern);
  if (match) return { month: MONTHS[match[1].toLowerCase()], year: Number(match[2]) };

  for (const row of grid.slice(0, 15)) {
    for (const value of row) {
      const date = parseFullDate(value);
      if (date) return { month: date.getMonth(), year: date.getFullYear() };
    }
  }
  return { month: fallback.getMonth(), year: fallback.getFullYear() };
}

function parseFullDate(value: unknown): Date | null {
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;
  const s = clean(value);
  if (!s) return null;
  let m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (m) {
    let year = Number(m[3]);
    if (year < 100) year += 2000;
    const date = new Date(year, Number(m[2]) - 1, Number(m[1]));
    if (date.getFullYear() === year && date.getMonth() === Number(m[2]) - 1 && date.getDate() === Number(m[1])) return date;
  }
  m = s.match(/^(20\d{2})-(\d{1,2})-(\d{1,2})/);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  const parsed = Date.parse(s);
  if (!Number.isNaN(parsed) && /\d/.test(s) && /[/-]|\b20\d{2}\b/.test(s)) return new Date(parsed);
  return null;
}

function getDay(value: unknown): number | null {
  const full = parseFullDate(value);
  if (full) return full.getDate();
  const s = clean(value);
  const m = s.match(/^(?:LUN(?:ES)?|MAR(?:TES)?|MIE(?:RCOLES)?|JUE(?:VES)?|VIE(?:RNES)?|SAB(?:ADO)?|DOM(?:INGO)?\s*)?(\d{1,2})$/i);
  if (m) {
    const day = Number(m[1]);
    return day >= 1 && day <= 31 ? day : null;
  }
  return null;
}

type ParsedCell = { codes: ShiftCode[]; zones: string[]; originalValue: string };

/**
 * Interpreta el contenido de una celda sin confundir turnos con códigos de zona.
 * - D, C, P y N aisladas son turnos.
 * - "/" representa posturno (P).
 * - Códigos como P123A, D04 o N-ZONA2 aportan su primera letra como turno
 *   y se conservan completos como zonas para verlos en el detalle.
 * - También reconoce las palabras completas DESCANSO, CORRIDO, POSTURNO y NOCHE.
 */
function parseCell(value: unknown): ParsedCell {
  const originalValue = String(value ?? '').trim();
  const normalized = originalValue
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toUpperCase();
  if (!normalized) return { codes: [], zones: [], originalValue };

  const found = new Set<ShiftCode>();
  const zones = new Set<string>();

  const fullWords: Array<[RegExp, ShiftCode]> = [
    [/\bDESCANSO\b/, 'D'],
    [/\bCORRIDO\b/, 'C'],
    [/\bPOSTURNO\b/, 'P'],
    [/\bNOCHE\b/, 'N']
  ];
  for (const [regex, code] of fullWords) {
    if (regex.test(normalized)) found.add(code);
  }

  // En el cuadro original la barra es el marcador de posturno, incluso si
  // está junto a otra marca (por ejemplo, D/).
  if (normalized.includes('/')) found.add('P');

  // Separamos por espacios y separadores comunes, manteniendo guiones/guiones bajos
  // dentro de códigos de zona como N-ZONA2 o C_04.
  const tokens = originalValue.split(/[\s,;|]+/).filter(Boolean);
  for (const originalToken of tokens) {
    const token = originalToken
      .replace(/^[([{]+|[)\]},;]+$/g, '')
      .toUpperCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
    if (!token) continue;

    const withoutTrailingSlash = token.replace(/\/$/, '');
    if (/^[DCNP]$/.test(withoutTrailingSlash)) {
      found.add(withoutTrailingSlash as ShiftCode);
      continue;
    }

    if (/^(DESCANSO|CORRIDO|POSTURNO|NOCHE)$/.test(token)) continue;

    // Si el código de zona comienza con D, C, P o N, esa primera letra
    // también identifica el turno del día. Conservamos el código completo
    // para mostrarlo en el detalle (por ejemplo, P123A -> turno P + zona P123A).
    if (/^[DCNP](?:[A-Z0-9]+|[-_][A-Z0-9]+)(?:[-_][A-Z0-9]+)*$/.test(token)) {
      found.add(token[0] as ShiftCode);
      zones.add(originalToken.replace(/^[([{]+|[)\]},;]+$/g, ''));
    }
  }

  return { codes: [...found], zones: [...zones], originalValue };
}

function hasAssignment(value: unknown): boolean {
  const parsed = parseCell(value);
  return parsed.codes.length > 0 || parsed.zones.length > 0;
}

function isPossibleName(value: unknown): boolean {
  const s = upper(value);
  if (!s || IGNORE_LABELS.has(s) || s.length < 3) return false;
  if (/^\d+$/.test(s) || parseFullDate(value)) return false;
  if (hasAssignment(value) && /^[DCNP0-9 /_-]+$/.test(s)) return false;
  if (/^(LUNES|MARTES|MIERCOLES|JUEVES|VIERNES|SABADO|DOMINGO)$/.test(s)) return false;
  return /[A-ZÁÉÍÓÚÑ]/i.test(s);
}

function isoDate(year: number, month: number, day: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseLongFormat(grid: unknown[][], monthYear: { month: number; year: number }): ShiftEvent[] {
  for (let r = 0; r < Math.min(grid.length, 15); r++) {
    const headers = grid[r].map(upper);
    const nameCol = headers.findIndex(h => /AUXILIAR|NOMBRE|EMPLEAD|PERSONA/.test(h));
    const dateCol = headers.findIndex(h => /FECHA|DIA|DÍA/.test(h));
    const shiftCol = headers.findIndex(h => /TURNO|CODIGO|CÓDIGO|JORNADA|NOVEDAD/.test(h));
    if (nameCol >= 0 && dateCol >= 0 && shiftCol >= 0) {
      const events: ShiftEvent[] = [];
      for (const row of grid.slice(r + 1)) {
        const name = clean(row[nameCol]);
        const date = parseFullDate(row[dateCol]);
        const day = date?.getDate() ?? getDay(row[dateCol]);
        const month = date?.getMonth() ?? monthYear.month;
        const year = date?.getFullYear() ?? monthYear.year;
        if (!name || !day) continue;
        const parsed = parseCell(row[shiftCol]);
        if (parsed.codes.length || parsed.zones.length) events.push({ auxiliary: name, date: isoDate(year, month, day), ...parsed });
      }
      if (events.length) return events;
    }
  }
  return [];
}

export function parseScheduleGrid(grid: unknown[][], sourceName = 'Cuadro de turnos'): ParsedSchedule {
  const rows = grid.map(row => Array.isArray(row) ? row : []);
  const monthYear = parseMonthYear([[sourceName], ...rows]);

  const longEvents = parseLongFormat(rows, monthYear);
  if (longEvents.length) {
    const names = [...new Set(longEvents.map(e => e.auxiliary))].sort((a, b) => a.localeCompare(b, 'es'));
    return { names, events: longEvents, sourceName, monthLabel: new Date(monthYear.year, monthYear.month, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' }) };
  }

  let headerIndex = -1;
  let bestScore = 0;
  let dateColumns: Array<{ col: number; day: number; date?: Date }> = [];
  rows.slice(0, 35).forEach((row, index) => {
    const found = row.map((value, col) => ({ col, day: getDay(value), date: parseFullDate(value) }))
      .filter(item => item.day !== null) as Array<{ col: number; day: number; date?: Date }>;
    // El encabezado suele tener varios días distribuidos horizontalmente.
    const score = found.length;
    if (score > bestScore) {
      bestScore = score;
      headerIndex = index;
      dateColumns = found;
    }
  });

  const events: ShiftEvent[] = [];
  const names = new Set<string>();
  if (headerIndex >= 0 && bestScore >= 3) {
    const firstDateCol = Math.min(...dateColumns.map(d => d.col));
    let currentName = '';
    for (const row of rows.slice(headerIndex + 1)) {
      const beforeDates = row.slice(0, firstDateCol);
      let rowName = '';
      for (const value of beforeDates) {
        if (isPossibleName(value)) { rowName = clean(value); break; }
      }
      const rowHasShift = dateColumns.some(d => hasAssignment(row[d.col]));
      if (rowName) currentName = rowName;
      if (!currentName || !rowHasShift) continue;
      names.add(currentName);
      for (const dateColumn of dateColumns) {
        const parsed = parseCell(row[dateColumn.col]);
        if (!parsed.codes.length && !parsed.zones.length) continue;
        const date = dateColumn.date;
        const month = date?.getMonth() ?? monthYear.month;
        const year = date?.getFullYear() ?? monthYear.year;
        events.push({ auxiliary: currentName, date: isoDate(year, month, dateColumn.day), ...parsed });
      }
    }
  }

  // Formato transpuesto: auxiliares en columnas y fechas en filas.
  if (!events.length && rows.length > 1) {
    let bestDateCol = -1;
    let bestDateScore = 0;
    for (let col = 0; col < Math.min(8, Math.max(...rows.map(r => r.length))); col++) {
      const score = rows.slice(1).filter(row => getDay(row[col]) !== null).length;
      if (score > bestDateScore) { bestDateScore = score; bestDateCol = col; }
    }
    let namesHeader = -1;
    let nameColumns: Array<{ col: number; name: string }> = [];
    for (let r = 0; r < Math.min(12, rows.length); r++) {
      const found = rows[r].map((value, col) => ({ col, name: clean(value) }))
        .filter(item => item.col !== bestDateCol && isPossibleName(item.name));
      if (found.length > nameColumns.length) { namesHeader = r; nameColumns = found; }
    }
    if (bestDateCol >= 0 && bestDateScore >= 3 && namesHeader >= 0 && nameColumns.length >= 2) {
      for (const row of rows.slice(namesHeader + 1)) {
        const fullDate = parseFullDate(row[bestDateCol]);
        const day = fullDate?.getDate() ?? getDay(row[bestDateCol]);
        if (!day) continue;
        const month = fullDate?.getMonth() ?? monthYear.month;
        const year = fullDate?.getFullYear() ?? monthYear.year;
        for (const item of nameColumns) {
          const parsed = parseCell(row[item.col]);
          if (!parsed.codes.length && !parsed.zones.length) continue;
          names.add(item.name);
          events.push({ auxiliary: item.name, date: isoDate(year, month, day), ...parsed });
        }
      }
    }
  }

  // Respaldo para cuadros donde los días están en la primera fila y el nombre en la primera columna.
  if (!events.length && rows.length > 1) {
    const header = rows.findIndex(row => row.filter(v => getDay(v) !== null).length >= 3);
    if (header >= 0) {
      const dateCols = rows[header].map((v, col) => ({ col, day: getDay(v) })).filter(v => v.day !== null) as Array<{col:number;day:number}>;
      for (const row of rows.slice(header + 1)) {
        const name = row.map(clean).find(v => isPossibleName(v));
        if (!name) continue;
        const nameIndex = row.findIndex(v => clean(v) === name);
        const shiftedColumns = dateCols.filter(d => d.col > nameIndex);
        for (const dc of shiftedColumns) {
          const parsed = parseCell(row[dc.col]);
          if (parsed.codes.length || parsed.zones.length) {
            events.push({ auxiliary: name, date: isoDate(monthYear.year, monthYear.month, dc.day), ...parsed });
          }
        }
        if (shiftedColumns.some(dc => hasAssignment(row[dc.col]))) names.add(name);
      }
    }
  }

  const uniqueEvents = [...new Map(events.map(e => [`${upper(e.auxiliary)}|${e.date}|${e.codes.join('')}|${e.zones.join(',')}|${e.originalValue}`, e])).values()];
  const sortedNames = [...new Set([...names, ...uniqueEvents.map(e => e.auxiliary)])].sort((a, b) => a.localeCompare(b, 'es'));
  return {
    names: sortedNames,
    events: uniqueEvents,
    sourceName,
    monthLabel: new Date(monthYear.year, monthYear.month, 1).toLocaleDateString('es-CO', { month: 'long', year: 'numeric' })
  };
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '"') {
      if (quoted && text[i + 1] === '"') { cell += '"'; i++; }
      else quoted = !quoted;
    } else if (ch === ',' && !quoted) {
      row.push(cell); cell = '';
    } else if ((ch === '\n' || ch === '\r') && !quoted) {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); cell = '';
      if (row.some(v => clean(v))) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some(v => clean(v))) rows.push(row);
  return rows;
}

export async function parseExcelFile(file: File, preferredSheet = ''): Promise<ParsedSchedule> {
  const buffer = await file.arrayBuffer();
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
  const preferred = preferredSheet.trim().toLocaleLowerCase('es');
  const orderedSheets = preferred
    ? [...workbook.SheetNames].sort((a, b) => Number(b.toLocaleLowerCase('es').includes(preferred)) - Number(a.toLocaleLowerCase('es').includes(preferred)))
    : workbook.SheetNames;

  for (const sheetName of orderedSheets) {
    const sheet = workbook.Sheets[sheetName];
    const grid = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' }) as unknown[][];
    const parsed = parseScheduleGrid(grid, `${file.name} · ${sheetName}`);
    if (parsed.names.length && parsed.events.length) return parsed;
  }
  return { names: [], events: [], sourceName: file.name };
}

function getSpreadsheetId(url: string): string | null {
  return url.match(/spreadsheets\/(?:u\/\d+\/)?d\/([a-zA-Z0-9-_]+)/)?.[1] ?? null;
}

function getGid(url: string): string | null {
  return url.match(/[?#&]gid=(\d+)/)?.[1] ?? null;
}

export async function fetchGoogleSheet(url: string, sheetName = ''): Promise<ParsedSchedule> {
  const id = getSpreadsheetId(url);
  if (!id) throw new Error('El enlace no parece ser de Google Sheets. Revisa que hayas copiado el enlace completo.');
  const gid = getGid(url);
  const attempts: Array<() => Promise<ParsedSchedule>> = [];

  // Exportar como Excel permite recorrer todas las pestañas del documento.
  attempts.push(async () => {
    const response = await fetch(`https://docs.google.com/spreadsheets/d/${id}/export?format=xlsx${gid ? `&gid=${gid}` : ''}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Google respondió ${response.status}`);
    const blob = await response.blob();
    const file = new File([blob], 'Cuadro de turnos.xlsx', { type: blob.type });
    return parseExcelFile(file, sheetName);
  });

  // Alternativa CSV para hojas compartidas públicamente.
  attempts.push(async () => {
    const base = `https://docs.google.com/spreadsheets/d/${id}/gviz/tq?tqx=out:csv`;
    const query = sheetName ? `&sheet=${encodeURIComponent(sheetName)}` : (gid ? `&gid=${gid}` : '');
    const response = await fetch(`${base}${query}`, { cache: 'no-store' });
    if (!response.ok) throw new Error(`Google respondió ${response.status}`);
    const text = await response.text();
    if (/<html|accounts\.google\.com/i.test(text.slice(0, 500))) throw new Error('Google solicita iniciar sesión. El documento debe permitir lectura con el enlace.');
    return parseScheduleGrid(parseCsv(text), 'Google Sheets');
  });

  let lastError: unknown;
  for (const attempt of attempts) {
    try {
      const parsed = await attempt();
      if (parsed.names.length && parsed.events.length) return parsed;
      lastError = new Error('Se pudo abrir el documento, pero no reconocí la distribución de nombres, fechas y turnos.');
    } catch (error) { lastError = error; }
  }
  if (lastError instanceof Error && /Failed to fetch|NetworkError|Load failed/i.test(lastError.message)) {
    throw new Error('No se pudo leer el enlace. Comprueba que Google Sheets esté compartido como “Cualquier persona con el enlace · Lector” y vuelve a intentarlo.');
  }
  throw lastError instanceof Error ? lastError : new Error('No se pudo interpretar el cuadro. Prueba cargar el archivo Excel.');
}
