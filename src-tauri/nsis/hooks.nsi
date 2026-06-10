; ─────────────────────────────────────────────────────────────────────────────
; hooks.nsi — LMU Stats Viewer custom NSIS hooks
;
; Après l'installation de l'application, propose d'installer le plugin
; rF2 Shared Memory Map (requis pour la page Live Timing).
;
; Le DLL rFactor2SharedMemoryMapPlugin64.dll est bundlé en tant que ressource
; Tauri et se trouve dans $INSTDIR lors de l'exécution du hook.
; Il est supprimé de $INSTDIR à la fin du hook (inutile pour l'appli elle-même).
; ─────────────────────────────────────────────────────────────────────────────

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
