/* B26: URL tabanli navigasyon — router kutuphanesi yok, History API ile.
 * Yol cozumleme main.tsx icinde duruyordu; orasi React agacini kuran ve yan
 * etkisi olan bir modul oldugu icin test edilemiyordu. Saf fonksiyonlar
 * burada: `tests/web-routing.test.ts` bunlari dogrudan kosar. */
export const MGMT_PATH:Record<string,string>={devices:'/cihazlar',tags:'/etiketler',commands:'/komutlar',alarms:'/alarmlar',audit:'/kayitlar',dashboard:'/panelim',reports:'/raporlar',energy:'/enerji',settings:'/ayarlar'};
export const PATH_MGMT:Record<string,string>=Object.fromEntries(Object.entries(MGMT_PATH).map(([k,v])=>[v,k]));
export function pathFor(page:string,screenId:string,defaultScreenId:string):string{if(page==='editor')return '/tasarim/'+encodeURIComponent(screenId);if(page==='preview')return '/onizleme/'+encodeURIComponent(screenId);if(page==='runtime')return screenId&&screenId!==defaultScreenId?'/ekran/'+encodeURIComponent(screenId):'/';return MGMT_PATH[page]||'/';}
export function parsePath(pathname:string):{page:string;screenId?:string}|null{const parts=pathname.split('/').filter(Boolean);if(!parts.length)return {page:'runtime'};if(parts[0]==='ekran'&&parts[1])return {page:'runtime',screenId:decodeURIComponent(parts[1])};if(parts[0]==='tasarim'&&parts[1])return {page:'editor',screenId:decodeURIComponent(parts[1])};if(parts[0]==='onizleme'&&parts[1])return {page:'preview',screenId:decodeURIComponent(parts[1])};if(parts.length===1&&PATH_MGMT['/'+parts[0]])return {page:PATH_MGMT['/'+parts[0]]};return null;}
/** Sayfa geçişinde /api/project yeniden çekilsin mi? Eskiden her geçişte (ve açılışta iki kez)
 * tüm proje bekletilerek çekiliyordu. Kayıt/yayın sonrası tazeleme açıkça yapılır; geçişte
 * yalnız son çekim PROJECT_STALE_MS'den eskiyse arka planda tazelenir (başka oturumun değişikliği). */
export const PROJECT_STALE_MS=30000;
export function projectStale(lastFetchAt:number,now:number):boolean{return !lastFetchAt||now-lastFetchAt>=PROJECT_STALE_MS;}
