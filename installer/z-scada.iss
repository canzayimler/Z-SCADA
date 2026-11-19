; Z SCADA Windows kurucusu (Inno Setup 6). Derleme: build.ps1 -Version X.Y.Z (ayrinti: README.md).
; SPDX-License-Identifier: GPL-3.0-or-later

#ifndef MyAppVersion
  #define MyAppVersion "0.0.0"
#endif

#define MyAppName "Z SCADA"
#define MyAppPublisher "Z SCADA contributors"
#define MyAppExeName "ZScada.exe"
; YUKSELTME UYUMLULUGU: servis adi degismez; yeni ad ikinci bir servis kurar ve eski servis portlari tutar.
#define MyServiceName "ZScada"

; Yonetici kurulumu + Windows servisi.
;  - Program: {autopf}\Z SCADA, veri: {commonappdata}\DVP-SCADA\data, servis: ZScada (NT SERVICE\ZScada).
;  - Kullanici basina eski kurulum (0.1.x/0.2.0, AppId ayni, HKCU) sessizce kaldirilir; verisi kopyalanir, kaynak silinmez.
;  - Tum servis adimlari {app}\kurulum.log'a yazilir.
;
; YUKSELTME UYUMLULUGU ile korunan eski adlar (urunun onceki adi "DVP SCADA" idi). Degistirilirse mevcut kurulumlar
; yerinde guncellenmez, veriler bulunamaz veya iki kopya kurulur:
;  - AppId GUID: Inno Setup ayni urunu bu kimlikle tanir ve yerinde gunceller.
;  - Veri yolu {commonappdata}\DVP-SCADA\data: mevcut kurulumlarin ekranlari, kullanicilari ve gecmisi burada;
;    ZScada.exe ayni yolu kullanir (launcher\ZScada.cs).
;  - Eski kullanici basina veri yolu {localappdata}\DVP-SCADA\data: yalniz ilk yukseltmede tasima kaynagi.
;  - Eski kaldirma anahtari (HKCU ...\Uninstall\<AppId>_is1) ve eski "DVP SCADA" kisayollari: eski kurulumu temizlemek icin.

