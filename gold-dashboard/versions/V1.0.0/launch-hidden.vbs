Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")
projectDir = fso.GetAbsolutePathName(fso.BuildPath(fso.GetParentFolderName(WScript.ScriptFullName), "..\..\"))
shell.CurrentDirectory = projectDir
shell.Run "cmd.exe /c cd /d """ & projectDir & """ && node server.mjs", 0, False
