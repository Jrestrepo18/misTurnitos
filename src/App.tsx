import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft, ArrowRight, CalendarDays, Check, ChevronDown, CircleHelp,
  CloudDownload, FileSpreadsheet, Heart, LoaderCircle, Moon, RefreshCw,
  Settings2, Sparkles, Upload, UserRound, X, WifiOff, Link2, ShieldCheck
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
  const [settingsAux, setSettingsAux] = useState(() => readSavedAuxiliary());
  const [advancedOpen, setAdvancedOpen] = useState(false);
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