[Setup]
; YUKSELTME UYUMLULUGU: AppId degismez (bkz. dosya basi).
AppId={{B83EA00E-76D8-43C1-9902-3EDB71FB2F4B}
AppName={#MyAppName}
AppVersion={#MyAppVersion}
AppPublisher={#MyAppPublisher}
DefaultDirName={autopf}\Z SCADA
DefaultGroupName=Z SCADA
UsePreviousGroup=no
DisableProgramGroupPage=yes
PrivilegesRequired=admin
ArchitecturesAllowed=x64compatible
ArchitecturesInstallIn64BitMode=x64compatible
OutputDir=dist
OutputBaseFilename=Z-SCADA-Kurulum-{#MyAppVersion}
Compression=lzma2/ultra64
SolidCompression=yes
WizardStyle=modern
SetupLogging=yes
CloseApplications=no
UninstallDisplayName=Z SCADA
UninstallDisplayIcon={app}\z-scada.ico
SetupIconFile=assets\z-scada.ico
VersionInfoVersion={#MyAppVersion}
VersionInfoCompany={#MyAppPublisher}
VersionInfoDescription=Z SCADA Windows Kurulumu
VersionInfoProductName={#MyAppName}

[Languages]
Name: "turkish"; MessagesFile: "compiler:Languages\Turkish.isl"

[Tasks]
Name: "desktopicon"; Description: "Masaustune Z SCADA kisayolu ekle"; GroupDescription: "Kisayollar:"; Flags: checkedonce
Name: "autostart"; Description: "Windows oturumu acildiginda tepsi simgesini baslat (servis zaten Windows ile acilir)"; GroupDescription: "Baslatma:"; Flags: checkedonce

[Files]
; Eski PowerShell baslaticilari (Baslat.ps1/Durdur.ps1) servis modunda yanlis veri yolunu kullanir: hic kurulmaz.
Source: "_staging\*"; DestDir: "{app}"; Excludes: "Baslat.ps1,Durdur.ps1"; Flags: ignoreversion recursesubdirs createallsubdirs

[InstallDelete]
; YUKSELTME UYUMLULUGU: urun adi DVP SCADA -> Z SCADA (0.1.4). Eski adla kalan kisayollar temizlenir.
Type: filesandordirs; Name: "{userprograms}\DVP SCADA"
Type: files; Name: "{autodesktop}\DVP SCADA.lnk"
Type: files; Name: "{userstartup}\DVP SCADA.lnk"
; 0.5.0: simge dosyasi DVP-SCADA.ico -> z-scada.ico; eski kopya program klasorunde kalmasin.
Type: files; Name: "{app}\DVP-SCADA.ico"

[UninstallDelete]
Type: files; Name: "{app}\kurulum.log"

[Icons]
Name: "{group}\Z SCADA"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\z-scada.ico"
; YUKSELTME UYUMLULUGU: veri yolu eski urun adini korur (bkz. dosya basi).
Name: "{group}\Veri ve Log Klasoru"; Filename: "{commonappdata}\DVP-SCADA\data"
; Kaldirici (unins000.exe) program klasorunde gizli kalmasin: Baslat menusunden ve klasorden ulasilsin.
Name: "{group}\Z SCADA'yi Kaldir"; Filename: "{uninstallexe}"; IconFilename: "{app}\z-scada.ico"
Name: "{app}\Z SCADA'yi Kaldir"; Filename: "{uninstallexe}"; IconFilename: "{app}\z-scada.ico"
Name: "{autodesktop}\Z SCADA"; Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; IconFilename: "{app}\z-scada.ico"; Tasks: desktopicon
Name: "{commonstartup}\Z SCADA"; Filename: "{app}\{#MyAppExeName}"; Parameters: "--arkaplan"; WorkingDir: "{app}"; IconFilename: "{app}\z-scada.ico"; Tasks: autostart

[Run]
; Parametresiz: tepsiyi baslatir ve (servis hazir olunca) tarayiciyi acar. Servisin kendisini kurulum zaten baslatti.
Filename: "{app}\{#MyAppExeName}"; WorkingDir: "{app}"; Description: "Z SCADA'yi uygulama olarak ac"; Flags: postinstall nowait skipifsilent runasoriginaluser

[Code]
const
  ServiceName = '{#MyServiceName}';
  // YUKSELTME UYUMLULUGU: eski kullanici basina kurulumun (ayni AppId, HKCU) kaldirma anahtari.
  OldUninstallKey = 'Software\Microsoft\Windows\CurrentVersion\Uninstall\{B83EA00E-76D8-43C1-9902-3EDB71FB2F4B}_is1';
  // Varsayilan servis SDDL'i + Authenticated Users (AU): QUERY_CONFIG, QUERY_STATUS, ENUM_DEPENDENTS, START, STOP,
  // INTERROGATE, READ_CONTROL. SY ve BA tam kalir. (SACL kasitli yok.)
  ServiceSddl = 'D:(A;;CCLCSWRPWPDTLOCRRC;;;SY)(A;;CCDCLCSWRPWPDTLOCRSDRCWDWO;;;BA)(A;;CCLCSWRPWPLORC;;;AU)(A;;CCLCSWLOCRRC;;;IU)(A;;CCLCSWLOCRRC;;;SU)';

var
  KurulumLog: String;
  KurulumHata: Boolean;

procedure KLog(const Msg: String);
begin
  KurulumLog := KurulumLog + GetDateTimeString('yyyy-mm-dd hh:nn:ss', '-', ':') + '  ' + Msg + #13#10;
  Log(Msg);
end;

function SysExe(const Name: String): String;
begin
  Result := ExpandConstant('{sys}\') + Name;
end;

// Komutu calistirir, cikis kodunu kurulum.log'a yazar. MaxOk: bu degere kadar (dahil) basari sayilir.
// Critical: basarisizsa kurulum sonunda uyari gosterilsin.
function RunStep(const Title, Exe, Params: String; MaxOk: Integer; Critical: Boolean): Boolean;
var
  ResultCode: Integer;
begin
  Result := False;
  ResultCode := 0;
  if Exec(Exe, Params, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) then
  begin
    Result := (ResultCode >= 0) and (ResultCode <= MaxOk);
    if Result then
      KLog(Title + ': tamam (cikis kodu ' + IntToStr(ResultCode) + ')')
    else
      KLog(Title + ': BASARISIZ (cikis kodu ' + IntToStr(ResultCode) + ')');
  end
  else
    KLog(Title + ': BASLATILAMADI (' + SysErrorMessage(ResultCode) + ')');
  if (not Result) and Critical then KurulumHata := True;
end;

function ServiceExists: Boolean;
var
  ResultCode: Integer;
begin
  ResultCode := -1;
  Result := Exec(SysExe('sc.exe'), 'query ' + ServiceName, '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

// sc.exe durum sozcukleri (STOPPED/RUNNING) yerellestirilmez.
function ServiceStopped: Boolean;
var
  ResultCode: Integer;
begin
  ResultCode := -1;
  Result := Exec(ExpandConstant('{cmd}'), '/C sc query ' + ServiceName + ' | find "STOPPED" > nul',
    '', SW_HIDE, ewWaitUntilTerminated, ResultCode) and (ResultCode = 0);
end;

// sc stop + en fazla 30 sn bekle. True: servis durdu.
function StopServiceAndWait: Boolean;
var
  I: Integer;
begin
  RunStep('sc stop', SysExe('sc.exe'), 'stop ' + ServiceName, 9999, False);
  Result := False;
  for I := 1 to 30 do
  begin
    if ServiceStopped then
    begin
      Result := True;
      Break;
    end;
    Sleep(1000);
  end;
  if Result then
    KLog('Servis durdu.')
  else
    KLog('UYARI: servis 30 sn icinde durmadi.');
end;

// Son care: baska oturumlarda kalan tepsi kopyalari ZScada.exe'yi kilitler. Servis durdurulduktan sonra cagrilir.
procedure KillStrayTrays;
begin
  RunStep('taskkill ZScada.exe (artik tepsi kopyalari)', SysExe('taskkill.exe'), '/F /IM {#MyAppExeName}', 9999, False);
end;

function PrepareToInstall(var NeedsRestart: Boolean): String;
var
  TrayExe, OldLoc, OldUninst, OldTray, OldStop: String;
begin
  Result := '';
  KurulumLog := '';
  KurulumHata := False;
  KLog('Z SCADA {#MyAppVersion} kurulumu basliyor.');

  // 1. Bu kurulumun eski surumu: servisi durdur (gercekten dusene kadar bekle), sonra tepsiyi kapat.
  TrayExe := ExpandConstant('{app}\{#MyAppExeName}');
  if FileExists(TrayExe) then
  begin
    if ServiceExists then StopServiceAndWait;
    RunStep('tepsi --durdur (bu kurulum)', TrayExe, '--durdur', 9999, False);
  end;

  // 2. Kullanici basina eski kurulum (0.1.x / 0.2.0): durdur + sessiz kaldir (veri korunur).
  OldUninst := '';
  OldLoc := '';
  if RegQueryStringValue(HKCU, OldUninstallKey, 'UninstallString', OldUninst) then
  begin
    RegQueryStringValue(HKCU, OldUninstallKey, 'InstallLocation', OldLoc);
    OldUninst := RemoveQuotes(OldUninst);
    KLog('Kullanici basina eski kurulum bulundu: ' + OldLoc);
    if OldLoc <> '' then
    begin
      OldTray := AddBackslash(OldLoc) + '{#MyAppExeName}';
      OldStop := AddBackslash(OldLoc) + 'Durdur.ps1';
      if FileExists(OldTray) then
        RunStep('eski tepsi --durdur', OldTray, '--durdur', 9999, False)
      else if FileExists(OldStop) then
        RunStep('eski Durdur.ps1', ExpandConstant('{sys}\WindowsPowerShell\v1.0\powershell.exe'),
          '-NoProfile -ExecutionPolicy Bypass -File "' + OldStop + '"', 9999, False);
    end;
    if FileExists(OldUninst) then
      RunStep('eski kurulumu kaldir (sessiz, veri korunur)', OldUninst, '/VERYSILENT /SUPPRESSMSGBOXES /NORESTART', 0, False)
    else
      KLog('UYARI: eski kaldirici bulunamadi: ' + OldUninst);
  end
  else
    KLog('Kullanici basina eski kurulum yok.');

  KillStrayTrays;
end;

procedure TasiVeri;
var
  ProgData, DataDir, OldData: String;
begin
  // YUKSELTME UYUMLULUGU: veri yollari eski urun adini korur (bkz. dosya basi).
  ProgData := ExpandConstant('{commonappdata}\DVP-SCADA');
  DataDir := ProgData + '\data';
  OldData := ExpandConstant('{localappdata}\DVP-SCADA\data');
  if DirExists(DataDir) then
    KLog('Veri klasoru zaten var, tasima yapilmadi: ' + DataDir)
  else if DirExists(OldData) then
  begin
    ForceDirectories(ProgData);
    // Kaynak SILINMEZ. .pid dosyalari tasinmaz. Cikis kodu < 8 basari.
    RunStep('veri tasima (robocopy): ' + OldData + ' -> ' + DataDir, SysExe('robocopy.exe'),
      '"' + OldData + '" "' + DataDir + '" /E /XF *.pid /R:1 /W:1 /NP /NFL /NDL', 7, True);
  end
  else
    KLog('Eski veri klasoru yok, tasima gerekmedi.');
  if not DirExists(DataDir) then
  begin
    if ForceDirectories(DataDir) then
      KLog('Veri klasoru olusturuldu: ' + DataDir)
    else
    begin
      KLog('BASARISIZ: veri klasoru olusturulamadi: ' + DataDir);
      KurulumHata := True;
    end;
  end;
end;

procedure KurServis;
var
  AppExe, ProgData, DataDir, Sc, Icacls, SecretFile, Bin: String;
  Ok: Boolean;
  I: Integer;
  Secrets: array[0..2] of String;
begin
  AppExe := ExpandConstant('{app}\{#MyAppExeName}');
  // YUKSELTME UYUMLULUGU: veri yolu eski urun adini korur (bkz. dosya basi).
  ProgData := ExpandConstant('{commonappdata}\DVP-SCADA');
  DataDir := ProgData + '\data';
  Sc := SysExe('sc.exe');
  Icacls := SysExe('icacls.exe');

  // 2. Servis: varsa binPath/hesap guncelle (silme yok), yoksa olustur.
  Bin := 'binPath= "\"' + AppExe + '\" --servis" start= delayed-auto obj= "NT SERVICE\' + ServiceName + '" DisplayName= "Z SCADA"';
  if ServiceExists then
    Ok := RunStep('sc config (servis vardi)', Sc, 'config ' + ServiceName + ' ' + Bin, 0, True)
  else
    Ok := RunStep('sc create', Sc, 'create ' + ServiceName + ' ' + Bin, 0, True);
  if not Ok then
  begin
    KLog('Servis kurulamadi; sonraki servis adimlari atlandi.');
    Exit;
  end;
  RunStep('sc description', Sc, 'description ' + ServiceName + ' "Z SCADA sunucusu ve Node-RED yoneticisi"', 0, True);

  // 3. Kurtarma: cokerse 5 sn / 10 sn / 60 sn sonra yeniden baslat; failureflag=1 ile hata koduyla durmak da sayilir.
  RunStep('sc failure', Sc, 'failure ' + ServiceName + ' reset= 86400 actions= restart/5000/restart/10000/restart/60000', 0, True);
  RunStep('sc failureflag', Sc, 'failureflag ' + ServiceName + ' 1', 0, True);

  // 4. ACL: ProgramData mirasi Users'a her seyi okutur (scada.sqlite parola hash'leri dahil). Miras kesilir:
  // SYSTEM + Administrators tam, servis hesabi degistirir; Users yalniz klasorlerde gezinir ve ayarlar.ps1'i okur
  // (tepsi portu oradan alir). Ayar dosyasi yoksa simdi olusturulur ki Users okuma izni tutunsun.
  if not FileExists(DataDir + '\ayarlar.ps1') then
    FileCopy(ExpandConstant('{app}\Varsayilan-Ayarlar.ps1'), DataDir + '\ayarlar.ps1', True);
  RunStep('icacls miras kes + servis hesabi', Icacls, '"' + ProgData + '" /inheritance:r /grant:r *S-1-5-18:(OI)(CI)F /grant:r *S-1-5-32-544:(OI)(CI)F /grant:r "NT SERVICE\' + ServiceName + ':(OI)(CI)M" /grant:r *S-1-5-32-545:RX', 0, True);
  RunStep('icacls Users veri klasoru', Icacls, '"' + DataDir + '" /grant *S-1-5-32-545:RX', 0, True);
  RunStep('icacls Users ayarlar.ps1', Icacls, '"' + DataDir + '\ayarlar.ps1" /grant *S-1-5-32-545:R', 0, True);
  // Tasinan sir dosyalari miras ACL ile (Users okuyabilir) gelmis olur; sunucu/betikler bunlari yalniz olusturulurken
  // daraltir. Servis, Administrators ve SYSTEM disinda kimse okuyamasin.
  Secrets[0] := 'nodered-admin.json';
  Secrets[1] := 'admin-access.json';
  Secrets[2] := 'gateway-token';
  for I := 0 to 2 do
  begin
    SecretFile := DataDir + '\' + Secrets[I];
    if FileExists(SecretFile) then
      RunStep('icacls sir dosyasi ' + Secrets[I], Icacls,
        '"' + SecretFile + '" /inheritance:r /grant:r "NT SERVICE\' + ServiceName + ':F" /grant:r *S-1-5-32-544:F /grant:r *S-1-5-18:F', 0, True);
  end;

  // 5. Servis izni: Authenticated Users baslatabilir/durdurabilir (tepsi menusu icin).
  RunStep('sc sdset', Sc, 'sdset ' + ServiceName + ' ' + ServiceSddl, 0, True);

  // 6. Baslat.
  RunStep('sc start', Sc, 'start ' + ServiceName, 0, True);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  LogFile: String;
begin
  if CurStep <> ssPostInstall then Exit;
  KLog('Dosyalar kuruldu; servis adimlari basliyor.');
  TasiVeri;
  KurServis;
  if KurulumHata then
    KLog('SONUC: bazi adimlar BASARISIZ.')
  else
    KLog('SONUC: tum adimlar tamam.');
  LogFile := ExpandConstant('{app}\kurulum.log');
  if not SaveStringToFile(LogFile, KurulumLog, False) then
    Log('kurulum.log yazilamadi: ' + LogFile);
  if KurulumHata and (not WizardSilent) then
    MsgBox('Kurulum tamamlandi ancak bazi servis adimlari basarisiz oldu.' + #13#10 + #13#10 +
      'Ayrintilar: ' + LogFile, mbError, MB_OK);
end;

// Kaldirma: tepsiyi kapat, servisi durdur ve sil. (Once tepsi: servis varken --durdur yalniz tepsiyi kapatir.)
// Veri klasoru ({commonappdata}) varsayilan olarak korunur; eski {localappdata} kopyasina dokunulmaz.
procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
var
  DataDir: String;
begin
  if CurUninstallStep = usUninstall then
  begin
    RunStep('tepsi --durdur', ExpandConstant('{app}\{#MyAppExeName}'), '--durdur', 9999, False);
    if ServiceExists then
    begin
      StopServiceAndWait;
      RunStep('sc delete', SysExe('sc.exe'), 'delete ' + ServiceName, 0, False);
    end;
    KillStrayTrays;
    Exit;
  end;
  if CurUninstallStep <> usPostUninstall then Exit;
  if UninstallSilent then Exit;
  // YUKSELTME UYUMLULUGU: veri yolu eski urun adini korur (bkz. dosya basi).
  DataDir := ExpandConstant('{commonappdata}\DVP-SCADA');
  if not DirExists(DataDir) then Exit;
  if MsgBox('Z SCADA verileri de silinsin mi?' + #13#10 + #13#10 +
      'Ekranlar, cihaz/etiket ayarlari, kullanicilar ve loglar:' + #13#10 + DataDir + #13#10 + #13#10 +
      'Hayir derseniz veriler korunur; yeniden kurulumda kaldigi yerden devam eder.',
      mbConfirmation, MB_YESNO or MB_DEFBUTTON2) = IDYES then
  begin
    if not DelTree(DataDir, True, True, True) then
      MsgBox('Veri klasoru tamamen silinemedi:' + #13#10 + DataDir, mbError, MB_OK);
  end;
end;
