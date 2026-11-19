'use strict';
/* Z SCADA icin en kucuk BACnet/IP okuma dugumleri (@innovation-system/node-bacnet uzerinde).
 *
 * Neden ayri paket: hazir node-red-contrib-bacnet istemcisi acilista kosulsuz Who-Is YAYINI gonderir
 * (whoIs() -> 255.255.255.255 / alt ag yayini) ve tek bir port alanini hem yerel baglama hem hedef icin kullanir.
 * Sahada BMS aginda istenmeyen yayin trafigi ve ayni PC'deki BMS yazilimiyla 47808 cakismasi demektir.
 * Bu paket:
 *  - 'zscada-bacnet-client' (yapilandirma): yerel arayuz + yerel UDP portunda TEK istemci. reuseAddr KAPALI: port
 *    baska yazilimda doluysa paketler sessizce paylasilmaz, hata acikca gorunur ve 5 sn'de bir yeniden denenir.
 *  - 'zscada-bacnet-read': cihazin TEKIL (unicast) IPv4:port adresine ReadPropertyMultiple yollar. Who-Is, I-Am,
 *    yayin ya da yazma servisi YOKTUR. Istekler dugum basina sirayla (tek bekleyen istek) gider; kuyruk sinirli.
 * Girdi: msg.bacnetObjects=[{type,instance,props:[ozellik numaralari]}] (en cok 64 nesne).
 * Cikti (her istek icin tek mesaj, ayni msg nesnesi): basarida msg.payload=[{type,instance,props:{<id>:{t,v}|{e}}}],
 * hatada (zaman asimi, BACnet hata/iptal, istemci hazir degil) msg.error=metin ve msg.payload=null.
 * Bu dugum node.error ile msg'siz hata VERMEZ: her girdi tam olarak bir cikti uretir (donusum dugumu 'bad' yazabilsin).
 */
