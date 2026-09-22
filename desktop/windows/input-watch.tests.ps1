# Logic checks for Get-CfxEvents. Runs anywhere PowerShell runs, Windows not required.
. "$PSScriptRoot/input-watch.ps1" -Test

$cases = @(
    @{ n = 'idle: nothing changed';        a = @{ Down=$false; LastDown=$false; Tick=100; LastTick=100; X=5; Y=5; LastX=5; LastY=5 }; want = @() }
    @{ n = 'pointer moved';                a = @{ Down=$false; LastDown=$false; Tick=101; LastTick=100; X=9; Y=5; LastX=5; LastY=5 }; want = @() }
    @{ n = 'button pressed, no move';      a = @{ Down=$true;  LastDown=$false; Tick=101; LastTick=100; X=5; Y=5; LastX=5; LastY=5 }; want = @('B1') }
    @{ n = 'button released, no move';     a = @{ Down=$false; LastDown=$true;  Tick=102; LastTick=101; X=5; Y=5; LastX=5; LastY=5 }; want = @('B0') }
    @{ n = 'keystroke';                    a = @{ Down=$false; LastDown=$false; Tick=103; LastTick=102; X=5; Y=5; LastX=5; LastY=5 }; want = @('K') }
    @{ n = 'drag: held and moving';        a = @{ Down=$true;  LastDown=$true;  Tick=104; LastTick=103; X=7; Y=8; LastX=5; LastY=5 }; want = @() }
    @{ n = 'typing while button held';     a = @{ Down=$true;  LastDown=$true;  Tick=105; LastTick=104; X=5; Y=5; LastX=5; LastY=5 }; want = @('K') }
    @{ n = 'first tick, unknown position'; a = @{ Down=$false; LastDown=$false; Tick=1;   LastTick=0;   X=5; Y=5; LastX=-1; LastY=-1 }; want = @() }
)

$failed = 0
foreach ($c in $cases) {
    $got = @(Get-CfxEvents -Down $c.a.Down -LastDown $c.a.LastDown -Tick $c.a.Tick -LastTick $c.a.LastTick -X $c.a.X -Y $c.a.Y -LastX $c.a.LastX -LastY $c.a.LastY)
    $gotS = ($got -join ',')
    $wantS = ($c.want -join ',')
    if ($gotS -eq $wantS) {
        Write-Output ("  pass  {0,-28} -> [{1}]" -f $c.n, $gotS)
    } else {
        Write-Output ("  FAIL  {0,-28} -> got [{1}], want [{2}]" -f $c.n, $gotS, $wantS)
        $failed++
    }
}
Write-Output ''
if ($failed) { Write-Output "$failed test(s) failed"; exit 1 } else { Write-Output "all $($cases.Count) tests passed"; exit 0 }
