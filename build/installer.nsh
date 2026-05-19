!include /NONFATAL "installer-api-url.generated.nsh"

!ifndef ACTION_DESK_INSTALLER_API_URL
  !error "ACTION_DESK_INSTALLER_API_URL is required. Run npm run package:win so scripts/write-installer-api-url.cjs can generate installer-api-url.generated.nsh."
!endif

!ifndef ACTION_DESK_INSTALLER_AZURE_CLIENT_ID
  !error "ACTION_DESK_INSTALLER_AZURE_CLIENT_ID is required. Set ACTION_DESK_INSTALLER_AZURE_CLIENT_ID before running npm run package:win."
!endif

!ifndef ACTION_DESK_INSTALLER_AZURE_TENANT_ID
  !error "ACTION_DESK_INSTALLER_AZURE_TENANT_ID is required. Set ACTION_DESK_INSTALLER_AZURE_TENANT_ID before running npm run package:win."
!endif

!macro customInstall
  SetShellVarContext current

  CreateDirectory "$APPDATA\action-desk-app"
  IfFileExists "$APPDATA\action-desk-app\config.json" actionDeskRuntimeConfigExists 0

  DetailPrint "Creating Action Desk runtime config at $APPDATA\action-desk-app\config.json"
  FileOpen $0 "$APPDATA\action-desk-app\config.json" w
  FileWrite $0 "{$\r$\n"
  FileWrite $0 "  $\"ACTION_DESK_API_URL$\": $\"${ACTION_DESK_INSTALLER_API_URL}$\",$\r$\n"
  FileWrite $0 "  $\"VITE_AZURE_CLIENT_ID$\": $\"${ACTION_DESK_INSTALLER_AZURE_CLIENT_ID}$\",$\r$\n"
  FileWrite $0 "  $\"VITE_AZURE_TENANT_ID$\": $\"${ACTION_DESK_INSTALLER_AZURE_TENANT_ID}$\"$\r$\n"
  FileWrite $0 "}$\r$\n"
  FileClose $0
  Goto actionDeskRuntimeConfigDone

  actionDeskRuntimeConfigExists:
    DetailPrint "Action Desk runtime config already exists; preserving $APPDATA\action-desk-app\config.json"

  actionDeskRuntimeConfigDone:
    ${if} $installMode == "all"
      SetShellVarContext all
    ${endif}
!macroend
