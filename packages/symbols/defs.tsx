/* "Detayli" sembol stilinin degrade ve filtre tanimlari. Sembol basina TEKRARLANMAZ:
 * tuval (Studio) basina tek gizli <svg> icinde durur, semboller `url(#sym-...)` ile
 * CSS'ten (motion.css) basvurur. Kimlikler `sym-` onekiyle sabittir; ayni sayfada
 * ikinci bir Studio olsa bile tanimlar birebir ayni oldugundan cakisma anlam degistirmez.
 * Renkler temadan bagimsizdir: metal her iki temada metal gorunur (referans: sembol-yonleri-v2). */
export const SYMBOL_DEF_IDS=['sym-metal','sym-cast','sym-pipe','sym-pipev','sym-liq','sym-dial','sym-sh'] as const;
export function SymbolDefs(){
 return <svg className="sym-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="sym-metal" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e3e8ed"/><stop offset=".45" stopColor="#a9b4be"/><stop offset="1" stopColor="#6b7783"/></linearGradient>
  <linearGradient id="sym-cast" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#8fa3b6"/><stop offset=".55" stopColor="#5a7086"/><stop offset="1" stopColor="#3b4b5a"/></linearGradient>
  <linearGradient id="sym-pipe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#7d8892"/><stop offset=".4" stopColor="#eef1f4"/><stop offset="1" stopColor="#6d7781"/></linearGradient>
  <linearGradient id="sym-pipev" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#7d8892"/><stop offset=".4" stopColor="#eef1f4"/><stop offset="1" stopColor="#6d7781"/></linearGradient>
  <linearGradient id="sym-liq" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3f79a8"/><stop offset=".5" stopColor="#7fb2da"/><stop offset="1" stopColor="#3f79a8"/></linearGradient>
  <radialGradient id="sym-dial" cx=".45" cy=".35" r=".75"><stop offset="0" stopColor="#ffffff"/><stop offset="1" stopColor="#dfe4e9"/></radialGradient>
  <filter id="sym-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.3" floodColor="#000" floodOpacity=".28"/></filter>
 </defs></svg>;
}
