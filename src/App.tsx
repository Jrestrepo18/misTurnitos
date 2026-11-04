import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CircleHelp,
  CloudDownload, FileSpreadsheet, Heart, LoaderCircle, Moon, RefreshCw,
  Settings2, Sparkles, Upload, UserRound, X, WifiOff
} from 'lucide-react';
import { fetchGoogleSheet, parseExcelFile, type ParsedSchedule, type ShiftCode, type ShiftEvent } from './lib/schedule';

const DEFAULT_SOURCE_URL = 'https://docs.google.com/spreadsheets/u/0/d/1IK8wEXTsn9azsjrpUjzKgCDS-iBbV8T_/htmlview?pli=1';
const STORAGE_DATA = 'mis-turnitos-data-v1';
const STORAGE_AUX = 'mis-turnitos-aux-v2';
const LEGACY_STORAGE_AUX = 'mis-turnitos-aux-v1';
const STORAGE_SOURCE = 'mis-turnitos-source-v1';
const STORAGE_SHEET = 'mis-turnitos-sheet-v1';

const SHIFT_INFO: Record<ShiftCode, { label: string; color: string; description: string }> = {
  D: { label: 'Descanso', color: 'rest', description: 'Día de descanso' },
  C: { label: 'Corrido', color: 'corrido', description: 'Turno corrido' },
  P: { label: 'Posturno', color: 'posturno', description: 'Día de posturno' },
  N: { label: 'Noche', color: 'night', description: 'Turno de noche' }
};

const monthName = (date: Date) => date.toLocaleDateString('es-CO', { month: 'long', year: 'numeric' });
const dateKey = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const dateFromKey = (key: string) => {
  const [year, month, day] = key.split('-').map(Number);
  return new Date(year, month - 1, day);
};
const sameDay = (a: Date, b: Date) => dateKey(a) === dateKey(b);
const initials = (name: string) => name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();

// Compara nombres aunque el Excel traiga espacios dobles, tildes o mayúsculas distintas.
const normalizeAuxName = (name: string) => name
  .trim()
  .replace(/\s+/g, ' ')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLocaleLowerCase('es');

function readSavedAuxiliary(): string {
  try {
    // La clave v1 se conserva como respaldo para no perder selecciones anteriores.
    return localStorage.getItem(STORAGE_AUX) || localStorage.getItem(LEGACY_STORAGE_AUX) || '';
  } catch { return ''; }
}

function persistAuxiliary(name: string) {
  try {
    localStorage.setItem(STORAGE_AUX, name);
    localStorage.setItem(LEGACY_STORAGE_AUX, name);
  } catch {
    // La app sigue funcionando aunque el navegador restrinja el almacenamiento.
  }
}

function loadSavedData(): ParsedSchedule | null {
  try {
    const raw = localStorage.getItem(STORAGE_DATA);
    return raw ? JSON.parse(raw) as ParsedSchedule : null;
  } catch { return null; }
}

function saveData(data: ParsedSchedule) {
  localStorage.setItem(STORAGE_DATA, JSON.stringify(data));
}

