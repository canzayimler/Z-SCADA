/* İşlem kayıtları için saf hesaplar: ham işlem kodunu okunur ada ve kategoriye çevirir,
   ayrıntıdan tek satırlık özet çıkarır, zaman damgalarını kovalara sayar. */

export const AUDIT_CATEGORIES = {
 command: 'Komut',
 alarm: 'Alarm',
 screen: 'Ekran',
 config: 'Yapılandırma',
 recipe: 'Reçete',
 shift: 'Vardiya',
 user: 'Kullanıcı',
 system: 'Sistem',
} as const;
export type AuditCategory = keyof typeof AUDIT_CATEGORIES;

const LABELS: Record<string, string> = {
 'command.accepted': 'Komut gönderildi',
 'command.rejected': 'Komut reddedildi',
 'command.reconciled': 'Komut sonucu uzlaştırıldı',
 'command.late': 'Komut geç sonuçlandı',
 'command.approved': 'Komut onaylandı',
 'command.approval.requested': 'Komut onayı istendi',
 'command.approval.rejected': 'Komut onayı reddedildi',
 'command.approval.failed': 'Komut onayı başarısız',
 'alarm.raised': 'Alarm oluştu',
 'alarm.cleared': 'Alarm normale döndü',
 'alarm.acknowledged': 'Alarm onaylandı',
 'alarm.shelved': 'Alarm rafa kaldırıldı',
 'alarm.unshelved': 'Alarm raftan indirildi',
 'alarm.rules.saved': 'Alarm kuralları kaydedildi',
 'alarm.policy.saved': 'Alarm politikası kaydedildi',
 'alarm.flood.started': 'Alarm seli başladı',
 'alarm.flood.ended': 'Alarm seli bitti',
 'screen.created': 'Ekran oluşturuldu',
 'screen.published': 'Ekran yayınlandı',
 'screen.deleted': 'Ekran silindi',
 'screen.restored': 'Ekran sürümü geri yüklendi',
 'screens.layout': 'Ekran sırası değişti',
 'config.saved': 'Yapılandırma kaydedildi',
 'tag.rebound': 'Etiket bağları taşındı',
 'equipment.types.saved': 'Ekipman tipleri kaydedildi',
 'project.saved': 'Proje kaydedildi',
 'project.opened': 'Proje açıldı',
 'project.imported': 'Proje içe aktarıldı',
 'project.deleted': 'Proje silindi',
 'package.imported': 'Paket içe aktarıldı',
 'package.exported': 'Paket dışa aktarıldı',
 'library.imported': 'Kütüphane içe aktarıldı',
 'library.exported': 'Kütüphane dışa aktarıldı',
 'image.uploaded': 'Görsel yüklendi',
 'image.rejected': 'Görsel reddedildi',
 'image.deleted': 'Görsel silindi',
 'image.cleanup': 'Kullanılmayan görseller temizlendi',
 'recipe.saved': 'Reçete kaydedildi',
 'recipe.apply.started': 'Reçete uygulaması başladı',
 'recipe.apply.finished': 'Reçete uygulandı',
 'recipe.apply.stopped': 'Reçete uygulaması durdu',
 'shift.note': 'Vardiya notu eklendi',
 'user.created': 'Kullanıcı oluşturuldu',
 'user.updated': 'Kullanıcı güncellendi',
 'user.password.changed': 'Parola değiştirildi',
 'user.sessions.revoked': 'Oturumlar kapatıldı',
 'reauth.ok': 'Yeniden kimlik doğrulandı',
 'reauth.failed': 'Kimlik doğrulama başarısız',
 'gateway.applied': 'Node-RED köprüsü uygulandı',
 'connection.secret.set': 'Bağlantı kimlik bilgisi değiştirildi',
 'connection.secret.deleted': 'Bağlantı kimlik bilgisi silindi',
 'cluster.promoted': 'Sunucu birincil oldu',
 'cluster.demoted': 'Sunucu yedeğe geçti',
 'disk.low': 'Disk alanı azaldı',
 'disk.recovered': 'Disk alanı düzeldi',
 'backup.created': 'Yedek alındı',
 'retention.pruned': 'Eski kayıtlar temizlendi',
 'process.error': 'Sunucu hatası',
};

export function auditCategory(action: string): AuditCategory {
 const head = action.split('.')[0];
 if (head === 'command') return 'command';
 if (head === 'alarm') return 'alarm';
 if (head === 'screen' || head === 'screens') return 'screen';
 if (action.startsWith('recipe.apply')) return 'recipe';
 if (head === 'shift') return 'shift';
 if (head === 'user' || head === 'reauth') return 'user';
 if (['config', 'tag', 'equipment', 'project', 'package', 'library', 'image', 'recipe'].includes(head)) return 'config';
 return 'system';
}

/** Bilinen kod → Türkçe ad; bilinmeyen kod olduğu gibi kalır (uydurma ad üretilmez). */
export function auditLabel(action: string) {
 return LABELS[action] ?? action;
}

const SUMMARY_KEYS = ['name', 'title', 'username', 'code', 'screenName', 'message', 'reason', 'file', 'text'];

/** Ayrıntıdan tek satırlık özet: önce üst düzey, sonra bir alt düzey tanıdık alan. */
export function auditSummary(details: unknown): string {
 if (!details || typeof details !== 'object') return details == null ? '' : String(details);
 const d = details as Record<string, unknown>;
 const pick = (o: Record<string, unknown>) => {
  for (const k of SUMMARY_KEYS) if (typeof o[k] === 'string' && o[k]) return String(o[k]);
  return '';
 };
 const top = pick(d);
 if (top) return top;
 for (const v of Object.values(d)) if (v && typeof v === 'object' && !Array.isArray(v)) {
  const inner = pick(v as Record<string, unknown>);
  if (inner) return inner;
 }
 if (typeof d.revision === 'number') return 'rev ' + d.revision;
 if (typeof d.id === 'string') return d.id.slice(0, 8);
 return '';
}

/** Ayrıntının düz (sayı/yazı/mantıksal) alanları; iç içe nesneler ham görünümde kalır. */
export function auditFields(details: unknown): [string, string][] {
 if (!details || typeof details !== 'object' || Array.isArray(details)) return [];
 return Object.entries(details as Record<string, unknown>)
  .filter(([, v]) => v === null || ['string', 'number', 'boolean'].includes(typeof v))
  .map(([k, v]) => [k, String(v)]);
}

/** Zaman damgalarını aralık kovalarına sayar (sınırda olan son kovaya düşer). */
export function countBuckets(times: number[], from: number, to: number, size: number) {
 const n = Math.max(1, Math.ceil((to - from) / size));
 const buckets = Array.from({ length: n }, (_, i) => ({ from: from + i * size, to: Math.min(to, from + (i + 1) * size), count: 0 }));
 for (const t of times) {
  if (t < from || t > to) continue;
  buckets[Math.min(n - 1, Math.floor((t - from) / size))].count++;
 }
 return buckets;
}
