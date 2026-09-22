# Reports global mouse-button and keyboard activity to stdout, one short line per event.
#   B1 / B0  left mouse button pressed / released
#   K        a keystroke happened
# Electron polls the pointer position itself, so this covers only what it cannot see.
#
# Keyboard activity is inferred rather than hooked, which needs no special privileges:
# Windows reports the time of the last input of any kind, so if that time advanced while
# the pointer stood still and no button changed, the input must have been the keyboard.
$ErrorActionPreference = 'Stop'

function Get-CfxEvents {
    param(
        [bool]$Down, [bool]$LastDown,
        [uint32]$Tick, [uint32]$LastTick,
        [int]$X, [int]$Y, [int]$LastX, [int]$LastY
    )
    $events = @()
    $buttonChanged = $Down -ne $LastDown
    if ($buttonChanged) {
        if ($Down) { $events += 'B1' } else { $events += 'B0' }
    }
    $moved = ($X -ne $LastX) -or ($Y -ne $LastY)
    # A click also advances the input clock without moving the pointer, so it must be
    # excluded here or every click would read as typing.
    if (($Tick -ne $LastTick) -and (-not $moved) -and (-not $buttonChanged)) {
        $events += 'K'
    }
    return $events
}

# Sourcing the file with -Test runs the logic checks and exits without watching anything.
if ($args -contains '-Test') { return }

Add-Type @"
using System;
using System.Runtime.InteropServices;
public class CfxInput {
  [DllImport("user32.dll")] public static extern short GetAsyncKeyState(int vKey);
  [DllImport("user32.dll")] public static extern bool GetCursorPos(out POINT p);
  [DllImport("user32.dll")] public static extern bool GetLastInputInfo(ref LASTINPUTINFO i);
  [StructLayout(LayoutKind.Sequential)] public struct POINT { public int X; public int Y; }
  [StructLayout(LayoutKind.Sequential)] public struct LASTINPUTINFO { public uint cbSize; public uint dwTime; }
}
"@

$lii = New-Object CfxInput+LASTINPUTINFO
$lii.cbSize = [uint32][System.Runtime.InteropServices.Marshal]::SizeOf($lii)
$lastDown = $false
$lastTick = [uint32]0
$lastX = -1
$lastY = -1

while ($true) {
    $down = ([CfxInput]::GetAsyncKeyState(0x01) -band 0x8000) -ne 0
    $p = New-Object CfxInput+POINT
    [void][CfxInput]::GetCursorPos([ref]$p)
    [void][CfxInput]::GetLastInputInfo([ref]$lii)

    foreach ($e in (Get-CfxEvents -Down $down -LastDown $lastDown -Tick $lii.dwTime -LastTick $lastTick -X $p.X -Y $p.Y -LastX $lastX -LastY $lastY)) {
        Write-Output $e
    }

    $lastDown = $down
    $lastTick = $lii.dwTime
    $lastX = $p.X
    $lastY = $p.Y
    Start-Sleep -Milliseconds 16
}
