# Downloads libmpv (shinchiro/mpv-winbuild-cmake, x86_64) into vendor/libmpv
# and generates the MSVC import library mpv.lib from libmpv-2.dll exports.
# Needs 7-Zip and Visual Studio Build Tools (C++).
#   powershell -ExecutionPolicy Bypass -File scripts/fetch-libmpv.ps1 [-Tag 20261021]
param([string]$Tag = 'latest')
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$vendor = Join-Path $root 'vendor\libmpv'
$tmp = Join-Path ([IO.Path]::GetTempPath()) ('kino-libmpv-' + [Guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Force $vendor, $tmp | Out-Null

$api = if ($Tag -eq 'latest') { 'https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/latest' }
       else { "https://api.github.com/repos/shinchiro/mpv-winbuild-cmake/releases/tags/$Tag" }
$release = Invoke-RestMethod $api
$asset = $release.assets | Where-Object { $_.name -match '^mpv-dev-x86_64-\d{8}-git-[0-9a-f]+\.7z$' } | Select-Object -First 1
if (-not $asset) { throw "mpv-dev-x86_64 not found in release $($release.tag_name)" }
Write-Host "libmpv: $($asset.name) ($([math]::Round($asset.size / 1MB)) MB)"
$archive = Join-Path $tmp $asset.name
Invoke-WebRequest $asset.browser_download_url -OutFile $archive

$7z = @("$env:ProgramFiles\7-Zip\7z.exe", "${env:ProgramFiles(x86)}\7-Zip\7z.exe") | Where-Object { Test-Path $_ } | Select-Object -First 1
if (-not $7z) { throw '7-Zip not found' }
& $7z x -y "-o$tmp\x" $archive | Out-Null

$vswhere = "${env:ProgramFiles(x86)}\Microsoft Visual Studio\Installer\vswhere.exe"
$vs = & $vswhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath
$vcvars = Join-Path $vs 'VC\Auxiliary\Build\vcvars64.bat'

# Import library from the mpv_* exports only (the dll also exports symbols of bundled libraries)
$exports = cmd /c "`"$vcvars`" >nul 2>nul && dumpbin /nologo /exports `"$tmp\x\libmpv-2.dll`""
$names = $exports | ForEach-Object { if ($_ -match '^\s+\d+\s+[0-9A-F]+\s+[0-9A-F]+\s+(mpv_\w+)') { $Matches[1] } }
if (-not $names) { throw 'no mpv_* exports found' }
Set-Content -Encoding ascii "$tmp\x\mpv.def" (@('LIBRARY libmpv-2', 'EXPORTS') + ($names | ForEach-Object { "    $_" }))
cmd /c "`"$vcvars`" >nul 2>nul && lib /nologo /def:`"$tmp\x\mpv.def`" /out:`"$tmp\x\mpv.lib`" /machine:x64" | Out-Null

Copy-Item "$tmp\x\libmpv-2.dll", "$tmp\x\mpv.lib", "$tmp\x\mpv.def" $vendor -Force
Copy-Item "$tmp\x\include" $vendor -Recurse -Force
Set-Content -Encoding utf8 (Join-Path $vendor 'VERSION') $asset.name
Remove-Item -Recurse -Force $tmp
Write-Host "Done: $vendor ($($names.Count) mpv_* exports)"
