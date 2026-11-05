/* Interfaccia di GPG Turni (PWA per iPhone). Dati salvati in localStorage. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const euro = (x) => x.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
  const num = (x) => x.toFixed(2).replace('.', ',');
  const fmtData = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`;

  // ------------------------------------------------------------ persistenza
  const K_TURNI = 'gpg_turni_v1', K_SET = 'gpg_settings_v1';
  let db = { next: 1, turni: [] };
  let s = JSON.parse(JSON.stringify(GPG.DEFAULTS));
  let sel = null; // id turno selezionato

  function carica() {
    try { db = JSON.parse(localStorage.getItem(K_TURNI)) || db; } catch (e) { /* archivio vuoto */ }
    try { Object.assign(s, JSON.parse(localStorage.getItem(K_SET)) || {}); } catch (e) { /* default */ }
  }
  const salvaDb = () => localStorage.setItem(K_TURNI, JSON.stringify(db));
  const salvaSet = () => localStorage.setItem(K_SET, JSON.stringify(s));

  function aggiungiTurno(t, evitaDoppioni) {
    if (evitaDoppioni && db.turni.some((x) => x.data === t.data && x.inizio === t.inizio && x.fine === t.fine && x.tipo === t.tipo))
      return false;
    t.id = db.next++;
    db.turni.push(t);
    db.turni.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : a.id - b.id));
    return true;
  }

  // ------------------------------------------------------------------- tipi
  const TIPI = [
    ['PIANTONAMENTO', 'SERVIZIO'], ['PATTUGLIAMENTO AUTO', 'SERVIZIO'], ['VIGILANZA PRESIDIO FISSO', 'SERVIZIO'],
    ['FERIE', 'FERIE'], ['PERMESSI GODUTI', 'PERMESSI GODUTI'], ['TURNO DI RIPOSO', 'TURNO DI RIPOSO'],
    ['INFORTUNIO', 'INFORTUNIO'], ['MALATTIA', 'MALATTIA'],
  ];

  // ------------------------------------------------------------ rendering
  const mese = () => $('c-mese').value || '';
  function turniMese() { const m = mese(); return m ? db.turni.filter((t) => t.data.startsWith(m)) : []; }

  function htmlCedolino(turni, r, m) {
    const voci = r.voci.map(([d, q, b, i]) => `<tr><td>${esc(d)}</td><td class=r>${q.replace('.', ',')}</td><td class=r>${euro(b)}</td><td class=r>${euro(i)}</td></tr>`).join('');
    let infos = r.info.map(([d, q, b, i]) => `<tr><td>${esc(d)}</td><td class=r>${q.replace('.', ',')}</td><td class=r>${euro(b)}</td><td class=r><i>${euro(i)}</i></td></tr>`).join('');
    if (infos) infos = '<tr><td colspan=4><i>Di cui, già inclusi nel salario (non sommati):</i></td></tr>' + infos;
    const riga = (d, v, neg) => `<tr><td colspan=3>${d}</td><td class=r>${neg ? '-' : ''}${euro(v)}</td></tr>`;
    const righe = turni.map((t) => `<tr><td>${fmtData(t.data)}</td><td>${esc(t.postazione)}</td><td>${t.inizio} - ${t.fine}</td><td>${esc(t.tipo)}</td><td class=r>${num(t.ore_tot)}</td><td class=r>${num(t.ore_notte)}</td><td>${t.festivo ? 'SI' : ''}</td></tr>`).join('');
    const etichetta = m ? `${m.slice(5)}/${m.slice(0, 4)}` : '';
    return `<h2>PROSPETTO RETRIBUTIVO / CEDOLINO (STIMA) ${etichetta}</h2>
    <p style="text-align:center">CCNL Vigilanza Privata - ${s.livello}° Livello - tariffa oraria ${r.tariffa.toFixed(4)} € - generato il ${new Date().toLocaleDateString('it-IT')}</p>
    <p>Ore servizio ${num(r.ore_servizio)} + permessi ${num(r.ore_permessi)} + ferie ${num(r.ore_ferie)} = <b>${num(r.ore_tot)} h</b>
    (soglia ${s.ore_ordinarie}, straordinario ${num(r.ore_str)} h) - giorni lavorati ${r.giorni} - ore notte ${num(r.ore_notte)} - ore festive ${num(r.ore_festive)}</p>
    <table width="100%"><tr><th>Voce</th><th>Quantità</th><th>Base</th><th>Competenze</th></tr>${voci}${infos}
    ${riga('<b>TOTALE LORDO (imponibile previdenziale)</b>', r.lordo)}
    ${riga('Trattamento integrativo', r.integrativo)}
    ${riga('<b>TOTALE COMPETENZE</b>', r.competenze)}
    ${riga(`Contributi previdenziali (${s.inps}%)`, r.contributi, true)}
    ${riga(`Imposta sostitutiva ${s.aliq_detass}% su ${euro(r.detassabile)}`, r.imposta_sost, true)}
    ${riga('IRPEF lorda', r.irpef_lorda, true)}
    ${riga('Detrazioni lavoro dipendente', r.detrazioni)}
    ${riga('<b>NETTO STIMATO</b>', r.netto)}</table>
    <h3>Dettaglio turni (${r.non_lavorati} giorni non lavorati: ferie/riposo/permessi)</h3>
    <table width="100%"><tr><th>Data</th><th>Postazione</th><th>Orario</th><th>Tipo</th><th>Ore</th><th>Notte</th><th>Fest.</th></tr>${righe}</table>
    <p><i>Stima indicativa calibrata su un cedolino reale; ticket pasto esclusi. Non sostituisce il cedolino ufficiale.</i></p>`;
  }

  function aggiornaMesi() {
    const mesi = [...new Set(db.turni.map((t) => t.data.slice(0, 7)))].sort().reverse();
    const prec = $('c-mese').value;
    $('c-mese').innerHTML = mesi.map((m) => `<option value="${m}">${m.slice(5)}/${m.slice(0, 4)}</option>`).join('');
    if (mesi.includes(prec)) $('c-mese').value = prec;
  }

  function ricarica(conMesi) {
    if (conMesi !== false) aggiornaMesi();
    const m = mese(), turni = turniMese();
    const r = GPG.riepilogo(turni, s, m ? +m.slice(0, 4) : 0, m ? +m.slice(5) : 0);
    $('c-paga').value = num(r.tariffa) + ' €/h';
    const tb = $('tab').tBodies[0];
    tb.innerHTML = turni.map((t) => `<tr data-id="${t.id}" class="${t.festivo ? 'fest' : ''} ${t.id === sel ? 'sel' : ''}">
      <td>${fmtData(t.data).slice(0, 5)}</td><td>${esc(t.postazione)}</td><td>${esc(t.servizio || t.tipo)}</td>
      <td>${t.inizio ? t.inizio + ' - ' + t.fine : ''}</td><td>${num(t.ore_tot)}</td><td>${num(t.ore_notte)}</td><td>${t.festivo ? 'SI' : ''}</td></tr>`).join('');
    $('k-lordo').textContent = euro(r.lordo);
    $('k-netto').textContent = euro(r.netto);
    $('k-ore').textContent = num(r.ore_tot) + ' h';
    $('k-notte').textContent = num(r.ore_notte) + ' h';
    $('ced').innerHTML = htmlCedolino(turni, r, m);
  }

  function riempiLivelli() {
    $('c-liv').innerHTML = ['6', '5', '4', '3', '2', '1'].map((l) => `<option value="${l}">${l}° Liv. (${euro(s.minimi[l])})</option>`).join('');
    $('c-liv').value = s.livello;
    $('c-extra').value = s.extra_mensili;
  }

  // -------------------------------------------------------------------- modale
  function apri(titolo, corpoHtml, bottoni) {
    $('m-tit').textContent = titolo;
    $('m-corpo').innerHTML = corpoHtml;
    const foot = $('m-foot');
    foot.innerHTML = '';
    for (const [testo, fn, cls] of bottoni) {
      const b = document.createElement('button');
      b.textContent = testo;
      if (cls) b.className = cls;
      b.onclick = fn;
      foot.appendChild(b);
    }
    $('modal').hidden = false;
  }
  const chiudi = () => { $('modal').hidden = true; };
  function messaggio(titolo, testo) { apri(titolo, `<p style="white-space:pre-line">${esc(testo)}</p>`, [['OK', chiudi, 'blu']]); }
  function conferma(titolo, testo, fn) {
    apri(titolo, `<p>${esc(testo)}</p>`, [['Sì', () => { chiudi(); fn(); }, 'rosso'], ['Annulla', chiudi]]);
  }

  // -------------------------------------------------------------------- azioni
  function aggiungi() {
    const [nome, tipo] = TIPI[$('f-tipo').selectedIndex];
    const data = $('f-data').value, ini = $('f-ini').value.trim(), fin = $('f-fin').value.trim();
    try {
      if (!data) throw new Error('Inserisci la data.');
      if (tipo === 'SERVIZIO' && !(ini && fin)) throw new Error('Per un servizio servono ora inizio e fine.');
      const t = GPG.creaTurno(data, $('f-post').value.trim(), ini, fin, tipo, tipo === 'SERVIZIO' ? nome : '');
      aggiungiTurno(t, false);
      salvaDb();
    } catch (e) { messaggio('Dati non validi', e.message); return; }
    $('f-ini').value = ''; $('f-fin').value = '';
    aggiornaMesi();
    $('c-mese').value = data.slice(0, 7);
    ricarica(false);
    $('f-post').focus();
    $('f-post').select();
  }

  async function leggiPdf(file) {
    const buf = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(buf) }).promise;
    let righe = [];
    for (let n = 1; n <= pdf.numPages; n++) {
      const tc = await (await pdf.getPage(n)).getTextContent();
      righe = righe.concat(GPG.righeDaItems(tc.items));
    }
    return GPG.parseRighe(righe);
  }

  async function importa(files) {
    if (!files.length) return;
    $('l-pdf').textContent = '⏳ Lettura in corso...';
    let letti = 0, nuovi = 0, doppi = 0, errori = 0, errPdf = [];
    for (const f of files) {
      try {
        for (const r of await leggiPdf(f)) {
          letti++;
          try {
            if (aggiungiTurno(GPG.creaTurno(r.data, r.postazione, r.inizio, r.fine, r.tipo, r.servizio), true)) nuovi++;
            else doppi++;
          } catch (e) { errori++; }
        }
      } catch (e) { errPdf.push(`${f.name}: ${e.message}`); }
    }
    salvaDb();
    ricarica();
    let msg = letti ? `${nuovi} turni importati su ${letti} letti.` : 'Nessun turno riconosciuto nel PDF.';
    if (doppi) msg += `\n${doppi} già presenti (saltati).`;
    if (errori) msg += `\n${errori} righe con orario non valido.`;
    if (errPdf.length) msg += '\nErrore PDF: ' + errPdf.join('; ');
    $('l-pdf').textContent = (letti ? '✅ ' : '⚠️ ') + msg.replace(/\n/g, ' ');
    messaggio('Importazione PDF', msg);
  }

  async function condividi(nome, testo, tipo) {
    const file = new File([testo], nome, { type: tipo });
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try { await navigator.share({ files: [file], title: nome }); return; } catch (e) { if (e.name === 'AbortError') return; }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = nome;
    a.click();
  }

  function esportaCsv() {
    const r = [['Data', 'Postazione', 'Inizio', 'Fine', 'Tipo', 'Ore', 'Ore notte', 'Festivo', 'Servizio']];
    for (const t of turniMese()) r.push([t.data, t.postazione, t.inizio, t.fine, t.tipo, t.ore_tot, t.ore_notte, t.festivo, t.servizio]);
    const csv = '\ufeff' + r.map((x) => x.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    condividi(`turni_${mese() || 'tutti'}.csv`, csv, 'text/csv');
  }

  function cedolino() {
    const m = mese(), turni = turniMese();
    const r = GPG.riepilogo(turni, s, m ? +m.slice(0, 4) : 0, m ? +m.slice(5) : 0);
    apri('Cedolino', `<div class="carta">${htmlCedolino(turni, r, m)}</div>`,
      [['🖨️ Stampa / Salva PDF', () => window.print(), 'blu'], ['Chiudi', chiudi]]);
  }

  // ---------------------------------------------------------------- impostazioni
  const CAMPI = [
    ['divisore', 'Divisore orario', ''], ['tariffa_override', 'Tariffa oraria (0 = automatica)', '€/h'],
    ['ore_ordinarie', 'Ore ordinarie mensili (oltre = straord.)', 'h'], ['ore_giorno_ferie', 'Ore computate per giorno di ferie', 'h'],
    ['pct_str_feriale', 'Straordinario feriale (% tariffa)', '%'], ['pct_festivo', 'Ore in festivo (% tariffa)', '%'],
    ['magg_notturna', 'Maggiorazione notturna oraria', '%'], ['ind_giornaliera', 'Indennità domenicale per giorno', '€'],
    ['ind_not_stradale', 'Ind. notturna stradale per giorno', '€'], ['ind_not_fisso', 'Ind. notturna piantonamento per giorno', '€'],
    ['mesi_14ma', 'Mesi di 14ª da liquidare', ''], ['inps', 'Aliquota contributi', '%'],
    ['detrazione_annua', 'Detrazione annua lav. dipendente', '€'], ['integrativo_annuo', 'Trattamento integrativo annuo', '€'],
    ['mesi_reddito', 'Mesi per proiezione reddito annuo', ''], ['aliq_detass', 'Imposta sostitutiva straord./notte', '%'],
  ];
  function impostazioni() {
    const campo = (id, lab, val, suf) => `<label>${lab}${suf ? ' (' + suf + ')' : ''}<input id="s-${id}" type="number" step="any" inputmode="decimal" value="${val}"></label>`;
    const minimi = ['6', '5', '4', '3', '2', '1'].map((l) => campo('min' + l, `Minimo ${l}° livello`, s.minimi[l], '€')).join('');
    const altri = CAMPI.map(([k, lab, suf]) => campo(k, lab, s[k], suf)).join('');
    const irpef = s.irpef.map(([l, a]) => `${l === null ? '' : l}:${a}`).join('; ');
    apri('Impostazioni & Parametri CCNL', `${minimi}${altri}
      <label>Scaglioni IRPEF annui (limite:aliquota)<input id="s-irpef" value="${irpef}"></label>
      <label><input id="s-detass" type="checkbox" style="display:inline;width:auto;min-height:0" ${s.detassazione ? 'checked' : ''}> Imposta sostitutiva su straordinari/notte</label>
      <hr><b>Backup dati</b>
      <div class="bottoni" style="padding:0"><button id="s-bk">⬇️ Salva backup</button><button id="s-rs">⬆️ Ripristina</button></div>
      <input id="s-file" type="file" accept=".json,application/json" hidden>`,
      [['💾 Salva', salvaImpostazioni, 'blu'], ['Annulla', chiudi]]);
    $('s-bk').onclick = () => condividi('gpg_turni_backup.json', JSON.stringify({ db, s }), 'application/json');
    $('s-rs').onclick = () => $('s-file').click();
    $('s-file').onchange = async (e) => {
      try {
        const o = JSON.parse(await e.target.files[0].text());
        if (!o.db || !Array.isArray(o.db.turni)) throw new Error('File non valido');
        db = o.db; Object.assign(s, o.s || {});
        salvaDb(); salvaSet(); riempiLivelli(); ricarica(); messaggio('Backup', 'Dati ripristinati.');
      } catch (err) { messaggio('Errore', err.message); }
    };
  }
  function salvaImpostazioni() {
    try {
      const sc = $('s-irpef').value.split(';').map((p) => {
        const [l, a] = p.trim().split(':');
        if (a === undefined || isNaN(parseFloat(a))) throw new Error('Scaglioni IRPEF non validi.');
        return [l.trim() === '' ? null : parseFloat(l), parseFloat(a)];
      });
      const n = Object.assign({}, s, { minimi: {}, irpef: sc, detassazione: $('s-detass').checked });
      for (const l of ['6', '5', '4', '3', '2', '1']) n.minimi[l] = parseFloat($('s-min' + l).value) || 0;
      for (const [k] of CAMPI) n[k] = parseFloat($('s-' + k).value) || 0;
      if (n.divisore <= 0) throw new Error('Il divisore deve essere maggiore di zero.');
      s = n;
    } catch (e) { alert(e.message); return; }
    salvaSet(); chiudi(); riempiLivelli(); ricarica();
  }

  // ----------------------------------------------------------------------- init
  function init() {
    carica();
    $('f-tipo').innerHTML = TIPI.map(([n]) => `<option>${n}</option>`).join('');
    const oggi = new Date();
    $('f-data').value = `${oggi.getFullYear()}-${String(oggi.getMonth() + 1).padStart(2, '0')}-${String(oggi.getDate()).padStart(2, '0')}`;
    riempiLivelli();
    pdfjsLib.GlobalWorkerOptions.workerSrc = 'lib/pdf.worker.min.js';

    $('c-liv').onchange = () => { s.livello = $('c-liv').value; salvaSet(); ricarica(false); };
    $('c-extra').onchange = () => { s.extra_mensili = parseFloat($('c-extra').value) || 0; salvaSet(); ricarica(false); };
    $('c-mese').onchange = () => ricarica(false);
    $('b-pdf').onclick = () => $('f-pdf').click();
    $('f-pdf').onchange = (e) => { importa([...e.target.files]); e.target.value = ''; };
    $('b-add').onclick = aggiungi;
    $('b-del').onclick = () => {
      if (sel === null) { messaggio('Elimina', 'Tocca prima un rigo del registro.'); return; }
      db.turni = db.turni.filter((t) => t.id !== sel); sel = null; salvaDb(); ricarica();
    };
    $('b-csv').onclick = esportaCsv;
    $('b-ced').onclick = cedolino;
    $('b-reset').onclick = () => conferma('Azzera', 'Eliminare TUTTI i turni memorizzati?', () => { db = { next: 1, turni: [] }; sel = null; salvaDb(); ricarica(); });
    $('b-imp').onclick = impostazioni;
    $('m-x').onclick = chiudi;
    $('tab').tBodies[0].onclick = (e) => {
      const tr = e.target.closest('tr');
      if (!tr) return;
      sel = sel === +tr.dataset.id ? null : +tr.dataset.id;
      for (const r of $('tab').tBodies[0].rows) r.classList.toggle('sel', +r.dataset.id === sel);
    };
    // INVIO passa al campo successivo; sull'ultimo aggiunge il turno
    const ordine = ['f-data', 'f-post', 'f-ini', 'f-fin'].map($);
    ordine.forEach((el, i) => el.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter') return;
      e.preventDefault();
      if (i < ordine.length - 1) ordine[i + 1].focus(); else aggiungi();
    }));
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist();
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
    ricarica();
  }
  init();
})();
