/* --- Komut scripti (C benzeri, güvenli alt küme) ---------------------------
 * Operatör düğmesiyle başlayan, SCADA sunucusunda çalışan kısa sıralı mantık:
 *
 *   if (read("X0")) { write("Y0", 1); wait(5000); write("Y0", 0); }
 *   if (holdFor(read("X1"), 5000)) pulse("Y1", 1000);
 *
 * eval / Function / serbest JavaScript YOK. Kaynak burada ayrıştırılır ve tipli
 * bir ağaca çevrilir; sunucudaki yorumlayıcı (apps/server/src/scriptRunner.ts)
 * yalnız bu ağacı yürütür. Etiket adları yalnız sabit metin olabilir — böylece
 * scriptin neyi okuyup neyi yazacağı KAYITTAN ÖNCE bilinir ve doğrulanır.
 *
 * Bu modül paylaşılır: arayüz yazarken anlık hata gösterir, sunucu
 * validateConfig içinde aynı denetimi bağlayıcı olarak çalıştırır.
 */

export type Pos = { line: number; col: number };
export type Expr =
 | { k: 'num'; v: number; p: Pos }
 | { k: 'bool'; v: boolean; p: Pos }
 | { k: 'str'; v: string; p: Pos }
 | { k: 'var'; name: string; p: Pos }
 | { k: 'un'; op: '!' | '-'; e: Expr; p: Pos }
 | { k: 'bin'; op: string; a: Expr; b: Expr; p: Pos }
 | { k: 'call'; fn: string; args: Expr[]; p: Pos };
export type Stmt =
 | { k: 'block'; body: Stmt[]; p: Pos }
 | { k: 'if'; cond: Expr; then: Stmt; else: Stmt | null; p: Pos }
 | { k: 'while'; cond: Expr; body: Stmt; p: Pos }
 | { k: 'decl'; name: string; init: Expr | null; p: Pos }
 | { k: 'assign'; name: string; op: '=' | '+=' | '-='; e: Expr; p: Pos }
 | { k: 'expr'; e: Expr; p: Pos }
 | { k: 'return'; p: Pos };

export class ScriptError extends Error {
 constructor(message: string, public pos: Pos) { super(message); }
}

/* Sınırlar: tek bir bekleme ve toplam çalışma bir saati aşamaz; döngüler adım sınırına takılır. */
export const SCRIPT_LIMITS = { maxSource: 8000, maxWaitMs: 3_600_000, maxRunMs: 3_600_000, maxSteps: 100_000, maxWrites: 500, pollMs: 100 };

/** Fonksiyonlar: ad → [en az, en çok] argüman. Etiket argümanı her zaman ilk argümandır ve sabit metin olmalıdır. */
export const SCRIPT_FUNCTIONS: Record<string, { args: [number, number]; tag?: 'read' | 'write'; help: string }> = {
 read: { args: [1, 1], tag: 'read', help: 'read("X0") — etiketin güncel değeri. Veri güncel değilse script durur ve güvenli duruma geçer.' },
 write: { args: [2, 2], tag: 'write', help: 'write("Y0", 1) — PLC\'ye yazar ve yazma onayını bekler. Dijitalde 0/1 ya da true/false.' },
 pulse: { args: [2, 2], tag: 'write', help: 'pulse("Y0", 5000) — dijital çıkışı açar, süre kadar bekler, kapatır.' },
 wait: { args: [1, 1], help: 'wait(5000) — milisaniye bekler (en çok 1 saat).' },
 waitUntil: { args: [2, 2], help: 'waitUntil(read("X0"), 10000) — koşul doğru olana kadar bekler; süre dolarsa false döner.' },
 holdFor: { args: [2, 2], help: 'holdFor(read("X0"), 5000) — koşul süre boyunca kesintisiz doğruysa true; arada düşerse hemen false.' },
 log: { args: [1, 8], help: 'log("Dolum başladı", read("D100")) — çalışma kaydına satır yazar.' },
 stop: { args: [0, 1], help: 'stop("Kapı açık") — scripti hata olarak durdurur; güvenli durum yazılır.' },
 abs: { args: [1, 1], help: 'abs(x)' },
 min: { args: [2, 2], help: 'min(a, b)' },
 max: { args: [2, 2], help: 'max(a, b)' },
 round: { args: [1, 1], help: 'round(x)' },
 elapsed: { args: [0, 0], help: 'elapsed() — script başladığından beri geçen ms.' },
};
const TYPES = new Set(['int', 'float', 'bool', 'var']);
const KEYWORDS = new Set(['if', 'else', 'while', 'return', 'true', 'false', ...TYPES]);
/** Script içinde hazır değişken: komutu tetikleyen değer (düğmede true / ayarlanan sayı). */
export const SCRIPT_INPUT = 'input';

