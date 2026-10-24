; Kino's own steps of the installer (tauri runs these macros around its own).
; The file associations and the magnet: link come from tauri.conf.json; here libmpv goes next to
; the program and Kino is listed in Windows' «Приложения по умолчанию», so the user can make it
; the program for them there. Its name there is «Kino v2», the key KinoV2: Kino v1 is installed
; next to it as «Kino».

; Fixed here, where __FILEDIR__ is this folder (inside a macro it is the generated script's)
!define KINO_LIBMPV "${__FILEDIR__}\..\..\..\..\vendor\libmpv\libmpv-2.dll"

!macro KINO_CAPABILITY EXT PROGID
  WriteRegStr SHCTX "Software\KinoV2\Capabilities\FileAssociations" "${EXT}" "${PROGID}"
!macroend

!macro NSIS_HOOK_POSTINSTALL
  ; Not a bundle resource: tauri would copy it into target\debug on every build, over the one a
  ; running debug Kino holds (build.rs puts it there)
  SetOutPath "$INSTDIR"
  File "${KINO_LIBMPV}"
  WriteRegStr SHCTX "Software\KinoV2\Capabilities" "ApplicationName" "Kino v2"
  WriteRegStr SHCTX "Software\KinoV2\Capabilities" "ApplicationDescription" "Видеоплеер и торрент-клиент"
  WriteRegStr SHCTX "Software\KinoV2\Capabilities" "ApplicationIcon" "$INSTDIR\${MAINBINARYNAME}.exe,0"
  !insertmacro KINO_CAPABILITY ".mkv" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".mp4" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".avi" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".mov" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".wmv" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".webm" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".m4v" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".ts" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".m2ts" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".mts" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".flv" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".mpg" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".mpeg" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".vob" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".3gp" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".ogv" "Kino.Video"
  !insertmacro KINO_CAPABILITY ".torrent" "Kino.Torrent"
  WriteRegStr SHCTX "Software\KinoV2\Capabilities\URLAssociations" "magnet" "magnet"
  WriteRegStr SHCTX "Software\RegisteredApplications" "KinoV2" "Software\KinoV2\Capabilities"
!macroend

!macro NSIS_HOOK_PREUNINSTALL
  Delete "$INSTDIR\libmpv-2.dll"
!macroend

!macro NSIS_HOOK_POSTUNINSTALL
  DeleteRegValue SHCTX "Software\RegisteredApplications" "KinoV2"
  DeleteRegKey SHCTX "Software\KinoV2"
!macroend
