/* Komut scripti yorumlayıcısı. Yalnız packages/contracts/script.ts'in ürettiği ağacı
 * yürütür; eval yok. Saha ile tek temas noktası `host`: okuma (tazelik denetimli) ve
 * yazma (köprü onayı beklenir). Her bekleme durdurulabilir; durdurma, süre sınırı,
 * adım sınırı ya da herhangi bir hata `run()`'ı reddeder — güvenli durumu çağıran
 * (Commands) yazar. Bu sınıf saha durumunu kendisi "düzeltmeye" çalışmaz. */
import { SCRIPT_FUNCTIONS, SCRIPT_INPUT, SCRIPT_LIMITS, type Expr, type Stmt } from '../../../packages/contracts/script';

type Val = number | boolean | string;
export type ScriptHost = {
 /** Etiket adı → id (kayıtta çözülmüş, burada tekrar çözülür). */
 resolve: (name: string) => string;
 /** Güncel ve iyi kaliteli değer; değilse hata fırlatır. */
 read: (tagId: string) => boolean | number;
 /** Yazar ve köprünün onayını bekler. Değer dönüşümü (0/1 → bool) çağırandadır. */
 write: (tagId: string, value: boolean | number, n: number) => Promise<void>;
 isBool: (tagId: string) => boolean;
 log: (text: string) => void;
};

export class ScriptStopped extends Error {}
class Return {}

export class ScriptRun {
 aborted: string | null = null;
 steps = 0;
 writes = 0;
 readonly started = Date.now();
 private wakers = new Set<() => void>();
 private timer: ReturnType<typeof setTimeout> | null = null;
 constructor(private ast: Stmt[], private host: ScriptHost, private input: boolean | number, readonly maxRunMs: number) {}

 /** Çalışmayı keser: bekleyen her uyku hemen uyanır ve hata ile döner. */
 abort(reason: string) {
  if (this.aborted) return;
  this.aborted = reason;
  for (const w of [...this.wakers]) w();
 }

 async run() {
  this.timer = setTimeout(() => this.abort('Süre sınırı aşıldı (' + Math.round(this.maxRunMs / 1000) + ' sn).'), this.maxRunMs);
  try {
   const scope: Map<string, Val>[] = [new Map([[SCRIPT_INPUT, this.input]])];
   try { for (const s of this.ast) await this.stmt(s, scope); } catch (e) { if (!(e instanceof Return)) throw e; }
   this.check();
  } finally { if (this.timer) clearTimeout(this.timer); }
 }

 private check() { if (this.aborted) throw new ScriptStopped(this.aborted); }
 private async tickStep() {
  this.check();
  if (++this.steps > SCRIPT_LIMITS.maxSteps) throw Error('Adım sınırı aşıldı (' + SCRIPT_LIMITS.maxSteps + '); döngüde wait() eksik olabilir.');
  // Uzun hesaplamada olay döngüsünü bırak: sunucu canlı veri ve komutlara yanıt vermeye devam etsin.
  if (this.steps % 500 === 0) await new Promise<void>((r) => setImmediate(r));
 }
 private sleep(ms: number) {
  this.check();
  return new Promise<void>((resolve, reject) => {
   const done = () => { clearTimeout(t); this.wakers.delete(done); this.aborted ? reject(new ScriptStopped(this.aborted)) : resolve(); };
   const t = setTimeout(done, Math.max(0, ms));
   this.wakers.add(done);
  });
 }

 private find(scope: Map<string, Val>[], name: string) { for (let i = scope.length - 1; i >= 0; i--) if (scope[i].has(name)) return scope[i]; return null; }

 private async stmt(s: Stmt, scope: Map<string, Val>[]): Promise<void> {
  await this.tickStep();
  switch (s.k) {
   case 'block': { scope.push(new Map()); try { for (const x of s.body) await this.stmt(x, scope); } finally { scope.pop(); } return; }
   case 'if': if (truthy(await this.ex(s.cond, scope))) await this.stmt(s.then, scope); else if (s.else) await this.stmt(s.else, scope); return;
   case 'while': while (truthy(await this.ex(s.cond, scope))) { await this.stmt(s.body, scope); await this.tickStep(); } return;
   case 'decl': scope[scope.length - 1].set(s.name, s.init ? await this.ex(s.init, scope) : 0); return;
   case 'assign': {
    const sc = this.find(scope, s.name); if (!sc) throw Error('"' + s.name + '" tanımlı değil.');
    const v = await this.ex(s.e, scope);
    sc.set(s.name, s.op === '=' ? v : s.op === '+=' ? num(sc.get(s.name)!) + num(v) : num(sc.get(s.name)!) - num(v));
    return;
   }
   case 'expr': await this.ex(s.e, scope); return;
   case 'return': throw new Return();
  }
 }

