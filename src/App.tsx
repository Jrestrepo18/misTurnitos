
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
