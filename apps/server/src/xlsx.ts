import {deflateRawSync} from 'node:zlib';
/* Bagimliliksiz, kucuk .xlsx yazici (Office Open XML). Yalniz ihtiyac olan kadar: satir satir
 * hucre, sayi / metin / tarih, birkac sabit bicim, sutun genisligi, ust satir dondurma ve
 * otomatik filtre. Metin hucreleri inlineStr: paylasilan metin tablosu gerekmez. */

export type CellStyle='text'|'header'|'title'|'muted'|'dateTime'|'date'|'month'|'num'|'int'|'pct'|'money'|'totalLabel'|'totalNum'|'totalMoney'|'warn';
export type Cell=null|string|number|{v:string|number|null;s?:CellStyle;date?:boolean};
export type Sheet={name:string;rows:Cell[][];widths?:number[];freezeRow?:number;filterRow?:number};

// cellXfs sirasi: index = stil numarasi. numFmt 164+ ozel.
const STYLE_INDEX:Record<CellStyle,number>={text:0,header:1,title:2,muted:3,dateTime:4,date:5,month:6,num:7,int:8,pct:9,money:10,totalLabel:11,totalNum:12,totalMoney:13,warn:14};
const STYLES_XML=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="6"><numFmt numFmtId="164" formatCode="dd.mm.yyyy hh:mm"/><numFmt numFmtId="165" formatCode="dd.mm.yyyy"/><numFmt numFmtId="166" formatCode="mmmm yyyy"/><numFmt numFmtId="167" formatCode="#,##0.00"/><numFmt numFmtId="168" formatCode="0.0&quot;%&quot;"/><numFmt numFmtId="169" formatCode="#,##0.00"/></numFmts>
<fonts count="5"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="14"/><name val="Calibri"/></font><font><sz val="10"/><color rgb="FF6B7280"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFB42318"/><name val="Calibri"/></font></fonts>
<fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEF4"/><bgColor indexed="64"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F4F6"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top style="thin"><color rgb="FF9CA3AF"/></top><bottom/><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="15">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"><alignment wrapText="1" vertical="center"/></xf>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="168" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="169" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="167" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="169" fontId="1" fillId="3" borderId="1" xfId="0" applyNumberFormat="1" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="0" fontId="4" fillId="0" borderId="0" xfId="0" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`;

const esc=(s:string)=>s.replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]!))
 // XML 1.0'da gecersiz kontrol karakterleri dosyayi bozar; sessizce at.
 .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g,'');
export function colName(i:number){let s='';i++;while(i>0){const m=(i-1)%26;s=String.fromCharCode(65+m)+s;i=Math.floor((i-1)/26);}return s;}
/** Yerel duvar saati -> Excel seri tarih (1900 sistemi). Excel saat dilimi bilmez; ekranda
 * gorulen saat hucrede de ayni gorunsun diye ofset uygulanir. */
export function excelDate(ms:number){const d=new Date(ms);return (ms-d.getTimezoneOffset()*60000)/86400000+25569;}