 private async ex(e: Expr, scope: Map<string, Val>[]): Promise<Val> {
  this.check();
  switch (e.k) {
   case 'num': case 'bool': case 'str': return e.v;
   case 'var': { const sc = this.find(scope, e.name); if (!sc) throw Error('"' + e.name + '" tanımlı değil.'); return sc.get(e.name)!; }
   case 'un': { const v = await this.ex(e.e, scope); return e.op === '!' ? !truthy(v) : -num(v); }
   case 'bin': {
    if (e.op === '&&') return truthy(await this.ex(e.a, scope)) && truthy(await this.ex(e.b, scope));
    if (e.op === '||') return truthy(await this.ex(e.a, scope)) || truthy(await this.ex(e.b, scope));
    const a = await this.ex(e.a, scope), b = await this.ex(e.b, scope);
    if (e.op === '==' || e.op === '!=') { const eq = typeof a === 'string' || typeof b === 'string' ? a === b : num(a) === num(b); return e.op === '==' ? eq : !eq; }
    const x = num(a), y = num(b);
    switch (e.op) {
     case '+': return x + y; case '-': return x - y; case '*': return x * y;
     case '/': if (y === 0) throw Error('Sıfıra bölme (satır ' + e.p.line + ').'); return x / y;
     case '%': if (y === 0) throw Error('Sıfıra bölme (satır ' + e.p.line + ').'); return x % y;
     case '<': return x < y; case '<=': return x <= y; case '>': return x > y; case '>=': return x >= y;
    }
    throw Error('Bilinmeyen işlem: ' + e.op);
   }
   case 'call': return this.call(e, scope);
  }
 }

 private async call(e: Extract<Expr, { k: 'call' }>, scope: Map<string, Val>[]): Promise<Val> {
  if (!SCRIPT_FUNCTIONS[e.fn]) throw Error('Bilinmeyen fonksiyon: ' + e.fn);
  const tagOf = () => this.host.resolve((e.args[0] as { v: string }).v);
  const ms = async (x: Expr) => { const v = num(await this.ex(x, scope)); if (!(v >= 0 && v <= SCRIPT_LIMITS.maxWaitMs)) throw Error('Süre 0–' + SCRIPT_LIMITS.maxWaitMs + ' ms olmalı, ' + v + ' verildi (satır ' + x.p.line + ').'); return v; };
  switch (e.fn) {
   case 'read': return this.host.read(tagOf());
   case 'write': { const id = tagOf(), v = await this.ex(e.args[1], scope); await this.doWrite(id, v); return true; }
   case 'pulse': { const id = tagOf(), d = await ms(e.args[1]); await this.doWrite(id, true); await this.sleep(d); await this.doWrite(id, false); return true; }
   case 'wait': await this.sleep(await ms(e.args[0])); return true;
   case 'waitUntil': {
    const limit = await ms(e.args[1]), t0 = Date.now();
    for (;;) {
     if (truthy(await this.ex(e.args[0], scope))) return true;
     const left = limit - (Date.now() - t0); if (left <= 0) return false;
     await this.sleep(Math.min(SCRIPT_LIMITS.pollMs, left));
    }
   }
   case 'holdFor': {
    const need = await ms(e.args[1]), t0 = Date.now();
    for (;;) {
     if (!truthy(await this.ex(e.args[0], scope))) return false;
     const left = need - (Date.now() - t0); if (left <= 0) return true;
     await this.sleep(Math.min(SCRIPT_LIMITS.pollMs, left));
    }
   }
   case 'log': { const parts: string[] = []; for (const a of e.args) parts.push(fmt(await this.ex(a, scope))); this.host.log(parts.join(' ')); return true; }
   case 'stop': throw new ScriptStopped(e.args[0] ? fmt(await this.ex(e.args[0], scope)) : 'Script stop() ile durdu.');
   case 'abs': return Math.abs(num(await this.ex(e.args[0], scope)));
   case 'round': return Math.round(num(await this.ex(e.args[0], scope)));
   case 'min': return Math.min(num(await this.ex(e.args[0], scope)), num(await this.ex(e.args[1], scope)));
   case 'max': return Math.max(num(await this.ex(e.args[0], scope)), num(await this.ex(e.args[1], scope)));
   case 'elapsed': return Date.now() - this.started;
  }
  throw Error('Bilinmeyen fonksiyon: ' + e.fn);
 }

 private async doWrite(tagId: string, v: Val) {
  this.check();
  if (++this.writes > SCRIPT_LIMITS.maxWrites) throw Error('Yazma sınırı aşıldı (' + SCRIPT_LIMITS.maxWrites + ' yazma / çalışma).');
  const value = this.host.isBool(tagId) ? truthy(v) : num(v);
  await this.host.write(tagId, value, this.writes);
  this.check();
 }
}

export function truthy(v: Val) { if (typeof v === 'string') throw Error('Metin koşulda kullanılamaz.'); return typeof v === 'boolean' ? v : v !== 0; }
export function num(v: Val) { if (typeof v === 'string') throw Error('Metin sayı yerine kullanılamaz.'); return typeof v === 'boolean' ? (v ? 1 : 0) : v; }
const fmt = (v: Val) => (typeof v === 'number' ? String(Math.round(v * 1000) / 1000) : String(v));