type Tok = { t: 'num' | 'str' | 'id' | 'op' | 'eof'; v: string; p: Pos };

function lex(src: string): Tok[] {
 const out: Tok[] = [];
 let i = 0, line = 1, col = 1;
 const adv = (n = 1) => { for (let k = 0; k < n; k++) { if (src[i] === '\n') { line++; col = 1; } else col++; i++; } };
 while (i < src.length) {
  const c = src[i], p = { line, col };
  if (/\s/.test(c)) { adv(); continue; }
  if (c === '/' && src[i + 1] === '/') { while (i < src.length && src[i] !== '\n') adv(); continue; }
  if (c === '/' && src[i + 1] === '*') { adv(2); while (i < src.length && !(src[i] === '*' && src[i + 1] === '/')) adv(); if (i >= src.length) throw new ScriptError('Yorum kapanmamış (*/ eksik).', p); adv(2); continue; }
  if (/[0-9]/.test(c) || (c === '.' && /[0-9]/.test(src[i + 1] || ''))) {
   const m = /^(\d+(\.\d+)?|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i))!;
   out.push({ t: 'num', v: m[0], p }); adv(m[0].length);
   if (/[A-Za-z_]/.test(src[i] || '')) throw new ScriptError('Sayıdan sonra harf: "' + m[0] + src[i] + '". Etiket adını tırnak içinde yazın: read("' + m[0] + src[i] + '…").', p);
   continue;
  }
  if (/[A-Za-z_ğüşıöçĞÜŞİÖÇ]/.test(c)) {
   const m = /^[A-Za-z_ğüşıöçĞÜŞİÖÇ][A-Za-z0-9_ğüşıöçĞÜŞİÖÇ]*/.exec(src.slice(i))!;
   out.push({ t: 'id', v: m[0], p }); adv(m[0].length); continue;
  }
  if (c === '"' || c === "'") {
   let s = ''; adv();
   while (i < src.length && src[i] !== c) { if (src[i] === '\n') throw new ScriptError('Metin aynı satırda kapanmalı.', p); if (src[i] === '\\' && i + 1 < src.length) { adv(); s += src[i] === 'n' ? '\n' : src[i]; adv(); continue; } s += src[i]; adv(); }
   if (i >= src.length) throw new ScriptError('Metin kapanmamış (' + c + ' eksik).', p);
   adv(); out.push({ t: 'str', v: s, p }); continue;
  }
  const two = src.slice(i, i + 2);
  if (['==', '!=', '<=', '>=', '&&', '||', '+=', '-='].includes(two)) { out.push({ t: 'op', v: two, p }); adv(2); continue; }
  if ('(){};,+-*/%<>=!'.includes(c)) { out.push({ t: 'op', v: c, p }); adv(); continue; }
  if (c === '&' || c === '|') throw new ScriptError('"' + c + c + '" kullanın (mantıksal ' + (c === '&' ? 'VE' : 'VEYA') + ').', p);
  throw new ScriptError('Tanınmayan karakter: "' + c + '".', p);
 }
 out.push({ t: 'eof', v: '', p: { line, col } });
 return out;
}

