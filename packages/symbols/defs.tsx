/* "Detayli" sembol stilinin degrade ve filtre tanimlari. Sembol basina TEKRARLANMAZ:
 * tuval (Studio) basina tek gizli <svg> icinde durur, semboller `url(#sym-...)` ile
 * CSS'ten (motion.css) basvurur. Kimlikler `sym-` onekiyle sabittir; ayni sayfada
 * ikinci bir Studio olsa bile tanimlar birebir ayni oldugundan cakisma anlam degistirmez.
 * Renkler temadan bagimsizdir: metal her iki temada metal gorunur (referans: sembol-yonleri-v2). */
export const SYMBOL_DEF_IDS=['sym-metal','sym-cast','sym-pipe','sym-pipev','sym-liq','sym-dial','sym-bezel','sym-glass','sym-sh'] as const;
export function SymbolDefs(){
 return <svg className="sym-defs" width="0" height="0" aria-hidden="true" focusable="false"><defs>
  <linearGradient id="sym-metal" x1="0" y1="0" x2="0" y2="1">
   <stop offset="0" stopColor="#eef2f6"/>
   <stop offset=".18" stopColor="#d3dbe3"/>
   <stop offset=".52" stopColor="#9eabba"/>
   <stop offset=".85" stopColor="#778492"/>
   <stop offset="1" stopColor="#5f6b78"/>
  </linearGradient>
  <linearGradient id="sym-cast" x1="0" y1="0" x2="1" y2="1">
   <stop offset="0" stopColor="#9db1c4"/>
   <stop offset=".3" stopColor="#73899e"/>
   <stop offset=".7" stopColor="#50657a"/>
   <stop offset="1" stopColor="#354554"/>
  </linearGradient>
  <linearGradient id="sym-pipe" x1="0" y1="0" x2="0" y2="1">
   <stop offset="0" stopColor="#6a7580"/>
   <stop offset=".28" stopColor="#d6dde4"/>
   <stop offset=".45" stopColor="#f5f8fa"/>
   <stop offset=".75" stopColor="#9aa5b0"/>
   <stop offset="1" stopColor="#5e6873"/>
  </linearGradient>
  <linearGradient id="sym-pipev" x1="0" y1="0" x2="1" y2="0">
   <stop offset="0" stopColor="#6a7580"/>
   <stop offset=".28" stopColor="#d6dde4"/>
   <stop offset=".45" stopColor="#f5f8fa"/>
   <stop offset=".75" stopColor="#9aa5b0"/>
   <stop offset="1" stopColor="#5e6873"/>
  </linearGradient>
  <linearGradient id="sym-liq" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stopColor="#3b74a2"/><stop offset=".5" stopColor="#85b9e0"/><stop offset="1" stopColor="#3b74a2"/></linearGradient>
  <radialGradient id="sym-dial" cx=".45" cy=".35" r=".75"><stop offset="0" stopColor="#ffffff"/><stop offset=".75" stopColor="#eef2f6"/><stop offset="1" stopColor="#d5dce3"/></radialGradient>
  <linearGradient id="sym-bezel" x1="0" y1="0" x2="1" y2="1">
   <stop offset="0" stopColor="#f3f6f9"/>
   <stop offset=".35" stopColor="#9ca8b4"/>
   <stop offset=".7" stopColor="#4c5865"/>
   <stop offset="1" stopColor="#d0d8e0"/>
  </linearGradient>
  <linearGradient id="sym-glass" x1="0" y1="0" x2="0" y2="1">
   <stop offset="0" stopColor="#ffffff" stopOpacity=".42"/>
   <stop offset=".55" stopColor="#ffffff" stopOpacity=".1"/>
   <stop offset="1" stopColor="#ffffff" stopOpacity="0"/>
  </linearGradient>
  <filter id="sym-sh" x="-20%" y="-20%" width="140%" height="150%"><feDropShadow dx="0" dy="1.6" stdDeviation="1.3" floodColor="#000" floodOpacity=".28"/></filter>
 </defs></svg>;
}
