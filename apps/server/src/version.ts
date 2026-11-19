import pkg from '../../../package.json';
/** Uygulamanin tek surum kaynagi: kok package.json `version`. /api/health bunu raporlar; installer/build.ps1
 * kurucu surumunu bundan alir (farkli -Version verilirse derleme durur). */
export const APP_VERSION:string=pkg.version;
