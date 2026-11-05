/* Logica di GPG Turni (porting del programma macOS): ore, festività,
 * parser della foglina servizi PDF e calcolo del cedolino.
 * Funziona sia nel browser (global GPG) sia in Node (module.exports). */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ impostazioni
  const MINIMI = { '6': 1293.87, '5': 1393.87, '4': 1468.88, '3': 1651.31, '2': 1860.38, '1': 1992.60 };
  const VERSIONE = 2;
  const DEFAULTS = {
    versione: VERSIONE, livello: '5', minimi: MINIMI, divisore: 173, tariffa_override: 0,
    extra_mensili: 0, ore_giorno_ferie: 7, ore_ordinarie: 175, pct_str_feriale: 130,
    pct_festivo: 135, magg_notturna: 0, ind_giornaliera: 0.71, ind_not_stradale: 5.61,
    ind_not_fisso: 4.18, mesi_14ma: 0, inps: 9.93,
    irpef: [[28000, 23], [50000, 33], [null, 43]],
    detrazione_annua: 1380, integrativo_annuo: 1200, mesi_reddito: 6,
    detassazione: true, aliq_detass: 15,
  };
  const pagaBase = (s) => Number(s.minimi[s.livello]) + Number(s.extra_mensili);
  const tariffaOraria = (s) =>
    Number(s.tariffa_override) > 0 ? Number(s.tariffa_override) : pagaBase(s) / Number(s.divisore);

  // ------------------------------------------------------------------- date
  const iso = (a, m, g) => `${a}-${String(m).padStart(2, '0')}-${String(g).padStart(2, '0')}`;
  const dow = (d) => new Date(Date.UTC(+d.slice(0, 4), +d.slice(5, 7) - 1, +d.slice(8, 10))).getUTCDay();
  function pasqua(anno) {
    const a = anno % 19, b = Math.floor(anno / 100), c = anno % 100;
    const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mese = Math.floor((h + l - 7 * m + 114) / 31);
    const giorno = ((h + l - 7 * m + 114) % 31) + 1;
    return [mese, giorno];
  }
  function isFestivo(d) {
    const A = +d.slice(0, 4), M = +d.slice(5, 7), G = +d.slice(8, 10);
    if (dow(d) === 0) return true;
    const fisse = ['1-1', '6-1', '25-4', '1-5', '2-6', '15-8', '1-11', '8-12', '25-12', '26-12'];
    if (fisse.includes(`${G}-${M}`)) return true;
    const [pm, pg] = pasqua(A);
    const pasquetta = new Date(Date.UTC(A, pm - 1, pg + 1));
    return pasquetta.getUTCMonth() + 1 === M && pasquetta.getUTCDate() === G;
  }

  // ------------------------------------------------------------------- ore
  function parseOra(txt) {
    const p = String(txt).trim().replace(/[.:]/g, ',').split(',');
    const h = parseInt(p[0], 10), m = parseInt(p[1] === undefined ? '0' : p[1], 10);
    if (isNaN(h) || isNaN(m) || h < 0 || h > 24 || m < 0 || m >= 60)
      throw new Error('Orario non valido: ' + txt);
    return h * 60 + m;
  }
  const FASCIA = [[0, 360], [1320, 1440]];
  function calcolaOre(inizio, fine) {
    const a = parseOra(inizio);
    let b = parseOra(fine);
    if (b <= a) b += 1440;
    let notte = 0;
    for (const g of [0, 1]) for (const [n0, n1] of FASCIA) {
      notte += Math.max(0, Math.min(b, n1 + g * 1440) - Math.max(a, n0 + g * 1440));
    }
    const r2 = (x) => Math.round(x * 100) / 100;
    return [r2((b - a) / 60), r2(notte / 60)];
  }
  function creaTurno(data, postazione, inizio, fine, tipo, servizio) {
    let tot = 0, notte = 0;
    if (inizio && fine) [tot, notte] = calcolaOre(inizio, fine);
    return {
      data, postazione: (postazione || '').toUpperCase(), inizio: inizio || '', fine: fine || '',
      tipo: (tipo || 'SERVIZIO').toUpperCase(), ore_tot: tot, ore_notte: notte,
      festivo: isFestivo(data) ? 1 : 0, servizio: (servizio || '').toUpperCase(),
    };
  }

  // ----------------------------------------------------------------- parser
  const RE_DATA = /^\s*(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/;
  const RE_ORA = /\d{1,2}[,.:]\d{2}/g;
  const RE_ORARI = /^\s*(\d{1,2}[,.:]\d{2})\s+(\d{1,2}[,.:]\d{2})\s*$/;
  const ASSENZE = ['FERIE', 'TURNO DI RIPOSO', 'PERMESSI GODUTI', 'INFORTUNIO', 'MALATTIA', 'RIPOSO', 'PERMESSO'];
  const NORMALIZZA = { PERMESSO: 'PERMESSI GODUTI', RIPOSO: 'TURNO DI RIPOSO' };
  const NON_LAVORATI = ['FERIE', 'TURNO DI RIPOSO', 'PERMESSI GODUTI', 'INFORTUNIO', 'MALATTIA'];

  const celle = (riga) => riga.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
  function tipoDa(tip) {
    const t = tip.toUpperCase();
    for (const a of ASSENZE) if (t.includes(a)) return NORMALIZZA[a] || a;
    return 'SERVIZIO';
  }
  function daObiettivo(obj) {
    const parole = obj.toUpperCase().split(/\s+/).filter(Boolean);
    const visti = {};
    for (let i = 0; i < parole.length; i++) {
      const p = parole[i];
      if (p in visti && parole.length - i >= 2 && p.length > 2) return parole.slice(i).join(' ');
      visti[p] = i;
    }
    return parole.join(' ');
  }
  function postazioneDa(tip, desc, obj) {
    if (desc) {
      const parole = desc.toUpperCase().split(/\s+/).filter(Boolean);
      const t = tip.toUpperCase().split(/\s+/).filter(Boolean);
      let i = 0;
      while (i < parole.length && i < t.length && parole[i] === t[i]) i++;
      if (i > 0 && parole.slice(i).length) return parole.slice(i).join(' ');
    }
    return daObiettivo(obj);
  }

  /** Da righe di testo (colonne separate da '|') a lista di turni grezzi. */
  function parseRighe(righe) {
    const out = [];
    let giorno = null, corrente = null;
    for (const riga of righe) {
      if (!riga.includes('|') || /^[-| ]*$/.test(riga.trim())) continue;
      const c = celle(riga);
      const m = RE_DATA.exec(c[0]);
      if (m) {
        let a = +m[3];
        if (a < 100) a += 2000;
        const mm = +m[2], gg = +m[1];
        const d = new Date(Date.UTC(a, mm - 1, gg));
        if (d.getUTCMonth() !== mm - 1 || d.getUTCDate() !== gg) continue;
        giorno = iso(a, mm, gg);
      }
      if (giorno === null) continue;
      let orari = c.length > 1 ? RE_ORARI.exec(c[1]) : null;
      if (!orari && c.length > 1) {
        const t = c[1].match(RE_ORA) || [];
        if (t.length === 2) orari = RE_ORARI.exec(t.join(' '));
      }
      const tip = c[2] || '';
      let obj = c[4] || '';
      if (orari || (m && tip)) {
        const norm = (x) => x.replace(/[.:]/g, ',');
        corrente = {
          data: giorno, tipo: tipoDa(tip), tip, inizio: orari ? norm(orari[1]) : '',
          fine: orari ? norm(orari[2]) : '', desc: '', obj: obj === '.' ? '' : obj,
        };
        out.push(corrente);
      } else if (corrente) {
        const pieno = c.filter(Boolean);
        if (c.length === 1 && pieno.length && !corrente.desc) corrente.desc = pieno[0];
      }
    }
    return out.map((r) => ({
      data: r.data,
      postazione: r.tipo === 'SERVIZIO' ? postazioneDa(r.tip, r.desc, r.obj) : r.tipo,
      inizio: r.inizio, fine: r.fine, tipo: r.tipo, servizio: `${r.tip} ${r.desc}`.trim(),
    }));
  }

  /** Righe di testo da una pagina pdf.js (testo a larghezza fissa): si elimina
   *  il grassetto simulato (stesso testo stampato due volte) e si ricostruisce
   *  ogni riga posizionando i caratteri sulla griglia delle colonne. */
  function righeDaItems(items) {
    const visti = new Set();
    const els = [];
    for (const it of items) {
      if (!it.str) continue;
      const k = `${it.str}|${it.transform[4].toFixed(1)}|${it.transform[5].toFixed(1)}`;
      if (visti.has(k)) continue;
      visti.add(k);
      els.push({ s: it.str, x: it.transform[4], y: it.transform[5], w: it.width });
    }
    const larg = els.filter((e) => e.s.length > 1 && e.w > 0).map((e) => e.w / e.s.length).sort((a, b) => a - b);
    const cw = larg.length ? larg[Math.floor(larg.length / 2)] : 4.8;
    const righe = new Map();
    for (const e of els) {
      const y = Math.round(e.y);
      if (!righe.has(y)) righe.set(y, []);
      righe.get(y).push(e);
    }
    return [...righe.keys()].sort((a, b) => b - a).map((y) => {
      const buf = [];
      for (const e of righe.get(y).sort((a, b) => a.x - b.x)) {
        const col = Math.round(e.x / cw);
        for (let i = 0; i < e.s.length; i++) buf[col + i] = e.s[i];
      }
      return Array.from(buf, (ch) => ch || ' ').join('');
    });
  }

  // ----------------------------------------------------------------- calcolo
  function categoria(t) {
    const x = `${t.servizio || ''} ${t.postazione || ''}`.toUpperCase();
    return ['PATTUGLIAMENTO', 'PATT.', 'ZONA'].some((k) => x.includes(k)) ? 'stradale' : 'fisso';
  }
  const somma = (a, f) => a.reduce((s, t) => s + f(t), 0);
  function conteggi(turni) {
    const lav = turni.filter((t) => !NON_LAVORATI.includes(t.tipo));
    const giorni = {};
    for (const t of lav) if (giorni[t.data] !== 'stradale') giorni[t.data] = categoria(t);
    const v = Object.values(giorni);
    return {
      ore_servizio: somma(lav, (t) => t.ore_tot),
      ore_permessi: somma(turni.filter((t) => t.tipo === 'PERMESSI GODUTI'), (t) => t.ore_tot),
      ore_notte: somma(lav, (t) => t.ore_notte),
      ore_festive: somma(lav.filter((t) => t.festivo), (t) => t.ore_tot),
      giorni_ferie: new Set(turni.filter((t) => t.tipo === 'FERIE').map((t) => t.data)).size,
      giorni: v.length, n_stradale: v.filter((c) => c === 'stradale').length,
      n_fisso: v.filter((c) => c === 'fisso').length,
      non_lavorati: turni.filter((t) => NON_LAVORATI.includes(t.tipo)).length,
    };
  }
  function irpefAnnua(reddito, scaglioni) {
    let imposta = 0, prec = 0, marg = 0;
    for (const [lim, aliq] of scaglioni) {
      const top = lim === null ? reddito : Math.min(reddito, lim);
      if (top > prec) { imposta += ((top - prec) * aliq) / 100; marg = aliq; }
      if (lim === null || reddito <= lim) break;
      prec = lim;
    }
    return [imposta, marg];
  }
  const g = (x) => String(+x.toFixed(2));
  function calcola(c, s, giorniMese) {
    giorniMese = giorniMese || 30;
    const tar = tariffaOraria(s), mensile = pagaBase(s);
    const oreFerie = c.giorni_ferie * s.ore_giorno_ferie;
    const oreTot = c.ore_servizio + c.ore_permessi + oreFerie;
    const oreStr = Math.max(0, oreTot - s.ore_ordinarie);
    const voci = [['Retribuzione ordinaria (salario mensile)', '1 mese', mensile, mensile]];
    if (c.giorni && s.ind_giornaliera)
      voci.push(['Indennità domenicale / giornaliera', `${c.giorni} gg`, s.ind_giornaliera, c.giorni * s.ind_giornaliera]);
    const indStr = c.n_stradale * s.ind_not_stradale, indFis = c.n_fisso * s.ind_not_fisso;
    if (c.n_stradale) voci.push(['Ind. lavoro notturno - stradale (pattugliamento)', `${c.n_stradale} gg`, s.ind_not_stradale, indStr]);
    if (c.n_fisso) voci.push(['Ind. lavoro notturno - piantonamento fisso', `${c.n_fisso} gg`, s.ind_not_fisso, indFis]);
    const maggN = (c.ore_notte * tar * s.magg_notturna) / 100;
    if (maggN) voci.push([`Maggiorazione notturna ${g(s.magg_notturna)}%`, `${c.ore_notte.toFixed(2)} h`, tar, maggN]);
    const strFer = (oreStr * tar * s.pct_str_feriale) / 100;
    if (oreStr) voci.push([`Lavoro straordinario ${g(s.pct_str_feriale)}%`, `${oreStr.toFixed(2)} h`, (tar * s.pct_str_feriale) / 100, strFer]);
    const fest = (c.ore_festive * tar * s.pct_festivo) / 100;
    if (c.ore_festive) voci.push([`Ore lavorate in festivo ${g(s.pct_festivo)}%`, `${c.ore_festive.toFixed(2)} h`, (tar * s.pct_festivo) / 100, fest]);
    const q14 = (s.mesi_14ma * mensile) / 12;
    if (q14) voci.push(['14ª mensilità (ratei)', `${g(s.mesi_14ma)} mesi`, mensile / 12, q14]);

    const qGg = mensile / 26, info = [];
    if (c.giorni_ferie) info.push(['Ferie godute (già comprese nel salario)', `${c.giorni_ferie} gg`, qGg, c.giorni_ferie * qGg]);
    if (c.ore_permessi) info.push(['Permessi goduti (già compresi nel salario)', `${c.ore_permessi.toFixed(2)} h`, tar, c.ore_permessi * tar]);

    const lordo = somma(voci, (v) => v[3]);
    const contributi = (lordo * s.inps) / 100;
    const detassabile = s.detassazione ? strFer + fest + indStr + indFis + maggN : 0;
    const impostaSost = (detassabile * s.aliq_detass) / 100;
    const imponibile = Math.max(0, lordo - contributi - detassabile);
    const q14Netta = Math.min(imponibile, q14 * (1 - s.inps / 100));
    const ordinario = imponibile - q14Netta;
    const mesi = Math.max(1, s.mesi_reddito);
    const reddito = ordinario * mesi;
    const [impAnnua, marg] = irpefAnnua(reddito, s.irpef);
    const irpefLorda = impAnnua / mesi + (q14Netta * marg) / 100;
    const quotaGg = giorniMese / 365;
    const detrazioni = Math.min(irpefLorda, s.detrazione_annua * quotaGg);
    const irpef = irpefLorda - detrazioni;
    const integrativo = reddito <= 15000 ? s.integrativo_annuo * quotaGg : 0;
    const competenze = lordo + integrativo;
    const trattenute = contributi + irpef + impostaSost;
    return Object.assign({
      tariffa: tar, paga_base: mensile, voci, info, ore_ferie: oreFerie, ore_tot: oreTot, ore_str: oreStr,
      lordo, contributi, detassabile, imposta_sost: impostaSost, imponibile, irpef_lorda: irpefLorda,
      detrazioni, irpef, integrativo, competenze, trattenute, netto: competenze - trattenute,
    }, c);
  }
  function riepilogo(turni, s, anno, mese) {
    const gm = anno && mese ? new Date(Date.UTC(anno, mese, 0)).getUTCDate() : 30;
    return calcola(conteggi(turni), s, gm);
  }

  const API = {
    DEFAULTS, MINIMI, VERSIONE, NON_LAVORATI, pagaBase, tariffaOraria, isFestivo, calcolaOre,
    creaTurno, parseRighe, righeDaItems, conteggi, calcola, riepilogo,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.GPG = API;
})(typeof self !== 'undefined' ? self : this);
