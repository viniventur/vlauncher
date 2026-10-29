; Os ganchos do instalador do vlauncher (o NSIS que o Tauri gera; ver tauri.conf.json).
;
; Até a 0.1.0, o vlauncher se instalava como "Launcher", em %LOCALAPPDATA%\Launcher. O identificador
; não mudou, e com ele a pasta dos dados (%APPDATA%\br.com.viniciusventura.launcher): os grupos, os
; apps e as fotos servem aos dois. Ao instalar o vlauncher, o "Launcher" sai antes, em silêncio. O
; desinstalador só apaga os dados com a caixa "apagar os dados" marcada, e no modo silencioso ela nem
; aparece.
;
; Este arquivo fica em UTF-8 com BOM, como os que o Tauri gera: sem o BOM, o NSIS leria os acentos
; na página de código do Windows.

!define VLAUNCHER_ANTIGO "Software\Microsoft\Windows\CurrentVersion\Uninstall\Launcher"

!macro NSIS_HOOK_PREINSTALL
  ; Só o nosso: "Launcher" é um nome comum, e o executável registrado diz se é o vlauncher antigo.
  ReadRegStr $R5 HKCU "${VLAUNCHER_ANTIGO}" "MainBinaryName"
  ReadRegStr $R6 HKCU "${VLAUNCHER_ANTIGO}" "InstallLocation"
  ; O caminho vem entre aspas.
  StrCpy $R7 $R6 1
  ${If} $R7 == '"'
    StrCpy $R6 $R6 "" 1
    StrCpy $R6 $R6 -1
  ${EndIf}

  ; O LogicLib junta ${AndIf} e ${OrIf} da esquerda para a direita, sem precedência: daí a marca.
  StrCpy $R8 0
  ${If} $R5 == "vlauncher.exe"
  ${OrIf} $R5 == "app-launcher.exe"
    StrCpy $R8 1
  ${EndIf}
  ${If} $R6 == ""
    StrCpy $R8 0
  ${EndIf}

  ${If} $R8 = 1
    ; Aberto, ele seguraria o executável; fechado à força, deixaria órfãos os apps que estivesse rodando.
    vlauncher_antigo_aberto:
    nsis_tauri_utils::FindProcessCurrentUser "$R5"
    Pop $R7
    ${If} $R7 = 0
      MessageBox MB_RETRYCANCEL|MB_ICONEXCLAMATION "O Launcher (a versão antiga do vlauncher) está aberto.$\n$\nSaia dele pelo ícone da bandeja, em $\"Encerrar os apps e sair$\", e clique em Repetir." /SD IDCANCEL IDRETRY vlauncher_antigo_aberto
      Abort
    ${EndIf}

    ${If} ${FileExists} "$R6\uninstall.exe"
      ; Rodando no lugar (_?=), o desinstalador espera terminar, mas não consegue apagar a si mesmo.
      ExecWait '"$R6\uninstall.exe" /S _?=$R6'
      Delete "$R6\uninstall.exe"
    ${Else}
      DeleteRegKey HKCU "${VLAUNCHER_ANTIGO}"
    ${EndIf}
    ; O executável das primeiras versões, que o desinstalador não conhecia.
    Delete "$R6\app-launcher.exe"
    RMDir "$R6"
    ; Onde o instalador antigo guardava a pasta (o fabricante tinha saído "com", do identificador).
    DeleteRegKey HKCU "Software\com\Launcher"
    DeleteRegKey /ifempty HKCU "Software\com"
  ${EndIf}
!macroend
