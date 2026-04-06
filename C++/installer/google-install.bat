@echo off
setlocal enabledelayedexpansion

:: 获取脚本所在目录（以反斜杠结尾）
set "script_dir=%~dp0"

:: 定义文件路径
set "json_file=%script_dir%com.dynamic.speed.json"
set "exe_file=%script_dir%vidAutoSpeeChange.exe"

:: 检查 vidAutoSpeeChange.exe 是否存在
if not exist "%exe_file%" (
    echo 错误：在 %script_dir% 中未找到 vidAutoSpeeChange.exe
    pause
    exit /b 1
)

:: 将路径中的单反斜杠替换为双反斜杠（用于 JSON 转义）
set "exe_path_escaped=%exe_file:\=\\%"

:: 生成 JSON 文件（注意双引号前需加 ^ 进行转义）
(
echo {
echo   ^"name^": ^"com.dynamic.speed^",
echo   ^"description^": ^"dynamic speed-variable video comparison core^",
echo   ^"path^": ^"%exe_path_escaped%^",
echo   ^"type^": ^"stdio^",
echo   ^"allowed_origins^": [^"chrome-extension://hdemokncfcljaocjbhbambhfeplbicdj/^"]
echo }
) > "%json_file%"

echo JSON 文件已创建：%json_file%

:: 添加注册表项（当前用户，无需管理员权限）
reg add "HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.dynamic.speed" /ve /t REG_SZ /d "%json_file%" /f >nul

if %errorlevel% equ 0 (
    echo 注册表项添加成功
) else (
    echo 注册表项添加失败，请检查权限或路径
)

pause