function cellXml(c:Cell,ref:string){
 if(c===null||c===undefined)return '';
 const o=typeof c==='object'?c:{v:c};
 if(o.v===null||o.v===undefined||(typeof o.v==='number'&&!Number.isFinite(o.v)))return o.s?`<c r="${ref}" s="${STYLE_INDEX[o.s]}"/>`:'';
 const s=o.s?` s="${STYLE_INDEX[o.s]}"`:'';
 if(typeof o.v==='number'){const v=o.date?excelDate(o.v):o.v;return `<c r="${ref}"${s}><v>${v}</v></c>`;}
 return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(String(o.v))}</t></is></c>`;
}
function sheetXml(sh:Sheet){
 const cols=sh.widths?.length?'<cols>'+sh.widths.map((w,i)=>`<col min="${i+1}" max="${i+1}" width="${w}" customWidth="1"/>`).join('')+'</cols>':'';
 const pane=sh.freezeRow?`<sheetViews><sheetView workbookViewId="0"><pane ySplit="${sh.freezeRow}" topLeftCell="A${sh.freezeRow+1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>`:'<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
 const rows=sh.rows.map((r,ri)=>`<row r="${ri+1}">`+r.map((c,ci)=>cellXml(c,colName(ci)+(ri+1))).join('')+'</row>').join('');
 const width=Math.max(1,...sh.rows.map(r=>r.length));
 const filter=sh.filterRow&&sh.rows.length>sh.filterRow-1?`<autoFilter ref="A${sh.filterRow}:${colName(width-1)}${Math.max(sh.filterRow,sh.rows.length)}"/>`:'';
 return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">${pane}<sheetFormatPr defaultRowHeight="15"/>${cols}<sheetData>${rows}</sheetData>${filter}</worksheet>`;
}
/** Excel sayfa adi kurallari: en fazla 31 karakter, []:*?/\ yok, tekil. */
export function sheetName(name:string,taken:Set<string>){
 let base=name.replace(/[\[\]:*?/\\]/g,' ').trim().slice(0,31)||'Sayfa',n=base,i=2;
 while(taken.has(n.toLowerCase()))n=base.slice(0,28)+' '+(i++);
 taken.add(n.toLowerCase());return n;
}
export function workbook(sheets:Sheet[]):Buffer{
 const taken=new Set<string>(),names=sheets.map(s=>sheetName(s.name,taken));
 const files:[string,string][]=[
  ['[Content_Types].xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${sheets.map((_,i)=>`<Override PartName="/xl/worksheets/sheet${i+1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`],
  ['_rels/.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
  ['xl/workbook.xml',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n,i)=>`<sheet name="${esc(n)}" sheetId="${i+1}" r:id="rId${i+1}"/>`).join('')}</sheets>${sheets.some(s=>s.filterRow)?'<definedNames>'+sheets.map((s,i)=>s.filterRow?`<definedName name="_xlnm._FilterDatabase" localSheetId="${i}" hidden="1">'${esc(names[i].replace(/'/g,"''"))}'!$A$${s.filterRow}:$${colName(Math.max(1,...s.rows.map(r=>r.length))-1)}$${Math.max(s.filterRow,s.rows.length)}</definedName>`:'').join('')+'</definedNames>':''}</workbook>`],
  ['xl/_rels/workbook.xml.rels',`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_,i)=>`<Relationship Id="rId${i+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i+1}.xml"/>`).join('')}<Relationship Id="rId${sheets.length+1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
  ['xl/styles.xml',STYLES_XML],
  ...sheets.map((s,i)=>[`xl/worksheets/sheet${i+1}.xml`,sheetXml(s)] as [string,string])];
 return zip(files.map(([n,c])=>[n,Buffer.from(c,'utf8')]));
}

/* --- Zip (deflate, tek disk) --------------------------------------------------------------- */
const CRC_TABLE=(()=>{const t=new Uint32Array(256);for(let n=0;n<256;n++){let c=n;for(let k=0;k<8;k++)c=c&1?0xEDB88320^(c>>>1):c>>>1;t[n]=c>>>0;}return t;})();
export function crc32(buf:Buffer){let c=0xFFFFFFFF;for(let i=0;i<buf.length;i++)c=CRC_TABLE[(c^buf[i])&0xFF]^(c>>>8);return (c^0xFFFFFFFF)>>>0;}
export function zip(entries:[string,Buffer][]):Buffer{
 const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
 // Sabit DOS zamani (1980-01-01): ayni icerik ayni bayt dizisini uretir.
 const dosTime=0,dosDate=(0<<9)|(1<<5)|1;
 for(const [name,data] of entries){
  const nameBuf=Buffer.from(name,'utf8'),comp=deflateRawSync(data),crc=crc32(data);
  const local=Buffer.alloc(30);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt16LE(0x0800,6);local.writeUInt16LE(8,8);
  local.writeUInt16LE(dosTime,10);local.writeUInt16LE(dosDate,12);local.writeUInt32LE(crc,14);
  local.writeUInt32LE(comp.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(nameBuf.length,26);local.writeUInt16LE(0,28);
  const central=Buffer.alloc(46);
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt16LE(0x0800,8);central.writeUInt16LE(8,10);
  central.writeUInt16LE(dosTime,12);central.writeUInt16LE(dosDate,14);central.writeUInt32LE(crc,16);central.writeUInt32LE(comp.length,20);
  central.writeUInt32LE(data.length,24);central.writeUInt16LE(nameBuf.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,nameBuf,comp);centrals.push(central,nameBuf);
  offset+=30+nameBuf.length+comp.length;
 }
 const cd=Buffer.concat(centrals),end=Buffer.alloc(22);
 end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(entries.length,8);end.writeUInt16LE(entries.length,10);
 end.writeUInt32LE(cd.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,cd,end]);
}
