@echo off
setlocal EnableExtensions EnableDelayedExpansion

set IMAGE=5e2014
set CONTAINER=5e2014
set PORT=8214
set IMAGE_REF=ghcr.io/5etools-mirror-3/5etools-img:latest
set LOCAL_URL=http://localhost:%PORT%
set IMG_REPO_DIR=%~dp0img

:: File di stato di commit
set LAST_COMMIT_FILE=.last_commit_%IMAGE%
set CURRENT_COMMIT_FILE=.current_commit_%IMAGE%
set LAST_COMMIT_FILE_IMG=.last_commit_%IMAGE%_img
set CURRENT_COMMIT_FILE_IMG=.current_commit_%IMAGE%_img

call :CheckAndPullImgRepo
call :GetGitState
call :ContainerExists

if "%CONTAINER_EXISTS%"=="0" (
	echo [INFO] Container "%CONTAINER%" non trovato. Creo una nuova istanza...
	goto :RecreateAll
)

if "%HAS_CHANGES%"=="0" if "%HAS_CHANGES_IMG%"=="0" (
	echo [INFO] Nessuna modifica Git rilevata. Riavvio solo il container esistente...
	docker start %CONTAINER% >nul 2>&1
	echo [OK] Web server disponibile su %LOCAL_URL%
	goto :End
)

echo [INFO] Modifiche Git rilevate. Eseguo cleanup completo e ricreo da zero...

:RecreateAll
echo [INFO] Installo dipendenze npm...
call npm i
if errorlevel 1 (
	echo [ERRORE] npm i fallito.
	goto :End
)

echo [INFO] Eseguo build di produzione service worker...
call npm run build:sw:prod
if errorlevel 1 (
	echo [ERRORE] npm run build:sw:prod fallito.
	goto :End
)

echo [INFO] Eseguo build SEO...
call npm run build:seo
if errorlevel 1 (
	echo [ERRORE] npm run build:seo fallito.
	goto :End
)

echo [INFO] Pulizia output SEO dal working tree...
git restore --worktree --staged -- sitemap.xml bestiary items spells >nul 2>&1
git clean -fd -- bestiary items spells >nul 2>&1

docker compose -p %CONTAINER% down -v --remove-orphans >nul 2>&1
docker rm -f %CONTAINER% >nul 2>&1
docker image rm -f %IMAGE% >nul 2>&1

docker compose -p %CONTAINER% up -d
if errorlevel 1 (
	echo [ERRORE] docker compose up -d fallito.
	goto :End
)

echo %CURRENT_COMMIT% > %LAST_COMMIT_FILE%
if defined CURRENT_COMMIT_IMG echo %CURRENT_COMMIT_IMG% > %LAST_COMMIT_FILE_IMG%
echo [OK] Ambiente ricreato correttamente.
echo [OK] Web server disponibile su %LOCAL_URL%
goto :End

:CheckAndPullImgRepo
set HAS_CHANGES_IMG=0
set CURRENT_COMMIT_IMG=

if not exist "%IMG_REPO_DIR%\.git" (
	echo [INFO] Repository img non trovato in "%IMG_REPO_DIR%". Salto check/pull img.
	exit /b 0
)

for /f "delims=" %%i in ('git -C "%IMG_REPO_DIR%" rev-parse HEAD 2^>nul') do set CURRENT_COMMIT_IMG=%%i
if not defined CURRENT_COMMIT_IMG (
	echo [WARN] Impossibile leggere lo stato Git in "%IMG_REPO_DIR%". Forzo ricreazione.
	set HAS_CHANGES_IMG=1
	exit /b 0
)

git -C "%IMG_REPO_DIR%" status --porcelain > %CURRENT_COMMIT_FILE_IMG%
for %%A in (%CURRENT_COMMIT_FILE_IMG%) do set GIT_STATUS_SIZE_IMG=%%~zA
if not defined GIT_STATUS_SIZE_IMG set GIT_STATUS_SIZE_IMG=1

if not "%GIT_STATUS_SIZE_IMG%"=="0" (
	echo [WARN] Repository img con modifiche locali. Salto pull e forzo ricreazione.
	set HAS_CHANGES_IMG=1
	exit /b 0
)

echo [INFO] Eseguo git pull nella cartella img...
git -C "%IMG_REPO_DIR%" pull --ff-only
if errorlevel 1 (
	echo [WARN] git pull nella cartella img fallito. Forzo ricreazione.
	set HAS_CHANGES_IMG=1
	exit /b 0
)

for /f "delims=" %%i in ('git -C "%IMG_REPO_DIR%" rev-parse HEAD 2^>nul') do set CURRENT_COMMIT_IMG=%%i

if not exist %LAST_COMMIT_FILE_IMG% (
	set HAS_CHANGES_IMG=1
	exit /b 0
)

set /p LAST_COMMIT_IMG=<%LAST_COMMIT_FILE_IMG%
if /I "%LAST_COMMIT_IMG%"=="%CURRENT_COMMIT_IMG%" (
	set HAS_CHANGES_IMG=0
) else (
	set HAS_CHANGES_IMG=1
)
exit /b 0

:GetGitState
set HAS_CHANGES=1
set CURRENT_COMMIT=

for /f "delims=" %%i in ('git rev-parse HEAD 2^>nul') do set CURRENT_COMMIT=%%i
if not defined CURRENT_COMMIT (
	echo [WARN] Git non disponibile o repository non valido. Forzo ricreazione.
	exit /b 0
)

git status --porcelain > %CURRENT_COMMIT_FILE%
for %%A in (%CURRENT_COMMIT_FILE%) do set GIT_STATUS_SIZE=%%~zA
if not defined GIT_STATUS_SIZE set GIT_STATUS_SIZE=1

if not "%GIT_STATUS_SIZE%"=="0" (
	set HAS_CHANGES=1
	exit /b 0
)

if not exist %LAST_COMMIT_FILE% (
	set HAS_CHANGES=1
	exit /b 0
)

set /p LAST_COMMIT=<%LAST_COMMIT_FILE%
if /I "%LAST_COMMIT%"=="%CURRENT_COMMIT%" (
	set HAS_CHANGES=0
) else (
	set HAS_CHANGES=1
)
exit /b 0

:ContainerExists
set CONTAINER_EXISTS=0
docker ps -a --format "{{.Names}}" | findstr /I /X "%CONTAINER%" >nul
if not errorlevel 1 set CONTAINER_EXISTS=1
exit /b 0

:End
endlocal
