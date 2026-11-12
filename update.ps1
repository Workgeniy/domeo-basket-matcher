# Обновление расширения «DOMEO · Подбор по корзине».
# Скачивает свежую версию из публичного репозитория и заменяет файлы расширения.
$ErrorActionPreference = "Stop"
[Console]::OutputEncoding = [Text.Encoding]::UTF8

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$ext  = Join-Path $root "extension"
$url  = "https://github.com/Workgeniy/domeo-basket-matcher/archive/refs/heads/main.zip"
$tmp  = Join-Path $env:TEMP ("domeo-upd-" + [guid]::NewGuid().ToString("N"))
$zip  = Join-Path $tmp "main.zip"

New-Item -ItemType Directory -Force -Path $tmp | Out-Null
Write-Host "Скачиваю свежую версию..."
Invoke-WebRequest -Uri $url -OutFile $zip -UseBasicParsing

Write-Host "Распаковываю..."
Expand-Archive -Path $zip -DestinationPath $tmp -Force
$src = Join-Path $tmp "domeo-basket-matcher-main\extension"
if (-not (Test-Path $src)) { throw "В архиве не найдена папка extension" }

New-Item -ItemType Directory -Force -Path $ext | Out-Null
Copy-Item -Path (Join-Path $src "*") -Destination $ext -Recurse -Force
Remove-Item -Recurse -Force $tmp

Write-Host ""
Write-Host "Готово — файлы расширения обновлены."
Write-Host "Теперь откройте browser://extensions (или chrome://extensions)"
Write-Host "и нажмите кнопку 'Обновить' на карточке расширения DOMEO."
