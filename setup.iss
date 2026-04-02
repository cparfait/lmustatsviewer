; Script Inno Setup pour LMU Stats Viewer

[Setup]
AppName=LMU Stats Viewer
AppVersion=0.9.4
AppPublisher=Cris Tof
AppPublisherURL=https://github.com/cparfait/lmustatsviewer
DefaultDirName={autopf}\LMU_Stats_Viewer
DefaultGroupName=LMU Stats Viewer
UninstallDisplayIcon={app}\htdocs\logos\lmu.ico
OutputBaseFilename=SETUP-LSV-0-9.4
Compression=lzma
SolidCompression=yes
WizardStyle=modern
PrivilegesRequired=admin

[Files]
; PHP runtime (non inclus dans le repo — à télécharger séparément, voir README)
Source: "php\*"; DestDir: "{app}\php"; Flags: recursesubdirs createallsubdirs

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

[Run]
; Permissions en écriture pour les utilisateurs standard
Filename: "cmd.exe"; Parameters: "/c icacls ""{app}\htdocs\includes\init.php"" /grant *S-1-5-32-545:(M)"; Flags: runhidden
; Proposer d'afficher le changelog
Filename: "{app}\CHANGELOG.txt"; Description: "Afficher le CHANGE LOG"; Flags: postinstall shellexec
; Lancer l'appli en fin d'installation
Filename: "{app}\LMU_Stats_Viewer.exe"; Description: "Lancer LMU Stats Viewer"; Flags: postinstall nowait
