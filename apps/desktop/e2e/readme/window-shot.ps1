# One of Kino's windows as it draws itself, the video included, even when the tests' windows
# are cloaked or under others (PrintWindow, full content). Never a piece of the screen: that
# would catch whatever else is open there.
#   window-shot.ps1 "<exact title>" big|small out.png   — the biggest or smallest window of that title
param([string]$Title, [string]$Which, [string]$Out)
Add-Type -AssemblyName System.Drawing
Add-Type @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;
using System.Text;
public static class KinoWindows {
  [StructLayout(LayoutKind.Sequential)] public struct RECT { public int L, T, R, B; }
  public delegate bool EnumProc(IntPtr h, IntPtr l);
  [DllImport("user32.dll")] public static extern bool SetProcessDPIAware();
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc f, IntPtr l);
  [DllImport("user32.dll")] public static extern bool IsWindowVisible(IntPtr h);
  [DllImport("user32.dll", CharSet=CharSet.Unicode)] public static extern int GetWindowText(IntPtr h, StringBuilder s, int n);
  [DllImport("user32.dll")] public static extern bool GetWindowRect(IntPtr h, out RECT r);
  [DllImport("user32.dll")] public static extern bool PrintWindow(IntPtr h, IntPtr hdc, uint flags);
  public static List<IntPtr> Find(string title) {
    var found = new List<IntPtr>();
    EnumWindows((h, l) => { var sb = new StringBuilder(256); GetWindowText(h, sb, 256); if (IsWindowVisible(h) && sb.ToString() == title) found.Add(h); return true; }, IntPtr.Zero);
    return found;
  }
}
'@
[void][KinoWindows]::SetProcessDPIAware()
$windows = [KinoWindows]::Find($Title) | ForEach-Object {
  $r = New-Object KinoWindows+RECT
  [void][KinoWindows]::GetWindowRect($_, [ref]$r)
  [pscustomobject]@{ Handle = $_; Width = $r.R - $r.L; Height = $r.B - $r.T }
} | Sort-Object { $_.Width * $_.Height }
if (-not $windows) { throw "no window '$Title'" }
$w = if ($Which -eq 'small') { @($windows)[0] } else { @($windows)[-1] }
$bmp = New-Object System.Drawing.Bitmap $w.Width, $w.Height
$g = [System.Drawing.Graphics]::FromImage($bmp)
$hdc = $g.GetHdc()
# 2: PW_RENDERFULLCONTENT — DirectX content too (the video, WebView2)
[void][KinoWindows]::PrintWindow($w.Handle, $hdc, 2)
$g.ReleaseHdc($hdc)
$bmp.Save($Out, [System.Drawing.Imaging.ImageFormat]::Png)
$g.Dispose()
$bmp.Dispose()
