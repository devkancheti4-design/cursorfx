# Hides or restores the Windows mouse pointer system-wide.
#
#   cursor-visibility.ps1            replaces every system cursor with a blank one and
#                                    holds it until stdin closes, then restores
#   cursor-visibility.ps1 -Restore   restores the system cursors and exits
#
# Windows has no per-application "hide the pointer everywhere" call, so the system
# cursors are swapped for a transparent one. SystemParametersInfo puts them all back
# from the registry, so a restore is always one call away and a sign-out fixes it too.
param([switch]$Restore, [switch]$Test)
$ErrorActionPreference = 'Stop'

# Every standard cursor, so the pointer stays hidden over text fields, links and busy windows.
$CursorIds = @(32512, 32513, 32514, 32515, 32516, 32642, 32643, 32644, 32645, 32646, 32648, 32649, 32650, 32651)

$signature = @"
using System;
using System.Runtime.InteropServices;
public class CfxCursor {
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr CreateCursor(IntPtr hInst, int xHotspot, int yHotspot, int nWidth, int nHeight, byte[] pvANDPlane, byte[] pvXORPlane);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SetSystemCursor(IntPtr hcur, uint id);
  [DllImport("user32.dll", SetLastError = true)] public static extern IntPtr CopyIcon(IntPtr hIcon);
  [DllImport("user32.dll", SetLastError = true)] public static extern bool SystemParametersInfo(uint uiAction, uint uiParam, IntPtr pvParam, uint fWinIni);
  public const uint SPI_SETCURSORS = 0x0057;
}
"@

function Restore-Cursors {
    # Reloads every system cursor from the registry: the single call that undoes the hide.
    [void][CfxCursor]::SystemParametersInfo([CfxCursor]::SPI_SETCURSORS, 0, [IntPtr]::Zero, 0)
}

function Hide-Cursors {
    param([int[]]$Ids)
    # An AND mask of all ones with an XOR mask of all zeros is a fully transparent cursor.
    $width = 32
    $height = 32
    $bytes = [int](($width * $height) / 8)
    $and = New-Object byte[] $bytes
    $xor = New-Object byte[] $bytes
    for ($i = 0; $i -lt $bytes; $i++) { $and[$i] = 0xFF; $xor[$i] = 0x00 }
    $blank = [CfxCursor]::CreateCursor([IntPtr]::Zero, 0, 0, $width, $height, $and, $xor)
    if ($blank -eq [IntPtr]::Zero) { throw 'CreateCursor failed' }
    foreach ($id in $Ids) {
        # SetSystemCursor takes ownership of the handle, so each slot needs its own copy.
        [void][CfxCursor]::SetSystemCursor([CfxCursor]::CopyIcon($blank), [uint32]$id)
    }
}

if ($Test) { return }

Add-Type -TypeDefinition $signature

if ($Restore) {
    Restore-Cursors
    Write-Output 'restored'
    return
}

try {
    Hide-Cursors -Ids $CursorIds
    Write-Output 'hidden'
    # Block until the parent closes stdin or the process is asked to stop; then restore.
    while ($true) {
        $line = [Console]::In.ReadLine()
        if ($null -eq $line -or $line -eq 'show') { break }
    }
} finally {
    Restore-Cursors
    Write-Output 'restored'
}
