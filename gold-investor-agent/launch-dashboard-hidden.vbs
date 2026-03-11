Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetParentFolderName(WScript.ScriptFullName)
shell.CurrentDirectory = projectDir
shell.Run "cmd.exe /c """ & projectDir & "\run-dashboard-server.cmd""", 0, False
