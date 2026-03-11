Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)

shell.CurrentDirectory = projectDir

' Hidden restart for the agent daemon.
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & projectDir & "\restart-agent.ps1""", 0, False

' Hidden restart for the dashboard server.
shell.Run "powershell.exe -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & projectDir & "\restart-dashboard.ps1""", 0, False

' Give the local server a brief moment to bind the port before opening the browser.
WScript.Sleep 1500
shell.Run "http://127.0.0.1:3080", 1, False