module.exports = function (RED) {
    const lib = require('@innovation-system/node-bacnet');
    const Client = lib.default || lib;
    const MAX_OBJECTS = 64, MAX_QUEUE = 32, REOPEN_MS = 5000;

    function ipv4(s) {
        const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s || '').trim());
        if (!m) return null;
        const o = m.slice(1).map(Number);
        return o.some((x) => x > 255) ? null : o;
    }
    /** Tekil hedef: 0.x, 224+ (cok noktaya / yayin) ve 255.255.255.255 reddedilir. */
    function unicastTarget(s) {
        const o = ipv4(s);
        return !!o && o[0] !== 0 && o[0] < 224;
    }

    function ClientNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const iface = ipv4(config.iface) ? String(config.iface).trim() : '0.0.0.0';
        const port = parseInt(config.localPort, 10);
        node.localPort = port >= 1 && port <= 65535 ? port : 47809;
        node.iface = iface;
        node.apduTimeout = Math.max(500, Math.min(30000, parseInt(config.apduTimeout, 10) || 3000));
        node.client = null;
        node.ready = false;
        let timer = null, closing = false;
        function open() {
            timer = null;
            if (closing) return;
            let c;
            try {
                c = new Client({ port: node.localPort, interface: node.iface, apduTimeout: node.apduTimeout, reuseAddr: false });
            } catch (err) {
                node.error('BACnet istemcisi açılamadı (' + node.iface + ':' + node.localPort + '): ' + err.message);
                timer = setTimeout(open, REOPEN_MS);
                return;
            }
            node.client = c;
            c.on('listening', () => {
                if (node.client !== c) return;
                node.ready = true;
                node.log('BACnet istemci dinliyor: ' + node.iface + ':' + node.localPort + ' (yayın/Who-Is gönderilmez)');
            });
            c.on('error', (err) => {
                if (node.client !== c) return;
                node.ready = false;
                node.client = null;
                node.error('BACnet istemci hatası (' + node.iface + ':' + node.localPort + '): ' + (err && err.message ? err.message : err));
                try { c.close(); } catch (e) { /* zaten kapali */ }
                if (!closing && !timer) timer = setTimeout(open, REOPEN_MS);
            });
        }
        open();
        node.on('close', (done) => {
            closing = true;
            if (timer) clearTimeout(timer);
            node.ready = false;
            const c = node.client;
            node.client = null;
            if (c) { try { c.close(); } catch (e) { /* zaten kapali */ } }
            done();
        });
    }
    RED.nodes.registerType('zscada-bacnet-client', ClientNode);

    /** Kutuphanenin RPM sonucu -> duz JSON: ozellik basina ilk deger {t:uygulama etiketi,v} ya da hata {e:'sinif:kod'}. */
    function normalize(res) {
        const out = [];
        for (const obj of (res && Array.isArray(res.values) ? res.values : [])) {
            if (!obj || !obj.objectId) continue;
            const props = {};
            for (const p of (Array.isArray(obj.values) ? obj.values : [])) {
                const first = p && Array.isArray(p.value) ? p.value[0] : undefined;
                if (!first) { props[p.id] = { e: 'bos' }; continue; }
                if (first.type === 105 || (first.value && first.value.errorClass !== undefined)) {
                    const v = first.value || {};
                    props[p.id] = { e: String(v.errorClass) + ':' + String(v.errorCode) };
                } else props[p.id] = { t: first.type, v: first.value };
            }
            out.push({ type: obj.objectId.type, instance: obj.objectId.instance, props });
        }
        return out;
    }
    function sanitize(list) {
        if (!Array.isArray(list) || !list.length || list.length > MAX_OBJECTS) return null;
        const req = [];
        for (const o of list) {
            const type = Number(o && o.type), instance = Number(o && o.instance);
            const props = Array.isArray(o && o.props) ? o.props.map(Number) : [];
            if (!Number.isInteger(type) || type < 0 || type > 1023 || !Number.isInteger(instance) || instance < 0 || instance > 4194302) return null;
            if (!props.length || props.length > 8 || props.some((id) => !Number.isInteger(id) || id < 0 || id > 4194303)) return null;
            req.push({ objectId: { type, instance }, properties: props.map((id) => ({ id })) });
        }
        return req;
    }

    function ReadNode(config) {
        RED.nodes.createNode(this, config);
        const node = this;
        const conn = RED.nodes.getNode(config.client);
        const address = String(config.address || '').trim();
        const port = parseInt(config.port, 10) || 47808;
        const target = address + ':' + port;
        const valid = unicastTarget(address) && port >= 1 && port <= 65535;
        const queue = [];
        let busy = false, closed = false;
        if (!valid) {
            node.status({ fill: 'red', shape: 'ring', text: 'geçersiz hedef' });
            node.error('BACnet hedefi tekil bir IPv4 olmalı: ' + target);
        } else node.log('BACnet hedef: ' + target + ' (tekil, ReadPropertyMultiple)');
        function finish(item, err, res) {
            const { msg, send, done } = item;
            if (err) { msg.error = 'BACnet okuma hatası: ' + (err && err.message ? err.message : String(err)); msg.payload = null; }
            else { delete msg.error; msg.payload = normalize(res); }
            node.status(err ? { fill: 'red', shape: 'ring', text: msg.error.slice(0, 60) } : { fill: 'green', shape: 'dot', text: 'okundu' });
            send(msg);
            done();
            busy = false;
            setImmediate(pump);
        }
        function pump() {
            if (busy || closed || !queue.length) return;
            const item = queue.shift();
            busy = true;
            const req = sanitize(item.msg.bacnetObjects);
            if (!valid) return finish(item, new Error('geçersiz hedef ' + target));
            if (!req) return finish(item, new Error('geçersiz nesne listesi'));
            const c = conn && conn.ready ? conn.client : null;
            if (!c) return finish(item, new Error('istemci hazır değil'));
            let settled = false;
            // Kutuphane kendi APDU zaman asimini uygular; bu bekci yalniz hic cevap/geri cagri gelmezse dugumu kilitlenmekten korur.
            const guard = setTimeout(() => { if (!settled) { settled = true; finish(item, new Error('ERR_TIMEOUT (bekçi)')); } }, (conn.apduTimeout || 3000) + 2000);
            try {
                c.readPropertyMultiple(target, req, {}, (err, res) => {
                    if (settled) return;
                    settled = true;
                    clearTimeout(guard);
                    finish(item, err, res);
                });
            } catch (err) {
                if (settled) return;
                settled = true;
                clearTimeout(guard);
                finish(item, err);
            }
        }
        node.on('input', (msg, send, done) => {
            if (closed) return done();
            if (queue.length >= MAX_QUEUE) {
                msg.error = 'BACnet okuma kuyruğu dolu'; msg.payload = null;
                send(msg);
                return done();
            }
            queue.push({ msg, send, done });
            pump();
        });
        node.on('close', (done) => {
            closed = true;
            for (const item of queue.splice(0)) item.done();
            done();
        });
    }
    RED.nodes.registerType('zscada-bacnet-read', ReadNode);
};
