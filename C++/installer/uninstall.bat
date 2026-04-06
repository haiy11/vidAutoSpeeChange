@echo off
title 卸载 Native Messaging 主机

:: 获取脚本所在目录
set "script_dir=%~dp0"

:: 定义要删除的文件路径
set "json_file=%script_dir%com.dynamic.speed.json"

:: 定义要删除的注册表路径（Edge 和 Chrome）
set "reg_path_edge=HKEY_CURRENT_USER\SOFTWARE\Microsoft\Edge\NativeMessagingHosts\com.dynamic.speed"
set "reg_path_chrome=HKEY_CURRENT_USER\SOFTWARE\Google\Chrome\NativeMessagingHosts\com.dynamic.speed"

echo ========================================
echo     开始卸载 Native Messaging 主机
echo ========================================
echo.

:: 1. 删除 JSON 文件
if exist "%json_file%" (
    echo 正在删除文件：%json_file%
    del /f /q "%json_file%" >nul 2>&1
    if exist "%json_file%" (
        echo [错误] 文件删除失败，请检查权限或文件是否被占用。
    ) else (
        echo [成功] 文件已删除。
    )
) else (
    echo [跳过] JSON 文件不存在：%json_file%
)

echo.

:: 2. 删除 Edge 注册表项
echo 正在删除 Edge 注册表项...
reg delete "%reg_path_edge%" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [成功] Edge 注册表项已删除。
) else (
    echo [跳过] Edge 注册表项不存在或已被删除。
)

echo.

:: 3. 删除 Chrome 注册表项
echo 正在删除 Chrome 注册表项...
reg delete "%reg_path_chrome%" /f >nul 2>&1
if %errorlevel% equ 0 (
    echo [成功] Chrome 注册表项已删除。
) else (
    echo [跳过] Chrome 注册表项不存在或已被删除。
)

echo.
echo ========================================
echo           卸载完成
echo ========================================
pause