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

[Run]
; Proposer d'afficher le changelog
Filename: "{app}\CHANGELOG.txt"; Description: "Afficher le CHANGE LOG"; Flags: postinstall shellexec
; Lancer l'appli en fin d'installation
Filename: "{app}\LMU_Stats_Viewer.exe"; Description: "Lancer LMU Stats Viewer"; Flags: postinstall nowait
