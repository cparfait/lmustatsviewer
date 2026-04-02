; Script Inno Setup pour LMU Stats Viewer

#define AppVersion Trim(FileRead(FileOpen("version.txt")))

[Setup]
AppId={{A3F8C2D1-5E7B-4A90-B3F6-8D2E1C4F9A03}
AppName=LMU Stats Viewer
AppVersion={#AppVersion}
AppPublisher=Cris Tof
AppPublisherURL=https://github.com/cparfait/lmustatsviewer
AppSupportURL=https://github.com/cparfait/lmustatsviewer/issues
AppUpdatesURL=https://github.com/cparfait/lmustatsviewer/releases
DefaultDirName={autopf}\LMU_Stats_Viewer
DefaultGroupName=LMU Stats Viewer
UninstallDisplayIcon={app}\htdocs\logos\lmu.ico
SetupIconFile=htdocs\logos\lmu.ico
OutputBaseFilename=SETUP-LSV-{#StringChange(AppVersion, '.', '-')}
Compression=lzma
SolidCompression=yes
WizardStyle=modern
CloseApplications=yes
RestartApplications=yes
PrivilegesRequired=admin
PrivilegesRequiredOverridesAllowed=dialog

[Files]
; PHP runtime (non inclus dans le repo — à télécharger séparément, voir README)
Source: "php\*"; DestDir: "{app}\php"; Flags: recursesubdirs createallsubdirs

; Version (source unique pour PHP, Python et InnoSetup)
Source: "version.txt"; DestDir: "{app}"

; Launcher (compilé depuis launcher/build.bat)
Source: "LMU_Stats_Viewer.exe"; DestDir: "{app}"

; Documentation
Source: "CHANGELOG.txt"; DestDir: "{app}"; Flags: ignoreversion

; Application web
Source: "htdocs\*"; DestDir: "{app}\htdocs\"; Flags: recursesubdirs createallsubdirs

[Icons]
; Menu Démarrer
Name: "{group}\LMU Stats Viewer"; Filename: "{app}\LMU_Stats_Viewer.exe"; WorkingDir: "{app}"; IconFilename: "{app}\htdocs\logos\lmu.ico"

; Bureau
Name: "{commondesktop}\LMU Stats Viewer"; Filename: "{app}\LMU_Stats_Viewer.exe"; WorkingDir: "{app}"; Tasks: desktopicon; IconFilename: "{app}\htdocs\logos\lmu.ico"

[Tasks]
Name: "desktopicon"; Description: "{cm:CreateDesktopIcon}"; GroupDescription: "{cm:AdditionalIcons}"
Name: "startup"; Description: "Lancer LMU Stats Viewer au démarrage de Windows"; GroupDescription: "Démarrage automatique :"; Flags: unchecked

[Registry]
Root: HKCU; Subkey: "Software\Microsoft\Windows\CurrentVersion\Run"; ValueType: string; ValueName: "LMU Stats Viewer"; ValueData: """{app}\LMU_Stats_Viewer.exe"""; Flags: uninsdeletevalue; Tasks: startup

[UninstallDelete]
Type: files; Name: "{userappdata}\LMU_Stats_Viewer\launcher.log"
Type: files; Name: "{userappdata}\LMU_Stats_Viewer\php_server.log"

[Code]
// Désinstalle silencieusement toute version précédente de "LMU Stats Viewer"
// qui n'aurait pas le même AppId (ex: v0.9.3 installée sans AppId fixe).
function FindInKey(BaseKey: String): String;
var
  Names: TArrayOfString;
  I: Integer;
  DisplayName, UninstallStr, DisplayVersion: String;
begin
  Result := '';
  if RegGetSubkeyNames(HKLM, BaseKey, Names) then
    for I := 0 to GetArrayLength(Names) - 1 do
      if RegQueryStringValue(HKLM, BaseKey + '\' + Names[I], 'DisplayName', DisplayName) then
        if DisplayName = 'LMU Stats Viewer' then
          if RegQueryStringValue(HKLM, BaseKey + '\' + Names[I], 'DisplayVersion', DisplayVersion) then
            if DisplayVersion <> '{#AppVersion}' then
              if RegQueryStringValue(HKLM, BaseKey + '\' + Names[I], 'UninstallString', UninstallStr) then
              begin
                Result := UninstallStr;
                Exit;
              end;
end;

function FindOldUninstallString(): String;
begin
  Result := FindInKey('SOFTWARE\Microsoft\Windows\CurrentVersion\Uninstall');
  if Result = '' then
    Result := FindInKey('SOFTWARE\WOW6432Node\Microsoft\Windows\CurrentVersion\Uninstall');
end;

procedure KillApp();
var
  ResultCode: Integer;
begin
  Exec('taskkill.exe', '/F /IM LMU_Stats_Viewer.exe', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  Exec('taskkill.exe', '/F /IM php.exe',              '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
end;

procedure CurStepChanged(CurStep: TSetupStep);
var
  UninstallStr: String;
  ResultCode: Integer;
begin
  if CurStep = ssInstall then
  begin
    KillApp();
    UninstallStr := FindOldUninstallString();
    if UninstallStr <> '' then
      Exec(RemoveQuotes(UninstallStr), '/SILENT', '', SW_HIDE, ewWaitUntilTerminated, ResultCode);
  end;
end;

procedure CurUninstallStepChanged(CurUninstallStep: TUninstallStep);
begin
  if CurUninstallStep = usUninstall then
    KillApp();
end;

[Run]
; Proposer d'afficher le changelog
Filename: "{app}\CHANGELOG.txt"; Description: "Afficher le CHANGE LOG"; Flags: postinstall shellexec
; Lancer l'appli en fin d'installation
Filename: "{app}\LMU_Stats_Viewer.exe"; Description: "Lancer LMU Stats Viewer"; Flags: postinstall nowait
