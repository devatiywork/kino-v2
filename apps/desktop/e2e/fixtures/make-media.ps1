# Test media for the E2E tests: tiny clips made by mpv from generated pictures and tones.
# Already committed in e2e/fixtures/media; rerun only to change them:
#   powershell -ExecutionPolicy Bypass -File e2e/fixtures/make-media.ps1 -Mpv C:\path\to\mpv.exe
param([Parameter(Mandatory = $true)][string]$Mpv)

$out = Join-Path $PSScriptRoot 'media'
$series = Join-Path $out 'series'
$films = Join-Path $out 'films'
New-Item -ItemType Directory -Force $series, $films | Out-Null

function Run-Mpv([string]$arguments, [string]$path) {
  $p = Start-Process -FilePath $Mpv -ArgumentList $arguments -Wait -NoNewWindow -PassThru
  if ($p.ExitCode -ne 0 -or -not (Test-Path $path)) { throw "mpv did not write $path (exit $($p.ExitCode))" }
}

function Encode([string]$path, [int]$seconds, [int]$tone) {
  # yuv420p: the usual H.264 profile, the one hardware decoders take
  Run-Mpv ("--no-config --really-quiet av://lavfi:testsrc=size=320x180:rate=24 --vf=format=yuv420p " +
    "--audio-file=av://lavfi:sine=frequency=${tone}:sample_rate=48000 --length=$seconds `"--o=$path`" " +
    "--ovc=libx264 --ovcopts=preset=veryfast,crf=36 --oac=aac --oacopts=b=48k") $path
}

function Dub([string]$path, [int]$seconds) {
  Run-Mpv "--no-config --really-quiet av://lavfi:sine=frequency=880:sample_rate=48000 --length=$seconds `"--o=$path`" --oac=aac --oacopts=b=48k" $path
}

# Subtitles are copied byte for byte from a UTF-8 file: this script stays ASCII, because
# Windows PowerShell 5.1 reads a script without BOM as ANSI and would garble Cyrillic text
$srt = Join-Path $PSScriptRoot 'subtitles.ru.srt'

# A series: season 1 of three episodes and season 2 of one; the first two have an external dub and subtitles
foreach ($name in 'Kino.Test.S01E01', 'Kino.Test.S01E02', 'Kino.Test.S01E03', 'Kino.Test.S02E01') {
  Encode (Join-Path $series "$name.mkv") 12 440
}
foreach ($name in 'Kino.Test.S01E01', 'Kino.Test.S01E02') {
  Dub (Join-Path $series "$name.English.mka") 12
  Copy-Item $srt (Join-Path $series "$name.ru.srt") -Force
}

# A film long enough to be resumed (more than 10 s in, more than 30 s before the end), with
# Russian subtitles in Windows-1251 — old .srt files often are
Encode (Join-Path $films 'Film.2014.mkv') 75 330
$text = [IO.File]::ReadAllText((Join-Path $PSScriptRoot 'subtitles-cp1251.srt'), [Text.Encoding]::UTF8)
[IO.File]::WriteAllBytes((Join-Path $films 'Film.2014.ru.srt'), [Text.Encoding]::GetEncoding(1251).GetBytes($text))

Get-ChildItem $out -Recurse -File | ForEach-Object { '{0,8:N0} KB  {1}' -f ($_.Length / 1KB), $_.FullName.Substring($out.Length + 1) }