export function parseScript(src: string): Stmt[] {
 if (src.length > SCRIPT_LIMITS.maxSource) throw new ScriptError('Script en çok ' + SCRIPT_LIMITS.maxSource + ' karakter olabilir.', { line: 1, col: 1 });
 const toks = lex(src);
 let i = 0;
 const peek = () => toks[i], next = () => toks[i++];
 const is = (v: string) => toks[i].t !== 'str' && toks[i].v === v;
 const expect = (v: string, what?: string) => {
  if (is(v)) return next();
  // Eksik ";" bir sonraki satırda fark edilir; hatayı asıl satırın sonunda göster (C derleyicilerinden daha açık).
  const prev = toks[i - 1];
  if (v === ';' && prev && prev.p.line < peek().p.line) throw new ScriptError('Satır sonunda ";" eksik.', { line: prev.p.line, col: prev.p.col + prev.v.length });
  throw new ScriptError((what || '"' + v + '"') + ' bekleniyordu, "' + (peek().v || 'satır sonu') + '" bulundu.', peek().p);
 };
 const ident = () => { const t = peek(); if (t.t !== 'id' || KEYWORDS.has(t.v)) throw new ScriptError('Ad bekleniyordu, "' + (t.v || 'satır sonu') + '" bulundu.', t.p); return next(); };
 function stmt(): Stmt {
  const t = peek(), p = t.p;
  if (is('{')) { next(); const body: Stmt[] = []; while (!is('}')) { if (peek().t === 'eof') throw new ScriptError('"}" eksik — bu blok kapanmamış.', p); body.push(stmt()); } next(); return { k: 'block', body, p }; }
  if (is('if')) { next(); expect('('); const cond = expr(); expect(')'); const then = stmt(); let els: Stmt | null = null; if (is('else')) { next(); els = stmt(); } return { k: 'if', cond, then, else: els, p }; }
  if (is('while')) { next(); expect('('); const cond = expr(); expect(')'); return { k: 'while', cond, body: stmt(), p }; }
  if (is('return')) { next(); expect(';'); return { k: 'return', p }; }
  if (t.t === 'id' && TYPES.has(t.v)) { next(); const n = ident(); let init: Expr | null = null; if (is('=')) { next(); init = expr(); } expect(';', '";"'); return { k: 'decl', name: n.v, init, p }; }
  if (t.t === 'id' && !KEYWORDS.has(t.v) && ['=', '+=', '-='].includes(toks[i + 1].v) && toks[i + 1].t === 'op') {
   next(); const op = next().v as '=' | '+=' | '-='; const e = expr(); expect(';', '";"'); return { k: 'assign', name: t.v, op, e, p };
  }
  if (is('else')) throw new ScriptError('"else" öncesinde "if" yok.', p);
  const e = expr();
  if (e.k !== 'call') throw new ScriptError('Tek başına ifade bir şey yapmaz; fonksiyon çağrısı ya da atama bekleniyordu.', p);
  expect(';', '";"');
  return { k: 'expr', e, p };
 }
 const BIN: string[][] = [['||'], ['&&'], ['==', '!='], ['<', '<=', '>', '>='], ['+', '-'], ['*', '/', '%']];
 function expr(level = 0): Expr {
  if (level === BIN.length) return unary();
  let a = expr(level + 1);
  while (peek().t === 'op' && BIN[level].includes(peek().v)) { const op = next(); const b = expr(level + 1); a = { k: 'bin', op: op.v, a, b, p: op.p }; }
  return a;
 }
 function unary(): Expr {
  const t = peek();
  if (t.t === 'op' && (t.v === '!' || t.v === '-')) { next(); return { k: 'un', op: t.v as '!' | '-', e: unary(), p: t.p }; }
  return primary();
 }
 function primary(): Expr {
  const t = next();
  if (t.t === 'num') return { k: 'num', v: Number(t.v), p: t.p };
  if (t.t === 'str') return { k: 'str', v: t.v, p: t.p };
  if (t.t === 'op' && t.v === '(') { const e = expr(); expect(')'); return e; }
  if (t.t === 'id' && (t.v === 'true' || t.v === 'false')) return { k: 'bool', v: t.v === 'true', p: t.p };
  if (t.t === 'id' && !KEYWORDS.has(t.v)) {
   if (is('(')) { next(); const args: Expr[] = []; if (!is(')')) { args.push(expr()); while (is(',')) { next(); args.push(expr()); } } expect(')'); return { k: 'call', fn: t.v, args, p: t.p }; }
   return { k: 'var', name: t.v, p: t.p };
  }
  throw new ScriptError(t.t === 'eof' ? 'Script yarım kaldı; ifade bekleniyordu.' : '"' + t.v + '" burada beklenmiyordu.', t.p);
 }
 const prog: Stmt[] = [];
 while (peek().t !== 'eof') prog.push(stmt());
 return prog;
}