function App() {
  const [today, setToday] = useState(() => new Date());
  const [schedule, setSchedule] = useState<ParsedSchedule | null>(null);
  const [selectedAux, setSelectedAux] = useState(() => readSavedAuxiliary());
  const [sourceUrl, setSourceUrl] = useState(() => localStorage.getItem(STORAGE_SOURCE) || DEFAULT_SOURCE_URL);
  const [sheetName, setSheetName] = useState(() => localStorage.getItem(STORAGE_SHEET) || '');
  const [viewDate, setViewDate] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState(() => dateKey(today));
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [lastSync, setLastSync] = useState(() => localStorage.getItem('mis-turnitos-sync-v1') || '');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [setupName, setSetupName] = useState('');
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showSourceHelp, setShowSourceHelp] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const syncFromLink = useCallback(async (url: string, tab: string, quiet = false) => {
    setIsLoading(true);
    setError('');
    if (!quiet) setNotice('Conectando con el cuadro de turnos…');
    try {
      const fresh = await fetchGoogleSheet(url, tab);
      if (!fresh.events.length || !fresh.names.length) throw new Error('Encontré el documento, pero todavía no puedo reconocer sus turnos. Prueba subir el Excel para ajustar el lector al formato.');
      setSchedule(fresh);
      saveData(fresh);
      // No borrar la auxiliar guardada cuando se actualiza el Excel.
      // Algunos cuadros cambian tildes, espacios o incluso el formato del nombre
      // de un mes a otro; pedir que la persona se identifique en cada apertura
      // sería molesto. Solo actualizamos el nombre a su versión canónica si
      // encontramos una coincidencia normalizada. Si no existe, conservamos
      // la selección y mostramos el calendario sin turnos hasta que coincida.
      const currentAux = readSavedAuxiliary() || selectedAux;
      if (currentAux) {
        const matchingName = fresh.names.find(name => normalizeAuxName(name) === normalizeAuxName(currentAux));
        const savedName = matchingName || currentAux;
        setSelectedAux(savedName);
        persistAuxiliary(savedName);
      }
      // Al actualizar el cuadro no cambiamos el día que está consultando.
      // Al iniciar la app, la selección predeterminada ya es la fecha de hoy.
      const now = new Date().toISOString();
      setLastSync(now);
      localStorage.setItem('mis-turnitos-sync-v1', now);
      setNotice('¡Turnos actualizados! ♡');
    } catch (err) {
      const message = err instanceof Error ? err.message : 'No se pudo actualizar el cuadro.';
      setError(message);
      if (schedule || loadSavedData()) setNotice('No se pudo actualizar. Mostrando el último calendario guardado.');
      else setNotice('No se pudo cargar el cuadro automáticamente. Puedes subir el Excel.');
    } finally {
      setIsLoading(false);
    }
  }, [schedule, selectedAux]);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    const cached = loadSavedData();
    if (cached) {
      // Conservamos la fecha de hoy definida al inicializar el estado,
      // en lugar de saltar al primer día disponible del archivo anterior.
      setSchedule(cached);
    }
    if (navigator.onLine) void syncFromLink(sourceUrl, sheetName, true);
    else if (cached) setNotice('Sin conexión: estás viendo el último calendario guardado.');
  }, []); // La carga inicial solo debe ejecutarse una vez.

  useEffect(() => {
    // Al volver a abrir/reanudar la PWA, regresar al día y mes actuales.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return;
      const current = new Date();
      setToday(current);
      setViewDate(new Date(current.getFullYear(), current.getMonth(), 1));
      setSelectedDate(dateKey(current));
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, []);

  useEffect(() => {
    const onOnline = () => { setIsOffline(false); void syncFromLink(sourceUrl, sheetName, true); };
    const onOffline = () => { setIsOffline(true); setNotice('Sin conexión: se conserva el último calendario guardado.'); };
    const onInstall = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    window.addEventListener('beforeinstallprompt', onInstall);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
      window.removeEventListener('beforeinstallprompt', onInstall);
    };
  }, [sourceUrl, sheetName, syncFromLink]);

  const myEvents = useMemo(() => schedule?.events.filter(event =>
    selectedAux && normalizeAuxName(event.auxiliary) === normalizeAuxName(selectedAux)
  ) ?? [], [schedule, selectedAux]);

  const monthEvents = useMemo(() => myEvents.filter(event => {
    const d = dateFromKey(event.date);
    return d.getFullYear() === viewDate.getFullYear() && d.getMonth() === viewDate.getMonth();
  }), [myEvents, viewDate]);

  const selectedDayEvents = useMemo(() => myEvents.filter(event => event.date === selectedDate), [myEvents, selectedDate]);
  const eventMap = useMemo(() => {
    const map = new Map<string, ShiftCode[]>();
    for (const event of monthEvents) {
      const codes = map.get(event.date) || [];
      const savedCodes: ShiftCode[] = event.codes ?? ((event as any).code ? [(event as any).code as ShiftCode] : []);
      for (const code of savedCodes) {
        if (code && !codes.includes(code)) codes.push(code);
      }
      map.set(event.date, codes);
    }
    return map;
  }, [monthEvents]);

  const calendarCells = useMemo(() => {
    const first = new Date(viewDate.getFullYear(), viewDate.getMonth(), 1);
    const daysInMonth = new Date(viewDate.getFullYear(), viewDate.getMonth() + 1, 0).getDate();
    const mondayOffset = (first.getDay() + 6) % 7;
    const count = Math.ceil((mondayOffset + daysInMonth) / 7) * 7;
    return Array.from({ length: count }, (_, index) => {
      const day = index - mondayOffset + 1;
      return day < 1 || day > daysInMonth ? null : new Date(viewDate.getFullYear(), viewDate.getMonth(), day);
    });
  }, [viewDate]);

  const refresh = () => void syncFromLink(sourceUrl, sheetName);
  const chooseAux = (name: string) => {
    setSelectedAux(name);
    persistAuxiliary(name);
    setSetupName('');
    setSettingsOpen(false);
    setViewDate(new Date(today.getFullYear(), today.getMonth(), 1));
    setSelectedDate(dateKey(today));
  };

  const uploadExcel = async (file?: File) => {
    if (!file) return;
    setIsLoading(true);
    setError('');
    setNotice(`Leyendo ${file.name}…`);
    try {
      const parsed = await parseExcelFile(file);
      if (!parsed.names.length || !parsed.events.length) {
        throw new Error('El archivo se abrió, pero no pude identificar automáticamente los nombres, las fechas y los códigos D/C/P/N. Necesito revisar la estructura del Excel para ajustar el importador.');
      }
      setSchedule(parsed);
      saveData(parsed);
      // Tras importar, mantenemos visible el mes actual y el día de hoy.
      // La importación de un nuevo mes tampoco debe borrar la auxiliar elegida.
      if (selectedAux) {
        const matchingName = parsed.names.find(name => normalizeAuxName(name) === normalizeAuxName(selectedAux));
        if (matchingName) { setSelectedAux(matchingName); persistAuxiliary(matchingName); }
      }
      const now = new Date().toISOString();
      setLastSync(now); localStorage.setItem('mis-turnitos-sync-v1', now);
      setNotice('¡Excel cargado y calendario guardado en este celular! ♡');
      setSettingsOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo leer el Excel.');
    } finally {
      setIsLoading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  const saveSettings = () => {
    try {
      localStorage.setItem(STORAGE_SOURCE, sourceUrl.trim());
      localStorage.setItem(STORAGE_SHEET, sheetName.trim());
    } catch { /* La app puede seguir funcionando aunque el almacenamiento esté restringido. */ }
    setSettingsOpen(false);
    void syncFromLink(sourceUrl.trim(), sheetName.trim());
  };

  const changeMonth = (amount: number) => {
    setViewDate(new Date(viewDate.getFullYear(), viewDate.getMonth() + amount, 1));
  };

  const todayKey = dateKey(today);
  const friendlySelectedDate = dateFromKey(selectedDate).toLocaleDateString('es-CO', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-mark"><CalendarDays size={21} strokeWidth={1.9} /></div>
        <div className="brand-copy"><span>MI ESPACIO</span><strong>mis turnitos <span className="brand-heart">♡</span></strong></div>
        <div className="topbar-actions">
          {isOffline && <span className="offline-dot" title="Sin conexión"><WifiOff size={15} /></span>}
          <button className="icon-button" aria-label="Configuración" onClick={() => setSettingsOpen(true)}><Settings2 size={20} /></button>
        </div>
      </header>

      <main className="main-content">
        <section className="welcome-row">
          <div>
            <p className="eyebrow">TU CALENDARIO PERSONAL</p>
            <p className="muted">Aquí tienes tus turnos organizaditos.</p>
          </div>
          <div className="welcome-flower" aria-hidden="true"><span>✿</span></div>
        </section>

        {schedule && schedule.names.length > 0 ? (
          <button className="auxiliary-pill" onClick={() => setSettingsOpen(true)}>
            <span className="avatar"><UserRound size={17} /></span>
            <span className="auxiliary-label"><small>ESTE CALENDARIO ES DE</small><strong>{selectedAux || 'Selecciona tu nombre'}</strong></span>
            <ChevronDown size={17} className="pill-chevron" />
          </button>
        ) : null}

        {!schedule && (
          <section className="import-card">
            <div className="import-illustration"><FileSpreadsheet size={28} /></div>
            <div className="import-copy">
              <h2>{isLoading ? 'Conectando con tus turnos…' : 'Vamos a traer tu calendario'}</h2>
              <p>{isLoading ? 'Estoy leyendo el cuadro compartido.' : 'La primera vez necesito leer el cuadro para encontrar tu nombre y organizar las fechas.'}</p>
            </div>
            {isLoading ? <LoaderCircle className="spin" size={20} /> : <button className="primary-button" onClick={refresh}><RefreshCw size={16} /> Intentar de nuevo</button>}
            <button className="text-button" onClick={() => fileRef.current?.click()}><Upload size={16} /> O subir el archivo Excel</button>
          </section>
        )}

        {schedule && !selectedAux && (
          <section className="choose-card">
            <div className="choose-icon"><Heart size={23} /></div>
            <h2>Primero, ¿quién eres?</h2>
            <p>Selecciona tu nombre para mostrar solamente tus turnos. Lo guardaré en este celular.</p>
            <select value={setupName} onChange={e => setSetupName(e.target.value)} aria-label="Selecciona tu nombre">
              <option value="">Seleccionar auxiliar…</option>
              {schedule.names.map(name => <option key={name} value={name}>{name}</option>)}
            </select>
            <button className="primary-button full" disabled={!setupName} onClick={() => chooseAux(setupName)}>Este es mi calendario <Heart size={16} /></button>
          </section>
        )}

        {schedule && selectedAux && (
          <>
            <section className="calendar-card">
              <div className="calendar-heading">
                <div>
                  <p className="eyebrow">TUS TURNOS DE</p>
                  <h2>{monthName(viewDate)}</h2>
                </div>
                <div className="month-controls">
                  <button className="month-arrow" onClick={() => changeMonth(-1)} aria-label="Mes anterior"><ArrowLeft size={18} /></button>
                  <button className="month-arrow" onClick={() => changeMonth(1)} aria-label="Mes siguiente"><ArrowRight size={18} /></button>
                </div>
              </div>

              <div className="weekdays">
                {['L', 'M', 'M', 'J', 'V', 'S', 'D'].map((day, i) => <div key={`${day}-${i}`}>{day}</div>)}
              </div>
              <div className="calendar-grid">
                {calendarCells.map((date, index) => {
                  if (!date) return <div className="calendar-empty" key={`empty-${index}`} />;
                  const key = dateKey(date);
                  const codes = eventMap.get(key) || [];
                  const isSelected = selectedDate === key;
                  const isToday = sameDay(date, today);
                  return (
                    <button key={key} className={`day-cell ${isSelected ? 'selected' : ''} ${isToday ? 'today' : ''} ${codes.length ? 'has-shift' : ''}`} onClick={() => setSelectedDate(key)}>
                      <span className="day-number">{date.getDate()}</span>
                      <span className="day-codes">
                        {codes.slice(0, 3).map(code => <span key={code} className={`shift-dot ${SHIFT_INFO[code].color}`}>{code}</span>)}
                      </span>
                    </button>
                  );
                })}
              </div>

              <div className="legend">
                <span className="legend-title">TU LEYENDA</span>
                {(Object.keys(SHIFT_INFO) as ShiftCode[]).map(code => (
                  <span className="legend-item" key={code}><b className={`shift-dot ${SHIFT_INFO[code].color}`}>{code}</b><span>{SHIFT_INFO[code].label}</span></span>
                ))}
              </div>
            </section>

            <section className="day-detail">
              <div className="detail-heading">
                <div><p className="eyebrow">DETALLE DEL DÍA</p><h3>{friendlySelectedDate}</h3></div>
                {selectedDate === todayKey && <span className="today-tag"><Sparkles size={13} /> HOY</span>}
              </div>
              {selectedDayEvents.length ? (
                <div className="detail-shifts">
                  {selectedDayEvents.map((event, index) => {
                    // Compatibilidad con calendarios guardados por versiones anteriores.
                    const eventCodes: ShiftCode[] = event.codes || ((event as any).code ? [(event as any).code] : []);
                    const zones: string[] = event.zones || [];
                    return (
                      <div className="detail-entry" key={`${event.date}-${event.originalValue || eventCodes.join('')}-${index}`}>
                        {eventCodes.map(code => (
                          <div className={`detail-shift ${SHIFT_INFO[code].color}`} key={code}>
                            <span className={`detail-code ${SHIFT_INFO[code].color}`}>{code}</span>
                            <span><strong>{SHIFT_INFO[code].label}</strong><small>{SHIFT_INFO[code].description}</small></span>
                            <Check size={17} className="detail-check" />
                          </div>
                        ))}
                        {zones.length > 0 && (
                          <div className="zone-detail">
                            <span className="zone-detail-label">ZONA / CÓDIGO</span>
                            <div className="zone-code-list">
                              {zones.map((zone, zoneIndex) => <span className="zone-code" key={`${zone}-${zoneIndex}`}>{zone}</span>)}
                            </div>
                          </div>
                        )}
                        {event.originalValue && zones.length > 0 && (
                          <p className="original-value">Dato original del cuadro: <strong>{event.originalValue}</strong></p>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="no-shift"><span>☁</span><div><strong>No hay turno registrado</strong><small>Este día no tiene una inicial en el cuadro.</small></div></div>
              )}
            </section>

            <div className="sync-row">
              <span>{lastSync ? `Última actualización: ${new Date(lastSync).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}` : 'Calendario guardado en este celular'}</span>
              <button onClick={refresh} disabled={isLoading || isOffline}><RefreshCw size={14} className={isLoading ? 'spin' : ''} /> Actualizar</button>
            </div>
          </>
        )}

        {notice && <div className={`notice ${error ? 'notice-warning' : ''}`}><span>{error ? <CircleHelp size={15} /> : <Check size={15} />}</span><p>{error || notice}</p><button aria-label="Cerrar aviso" onClick={() => { setNotice(''); setError(''); }}><X size={15} /></button></div>}

        <footer className="footer-note"><Heart size={13} fill="currentColor" /> Hecho con cariño, solo para ti.</footer>
      </main>

      <input ref={fileRef} className="hidden-input" type="file" accept=".xlsx,.xls,.csv" onChange={e => e.target.files?.[0] && void uploadExcel(e.target.files[0])} />

      {settingsOpen && (
        <div className="modal-backdrop" onClick={() => setSettingsOpen(false)}>
          <section className="settings-sheet" onClick={e => e.stopPropagation()}>
            <div className="sheet-handle" />
            <div className="settings-header"><div><p className="eyebrow">PERSONALIZA TU APP</p><h2>Mis ajustes <span>♡</span></h2></div><button className="icon-button" onClick={() => setSettingsOpen(false)} aria-label="Cerrar"><X size={20} /></button></div>
            {schedule && <div className="setting-group"><label>Mi auxiliar</label><select value={selectedAux} onChange={e => chooseAux(e.target.value)}><option value="">Seleccionar auxiliar…</option>{schedule.names.map(name => <option value={name} key={name}>{name}</option>)}</select><small>Tu selección queda guardada en este dispositivo.</small></div>}
            <div className="setting-group"><label>Enlace del cuadro de turnos</label><input type="url" value={sourceUrl} onChange={e => setSourceUrl(e.target.value)} placeholder="Pega aquí el enlace de Google Sheets" /><small>Se guarda una sola vez. Si actualizan el mismo documento, no tendrás que cambiarlo.</small></div>
            <div className="setting-group"><label>Nombre de la pestaña (opcional)</label><input type="text" value={sheetName} onChange={e => setSheetName(e.target.value)} placeholder="Ej. AUX URG NOVIEMBRE SEDE 80" /><small>Déjalo vacío para que la app intente leer la primera pestaña.</small></div>
            <button className="secondary-button" onClick={() => setShowSourceHelp(!showSourceHelp)}><CircleHelp size={16} /> ¿Cómo debe estar compartido el documento?</button>
            {showSourceHelp && <div className="help-panel">En Google Sheets: <b>Compartir → Acceso general → Cualquier persona con el enlace → Lector</b>. Esto permite que el calendario lea el documento sin pedir una contraseña. No compartas datos privados si no deben ser visibles para quien tenga el enlace.</div>}
            <div className="settings-actions"><button className="outline-button" onClick={() => fileRef.current?.click()}><Upload size={16} /> Subir Excel</button><button className="primary-button" onClick={saveSettings} disabled={!sourceUrl.trim()}><CloudDownload size={16} /> Guardar y actualizar</button></div>
            {installPrompt && <button className="install-button" onClick={async () => { await installPrompt.prompt(); setInstallPrompt(null); }}><CalendarDays size={16} /> Instalar en este celular</button>}
            <p className="privacy-note"><Moon size={13} /> Tus turnos y tu nombre se guardan localmente en este celular.</p>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
