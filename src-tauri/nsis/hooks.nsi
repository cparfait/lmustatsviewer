; ─────────────────────────────────────────────────────────────────────────────
; hooks.nsi — LMU Stats Viewer custom NSIS hooks
;
; PREINSTALL  : propose de désinstaller l'ancienne V1 (0.9.x), livrée avec
;               InnoSetup — NSIS ne la voit pas et les deux cohabiteraient.
; POSTINSTALL : propose d'installer le plugin rF2 Shared Memory Map (requis
;               pour la page Live Timing).
;
; Le DLL rFactor2SharedMemoryMapPlugin64.dll est bundlé en tant que ressource
; Tauri et se trouve dans $INSTDIR lors de l'exécution du hook.
; Il est supprimé de $INSTDIR à la fin du hook (inutile pour l'appli elle-même).
; ─────────────────────────────────────────────────────────────────────────────

; AppId InnoSetup de la V1 (setup.iss, inchangé sur toute la série 0.9.x).
; InnoSetup suffixe la clé de désinstallation par « _is1 ».
!define LSV_V1_UNINST_KEY \
  "Software\Microsoft\Windows\CurrentVersion\Uninstall\{A3F8C2D1-5E7B-4A90-B3F6-8D2E1C4F9A03}_is1"

!macro NSIS_HOOK_PREINSTALL
  Push $R0

  ; Uniquement en installation interactive : lors d'une mise à jour auto
  ; (updater Tauri, /UPDATE /P /R) une MessageBox bloquerait le processus.
  ${If} $UpdateMode <> 1
    ${If} $PassiveMode <> 1
      ${IfNot} ${Silent}

        ; ── Recherche de l'ancienne installation ───────────────────────────
        ; La V1 s'installait en admin (HKLM) mais l'utilisateur pouvait
        ; basculer en installation par utilisateur (HKCU) : on teste les
        ; trois vues du registre.
        SetRegView 64
        ReadRegStr $R0 HKLM "${LSV_V1_UNINST_KEY}" "UninstallString"
        ${If} $R0 == ""
          SetRegView 32
          ReadRegStr $R0 HKLM "${LSV_V1_UNINST_KEY}" "UninstallString"
        ${EndIf}
        ${If} $R0 == ""
          ReadRegStr $R0 HKCU "${LSV_V1_UNINST_KEY}" "UninstallString"
        ${EndIf}
        SetRegView default

        ${If} $R0 != ""
          MessageBox MB_YESNO|MB_ICONQUESTION \
            "Ancienne version detectee$\n\
            $\n\
            Une version 0.9.x de LMU Stats Viewer est installee.$\n\
            La nouvelle version la remplace entierement : la garder$\n\
            n'apporte rien et laisse deux entrees dans la liste des$\n\
            programmes.$\n\
            $\n\
            La desinstaller maintenant ?$\n\
            $\n\
            (Vos donnees et resultats de courses ne sont pas touches.$\n\
            Une confirmation Windows peut apparaitre.)" \
            IDNO lsv_keep_v1

          ; UninstallString est deja entre guillemets ; on ajoute les
          ; drapeaux silencieux d'InnoSetup.
          ExecWait '$R0 /VERYSILENT /SUPPRESSMSGBOXES /NORESTART'

          lsv_keep_v1:
        ${EndIf}

      ${EndIf}
    ${EndIf}
  ${EndIf}

  Pop $R0
!macroend

!macro NSIS_HOOK_POSTINSTALL
  Push $R0
  Push $R1

  ; ── Plugin Live Timing ─────────────────────────────────────────────────────
  ; Ne proposer que lors d'une installation interactive (pas lors d'une mise a
  ; jour automatique via le plugin updater Tauri qui passe /UPDATE /P /R).
  ; En mode passif ($PassiveMode=1) ou silencieux, les MessageBox resteraient
  ; visibles meme si les pages sont sautees — on les evite explicitement.
  ${If} $UpdateMode <> 1
    ${If} $PassiveMode <> 1
      ${IfNot} ${Silent}

        ; ── Détection du chemin Steam ──────────────────────────────────────
        ; Essayer HKLM 64-bit → HKLM 32-bit → HKCU (portables / installations custom)
        ReadRegStr $R0 HKLM "SOFTWARE\Wow6432Node\Valve\Steam" "InstallPath"
        ${If} $R0 == ""
          ReadRegStr $R0 HKLM "SOFTWARE\Valve\Steam" "InstallPath"
        ${EndIf}
        ${If} $R0 == ""
          ReadRegStr $R0 HKCU "SOFTWARE\Valve\Steam" "SteamPath"
        ${EndIf}

        ${If} $R0 != ""
          StrCpy $R1 "$R0\steamapps\common\Le Mans Ultimate\Plugins"

          ; Vérifier que le dossier Plugins de LMU existe (LMU est installé)
          ${If} ${FileExists} "$R1\*.*"

            ; Proposer uniquement si le plugin n'est pas déjà présent
            ${IfNot} ${FileExists} "$R1\rFactor2SharedMemoryMapPlugin64.dll"

              MessageBox MB_YESNO|MB_ICONQUESTION \
                "Plugin Live Timing — LMU Stats Viewer$\n\
                $\n\
                Le plugin rFactor2SharedMemoryMapPlugin64.dll n'est pas$\n\
                installe dans votre dossier LMU. Ce plugin est requis$\n\
                pour la fonctionnalite Live Timing.$\n\
                $\n\
                L'installer maintenant dans :$\n\
                $R1$\n\
                $\n\
                (Il pourra etre installe plus tard depuis la page Live)" \
                IDNO lmu_skip_plugin

              CopyFiles /SILENT "$INSTDIR\rFactor2SharedMemoryMapPlugin64.dll" "$R1\"

              ${If} ${FileExists} "$R1\rFactor2SharedMemoryMapPlugin64.dll"
                MessageBox MB_OK|MB_ICONINFORMATION \
                  "Plugin Live Timing installe avec succes !$\n\
                  $\nVous pouvez maintenant utiliser la page Live Timing."
              ${Else}
                MessageBox MB_OK|MB_ICONEXCLAMATION \
                  "Echec de l'installation du plugin.$\n\
                  $\nInstallez-le manuellement depuis la page Live de LMU Stats Viewer."
              ${EndIf}

              lmu_skip_plugin:
            ${EndIf}
          ${EndIf}
        ${EndIf}

      ${EndIf}
    ${EndIf}
  ${EndIf}

  ; ── Nettoyage : supprimer le DLL de $INSTDIR ──────────────────────────────
  ; Le DLL a été copié dans $INSTDIR par le bundler Tauri (ressource).
  ; L'application ne l'utilise pas directement — on le supprime ici pour
  ; ne pas encombrer le dossier d'installation.
  Delete "$INSTDIR\rFactor2SharedMemoryMapPlugin64.dll"

  Pop $R1
  Pop $R0
!macroend
