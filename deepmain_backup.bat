@echo off
chcp 65001 >nul
echo ============================================
echo   E-Tax Center - Deep-Main Full Backup
echo   DB: etax-production @ deep-main.hopto.org:20541
echo ============================================
echo.

set /p DEST=กรุณาระบุโฟลเดอร์ปลายทาง (เช่น D:\backup): 

if "%DEST%"=="" (
    echo [ERROR] ไม่ได้ระบุโฟลเดอร์ปลายทาง
    pause
    exit /b 1
)

if not exist "%DEST%" (
    echo สร้างโฟลเดอร์ %DEST% ...
    mkdir "%DEST%"
)

if "%PGPASSWORD%"=="" (
    set /p PGPASSWORD=กรุณาใส่ password ของ etaxusr: 
)
if "%PGPASSWORD%"=="" (
    echo [ERROR] ไม่ได้ใส่ password
    pause
    exit /b 1
)

set TIMESTAMP=%date:~-4%%date:~3,2%%date:~0,2%_%time:~0,2%%time:~3,2%%time:~6,2%
set TIMESTAMP=%TIMESTAMP: =0%
set OUTFILE=%DEST%\deepmain_backup_%TIMESTAMP%.sql

echo.
echo [1/1] กำลัง backup ฐานข้อมูล etax-production ...
echo       Output: %OUTFILE%
echo       กรุณารอสักครู่ (ขนาด DB ~84MB) ...
echo.

pg_dump -h deep-main.hopto.org -p 20541 -U etaxusr -d etax-production --no-owner --no-privileges --clean --if-exists --format=plain -f "%OUTFILE%"

if %ERRORLEVEL% NEQ 0 (
    echo.
    echo [ERROR] backup ไม่สำเร็จ! กรุณาตรวจสอบ:
    echo   1. pg_dump ติดตั้งแล้วหรือไม่ ^(อยู่ใน PostgreSQL bin folder^)
    echo   2. deep-main เปิดอยู่หรือไม่
    echo   3. firewall / internet connection
    set PGPASSWORD=
    pause
    exit /b 1
)

set PGPASSWORD=

echo.
echo ============================================
echo [SUCCESS] Backup เสร็จสมบูรณ์!
echo   ไฟล์: %OUTFILE%
for %%A in ("%OUTFILE%") do echo   ขนาด: %%~zA bytes
echo ============================================
echo.
echo วิธี restore:
echo   psql -h deep-main.hopto.org -p 20541 -U etaxusr -d etax-production -f "%OUTFILE%"
echo.
pause
