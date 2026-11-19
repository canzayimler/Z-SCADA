// Z SCADA baslaticisi.
// Faz 1 (servis yok): tepsi simgesi + denetim (cokerse yeniden baslat) + tek kopya + Job Object;
//   eski PowerShell baslaticisi (Baslat.ps1) ile ayni isi yapar, yonetici yetkisi gerekmez.
// Faz 2 (servis "ZScada" kuruluysa): ayni exe uc modda calisir:
//   --servis          Windows servisi (SCM baslatir; Session 0, arayuz yok)
//   --servis-konsol   ayni basiz yonetici, servis kurmadan sinamak icin (--veri <yol> ile)
//   (parametresiz)    servis kuruluysa tepsi yalniz servisi izler/yonetir, cocuk surec baslatmaz
// Derleyici C# 5 (csc v4.0.30319): $"", ?., nameof, expression-bodied uye, out var YOK.
// YUKSELTME UYUMLULUGU: veri klasorleri urunun eski adini (DVP-SCADA) korur; mevcut kurulumlarin verisi oradadir
// (bkz. z-scada.iss dosya basi). Degistirilirse yukseltilen kurulum bos veriyle baslar.
// SPDX-License-Identifier: GPL-3.0-or-later

using System;
using System.Collections.Generic;
using System.ComponentModel;
using System.Diagnostics;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Net;
using System.Reflection;
using System.Runtime.InteropServices;
using System.ServiceProcess;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Forms;
using Microsoft.Win32;

[assembly: AssemblyTitle("Z SCADA")]
[assembly: AssemblyProduct("Z SCADA")]
[assembly: AssemblyDescription("Z SCADA baslaticisi (tepsi ve Windows servisi)")]
[assembly: AssemblyVersion("1.0.0.0")]

namespace ZScada
{
    // ---------------------------------------------------------------- yollar ve log

    static class Yol
    {
        public static string Kok;
        public static string Node;
        public static string App;
        public static string Veri;
        public static string Ayar;
        public static string Log;
        public static bool ServisKurulu;

