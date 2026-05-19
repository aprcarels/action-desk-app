!include /NONFATAL "installer-api-url.generated.nsh"

!ifndef ACTION_DESK_DEFAULT_API_URL
  !define ACTION_DESK_DEFAULT_API_URL "http://localhost:3960"
!endif

!macro customInstall
  ${if} $installMode == "all"
    SetShellVarContext current
  ${endif}

  CreateDirectory "$APPDATA\${PRODUCT_FILENAME}"
  IfFileExists "$APPDATA\${PRODUCT_FILENAME}\config.json" actionDeskRuntimeConfigExists 0

  DetailPrint "Creating Action Desk runtime config at $APPDATA\${PRODUCT_FILENAME}\config.json"
  FileOpen $0 "$APPDATA\${PRODUCT_FILENAME}\config.json" w
  FileWrite $0 "{$\r$\n"
  FileWrite $0 "  $\"ACTION_DESK_API_URL$\": $\"${ACTION_DESK_DEFAULT_API_URL}$\"$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileClose $0
  Goto actionDeskRuntimeConfigDone

  actionDeskRuntimeConfigExists:
    DetailPrint "Action Desk runtime config already exists; preserving $APPDATA\${PRODUCT_FILENAME}\config.json"

  actionDeskRuntimeConfigDone:
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
!macroend
