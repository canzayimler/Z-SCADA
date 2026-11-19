# Z SCADA - yerel ayarlar
# Bu dosyayi hedef bilgisayara gore duzenleyin. Diger betikler bunu okur.

# SCADA web arayuzunun portu
$SCADA_PORT = 3000

# Node-RED (PLC haberlesme koprusu) portu
$NODERED_PORT = 1880

# Web arayuzunun dinleyecegi adres.
#   127.0.0.1 -> yalnizca bu bilgisayardan erisilir (guvenli varsayilan)
#   0.0.0.0   -> agdaki diger bilgisayarlardan da erisilir
# 0.0.0.0 yaparsaniz Windows Guvenlik Duvarinda ilgili porta izin vermeniz gerekir.
$SCADA_HOST = '127.0.0.1'