        // Veri kokunu tek yerde belirler: --veri > servis kuruluysa %ProgramData% > eski %LOCALAPPDATA%.
        public static void Hazirla(string veriYolu)
        {
            Kok = Path.GetDirectoryName(Assembly.GetExecutingAssembly().Location);
            Node = Path.Combine(Kok, @"runtime\node.exe");
            App = Path.Combine(Kok, "app");
            ServisKurulu = ServisKontrol.Var();
            if (!string.IsNullOrEmpty(veriYolu))
            {
                Veri = Path.GetFullPath(veriYolu);
            }
            else if (ServisKurulu)
            {
                Veri = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.CommonApplicationData), @"DVP-SCADA\data");
            }
            else
            {
                string yerel = Environment.GetEnvironmentVariable("LOCALAPPDATA");
                if (string.IsNullOrEmpty(yerel))
                    yerel = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                Veri = Path.Combine(yerel, @"DVP-SCADA\data");
            }
            Ayar = Path.Combine(Veri, "ayarlar.ps1");
            Log = Path.Combine(Veri, "launcher.log");
        }
    }

    static class Gunluk
    {
        static readonly object kilit = new object();

        // null: Yol.Log (launcher.log). Servis kuruluyken tepsi veri klasorune yazamayacagi icin kendi dosyasina yazar.
        public static string Hedef;
        // --servis-konsol: satirlari konsola da yaz.
        public static bool KonsolaDa;

        public static void Yaz(string mesaj)
        {
            string satir = "[" + DateTime.Now.ToString("o") + "] " + mesaj;
            if (KonsolaDa) { try { Console.WriteLine(satir); } catch { } }
            try
            {
                lock (kilit)
                {
                    string hedef = Hedef ?? Yol.Log;
                    // Klasor yoksa (ornegin --durdur, hic kurulmamis) sessizce atla.
                    if (!Directory.Exists(Path.GetDirectoryName(hedef))) return;
                    if (Hedef != null)
                    {
                        FileInfo fi = new FileInfo(hedef);
                        if (fi.Exists && fi.Length > 1000000)
                        {
                            string eski = hedef + ".1";
                            if (File.Exists(eski)) File.Delete(eski);
                            File.Move(hedef, eski);
                        }
                    }
                    File.AppendAllText(hedef, satir + "\r\n", new UTF8Encoding(false));
                }
            }
            catch { }
        }
    }

    sealed class IptalException : Exception
    {
        public IptalException() : base("iptal") { }
    }

    // ---------------------------------------------------------------- Win32

    static class Win32
    {
        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern IntPtr OpenProcess(uint access, bool inherit, int pid);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern bool QueryFullProcessImageName(IntPtr h, int flags, StringBuilder sb, ref int size);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool CloseHandle(IntPtr h);

        [DllImport("kernel32.dll", SetLastError = true, CharSet = CharSet.Unicode)]
        public static extern IntPtr CreateJobObject(IntPtr attributes, string name);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool SetInformationJobObject(IntPtr job, int infoClass, IntPtr info, uint size);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool AssignProcessToJobObject(IntPtr job, IntPtr process);

        [DllImport("kernel32.dll")]
        public static extern bool AttachConsole(int pid);

        public delegate bool KonsolIsleyici(int tip);

        [DllImport("kernel32.dll", SetLastError = true)]
        public static extern bool SetConsoleCtrlHandler(KonsolIsleyici isleyici, bool ekle);

        [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
        public static extern uint ExtractIconEx(string file, int index, IntPtr[] large, IntPtr[] small, uint count);

        [DllImport("user32.dll", SetLastError = true)]
        public static extern bool DestroyIcon(IntPtr icon);

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_BASIC_LIMIT_INFORMATION
        {
            public long PerProcessUserTimeLimit;
            public long PerJobUserTimeLimit;
            public uint LimitFlags;
            public UIntPtr MinimumWorkingSetSize;
            public UIntPtr MaximumWorkingSetSize;
            public uint ActiveProcessLimit;
            public UIntPtr Affinity;
            public uint PriorityClass;
            public uint SchedulingClass;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct IO_COUNTERS
        {
            public ulong ReadOperationCount;
            public ulong WriteOperationCount;
            public ulong OtherOperationCount;
            public ulong ReadTransferCount;
            public ulong WriteTransferCount;
            public ulong OtherTransferCount;
        }

        [StructLayout(LayoutKind.Sequential)]
        public struct JOBOBJECT_EXTENDED_LIMIT_INFORMATION
        {
            public JOBOBJECT_BASIC_LIMIT_INFORMATION BasicLimitInformation;
            public IO_COUNTERS IoInfo;
            public UIntPtr ProcessMemoryLimit;
            public UIntPtr JobMemoryLimit;
            public UIntPtr PeakProcessMemoryUsed;
            public UIntPtr PeakJobMemoryUsed;
        }
    }

    // JOB_OBJECT_LIMIT_KILL_ON_JOB_CLOSE: tutaca (dolayisiyla tepsi sureci) kapaninca icindeki surecler olur.
    sealed class JobNesne : IDisposable
    {
        IntPtr tutac;

        public JobNesne()
        {
            tutac = Win32.CreateJobObject(IntPtr.Zero, null);
            if (tutac == IntPtr.Zero) throw new Win32Exception(Marshal.GetLastWin32Error());

            Win32.JOBOBJECT_EXTENDED_LIMIT_INFORMATION bilgi = new Win32.JOBOBJECT_EXTENDED_LIMIT_INFORMATION();
            bilgi.BasicLimitInformation.LimitFlags = 0x2000; // KILL_ON_JOB_CLOSE
            int uzunluk = Marshal.SizeOf(typeof(Win32.JOBOBJECT_EXTENDED_LIMIT_INFORMATION));
            IntPtr ptr = Marshal.AllocHGlobal(uzunluk);
            try
            {
                Marshal.StructureToPtr(bilgi, ptr, false);
                // 9 = JobObjectExtendedLimitInformation
                if (!Win32.SetInformationJobObject(tutac, 9, ptr, (uint)uzunluk))
                    throw new Win32Exception(Marshal.GetLastWin32Error());
            }
            catch
            {
                Win32.CloseHandle(tutac);
                tutac = IntPtr.Zero;
                throw;
            }
            finally { Marshal.FreeHGlobal(ptr); }
        }

        public bool Ekle(Process surec)
        {
            return tutac != IntPtr.Zero && Win32.AssignProcessToJobObject(tutac, surec.Handle);
        }

        public void Dispose()
        {
            IntPtr t = tutac;
            tutac = IntPtr.Zero;
            if (t != IntPtr.Zero) Win32.CloseHandle(t);
        }
    }

    // ---------------------------------------------------------------- yardimcilar

    static class Yardim
    {
        public static string ArgTirnak(string v)
        {
            if (v.Length > 0 && v.IndexOfAny(new char[] { ' ', '\t', '"' }) < 0) return v;
            string s = Regex.Replace(v, "(\\\\*)\"", "$1$1\\\"");
            s = Regex.Replace(s, "(\\\\+)$", "$1$1");
            return "\"" + s + "\"";
        }

        public static string ArgSatiri(string[] args)
        {
            StringBuilder sb = new StringBuilder();
            for (int i = 0; i < args.Length; i++)
            {
                if (i > 0) sb.Append(' ');
                sb.Append(ArgTirnak(args[i]));
            }
            return sb.ToString();
        }

        public static bool PortDolu(int port)
        {
            System.Net.Sockets.TcpClient c = new System.Net.Sockets.TcpClient();
            try { c.Connect("127.0.0.1", port); return true; }
            catch { return false; }
            finally { c.Close(); }
        }

        public static bool HttpTamam(string url)
        {
            HttpWebResponse yanit = null;
            try
            {
                HttpWebRequest istek = (HttpWebRequest)WebRequest.Create(url);
                istek.Proxy = null; // 127.0.0.1 icin vekil kullanma
                istek.Timeout = 2000;
                istek.ReadWriteTimeout = 2000;
                istek.KeepAlive = false;
                istek.UserAgent = "ZScada-Tepsi";
                yanit = (HttpWebResponse)istek.GetResponse();
                int kod = (int)yanit.StatusCode;
                return kod >= 200 && kod < 400;
            }
            catch { return false; }
            finally
            {
                if (yanit != null) { try { yanit.Close(); } catch { } }
            }
        }

        public static string KisaltMetin(string s, int n)
        {
            if (s == null) return "";
            s = s.Replace("\r", " ").Replace("\n", " ");
            return s.Length <= n ? s : s.Substring(0, n - 1) + "…";
        }

        // Surecin tam exe yolu (erisilemezse null).
        public static string SurecYolu(int pid)
        {
            IntPtr h = Win32.OpenProcess(0x1000 /* PROCESS_QUERY_LIMITED_INFORMATION */, false, pid);
            if (h == IntPtr.Zero) return null;
            try
            {
                StringBuilder sb = new StringBuilder(1024);
                int boyut = sb.Capacity;
                if (!Win32.QueryFullProcessImageName(h, 0, sb, ref boyut)) return null;
                return sb.ToString();
            }
            finally { Win32.CloseHandle(h); }
        }

        public static bool AyniYol(string a, string b)
        {
            try
            {
                return string.Equals(Path.GetFullPath(a), Path.GetFullPath(b), StringComparison.OrdinalIgnoreCase);
            }
            catch { return false; }
        }

        public static bool PidOku(string dosya, out int pid)
        {
            pid = 0;
            try
            {
                string[] satirlar = File.ReadAllLines(dosya);
                if (satirlar.Length == 0) return false;
                return int.TryParse(satirlar[0].Trim(), out pid) && pid > 0;
            }
            catch { return false; }
        }

        // Eski PowerShell surumunden (veya yetim kalmis) bu kurulumun node.exe'sini gosteren pid
        // dosyalarini isler: surec calisiyorsa oldurur, pid dosyasini siler.
        public static void PidDosyalariniTemizle()
        {
            string[] adlar = new string[] { "server", "node-red" };
            foreach (string ad in adlar)
            {
                string pf = Path.Combine(Yol.Veri, ad + ".pid");
                if (!File.Exists(pf)) continue;
                int pid;
                if (PidOku(pf, out pid))
                {
                    string yol = SurecYolu(pid);
                    if (yol != null && AyniYol(yol, Yol.Node))
                    {
                        try
                        {
                            using (Process p = Process.GetProcessById(pid))
                            {
                                p.Kill();
                                p.WaitForExit(5000);
                            }
                            Gunluk.Yaz(ad + " (eski surec, pid " + pid + ") durduruldu.");
                        }
                        catch (Exception ex) { Gunluk.Yaz(ad + " eski sureci durdurulamadi: " + ex.Message); }
                    }
                }
                try { File.Delete(pf); } catch { }
            }
        }

        public static void PidSil(string ad)
        {
            try { File.Delete(Path.Combine(Yol.Veri, ad + ".pid")); } catch { }
        }

        public static void LogDondur(string yol)
        {
            try
            {
                if (File.Exists(yol) && new FileInfo(yol).Length > 0)
                {
                    string eski = yol + ".1";
                    if (File.Exists(eski)) File.Delete(eski);
                    File.Move(yol, eski);
                }
            }
            catch (Exception ex) { Gunluk.Yaz("Log dondurulemedi (" + yol + "): " + ex.Message); }
        }

        // Ayar dosyasi: "$ADI = deger" satirlari, '#' yorum.
        public static Dictionary<string, string> AyarOku(string dosya)
        {
            Dictionary<string, string> d = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
            foreach (string ham in File.ReadAllLines(dosya, Encoding.UTF8))
            {
                string s = ham.Trim();
                if (s.Length == 0 || s[0] == '#') continue;
                Match m = Regex.Match(s, @"^\$(\w+)\s*=\s*(.*)$");
                if (!m.Success) continue;
                d[m.Groups[1].Value] = DegerCoz(m.Groups[2].Value.Trim());
            }
            return d;
        }

        static string DegerCoz(string v)
        {
            if (v.Length > 0 && (v[0] == '\'' || v[0] == '"'))
            {
                char tirnak = v[0];
                StringBuilder sb = new StringBuilder();
                for (int i = 1; i < v.Length; i++)
                {
                    char c = v[i];
                    if (c == tirnak)
                    {
                        if (tirnak == '\'' && i + 1 < v.Length && v[i + 1] == '\'') { sb.Append('\''); i++; continue; }
                        break;
                    }
                    sb.Append(c);
                }
                return sb.ToString();
            }
            int yorum = v.IndexOf('#');
            if (yorum >= 0) v = v.Substring(0, yorum);
            return v.Trim().TrimEnd(';').Trim();
        }

        public static int Tamsayi(Dictionary<string, string> d, string ad, int varsayilan)
        {
            string s;
            int n;
            if (d.TryGetValue(ad, out s) && int.TryParse(s, out n) && n > 0 && n < 65536) return n;
            return varsayilan;
        }

        public static string Metin(Dictionary<string, string> d, string ad, string varsayilan)
        {
            string s;
            if (d.TryGetValue(ad, out s) && !string.IsNullOrEmpty(s)) return s;
            return varsayilan;
        }

        // Ayar dosyasindaki "$DEGISKEN = ..." satirini guncelle (yoksa sona ekle).
        public static void AyarYaz(string degisken, string deger)
        {
            string icerik = File.ReadAllText(Yol.Ayar);
            string desen = "^\\$" + Regex.Escape(degisken) + "\\s*=[^\\r\\n]*";
            string yeni = "$" + degisken + " = " + deger;
            Regex re = new Regex(desen, RegexOptions.Multiline | RegexOptions.IgnoreCase);
            if (re.IsMatch(icerik))
                icerik = re.Replace(icerik, delegate(Match m) { return yeni; });
            else
                icerik = icerik.TrimEnd() + "\r\n" + yeni + "\r\n";
            File.WriteAllText(Yol.Ayar, icerik, new UTF8Encoding(false));
        }

        static string KayitDefteriExe(RegistryKey kok, string exe)
        {
            try
            {
                using (RegistryKey k = kok.OpenSubKey(@"SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\" + exe))
                {
                    if (k == null) return null;
                    string v = k.GetValue("") as string;
                    if (string.IsNullOrEmpty(v)) return null;
                    v = v.Trim().Trim('"');
                    return File.Exists(v) ? v : null;
                }
            }
            catch { return null; }
        }

        public static void UygulamaAc(string url)
        {
            try
            {
                string tarayici = TarayiciBul();
                if (tarayici != null)
                {
                    ProcessStartInfo psi = new ProcessStartInfo(tarayici, "--app=" + url + " --start-maximized");
                    psi.UseShellExecute = false;
                    Process.Start(psi);
                }
                else
                {
                    ProcessStartInfo psi = new ProcessStartInfo(url);
                    psi.UseShellExecute = true;
                    Process.Start(psi);
                }
            }
            catch (Exception ex) { Gunluk.Yaz("Tarayıcı açılamadı: " + ex.Message); }
        }

        // Baslat.ps1 Find-AppBrowser ile ayni sira.
        public static string TarayiciBul()
        {
            string[] adaylar = new string[]
            {
                KayitDefteriExe(Registry.LocalMachine, "msedge.exe"),
                KayitDefteriExe(Registry.CurrentUser, "msedge.exe"),
                KayitDefteriExe(Registry.LocalMachine, "chrome.exe"),
                KayitDefteriExe(Registry.CurrentUser, "chrome.exe")
            };
            foreach (string a in adaylar) if (a != null) return a;

            string pf = Environment.GetEnvironmentVariable("ProgramFiles");
            string pf86 = Environment.GetEnvironmentVariable("ProgramFiles(x86)");
            List<string> yollar = new List<string>();
            if (!string.IsNullOrEmpty(pf86)) yollar.Add(Path.Combine(pf86, @"Microsoft\Edge\Application\msedge.exe"));
            if (!string.IsNullOrEmpty(pf)) yollar.Add(Path.Combine(pf, @"Microsoft\Edge\Application\msedge.exe"));
            if (!string.IsNullOrEmpty(pf)) yollar.Add(Path.Combine(pf, @"Google\Chrome\Application\chrome.exe"));
            if (!string.IsNullOrEmpty(pf86)) yollar.Add(Path.Combine(pf86, @"Google\Chrome\Application\chrome.exe"));
            foreach (string y in yollar) if (File.Exists(y)) return y;
            return null;
        }
    }

    // ---------------------------------------------------------------- cocuk surec

    sealed class Cocuk
    {
        public string Ad;        // log/pid dosya adi: server, node-red
        public string Etiket;    // kullaniciya gorunen ad
        public string[] Args;
        public string Url;
        public int Saniye;
        public Process Surec;

        public bool Yasiyor
        {
            get
            {
                Process p = Surec;
                try { return p != null && !p.HasExited; }
                catch { return false; }
            }
        }

        public int CikisKodu
        {
            get
            {
                try { return Surec.ExitCode; }
                catch { return -1; }
            }
        }
    }

    // ---------------------------------------------------------------- yonetici

    sealed class Yonetici
    {
        public const int Basliyor = 0;
        public const int Hazir = 1;
        public const int Hata = 2;

        readonly object kilit = new object();
        readonly object degisim = new object();
        readonly bool etkinlestir;

        Thread isParcacigi;
        ManualResetEvent iptal;
        JobNesne job;
        readonly List<Cocuk> cocuklar = new List<Cocuk>();
        System.Threading.Timer saglikZamanlayici;
        int yoklaniyor;

        volatile bool cikiyor;
        volatile bool acBekliyor;
        volatile bool noderedSaglik;
        volatile bool serverSaglik;
        volatile int asama = Basliyor;
        string adim = "Başlatılıyor";
        string hataMesaji;

        string scadaHost = "127.0.0.1";
        string scadaAdres = "zscada.localhost";
        int scadaPort = 4730;
        int noderedPort = 4731;

        // UI geri cagrilari (herhangi bir iplikten cagrilabilir).
        public Action Degisti;
        public Action<string, string> BalonGoster;   // baslik, metin (hata balonu)
        public Action<string> HataKutusu;            // baslatma hatasi mesaj kutusu
        // Servis modu: kurtarilamayan hata (baslatma hatasi ya da 5 dakikada 5 cokme). Surec hata koduyla
        // sonlansin ki Windows kurtarma ayari (sc failure) devreye girsin. Tepside bos (davranis degismez).
        public Action Vazgecti;
        // Gercek Windows servisi (NT SERVICE\ZScada): cocuklarin icacls sirri dogru hesaba verebilmesi icin.
        public bool ServisKimligi;

        public Yonetici(bool etkinlestir)
        {
            this.etkinlestir = etkinlestir;
            try
            {
                Directory.CreateDirectory(Yol.Veri);
                AyarlariYukle();
            }
            catch (Exception ex) { Gunluk.Yaz("Ayarlar ilk okunamadi: " + ex.Message); }
        }

        // ------- durum

        public int Asama { get { return asama; } }
        public string Adim { get { lock (kilit) { return adim; } } }
        public string HataMetni { get { lock (kilit) { return hataMesaji; } } }
        public bool NodeRedSaglikli { get { return noderedSaglik; } }
        public bool ServerSaglikli { get { return serverSaglik; } }

        public string Url
        {
            get { lock (kilit) { return "http://" + scadaAdres + ":" + scadaPort; } }
        }

        void Duyur()
        {
            Action a = Degisti;
            if (a != null) { try { a(); } catch { } }
        }

        void AsamaAyarla(int yeni, string yeniAdim)
        {
            lock (kilit)
            {
                asama = yeni;
                if (yeniAdim != null) adim = yeniAdim;
                if (yeni != Hata) hataMesaji = null;
            }
            Duyur();
        }

        void VazgectiBildir()
        {
            Action a = Vazgecti;
            if (a != null) { try { a(); } catch { } }
        }

        void HataAyarla(string mesaj)
        {
            lock (kilit)
            {
                asama = Hata;
                hataMesaji = mesaj;
                adim = "Hata";
            }
            Gunluk.Yaz("HATA: " + mesaj);
            Duyur();
        }

        // ------- ayarlar

        void AyarlariYukle()
        {
            Directory.CreateDirectory(Yol.Veri);
            if (!File.Exists(Yol.Ayar))
            {
                string varsayilan = Path.Combine(Yol.Kok, "Varsayilan-Ayarlar.ps1");
                if (File.Exists(varsayilan))
                    File.Copy(varsayilan, Yol.Ayar);
                else
                    File.WriteAllText(Yol.Ayar,
                        "$SCADA_PORT = 4730\r\n$NODERED_PORT = 4731\r\n$SCADA_HOST = '127.0.0.1'\r\n$SCADA_ADRES = 'zscada.localhost'\r\n",
                        new UTF8Encoding(false));
            }
            Dictionary<string, string> d = Yardim.AyarOku(Yol.Ayar);
            lock (kilit)
            {
                scadaPort = Yardim.Tamsayi(d, "SCADA_PORT", 4730);
                noderedPort = Yardim.Tamsayi(d, "NODERED_PORT", 4731);
                scadaHost = Yardim.Metin(d, "SCADA_HOST", "127.0.0.1");
                scadaAdres = Yardim.Metin(d, "SCADA_ADRES", "zscada.localhost");
            }
        }

        // Baslat.ps1 Resolve-Port: port doluysa (baska uygulama) siradaki bos porta gec ve ayara yaz.
        int PortCoz(int port, string ad, string degisken, int haric)
        {
            if (!Yardim.PortDolu(port)) return port;
            for (int aday = port + 1; aday <= port + 20; aday++)
            {
                if (aday == haric || Yardim.PortDolu(aday)) continue;
                Yardim.AyarYaz(degisken, aday.ToString());
                Gunluk.Yaz("Port " + port + " dolu (baska uygulama); " + ad + " icin " + aday + " secildi.");
                return aday;
            }
            throw new Exception("Port " + port + " ve sonraki 20 port dolu. Ayarlar: " + Yol.Ayar);
        }

        // ------- baslatma / durdurma

        public void Baslat(bool ac)
        {
            lock (kilit)
            {
                if (ac) acBekliyor = true;
                iptal = new ManualResetEvent(false);
                ManualResetEvent benim = iptal;
                cocuklar.Clear();
                asama = Basliyor;
                adim = "Başlatılıyor";
                hataMesaji = null;
                noderedSaglik = false;
                serverSaglik = false;
                isParcacigi = new Thread(delegate() { Is(benim); });
                isParcacigi.IsBackground = true;
                isParcacigi.Name = "ZScada-Is";
                isParcacigi.Start();
            }
            Duyur();
            if (saglikZamanlayici == null)
                saglikZamanlayici = new System.Threading.Timer(SaglikYokla, null, 5000, 5000);
        }

        public void YenidenBaslat()
        {
            ThreadPool.QueueUserWorkItem(delegate(object o)
            {
                if (!Monitor.TryEnter(degisim)) return;
                try
                {
                    if (cikiyor) return;
                    Gunluk.Yaz("Yeniden başlatma istendi.");
                    AsamaAyarla(Basliyor, "Yeniden başlatılıyor");
                    DurdurIc(8000);
                    if (cikiyor) return;
                    Baslat(false);
                }
                finally { Monitor.Exit(degisim); }
            });
        }

        // Cocuklari kapat, pid dosyalarini sil, sonra cik. Tekrar cagrilabilir.
        public void Cik(int beklemeMs)
        {
            cikiyor = true;
            lock (degisim)
            {
                DurdurIc(beklemeMs);
            }
            System.Threading.Timer z = saglikZamanlayici;
            saglikZamanlayici = null;
            if (z != null) { try { z.Dispose(); } catch { } }
        }

        void DurdurIc(int beklemeMs)
        {
            ManualResetEvent i;
            Thread w;
            List<Cocuk> liste;
            JobNesne j;
            lock (kilit)
            {
                i = iptal;
                w = isParcacigi;
                liste = new List<Cocuk>(cocuklar);
                j = job;
            }
            if (i != null) { try { i.Set(); } catch { } }
            if (w != null && w != Thread.CurrentThread) w.Join(beklemeMs);

            lock (kilit) { liste = new List<Cocuk>(cocuklar); j = job; }
            foreach (Cocuk c in liste)
            {
                Process p = c.Surec;
                try
                {
                    if (p != null && !p.HasExited)
                    {
                        p.Kill();
                        p.WaitForExit(5000);
                    }
                }
                catch { }
                Yardim.PidSil(c.Ad);
                Gunluk.Yaz(c.Etiket + " durduruldu.");
            }
            // Job tutacagini kapatmak, kalan torunlari da oldurur.
            lock (kilit)
            {
                cocuklar.Clear();
                job = null;
                noderedSaglik = false;
                serverSaglik = false;
            }
            if (j != null) j.Dispose();
        }

        // ------- ana is parcacigi

        void Is(ManualResetEvent iptalBayragi)
        {
            try
            {
                Gunluk.Yaz("Başlatılıyor");
                AyarlariYukle();
                if (!File.Exists(Yol.Node)) throw new Exception("Gömülü Node.js bulunamadı: " + Yol.Node);

                // Eski PowerShell sürümünden kalan süreçler: sahiplik tek elde olsun.
                Yardim.PidDosyalariniTemizle();

                int nr, sv;
                lock (kilit) { nr = noderedPort; sv = scadaPort; }
                nr = PortCoz(nr, "node-red", "NODERED_PORT", sv);
                sv = PortCoz(sv, "server", "SCADA_PORT", nr);
                lock (kilit) { noderedPort = nr; scadaPort = sv; }
                Duyur();

                try
                {
                    JobNesne yeniJob = new JobNesne();
                    lock (kilit) { job = yeniJob; }
                }
                catch (Exception ex) { Gunluk.Yaz("Job Object oluşturulamadı (cocuklar yetim kalabilir): " + ex.Message); }

                Cocuk nodered = new Cocuk();
                nodered.Ad = "node-red";
                nodered.Etiket = "Node-RED";
                nodered.Url = "http://127.0.0.1:" + nr + "/auth/login";
                nodered.Saniye = 120;
                nodered.Args = new string[] {
                    "node_modules/node-red/red.js",
                    "--userDir", Path.Combine(Yol.Veri, "node-red"),
                    "--settings", Path.Combine(Path.Combine(Yol.Veri, "node-red"), "settings.js"),
                    "-p", nr.ToString() };

                Cocuk server = new Cocuk();
                server.Ad = "server";
                server.Etiket = "Z SCADA sunucusu";
                server.Url = "http://127.0.0.1:" + sv + "/api/health";
                server.Saniye = 90;
                server.Args = new string[] {
                    "--max-http-header-size=32768", "--import", "tsx", "apps/server/src/index.ts" };

                AsamaAyarla(Basliyor, "Node-RED hazırlanıyor");
                ScriptCalistir(iptalBayragi, "nodered-guvenlik",
                    new string[] { "--import", "tsx", "scripts/nodered-guvenlik.ts" },
                    "Node-RED güvenlik ayarı oluşturulamadı.");

                AsamaAyarla(Basliyor, "Node-RED başlatılıyor");
                CocukBaslat(nodered);
                if (!Bekle(iptalBayragi, nodered))
                    throw new Exception(nodered.Etiket + " beklenmedik şekilde kapandı (çıkış kodu " + nodered.CikisKodu +
                        "). Ayrıntı: " + Path.Combine(Yol.Veri, "node-red-error.log"));

                AsamaAyarla(Basliyor, "Sunucu başlatılıyor");
                CocukBaslat(server);
                if (!Bekle(iptalBayragi, server))
                    throw new Exception(server.Etiket + " beklenmedik şekilde kapandı (çıkış kodu " + server.CikisKodu +
                        "). Ayrıntı: " + Path.Combine(Yol.Veri, "server-error.log"));

                AsamaAyarla(Basliyor, "İlk hazırlık yapılıyor");
                List<string> hazirla = new List<string>();
                hazirla.Add("--import"); hazirla.Add("tsx"); hazirla.Add("scripts/hazirla.ts");
                if (etkinlestir) hazirla.Add("--etkinlestir");
                ScriptCalistir(iptalBayragi, "hazirla", hazirla.ToArray(), "İlk hazırlık adımı başarısız.");

                AsamaAyarla(Hazir, "Çalışıyor");
                Gunluk.Yaz("Hazır: " + Url);
                if (acBekliyor) { acBekliyor = false; TarayiciAc(); }

                Izle(iptalBayragi, new Cocuk[] { nodered, server });
            }
            catch (IptalException) { }
            catch (Exception ex)
            {
                if (cikiyor || iptalBayragi.WaitOne(0)) return;
                HataAyarla(ex.Message);
                Action<string> kutu = HataKutusu;
                if (kutu != null)
                {
                    try
                    {
                        kutu("Z SCADA başlatılamadı." + Environment.NewLine + Environment.NewLine + ex.Message +
                            Environment.NewLine + Environment.NewLine + "Log: " + Yol.Log);
                    }
                    catch { }
                }
                VazgectiBildir();
            }
        }

        // Beklenmedik cikis: logla, 5 sn bekle, yeniden baslat; 5 dakikada 5 cokme olursa vazgec.
        void Izle(ManualResetEvent iptalBayragi, Cocuk[] liste)
        {
            List<DateTime> cokmeler = new List<DateTime>();
            while (!iptalBayragi.WaitOne(1000))
            {
                foreach (Cocuk c in liste)
                {
                    if (c.Yasiyor) continue;
                    Gunluk.Yaz(c.Etiket + " beklenmedik şekilde kapandı (çıkış kodu " + c.CikisKodu + ").");
                    DateTime simdi = DateTime.UtcNow;
                    cokmeler.Add(simdi);
                    cokmeler.RemoveAll(delegate(DateTime t) { return (simdi - t).TotalMinutes > 5; });
                    if (cokmeler.Count >= 5)
                    {
                        string m = "5 dakika içinde 5 kez çöktü; otomatik yeniden başlatma durduruldu. Ayrıntı: " + Yol.Veri;
                        HataAyarla(m);
                        Action<string, string> balon = BalonGoster;
                        if (balon != null) { try { balon("Z SCADA durdu", m); } catch { } }
                        VazgectiBildir();
                        return;
                    }
                    AsamaAyarla(Basliyor, c.Etiket + " yeniden başlatılıyor");
                    if (iptalBayragi.WaitOne(5000)) return;
                    CocukBaslat(c);
                    Bekle(iptalBayragi, c); // false ise surec yine oldu; dongu bir sonraki turda sayar
                    bool hepsi = true;
                    foreach (Cocuk k in liste) if (!k.Yasiyor) hepsi = false;
                    if (hepsi) AsamaAyarla(Hazir, "Çalışıyor");
                }
            }
        }

        // true: yanit geldi; false: cocuk surec oldu; zaman asimi: istisna.
        bool Bekle(ManualResetEvent iptalBayragi, Cocuk c)
        {
            DateTime bitis = DateTime.UtcNow.AddSeconds(c.Saniye);
            while (DateTime.UtcNow < bitis)
            {
                if (iptalBayragi.WaitOne(0)) throw new IptalException();
                if (!c.Yasiyor) return false;
                if (Yardim.HttpTamam(c.Url)) return true;
                if (iptalBayragi.WaitOne(500)) throw new IptalException();
            }
            throw new Exception(c.Etiket + " zaman aşımına uğradı: " + c.Url);
        }

        // ------- surec baslatma

        ProcessStartInfo PsiYap(string[] args)
        {
            int nr, sv;
            string host;
            lock (kilit) { nr = noderedPort; sv = scadaPort; host = scadaHost; }
            ProcessStartInfo psi = new ProcessStartInfo(Yol.Node, Yardim.ArgSatiri(args));
            psi.WorkingDirectory = Yol.App;
            psi.UseShellExecute = false;
            psi.CreateNoWindow = true;
            psi.RedirectStandardInput = true;
            psi.RedirectStandardOutput = true;
            psi.RedirectStandardError = true;
            psi.StandardOutputEncoding = new UTF8Encoding(false);
            psi.StandardErrorEncoding = new UTF8Encoding(false);
            psi.EnvironmentVariables["SCADA_DATA"] = Yol.Veri;
            psi.EnvironmentVariables["SCADA_PORT"] = sv.ToString();
            psi.EnvironmentVariables["SCADA_HOST"] = host;
            psi.EnvironmentVariables["NODERED_URL"] = "http://127.0.0.1:" + nr;
            psi.EnvironmentVariables["VITE_CONFIG_NATIVE_IGNORE_WARNING"] = "true";
            if (ServisKimligi)
            {
                // apps/server/src/secrets.ts sir dosyalarini USERDOMAIN\USERNAME hesabina birakir; servis
                // sanal hesabinda USERNAME makine hesabi ("PC$") olur ve servis kendi dosyasini okuyamaz.
                psi.EnvironmentVariables["USERDOMAIN"] = "NT SERVICE";
                psi.EnvironmentVariables["USERNAME"] = ServisKontrol.Ad;
            }
            return psi;
        }

        void JobaEkle(Process p, string ad)
        {
            JobNesne j;
            lock (kilit) { j = job; }
            if (j == null) return;
            try
            {
                if (!j.Ekle(p)) Gunluk.Yaz(ad + " Job Object'e eklenemedi (win32 hata " + Marshal.GetLastWin32Error() + ").");
            }
            catch (Exception ex) { Gunluk.Yaz(ad + " Job Object'e eklenemedi: " + ex.Message); }
        }

        static StreamWriter LogAc(string yol)
        {
            try
            {
                Yardim.LogDondur(yol);
                FileStream fs = new FileStream(yol, FileMode.Create, FileAccess.Write, FileShare.ReadWrite);
                StreamWriter w = new StreamWriter(fs, new UTF8Encoding(false));
                w.AutoFlush = true;
                return w;
            }
            catch (Exception ex)
            {
                Gunluk.Yaz("Log dosyası açılamadı (" + yol + "): " + ex.Message);
                return null;
            }
        }

        static DataReceivedEventHandler SatirYazici(StreamWriter w)
        {
            return delegate(object gonderen, DataReceivedEventArgs e)
            {
                if (w == null) return;
                try
                {
                    if (e.Data == null) w.Dispose();
                    else w.WriteLine(e.Data);
                }
                catch { }
            };
        }

        void CocukBaslat(Cocuk c)
        {
            if (cikiyor) throw new IptalException();
            string cikti = Path.Combine(Yol.Veri, c.Ad + ".log");
            string hata = Path.Combine(Yol.Veri, c.Ad + "-error.log");
            StreamWriter wo = LogAc(cikti);
            StreamWriter we = LogAc(hata);

            Process p = new Process();
            p.StartInfo = PsiYap(c.Args);
            p.OutputDataReceived += SatirYazici(wo);
            p.ErrorDataReceived += SatirYazici(we);
            try
            {
                p.Start();
            }
            catch (Exception ex)
            {
                if (wo != null) wo.Dispose();
                if (we != null) we.Dispose();
                throw new Exception(c.Etiket + " başlatılamadı: " + ex.Message);
            }
            JobaEkle(p, c.Etiket);
            // Stdin acik kalir (pipe sessiz): bazi araclar stdin kapaninca cikar.
            p.BeginOutputReadLine();
            p.BeginErrorReadLine();
            c.Surec = p;
            lock (kilit) { if (!cocuklar.Contains(c)) cocuklar.Add(c); }
            try { File.WriteAllText(Path.Combine(Yol.Veri, c.Ad + ".pid"), p.Id.ToString(), Encoding.ASCII); } catch { }
            Gunluk.Yaz(c.Etiket + " başlatıldı (pid " + p.Id + ").");
        }

        // Kisa omurlu betik (nodered-guvenlik.ts, hazirla.ts): cikti launcher.log'a, exit != 0 -> hata.
        void ScriptCalistir(ManualResetEvent iptalBayragi, string etiket, string[] args, string hataMesajiMetni)
        {
            if (cikiyor) throw new IptalException();
            using (Process p = new Process())
            {
                p.StartInfo = PsiYap(args);
                DataReceivedEventHandler h = delegate(object g, DataReceivedEventArgs e)
                {
                    if (e.Data != null) Gunluk.Yaz("[" + etiket + "] " + e.Data);
                };
                p.OutputDataReceived += h;
                p.ErrorDataReceived += h;
                try { p.Start(); }
                catch (Exception ex) { throw new Exception(etiket + " çalıştırılamadı: " + ex.Message); }
                JobaEkle(p, etiket);
                try { p.StandardInput.Close(); } catch { }
                p.BeginOutputReadLine();
                p.BeginErrorReadLine();

                DateTime baslangic = DateTime.UtcNow;
                while (!p.WaitForExit(500))
                {
                    if (iptalBayragi.WaitOne(0))
                    {
                        try { p.Kill(); } catch { }
                        throw new IptalException();
                    }
                    if ((DateTime.UtcNow - baslangic).TotalMinutes > 10)
                    {
                        try { p.Kill(); } catch { }
                        throw new Exception(etiket + " 10 dakika içinde bitmedi.");
                    }
                }
                p.WaitForExit(); // async cikti bosalsin
                if (p.ExitCode != 0)
                    throw new Exception(hataMesajiMetni + " (çıkış kodu " + p.ExitCode + "; ayrıntı: " + Yol.Log + ")");
            }
        }

        // ------- tarayici

        public void AcIstegi()
        {
            if (Asama == Hazir) TarayiciAc();
            else if (Asama == Hata)
            {
                Action<string, string> balon = BalonGoster;
                if (balon != null) balon("Z SCADA çalışmıyor", "Başlatma başarısız. Menüden Yeniden başlat deneyin. Log: " + Yol.Log);
            }
            else acBekliyor = true; // hazir olunca acilir
        }

        void TarayiciAc()
        {
            Yardim.UygulamaAc(Url);
        }

        // ------- saglik yoklamasi (5 sn)

        void SaglikYokla(object durum)
        {
            if (Interlocked.Exchange(ref yoklaniyor, 1) == 1) return;
            try
            {
                if (cikiyor || Asama != Hazir) return;
                int nr, sv;
                lock (kilit) { nr = noderedPort; sv = scadaPort; }
                bool n = Yardim.HttpTamam("http://127.0.0.1:" + nr + "/auth/login");
                bool s = Yardim.HttpTamam("http://127.0.0.1:" + sv + "/api/health");
                bool degisti = (n != noderedSaglik) || (s != serverSaglik);
                noderedSaglik = n;
                serverSaglik = s;
                if (degisti) Duyur();
            }
            catch { }
            finally { Interlocked.Exchange(ref yoklaniyor, 0); }
        }
    }

    // ---------------------------------------------------------------- tepsi arayuzu

    sealed class TepsiBaglami : ApplicationContext
    {
        readonly Yonetici y;
        readonly NotifyIcon ni;
        readonly ContextMenuStrip menu;
        readonly ToolStripMenuItem miAc;
        readonly ToolStripMenuItem miDurum;
        readonly ToolStripMenuItem miYeniden;
        readonly ToolStripMenuItem miLog;
        readonly ToolStripMenuItem miCik;
        readonly Icon[] ikonlar; // 0 sari, 1 yesil, 2 kirmizi
        readonly Control ui;
        readonly EventWaitHandle acOlay;
        readonly EventWaitHandle durdurOlay;
        bool cikisBasladi;

        public TepsiBaglami(bool etkinlestir, bool pencereAc, EventWaitHandle acOlay, EventWaitHandle durdurOlay)
        {
            this.acOlay = acOlay;
            this.durdurOlay = durdurOlay;

            ui = new Control();
            IntPtr zorla = ui.Handle; // tutac olussun; BeginInvoke ile UI iplige atlanir
            GC.KeepAlive(zorla);

            ikonlar = IkonlariYap();

            miAc = new ToolStripMenuItem("Z SCADA'yı aç");
            miAc.Font = new Font(miAc.Font, FontStyle.Bold);
            miAc.Click += delegate { y.AcIstegi(); };
            miDurum = new ToolStripMenuItem("Durum");
            miDurum.Enabled = false;
            miYeniden = new ToolStripMenuItem("Yeniden başlat");
            miYeniden.Click += delegate { y.YenidenBaslat(); };
            miLog = new ToolStripMenuItem("Log klasörü");
            miLog.Click += delegate { LogKlasoruAc(); };
            miCik = new ToolStripMenuItem("Durdur ve çık");
            miCik.Click += delegate { CikisIste(); };

            menu = new ContextMenuStrip();
            menu.Items.Add(miAc);
            menu.Items.Add(miDurum);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(miYeniden);
            menu.Items.Add(miLog);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(miCik);

            ni = new NotifyIcon();
            ni.ContextMenuStrip = menu;
            ni.Icon = ikonlar[0];
            ni.Text = "Z SCADA";
            ni.MouseDoubleClick += delegate(object g, MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Left) y.AcIstegi();
            };
            ni.Visible = true;

            y = new Yonetici(etkinlestir);
            y.Degisti = delegate { UiyeGonder(new MethodInvoker(Guncelle)); };
            y.BalonGoster = delegate(string baslik, string metin)
            {
                UiyeGonder(new MethodInvoker(delegate { ni.ShowBalloonTip(8000, baslik, metin, ToolTipIcon.Error); }));
            };
            y.HataKutusu = delegate(string mesaj)
            {
                UiyeGonder(new MethodInvoker(delegate
                {
                    MessageBox.Show(mesaj, "Z SCADA", MessageBoxButtons.OK, MessageBoxIcon.Error);
                }));
            };
            Guncelle();

            Thread izleyici = new Thread(OlayDinle);
            izleyici.IsBackground = true;
            izleyici.Name = "ZScada-Olay";
            izleyici.Start();

            Microsoft.Win32.SystemEvents.SessionEnding += delegate
            {
                Gunluk.Yaz("Windows oturumu kapanıyor.");
                y.Cik(1500);
            };
            Application.ApplicationExit += delegate { y.Cik(1500); };

            y.Baslat(pencereAc);
        }

        void UiyeGonder(MethodInvoker m)
        {
            try
            {
                if (ui.IsHandleCreated && !ui.IsDisposed) ui.BeginInvoke(m);
            }
            catch { }
        }

        // Ikinci kopyadan gelen sinyaller.
        void OlayDinle()
        {
            WaitHandle[] bekle = new WaitHandle[] { acOlay, durdurOlay };
            while (true)
            {
                int i;
                try { i = WaitHandle.WaitAny(bekle); }
                catch { return; }
                if (i == 0)
                {
                    UiyeGonder(new MethodInvoker(delegate { y.AcIstegi(); }));
                }
                else
                {
                    Gunluk.Yaz("Durdurma sinyali alındı.");
                    UiyeGonder(new MethodInvoker(CikisIste));
                    return;
                }
            }
        }

        void CikisIste()
        {
            if (cikisBasladi) return;
            cikisBasladi = true;
            miCik.Enabled = false;
            miYeniden.Enabled = false;
            miDurum.Text = "Durduruluyor…";
            ThreadPool.QueueUserWorkItem(delegate(object o)
            {
                y.Cik(10000);
                UiyeGonder(new MethodInvoker(delegate
                {
                    ni.Visible = false;
                    ni.Dispose();
                    ExitThread();
                }));
            });
        }

        void LogKlasoruAc()
        {
            try
            {
                Directory.CreateDirectory(Yol.Veri);
                Process.Start("explorer.exe", "\"" + Yol.Veri + "\"");
            }
            catch (Exception ex) { Gunluk.Yaz("Log klasörü açılamadı: " + ex.Message); }
        }

        // 0 = sari (basliyor), 1 = yesil (calisiyor), 2 = kirmizi (hata)
        void Guncelle()
        {
            if (cikisBasladi) return;
            int renk;
            string ad;
            string durumSatiri;
            int asama = y.Asama;
            if (asama == Yonetici.Hata)
            {
                renk = 2; ad = "Hata";
                durumSatiri = "Durum: Hata — " + Yardim.KisaltMetin(y.HataMetni, 60);
            }
            else if (asama == Yonetici.Hazir && y.NodeRedSaglikli && y.ServerSaglikli)
            {
                renk = 1; ad = "Çalışıyor";
                durumSatiri = "Durum: Çalışıyor";
            }
            else
            {
                renk = 0; ad = "Başlıyor";
                durumSatiri = "Durum: " + (asama == Yonetici.Hazir ? "Yanıt bekleniyor" : y.Adim);
            }

            ni.Icon = ikonlar[renk];
            string baslik = "Z SCADA — " + ad;
            string url = y.Url;
            int kalan = 63 - baslik.Length - 1; // NotifyIcon.Text en fazla 63 karakter
            ni.Text = kalan > 0 ? baslik + "\n" + Yardim.KisaltMetin(url, kalan) : Yardim.KisaltMetin(baslik, 63);
            miDurum.Text = durumSatiri;
        }

        // ------- simge: assets ikonu + sag alt kosede renkli nokta

        internal static Icon TabanIkon()
        {
            try
            {
                IntPtr[] kucuk = new IntPtr[1];
                uint n = Win32.ExtractIconEx(Assembly.GetExecutingAssembly().Location, 0, null, kucuk, 1);
                if (n > 0 && kucuk[0] != IntPtr.Zero)
                {
                    Icon kopya = (Icon)Icon.FromHandle(kucuk[0]).Clone();
                    Win32.DestroyIcon(kucuk[0]);
                    return kopya;
                }
            }
            catch { }
            return (Icon)SystemIcons.Application.Clone();
        }

        internal static Icon[] IkonlariYap()
        {
            Color[] renkler = new Color[]
            {
                Color.FromArgb(245, 158, 11), // sari
                Color.FromArgb(34, 197, 94),  // yesil
                Color.FromArgb(239, 68, 68)   // kirmizi
            };
            Icon taban = TabanIkon();
            int w = taban.Width, h = taban.Height;
            Icon[] sonuc = new Icon[renkler.Length];
            for (int i = 0; i < renkler.Length; i++)
            {
                using (Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb))
                using (Graphics g = Graphics.FromImage(bmp))
                {
                    g.SmoothingMode = SmoothingMode.AntiAlias;
                    g.DrawIcon(taban, new Rectangle(0, 0, w, h));
                    int d = Math.Max(7, (w * 9) / 16);
                    Rectangle nokta = new Rectangle(w - d, h - d, d - 1, d - 1);
                    using (Brush dolgu = new SolidBrush(renkler[i])) g.FillEllipse(dolgu, nokta);
                    using (Pen kenar = new Pen(Color.White, Math.Max(1f, w / 16f))) g.DrawEllipse(kenar, nokta);
                    IntPtr hicon = bmp.GetHicon();
                    try { sonuc[i] = (Icon)Icon.FromHandle(hicon).Clone(); }
                    finally { Win32.DestroyIcon(hicon); }
                }
            }
            return sonuc;
        }
    }

    // ---------------------------------------------------------------- Windows servisi (Faz 2)

    static class ServisKontrol
    {
        public const string Ad = "ZScada";

        // Servis kayitli mi? (durumu okunamasa bile, "yok" hatasi degilse var sayilir.)
        public static bool Var()
        {
            try
            {
                using (ServiceController sc = new ServiceController(Ad))
                {
                    return (int)sc.Status > 0;
                }
            }
            catch (InvalidOperationException ex)
            {
                Win32Exception w = ex.InnerException as Win32Exception;
                return w != null && w.NativeErrorCode != 1060; // 1060 = ERROR_SERVICE_DOES_NOT_EXIST
            }
            catch { return false; }
        }

        public static bool ErisimReddedildi(Exception ex)
        {
            for (Exception e = ex; e != null; e = e.InnerException)
            {
                Win32Exception w = e as Win32Exception;
                if (w != null && w.NativeErrorCode == 5) return true;
                if (e is UnauthorizedAccessException) return true;
            }
            return false;
        }
    }

    // SCM'nin baslattigi servis (--servis). Arayuz yok: Session 0'da MessageBox/balon/tarayici acilmaz.
    sealed class ZScadaServisi : ServiceBase
    {
        Yonetici y;
        int durduruluyor;

        public ZScadaServisi()
        {
            ServiceName = ServisKontrol.Ad;
            CanStop = true;
            CanShutdown = true;
            CanPauseAndContinue = false;
            AutoLog = false; // servis hesabi olay kaynagi olusturamaz; her sey launcher.log'a
        }

        protected override void OnStart(string[] args)
        {
            try
            {
                Gunluk.Yaz("Servis başlıyor (veri: " + Yol.Veri + ").");
                y = new Yonetici(false);
                y.ServisKimligi = true;
                y.Vazgecti = delegate
                {
                    // Kurtarilamayan hata: hata koduyla dur; sc failure (failureflag 1) servisi yeniden baslatir.
                    ThreadPool.QueueUserWorkItem(delegate(object o)
                    {
                        if (Interlocked.Exchange(ref durduruluyor, 1) == 1) return;
                        Gunluk.Yaz("Servis hata koduyla durduruluyor (kurtarma ayarı devreye girer).");
                        ExitCode = 1;
                        try { Stop(); } catch (Exception ex) { Gunluk.Yaz("Stop başarısız: " + ex.Message); }
                    });
                };
                y.Baslat(false);
            }
            catch (Exception ex)
            {
                Gunluk.Yaz("HATA: Servis başlatılamadı: " + ex);
                throw;
            }
        }

        protected override void OnStop() { Kapat("Servis durduruluyor."); }

        protected override void OnShutdown() { Kapat("Sistem kapanıyor, servis durduruluyor."); }

        void Kapat(string neden)
        {
            Interlocked.Exchange(ref durduruluyor, 1);
            Gunluk.Yaz(neden);
            try { RequestAdditionalTime(20000); } catch { }
            Yonetici k = y;
            if (k != null) k.Cik(10000);
            Gunluk.Yaz("Servis durdu.");
        }
    }

    // Servis kuruluyken tepsinin arka ucu: cocuk surec baslatmaz; servis durumunu ve iki saglik URL'sini yoklar.
    sealed class ServisIzleyici
    {
        public const int Sari = 0;
        public const int Yesil = 1;
        public const int Kirmizi = 2;

        readonly object kilit = new object();
        System.Threading.Timer zamanlayici;
        int yoklaniyor;
        int islemde;
        volatile bool cikiyor;
        volatile bool acBekliyor;
        DateTime acBaslangic;

        int scadaPort = 4730;
        int noderedPort = 4731;
        string scadaAdres = "zscada.localhost";

        int renk = Sari;
        string durumMetni = "Durum: Denetleniyor…";
        bool durumBilinen;
        ServiceControllerStatus durum = ServiceControllerStatus.Stopped;

        public Action Degisti;
        public Action<string, string> BalonGoster;

        public int Renk { get { lock (kilit) { return renk; } } }
        public string DurumMetni { get { lock (kilit) { return durumMetni; } } }
        public string Url { get { lock (kilit) { return "http://" + scadaAdres + ":" + scadaPort; } } }

        public bool BaslatEtkin { get { lock (kilit) { return durumBilinen && durum == ServiceControllerStatus.Stopped; } } }
        public bool DurdurEtkin
        {
            get { lock (kilit) { return durumBilinen && (durum == ServiceControllerStatus.Running || durum == ServiceControllerStatus.Paused); } }
        }
        public bool YenidenEtkin
        {
            get
            {
                lock (kilit)
                {
                    return durumBilinen && (durum == ServiceControllerStatus.Running || durum == ServiceControllerStatus.Stopped ||
                        durum == ServiceControllerStatus.Paused);
                }
            }
        }

        public void Baslat()
        {
            zamanlayici = new System.Threading.Timer(Yokla, null, 0, 5000);
        }

        public void Dur()
        {
            cikiyor = true;
            System.Threading.Timer z = zamanlayici;
            zamanlayici = null;
            if (z != null) { try { z.Dispose(); } catch { } }
        }

        void Duyur()
        {
            Action a = Degisti;
            if (a != null) { try { a(); } catch { } }
        }

        void Balon(string baslik, string metin)
        {
            Action<string, string> b = BalonGoster;
            if (b != null) { try { b(baslik, metin); } catch { } }
        }

        // Ayar dosyasi servis tarafindan degistirilebilir (port cakismasi); her turda yeniden okunur. Yazilmaz.
        void AyarlariOku()
        {
            try
            {
                if (!File.Exists(Yol.Ayar)) return;
                Dictionary<string, string> d = Yardim.AyarOku(Yol.Ayar);
                lock (kilit)
                {
                    scadaPort = Yardim.Tamsayi(d, "SCADA_PORT", 4730);
                    noderedPort = Yardim.Tamsayi(d, "NODERED_PORT", 4731);
                    scadaAdres = Yardim.Metin(d, "SCADA_ADRES", "zscada.localhost");
                }
            }
            catch (Exception ex) { Gunluk.Yaz("Ayarlar okunamadı: " + ex.Message); }
        }

        void Yokla(object o)
        {
            if (cikiyor) return;
            if (Interlocked.Exchange(ref yoklaniyor, 1) == 1) return;
            try
            {
                AyarlariOku();
                bool okundu = false;
                string hata = null;
                ServiceControllerStatus d = ServiceControllerStatus.Stopped;
                try
                {
                    using (ServiceController sc = new ServiceController(ServisKontrol.Ad))
                    {
                        d = sc.Status;
                        okundu = true;
                    }
                }
                catch (Exception ex)
                {
                    hata = ServisKontrol.ErisimReddedildi(ex) ? "Servis durumu okunamıyor (erişim reddedildi)" : "Servis bulunamadı";
                }

                int nr, sv;
                lock (kilit) { nr = noderedPort; sv = scadaPort; }
                bool n = false, s = false;
                if (okundu && d == ServiceControllerStatus.Running)
                {
                    n = Yardim.HttpTamam("http://127.0.0.1:" + nr + "/auth/login");
                    s = Yardim.HttpTamam("http://127.0.0.1:" + sv + "/api/health");
                }

                int yeniRenk;
                string metin;
                if (!okundu) { yeniRenk = Kirmizi; metin = "Durum: " + hata; }
                else if (d == ServiceControllerStatus.Running)
                {
                    if (n && s) { yeniRenk = Yesil; metin = "Durum: Çalışıyor"; }
                    else
                    {
                        yeniRenk = Sari;
                        metin = "Durum: Servis çalışıyor, " + (!n && !s ? "uçlar henüz yanıt vermiyor" :
                            (!n ? "Node-RED yanıt vermiyor" : "sunucu yanıt vermiyor"));
                    }
                }
                else if (d == ServiceControllerStatus.StartPending || d == ServiceControllerStatus.ContinuePending)
                { yeniRenk = Sari; metin = "Durum: Servis başlıyor…"; }
                else if (d == ServiceControllerStatus.StopPending || d == ServiceControllerStatus.PausePending)
                { yeniRenk = Sari; metin = "Durum: Servis durduruluyor…"; }
                else if (d == ServiceControllerStatus.Paused) { yeniRenk = Kirmizi; metin = "Durum: Servis duraklatıldı"; }
                else { yeniRenk = Kirmizi; metin = "Durum: Servis durdu"; }

                bool degisti;
                lock (kilit)
                {
                    degisti = yeniRenk != renk || metin != durumMetni || okundu != durumBilinen || d != durum;
                    renk = yeniRenk;
                    durumMetni = metin;
                    durumBilinen = okundu;
                    durum = d;
                }
                if (degisti) Duyur();

                if (acBekliyor)
                {
                    if (yeniRenk == Yesil) { acBekliyor = false; Yardim.UygulamaAc(Url); }
                    else if ((DateTime.UtcNow - acBaslangic).TotalSeconds > 180)
                    {
                        acBekliyor = false;
                        Balon("Z SCADA hazır değil", "Servis 3 dakika içinde hazır olmadı. Durum: " + metin.Replace("Durum: ", "") +
                            ". Log klasörünü kontrol edin.");
                    }
                }
            }
            catch (Exception ex) { Gunluk.Yaz("Yoklama hatası: " + ex.Message); }
            finally { Interlocked.Exchange(ref yoklaniyor, 0); }
        }

        // Servis islemleri arka planda; yetki hatasi balonla bildirilir.
        void Islem(string ad, Action eylem)
        {
            ThreadPool.QueueUserWorkItem(delegate(object o)
            {
                if (Interlocked.Exchange(ref islemde, 1) == 1) return;
                try { eylem(); }
                catch (Exception ex)
                {
                    Gunluk.Yaz(ad + " başarısız: " + ex);
                    if (ServisKontrol.ErisimReddedildi(ex))
                        Balon("Z SCADA", ad + " için yetki yok (erişim reddedildi). Kurucuyu yönetici olarak yeniden çalıştırın " +
                            "ya da servis iznini kontrol edin.");
                    else
                        Balon("Z SCADA", ad + " başarısız: " + Yardim.KisaltMetin(ex.Message, 120));
                }
                finally
                {
                    Interlocked.Exchange(ref islemde, 0);
                    Yokla(null);
                }
            });
        }

        static void BaslatEylemi()
        {
            using (ServiceController sc = new ServiceController(ServisKontrol.Ad))
            {
                sc.Refresh();
                if (sc.Status == ServiceControllerStatus.Stopped)
                {
                    Gunluk.Yaz("Servis başlatılıyor (tepsiden).");
                    sc.Start();
                }
            }
        }

        public void ServisiBaslat() { Islem("Servisi başlatma", BaslatEylemi); }

        public void ServisiDurdur()
        {
            Islem("Servisi durdurma", delegate
            {
                using (ServiceController sc = new ServiceController(ServisKontrol.Ad))
                {
                    sc.Refresh();
                    if (sc.Status == ServiceControllerStatus.Running || sc.Status == ServiceControllerStatus.Paused)
                    {
                        Gunluk.Yaz("Servis durduruluyor (tepsiden).");
                        sc.Stop();
                    }
                }
            });
        }

        public void ServisiYenidenBaslat()
        {
            Islem("Servisi yeniden başlatma", delegate
            {
                using (ServiceController sc = new ServiceController(ServisKontrol.Ad))
                {
                    sc.Refresh();
                    if (sc.Status == ServiceControllerStatus.Running || sc.Status == ServiceControllerStatus.Paused)
                    {
                        Gunluk.Yaz("Servis yeniden başlatılıyor (tepsiden).");
                        sc.Stop();
                        sc.WaitForStatus(ServiceControllerStatus.Stopped, TimeSpan.FromSeconds(45));
                    }
                    sc.Refresh();
                    if (sc.Status == ServiceControllerStatus.Stopped) sc.Start();
                }
            });
        }

        // Servis calismiyorsa baslatir; hazir olunca (iki uc da yanit verince) tarayiciyi acar.
        public void AcIstegi()
        {
            acBaslangic = DateTime.UtcNow;
            acBekliyor = true;
            Islem("Servisi başlatma", BaslatEylemi);
        }
    }

    sealed class ServisTepsiBaglami : ApplicationContext
    {
        readonly ServisIzleyici iz;
        readonly NotifyIcon ni;
        readonly ContextMenuStrip menu;
        readonly ToolStripMenuItem miDurum;
        readonly ToolStripMenuItem miBaslat;
        readonly ToolStripMenuItem miDurdur;
        readonly ToolStripMenuItem miYeniden;
        readonly Icon[] ikonlar; // 0 sari, 1 yesil, 2 kirmizi
        readonly Control ui;
        readonly EventWaitHandle acOlay;
        readonly EventWaitHandle durdurOlay;
        bool cikisBasladi;

        public ServisTepsiBaglami(bool pencereAc, EventWaitHandle acOlay, EventWaitHandle durdurOlay)
        {
            this.acOlay = acOlay;
            this.durdurOlay = durdurOlay;

            ui = new Control();
            IntPtr zorla = ui.Handle; // tutac olussun; BeginInvoke ile UI iplige atlanir
            GC.KeepAlive(zorla);

            ikonlar = TepsiBaglami.IkonlariYap();

            ToolStripMenuItem miAc = new ToolStripMenuItem("Z SCADA'yı aç");
            miAc.Font = new Font(miAc.Font, FontStyle.Bold);
            miAc.Click += delegate { iz.AcIstegi(); };
            miDurum = new ToolStripMenuItem("Durum");
            miDurum.Enabled = false;
            miBaslat = new ToolStripMenuItem("Servisi başlat");
            miBaslat.Click += delegate { iz.ServisiBaslat(); };
            miDurdur = new ToolStripMenuItem("Servisi durdur");
            miDurdur.Click += delegate { iz.ServisiDurdur(); };
            miYeniden = new ToolStripMenuItem("Yeniden başlat");
            miYeniden.Click += delegate { iz.ServisiYenidenBaslat(); };
            ToolStripMenuItem miLog = new ToolStripMenuItem("Log klasörü");
            miLog.Click += delegate { LogKlasoruAc(); };
            ToolStripMenuItem miCik = new ToolStripMenuItem("Tepsiden çık (servis çalışmaya devam eder)");
            miCik.Click += delegate { CikisIste(); };

            menu = new ContextMenuStrip();
            menu.Items.Add(miAc);
            menu.Items.Add(miDurum);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(miBaslat);
            menu.Items.Add(miDurdur);
            menu.Items.Add(miYeniden);
            menu.Items.Add(miLog);
            menu.Items.Add(new ToolStripSeparator());
            menu.Items.Add(miCik);

            ni = new NotifyIcon();
            ni.ContextMenuStrip = menu;
            ni.Icon = ikonlar[0];
            ni.Text = "Z SCADA";
            ni.MouseDoubleClick += delegate(object g, MouseEventArgs e)
            {
                if (e.Button == MouseButtons.Left) iz.AcIstegi();
            };
            ni.Visible = true;

            iz = new ServisIzleyici();
            iz.Degisti = delegate { UiyeGonder(new MethodInvoker(Guncelle)); };
            iz.BalonGoster = delegate(string baslik, string metin)
            {
                UiyeGonder(new MethodInvoker(delegate { ni.ShowBalloonTip(8000, baslik, metin, ToolTipIcon.Error); }));
            };
            Guncelle();

            Thread izleyici = new Thread(OlayDinle);
            izleyici.IsBackground = true;
            izleyici.Name = "ZScada-Olay";
            izleyici.Start();

            iz.Baslat();
            if (pencereAc) iz.AcIstegi();
        }

        void UiyeGonder(MethodInvoker m)
        {
            try
            {
                if (ui.IsHandleCreated && !ui.IsDisposed) ui.BeginInvoke(m);
            }
            catch { }
        }

        // Ikinci kopyadan gelen sinyaller.
        void OlayDinle()
        {
            WaitHandle[] bekle = new WaitHandle[] { acOlay, durdurOlay };
            while (true)
            {
                int i;
                try { i = WaitHandle.WaitAny(bekle); }
                catch { return; }
                if (i == 0)
                {
                    UiyeGonder(new MethodInvoker(delegate { iz.AcIstegi(); }));
                }
                else
                {
                    Gunluk.Yaz("Durdurma sinyali alındı (tepsi kapanıyor; servis çalışmaya devam eder).");
                    UiyeGonder(new MethodInvoker(CikisIste));
                    return;
                }
            }
        }

        // Yalniz tepsi kapanir; servis dokunulmaz.
        void CikisIste()
        {
            if (cikisBasladi) return;
            cikisBasladi = true;
            iz.Dur();
            ni.Visible = false;
            ni.Dispose();
            ExitThread();
        }

        void LogKlasoruAc()
        {
            try { Process.Start("explorer.exe", "\"" + Yol.Veri + "\""); }
            catch (Exception ex) { Gunluk.Yaz("Log klasörü açılamadı: " + ex.Message); }
        }

        void Guncelle()
        {
            if (cikisBasladi) return;
            int r = iz.Renk;
            string ad = r == ServisIzleyici.Yesil ? "Çalışıyor" : (r == ServisIzleyici.Sari ? "Başlıyor" : "Durdu");
            ni.Icon = ikonlar[r];
            string baslik = "Z SCADA — " + ad;
            int kalan = 63 - baslik.Length - 1; // NotifyIcon.Text en fazla 63 karakter
            ni.Text = kalan > 0 ? baslik + "\n" + Yardim.KisaltMetin(iz.Url, kalan) : Yardim.KisaltMetin(baslik, 63);
            miDurum.Text = Yardim.KisaltMetin(iz.DurumMetni, 70);
            miBaslat.Enabled = iz.BaslatEtkin;
            miDurdur.Enabled = iz.DurdurEtkin;
            miYeniden.Enabled = iz.YenidenEtkin;
        }
    }

    // ---------------------------------------------------------------- giris noktasi

    static class Program
    {
        const string MutexAd = @"Local\ZScadaLauncher";
        const string AcOlayAd = @"Local\ZScadaLauncher.Ac";
        const string DurdurOlayAd = @"Local\ZScadaLauncher.Durdur";
        // --servis-konsol kopyasi tepsiden ayri adlarla calisir (tepsi calisirken de sinanabilsin).
        const string KonsolMutexAd = @"Local\ZScadaServisKonsol";
        const string KonsolDurdurOlayAd = @"Local\ZScadaServisKonsol.Durdur";

        static Win32.KonsolIsleyici konsolIsleyici; // GC toplamasin

        [STAThread]
        static int Main(string[] args)
        {
            bool durdur = false, arkaplan = false, etkinlestir = false, servis = false, konsol = false;
            string veri = null;
            for (int i = 0; i < args.Length; i++)
            {
                string k = args[i].Trim().ToLowerInvariant();
                if (k == "--durdur") durdur = true;
                else if (k == "--arkaplan") arkaplan = true;
                else if (k == "--etkinlestir") etkinlestir = true;
                else if (k == "--servis") servis = true;
                else if (k == "--servis-konsol") konsol = true;
                else if (k == "--veri" && i + 1 < args.Length) veri = args[++i].Trim();
            }

            Yol.Hazirla(veri);

            if (servis) return ServisCalistir();
            if (konsol) return KonsolServis(etkinlestir);

            if (durdur)
            {
                // Sinama icin calisan --servis-konsol kopyasi varsa onu kapat (gercek servise dokunmaz).
                int konsolSonuc = KonsolKopyayiDurdur();
                if (konsolSonuc >= 0) return konsolSonuc;
            }

            // Servis kuruluyken tepsi kendi kullanicisinin veri klasorune yazamaz; kendi logunu tutar.
            if (Yol.ServisKurulu)
            {
                try
                {
                    string yerel = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                    string dizin = Path.Combine(yerel, "DVP-SCADA");
                    Directory.CreateDirectory(dizin);
                    Gunluk.Hedef = Path.Combine(dizin, "tepsi.log");
                }
                catch { }
            }

            bool ilk;
            Mutex mutex = new Mutex(true, MutexAd, out ilk);
            if (!ilk)
            {
                int sonuc = IkinciKopya(mutex, durdur, arkaplan);
                mutex.Dispose();
                return sonuc;
            }

            EventWaitHandle acOlay = new EventWaitHandle(false, EventResetMode.AutoReset, AcOlayAd);
            EventWaitHandle durdurOlay = new EventWaitHandle(false, EventResetMode.AutoReset, DurdurOlayAd);
            try
            {
                if (durdur)
                {
                    // Calisan tepsi yok. Servis kuruluysa veri klasorunun pid dosyalari SERVISIN cocuklarina aittir:
                    // dokunma (servisi durdurmak kurucunun isi). Servis yoksa: eski PowerShell surumunden / yetim node surecleri.
                    if (!Yol.ServisKurulu) Yardim.PidDosyalariniTemizle();
                    return 0;
                }

                Application.SetUnhandledExceptionMode(UnhandledExceptionMode.CatchException);
                Application.ThreadException += delegate(object g, ThreadExceptionEventArgs e)
                {
                    Gunluk.Yaz("Beklenmeyen hata (UI): " + e.Exception);
                };
                AppDomain.CurrentDomain.UnhandledException += delegate(object g, UnhandledExceptionEventArgs e)
                {
                    Gunluk.Yaz("Beklenmeyen hata: " + e.ExceptionObject);
                };
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);

                if (Yol.ServisKurulu)
                {
                    ServisTepsiBaglami sb = new ServisTepsiBaglami(!arkaplan, acOlay, durdurOlay);
                    Application.Run(sb);
                    sb.Dispose();
                }
                else
                {
                    TepsiBaglami baglam = new TepsiBaglami(etkinlestir, !arkaplan, acOlay, durdurOlay);
                    Application.Run(baglam);
                    baglam.Dispose();
                }
                return 0;
            }
            finally
            {
                try { mutex.ReleaseMutex(); } catch { }
                mutex.Dispose();
                acOlay.Dispose();
                durdurOlay.Dispose();
            }
        }

        static int IkinciKopya(Mutex mutex, bool durdur, bool arkaplan)
        {
            if (durdur)
            {
                // Handle acik kalsin: sinyal birinci kopya dinlemeye baslamadan kaybolmasin.
                using (EventWaitHandle olay = new EventWaitHandle(false, EventResetMode.AutoReset, DurdurOlayAd))
                {
                    olay.Set();
                    try
                    {
                        if (mutex.WaitOne(15000))
                        {
                            try { mutex.ReleaseMutex(); } catch { }
                            return 0;
                        }
                    }
                    catch (AbandonedMutexException) { return 0; }
                }
                Gunluk.Yaz("--durdur: çalışan kopya 15 sn içinde kapanmadı.");
                if (!Yol.ServisKurulu) Yardim.PidDosyalariniTemizle();
                return 2;
            }
            if (!arkaplan)
            {
                using (EventWaitHandle olay = new EventWaitHandle(false, EventResetMode.AutoReset, AcOlayAd))
                {
                    olay.Set();
                }
            }
            return 0;
        }

        // ------- --servis

        static int ServisCalistir()
        {
            AppDomain.CurrentDomain.UnhandledException += delegate(object g, UnhandledExceptionEventArgs e)
            {
                Gunluk.Yaz("Beklenmeyen hata (servis): " + e.ExceptionObject);
            };
            // SCM servisleri etkilesimli olmayan pencere istasyonunda calisir. Elle (etkilesimli) calistirilirsa
            // ServiceBase.Run bir MessageBox acip bekler; bunun yerine logla ve cik.
            if (Environment.UserInteractive)
            {
                Gunluk.Yaz("--servis yalnızca Windows hizmet yöneticisi tarafından başlatılabilir (elle sınamak için --servis-konsol kullanın).");
                return 1;
            }
            ZScadaServisi s = new ZScadaServisi();
            try
            {
                ServiceBase.Run(s); // servis durana kadar doner
            }
            catch (Exception ex)
            {
                // Komut satirindan elle calistirilirsa buraya duser (SCM disinda servis olmaz).
                Gunluk.Yaz("--servis yalnızca Windows hizmet yöneticisi tarafından başlatılabilir: " + ex.Message);
                return 1;
            }
            return s.ExitCode;
        }

        // ------- --servis-konsol

        static void KonsolYaz(string mesaj)
        {
            Gunluk.Yaz("[konsol] " + mesaj);
        }

        static int KonsolServis(bool etkinlestir)
        {
            // Winexe'nin konsolu yok: baslatan konsola baglanmayi dene (basarisizsa yalniz launcher.log).
            if (Win32.AttachConsole(-1)) Gunluk.KonsolaDa = true;
            try { Directory.CreateDirectory(Yol.Veri); } catch { }

            bool ilk;
            using (Mutex mutex = new Mutex(true, KonsolMutexAd, out ilk))
            {
                if (!ilk)
                {
                    KonsolYaz("Zaten çalışan bir --servis-konsol kopyası var; çıkılıyor.");
                    return 3;
                }
                try
                {
                    ManualResetEvent bitti = new ManualResetEvent(false);
                    ManualResetEvent temiz = new ManualResetEvent(false);
                    int cikis = 0;
                    using (EventWaitHandle durdurOlay = new EventWaitHandle(false, EventResetMode.AutoReset, KonsolDurdurOlayAd))
                    {
                        // Ctrl+C, Ctrl+Break, konsol kapatma, oturum kapatma, sistem kapanisi.
                        konsolIsleyici = delegate(int tip)
                        {
                            KonsolYaz("Kapatma sinyali alındı (tip " + tip + ").");
                            bitti.Set();
                            // CLOSE/LOGOFF/SHUTDOWN: islemci donunce surec olur; temizlik bitene kadar bekle.
                            if (tip == 2 || tip == 5 || tip == 6) temiz.WaitOne(15000);
                            return true;
                        };
                        Win32.SetConsoleCtrlHandler(konsolIsleyici, true);

                        KonsolYaz("Servis-konsol başlıyor (veri: " + Yol.Veri + "). Durdurmak için Ctrl+C ya da: ZScada.exe --durdur");
                        Yonetici y = new Yonetici(etkinlestir);
                        y.Vazgecti = delegate { cikis = 1; bitti.Set(); };
                        y.Baslat(false);

                        int hangisi = WaitHandle.WaitAny(new WaitHandle[] { bitti, durdurOlay });
                        if (hangisi == 1) KonsolYaz("--durdur sinyali alındı.");
                        KonsolYaz(cikis == 0 ? "Kapatılıyor…" : "Kurtarılamayan hata; kapatılıyor (çıkış kodu 1).");
                        y.Cik(10000);
                        KonsolYaz("Durdu.");
                        temiz.Set();
                        return cikis;
                    }
                }
                finally
                {
                    try { mutex.ReleaseMutex(); } catch { }
                }
            }
        }

        // Calisan --servis-konsol kopyasini kapatir. -1: calisan kopya yok; 0: kapandi; 2: kapanmadi.
        static int KonsolKopyayiDurdur()
        {
            Mutex mutex;
            try { mutex = Mutex.OpenExisting(KonsolMutexAd); }
            catch (WaitHandleCannotBeOpenedException) { return -1; }
            catch (UnauthorizedAccessException) { return -1; }
            using (mutex)
            using (EventWaitHandle olay = new EventWaitHandle(false, EventResetMode.AutoReset, KonsolDurdurOlayAd))
            {
                olay.Set();
                try
                {
                    if (mutex.WaitOne(15000))
                    {
                        try { mutex.ReleaseMutex(); } catch { }
                        return 0;
                    }
                }
                catch (AbandonedMutexException) { return 0; }
            }
            Gunluk.Yaz("--durdur: --servis-konsol kopyası 15 sn içinde kapanmadı.");
            return 2;
        }
    }
}
