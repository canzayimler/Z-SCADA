/** Giriş vitrini için şeffaf zeminli P&ID / telemetri SVG şeması (sıfır kenar izi). */
export function LoginSchematic(){
 return (
  <svg viewBox="0 0 560 320" width="100%" height="100%" fill="none" aria-hidden="true">
   <defs>
    <linearGradient id="ls-steel" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0" stopColor="#4c5c6e" stopOpacity=".45"/>
     <stop offset=".5" stopColor="#2c3745" stopOpacity=".55"/>
     <stop offset="1" stopColor="#1d2632" stopOpacity=".65"/>
    </linearGradient>
    <linearGradient id="ls-liq" x1="0" y1="0" x2="0" y2="1">
     <stop offset="0" stopColor="#6fa0c7" stopOpacity=".42"/>
     <stop offset="1" stopColor="#3b6990" stopOpacity=".22"/>
    </linearGradient>
   </defs>

   {/* İnce referans ölçü çerçevesi ve eksen çizgileri */}
   <path d="M24 274H536" stroke="#313d4c" strokeWidth="1" strokeDasharray="4 4"/>
   <path d="M88 38V274M258 38V274M436 38V274" stroke="#2c3745" strokeWidth="1" strokeDasharray="2 5"/>

   {/* Boru hattı ve flanş bağlantıları */}
   <path d="M134 218H198" stroke="#7d95ad" strokeWidth="8" strokeLinecap="round"/>
   <path d="M134 218H198" stroke="#222b36" strokeWidth="4"/>
   <path d="M142 218H190" stroke="#84a6c6" strokeWidth="1.5" strokeDasharray="6 6"/>

   <path d="M254 196H306V138H348" stroke="#7d95ad" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
   <path d="M254 196H306V138H348" stroke="#222b36" strokeWidth="4" strokeLinejoin="round"/>
   <path d="M262 196H306V138H342" stroke="#84a6c6" strokeWidth="1.5" strokeDasharray="6 6" strokeLinejoin="round"/>

   <path d="M402 138H456V218H504" stroke="#7d95ad" strokeWidth="8" strokeLinecap="round" strokeLinejoin="round"/>
   <path d="M402 138H456V218H504" stroke="#222b36" strokeWidth="4" strokeLinejoin="round"/>
   <path d="M408 138H456V218H498" stroke="#84a6c6" strokeWidth="1.5" strokeDasharray="6 6" strokeLinejoin="round"/>

   {/* Flanşlar */}
   {[138,194,258].map(x=><rect key={x} x={x-2} y="209" width="4" height="18" rx="1" fill="#8fa7bf" opacity=".75"/>)}
   <rect x="342" y="129" width="4" height="18" rx="1" fill="#8fa7bf" opacity=".75"/>
   <rect x="404" y="129" width="4" height="18" rx="1" fill="#8fa7bf" opacity=".75"/>

   {/* Sol: Besleme Tankı T-101 */}
   <rect x="44" y="88" width="90" height="158" rx="14" fill="url(#ls-steel)" stroke="#7fa0bf" strokeWidth="1.8"/>
   <rect x="48" y="142" width="82" height="100" rx="10" fill="url(#ls-liq)"/>
   <path d="M48 142H130" stroke="#8ab7dc" strokeWidth="1.6"/>
   {/* Seviye cetveli */}
   <path d="M122 108v116M116 108h6M118 137h4M116 166h6M118 195h4M116 224h6" stroke="#9eb3c7" strokeWidth="1.2" opacity=".75"/>
   <path d="M58 246v28M120 246v28" stroke="#5b6d82" strokeWidth="2.2" strokeLinecap="round"/>
   <text x="89" y="126" textAnchor="middle" fill="#dce5ef" fontSize="12" fontWeight="700" fontFamily="Consolas,monospace">T-101</text>
   <text x="89" y="190" textAnchor="middle" fill="#eef4fa" fontSize="16" fontWeight="700" fontFamily="Consolas,monospace">%68</text>

   {/* Orta: Santrifüj Pompa P-101 */}
   <circle cx="226" cy="212" r="28" fill="url(#ls-steel)" stroke="#7fa0bf" strokeWidth="1.8"/>
   <circle cx="226" cy="212" r="19" fill="#1b232e" stroke="#566b82" strokeWidth="1.2"/>
   <path d="M226 196v32M210 212h32M215 201l22 22M237 201l-22 22" stroke="#88a6c4" strokeWidth="1.4" strokeLinecap="round"/>
   <circle cx="226" cy="212" r="4.5" fill="#9eb9d4"/>
   <path d="M204 242h44l6 10h-56z" fill="#2c3745" stroke="#5d7288" strokeWidth="1.3"/>
   <text x="226" y="268" textAnchor="middle" fill="#b4c2d1" fontSize="11" fontWeight="600" fontFamily="Consolas,monospace">P-101 · 1450 rpm</text>

   {/* Üst Orta: Oransal Kontrol Vanası KV-102 */}
   <path d="M286 126L306 138L286 150Z" fill="#2b3746" stroke="#7fa0bf" strokeWidth="1.6"/>
   <path d="M326 126L306 138L326 150Z" fill="#2b3746" stroke="#7fa0bf" strokeWidth="1.6"/>
   <path d="M306 138V110" stroke="#8fa7bf" strokeWidth="2.2"/>
   <rect x="290" y="90" width="32" height="20" rx="4" fill="#2c3745" stroke="#7fa0bf" strokeWidth="1.5"/>
   <text x="306" y="104" textAnchor="middle" fill="#dce5ef" fontSize="10" fontWeight="700" fontFamily="Consolas,monospace">KV</text>
   <text x="306" y="80" textAnchor="middle" fill="#9cb0c4" fontSize="10.5" fontFamily="Consolas,monospace">KV-102 · %48</text>

   {/* Sağ: Plakalı Eşanjör E-201 */}
   <rect x="348" y="104" width="54" height="72" rx="6" fill="url(#ls-steel)" stroke="#7fa0bf" strokeWidth="1.8"/>
   {[358,366,374,382,390].map(x=><line key={x} x1={x} y1="112" x2={x} y2="168" stroke="#8aa3bd" strokeWidth="1.6" opacity=".65"/>)}
   <text x="375" y="192" textAnchor="middle" fill="#b4c2d1" fontSize="11" fontWeight="600" fontFamily="Consolas,monospace">E-201</text>

   {/* Telemetri Okuma Kartları (şeffaf çerçeveli teknik rozetler) */}
   <g>
    <rect x="38" y="22" width="128" height="44" rx="7" fill="#212b38" fillOpacity=".86" stroke="#364557" strokeWidth="1.2"/>
    <text x="50" y="39" fill="#8da1b5" fontSize="10" fontFamily="Consolas,monospace">TANK SEVİYESİ</text>
    <text x="50" y="56" fill="#eef3f8" fontSize="14" fontWeight="700" fontFamily="Consolas,monospace">68.2 %</text>
   </g>
   <g>
    <rect x="194" y="22" width="136" height="44" rx="7" fill="#212b38" fillOpacity=".86" stroke="#364557" strokeWidth="1.2"/>
    <text x="206" y="39" fill="#8da1b5" fontSize="10" fontFamily="Consolas,monospace">HAT BASINCI</text>
    <text x="206" y="56" fill="#eef3f8" fontSize="14" fontWeight="700" fontFamily="Consolas,monospace">4.82 bar</text>
   </g>
   <g>
    <rect x="358" y="22" width="164" height="44" rx="7" fill="#212b38" fillOpacity=".86" stroke="#364557" strokeWidth="1.2"/>
    <text x="370" y="39" fill="#8da1b5" fontSize="10" fontFamily="Consolas,monospace">EŞANJÖR ÇIKIŞ</text>
    <text x="370" y="56" fill="#eef3f8" fontSize="14" fontWeight="700" fontFamily="Consolas,monospace">72.4 °C</text>
   </g>

   {/* Sağ alt: Geri okuma doğrulama göstergesi */}
   <g>
    <rect x="336" y="232" width="186" height="32" rx="6" fill="#212b38" fillOpacity=".82" stroke="#364557" strokeWidth="1.1"/>
    <circle cx="351" cy="248" r="3.5" fill="#43d192"/>
    <text x="362" y="252" fill="#cdd7e2" fontSize="10.5" fontWeight="600" fontFamily="Consolas,monospace">GERİ OKUMA: DOĞRULANDI</text>
   </g>
  </svg>
 );
}