export type TagRef = { id: string; code: string; deviceId: string; access: 'read' | 'readwrite'; dataType: string; writable: boolean };
export type ScriptCheck = { ok: boolean; errors: { message: string; line: number; col: number }[]; warnings: { message: string; line: number; col: number }[]; reads: string[]; writes: string[]; ast: Stmt[] | null };

/**
 * Etiket adı çözümü: "Y0" (bütün projede tekse) ya da "PLC.Y0" (cihaz kodu + nokta).
 * Döndürülen null: bulunamadı; dizi birden çoksa belirsiz.
 */
export function resolveTag(name: string, tags: TagRef[], devices: { id: string; code: string }[]): TagRef[] {
 const exact = tags.filter((t) => t.code === name);
 if (exact.length) return exact;
 const dot = name.indexOf('.');
 if (dot > 0) { const dev = devices.find((d) => d.code === name.slice(0, dot)); if (dev) return tags.filter((t) => t.deviceId === dev.id && t.code === name.slice(dot + 1)); }
 return [];
}

/** Statik denetim: sözdizimi, bilinmeyen ad/fonksiyon, etiket çözümü, yazılabilirlik, bekleme sınırları. */
export function checkScript(src: string, tags: TagRef[], devices: { id: string; code: string }[]): ScriptCheck {
 const errors: ScriptCheck['errors'] = [], warnings: ScriptCheck['warnings'] = [];
 const reads = new Set<string>(), writes = new Set<string>();
 let ast: Stmt[] | null = null;
 try { ast = parseScript(src); } catch (e) { const p = (e as ScriptError).pos || { line: 1, col: 1 }; return { ok: false, errors: [{ message: (e as Error).message, ...p }], warnings, reads: [], writes: [], ast: null }; }
 if (!ast.length) errors.push({ message: 'Script boş.', line: 1, col: 1 });
 const err = (message: string, p: Pos) => errors.push({ message, ...p });
 let hasWait = false;
 const scopes: Set<string>[] = [new Set([SCRIPT_INPUT])];
 const declared = (n: string) => scopes.some((s) => s.has(n));
 function ex(e: Expr): void {
  if (e.k === 'var') { if (!declared(e.name)) err('"' + e.name + '" tanımlı değil. Etiket okumak için read("' + e.name + '") yazın; değişken için önce "int ' + e.name + ' = 0;".', e.p); return; }
  if (e.k === 'un') return ex(e.e);
  if (e.k === 'bin') { ex(e.a); ex(e.b); return; }
  if (e.k === 'str') return;
  if (e.k !== 'call') return;
  const f = SCRIPT_FUNCTIONS[e.fn];
  if (!f) { err('Bilinmeyen fonksiyon: ' + e.fn + '(). Kullanılabilenler: ' + Object.keys(SCRIPT_FUNCTIONS).join(', ') + '.', e.p); return; }
  if (e.args.length < f.args[0] || e.args.length > f.args[1]) err(e.fn + '() ' + (f.args[0] === f.args[1] ? f.args[0] : f.args[0] + '–' + f.args[1]) + ' argüman alır, ' + e.args.length + ' verildi.', e.p);
  if (f.tag) {
   const a = e.args[0];
   if (!a || a.k !== 'str') err(e.fn + '() etiket adını tırnak içinde sabit metin olarak ister: ' + e.fn + '("Y0"…).', (a || e).p);
   else {
    const hits = resolveTag(a.v, tags, devices);
    if (!hits.length) err('Etiket bulunamadı: "' + a.v + '".', a.p);
    else if (hits.length > 1) err('"' + a.v + '" birden çok cihazda var; cihaz koduyla yazın: "' + devices.filter((d) => hits.some((h) => h.deviceId === d.id)).map((d) => d.code + '.' + a.v).join('" ya da "') + '".', a.p);
    else {
     const t = hits[0];
     if (f.tag === 'read') reads.add(t.id);
     else if (t.access !== 'readwrite' || !t.writable) err('"' + a.v + '" yazılabilir değil' + (t.access !== 'readwrite' ? ' (salt okuma etiketi).' : ' (bu protokolde yazma yok).'), a.p);
     else { writes.add(t.id); if (e.fn === 'pulse' && t.dataType !== 'bool') err('pulse() yalnız dijital etikette kullanılır.', a.p); }
    }
   }
   e.args.slice(1).forEach(ex);
  } else e.args.forEach(ex);
  const lit = (x: Expr | undefined) => (x && x.k === 'num' ? x.v : x && x.k === 'un' && x.op === '-' && x.e.k === 'num' ? -x.e.v : null);
  const msArg = e.fn === 'wait' ? e.args[0] : ['waitUntil', 'holdFor', 'pulse'].includes(e.fn) ? e.args[1] : undefined;
  if (msArg) {
   hasWait = true;
   const v = lit(msArg);
   if (v !== null && (v < 0 || v > SCRIPT_LIMITS.maxWaitMs)) err('Süre 0 ile ' + SCRIPT_LIMITS.maxWaitMs + ' ms (1 saat) arasında olmalı.', msArg.p);
   if (v !== null && v > 0 && v < 50) warnings.push({ message: 'Süre milisaniyedir: ' + v + ' ms çok kısa. Saniye mi demek istediniz? (' + v + ' sn = ' + v * 1000 + ')', ...msArg.p });
  }
 }
 function st(s: Stmt): void {
  if (s.k === 'block') { scopes.push(new Set()); s.body.forEach(st); scopes.pop(); return; }
  if (s.k === 'if') { ex(s.cond); st(s.then); if (s.else) st(s.else); return; }
  if (s.k === 'while') { ex(s.cond); const before = hasWait; hasWait = false; st(s.body); if (!hasWait) warnings.push({ message: 'Döngüde bekleme yok: wait() olmadan döngü adım sınırına (' + SCRIPT_LIMITS.maxSteps + ') hızla takılır ve script durur.', ...s.p }); hasWait = hasWait || before; return; }
  if (s.k === 'decl') { if (s.init) ex(s.init); if (s.name === SCRIPT_INPUT || SCRIPT_FUNCTIONS[s.name]) err('"' + s.name + '" ayrılmış bir ad.', s.p); scopes[scopes.length - 1].add(s.name); return; }
  if (s.k === 'assign') { if (s.name === SCRIPT_INPUT) err('"input" değiştirilemez.', s.p); else if (!declared(s.name)) err('"' + s.name + '" tanımlı değil; önce "int ' + s.name + ' = 0;" yazın.', s.p); ex(s.e); return; }
  if (s.k === 'expr') { ex(s.e); return; }
 }
 ast.forEach(st);
 if (!writes.size && !errors.length) warnings.push({ message: 'Script hiçbir etikete yazmıyor.', line: 1, col: 1 });
 return { ok: !errors.length, errors, warnings, reads: [...reads], writes: [...writes], ast };
}
