# src/main/observe-windows.ps1
# Windows foreground window and microphone state observer for Real Sticky Note
# Emits compressed JSON lines to stdout every ~250ms

$ErrorActionPreference = 'SilentlyContinue'
$WarningPreference = 'SilentlyContinue'
$VerbosePreference = 'SilentlyContinue'
$DebugPreference = 'SilentlyContinue'
$InformationPreference = 'SilentlyContinue'

try {
    [System.Console]::OutputEncoding = [System.Text.Encoding]::UTF8
} catch {}

try {
if (-not ([System.Management.Automation.PSTypeName]'Win32Observer').Type) {
    Add-Type -TypeDefinition @'
using System;
using System.Runtime.InteropServices;
using System.Collections.Concurrent;
using System.Threading;

public static class Win32Observer {
    public static readonly ConcurrentQueue<string> Commands = new ConcurrentQueue<string>();
    public static void StartCommands() {
        var thread = new Thread(() => { string line; while ((line = Console.In.ReadLine()) != null) Commands.Enqueue(line); });
        thread.IsBackground = true;
        thread.Start();
    }
    [DllImport("user32.dll", SetLastError = true)]
    public static extern bool SetWindowPos(IntPtr hwnd, IntPtr insertAfter, int x, int y, int width, int height, uint flags);
    [StructLayout(LayoutKind.Sequential)]
    public struct RECT {
        public int Left;
        public int Top;
        public int Right;
        public int Bottom;
    }

    [DllImport("user32.dll")]
    public static extern bool SetProcessDPIAware();

    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll", SetLastError = true)]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint lpdwProcessId);

    [DllImport("user32.dll", SetLastError = true)]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool GetWindowRect(IntPtr hWnd, out RECT lpRect);

    [DllImport("user32.dll")]
    public static extern short GetAsyncKeyState(int vKey);
}
'@ -ErrorAction Stop
}
} catch {
    [System.Console]::Error.WriteLine('Windows foreground observer could not initialize: ' + $_.Exception.Message)
    exit 1
}

try {
    [Win32Observer]::SetProcessDPIAware() | Out-Null
    [Win32Observer]::StartCommands()
} catch {}

function Test-MicrophoneInUse {
    try {
        $baseKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey("Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone")
        if ($null -eq $baseKey) { return $false }

        $subNames = $baseKey.GetSubKeyNames()
        if ($null -eq $subNames) {
            $baseKey.Close()
            return $false
        }

        foreach ($sub in $subNames) {
            if ($sub -eq 'NonPackaged') {
                $npKey = $baseKey.OpenSubKey('NonPackaged')
                if ($null -ne $npKey) {
                    $npSubs = $npKey.GetSubKeyNames()
                    if ($null -ne $npSubs) {
                        foreach ($npSub in $npSubs) {
                            $appKey = $npKey.OpenSubKey($npSub)
                            if ($null -ne $appKey) {
                                $startVal = $appKey.GetValue('LastUsedTimeStart', 0)
                                $stopVal = $appKey.GetValue('LastUsedTimeStop', 0)
                                $appKey.Close()
                                [int64]$start = 0
                                [int64]$stop = 0
                                [int64]::TryParse([string]$startVal, [ref]$start) | Out-Null
                                [int64]::TryParse([string]$stopVal, [ref]$stop) | Out-Null
                                if ($start -gt 0 -and $stop -eq 0) {
                                    $npKey.Close()
                                    $baseKey.Close()
                                    return $true
                                }
                            }
                        }
                    }
                    $npKey.Close()
                }
            } else {
                $appKey = $baseKey.OpenSubKey($sub)
                if ($null -ne $appKey) {
                    $startVal = $appKey.GetValue('LastUsedTimeStart', 0)
                    $stopVal = $appKey.GetValue('LastUsedTimeStop', 0)
                    $appKey.Close()
                    [int64]$start = 0
                    [int64]$stop = 0
                    [int64]::TryParse([string]$startVal, [ref]$start) | Out-Null
                    [int64]::TryParse([string]$stopVal, [ref]$stop) | Out-Null
                    if ($start -gt 0 -and $stop -eq 0) {
                        $baseKey.Close()
                        return $true
                    }
                }
            }
        }
        $baseKey.Close()
    } catch {
        return $false
    }
    return $false
}

$clock = [System.Diagnostics.Stopwatch]::StartNew()
$lastMicCheck = -2000
$lastWindowCheck = -250
$micActive = $false
$previousAlt = $false
$previousJson = ""
$pidNum = 0; $procName = ""; $winTitle = ""; $x = 0; $y = 0; $w = 0; $h = 0

while ($true) {
    try {
        $emit = $false
        $now = $clock.ElapsedMilliseconds
        [string]$commandLine = ""
        while ([Win32Observer]::Commands.TryDequeue([ref]$commandLine)) {
            try {
                $command = $commandLine | ConvertFrom-Json
                if ($command.type -eq "lower" -and [string]$command.handle -match "^[0-9]{1,19}$") {
                    $handleValue = [long]::Parse([string]$command.handle)
                    if ($handleValue -gt 0) { [Win32Observer]::SetWindowPos([IntPtr]$handleValue, [IntPtr]1, 0, 0, 0, 0, 0x13) | Out-Null }
                }
            } catch {}
        }
        if ($lastMicCheck -eq 0 -or [Math]::Abs($now - $lastMicCheck) -ge 2000) {
            $micActive = Test-MicrophoneInUse
            $lastMicCheck = $now
            $emit = $true
        }

        if ($now - $lastWindowCheck -ge 200) {
        $lastWindowCheck = $now
        $emit = $true
        $hwnd = [Win32Observer]::GetForegroundWindow()
        $pidNum = 0
        $procName = ""
        $winTitle = ""
        $x = 0
        $y = 0
        $w = 0
        $h = 0

        if ($hwnd -ne [IntPtr]::Zero) {
            [uint32]$rawPid = 0
            [Win32Observer]::GetWindowThreadProcessId($hwnd, [ref]$rawPid) | Out-Null
            $pidNum = [int]$rawPid

            if ($pidNum -gt 0) {
                try {
                    $proc = [System.Diagnostics.Process]::GetProcessById($pidNum)
                    $procName = $proc.ProcessName
                    $winTitle = $proc.MainWindowTitle
                } catch {
                    $procName = ""
                    $winTitle = ""
                }
            }

            if ($null -ne $procName -and $procName.EndsWith(".exe", [System.StringComparison]::OrdinalIgnoreCase)) {
                $procName = $procName.Substring(0, $procName.Length - 4)
            }

            $rect = New-Object Win32Observer+RECT
            if ([Win32Observer]::GetWindowRect($hwnd, [ref]$rect)) {
                $x = $rect.Left
                $y = $rect.Top
                $w = [Math]::Max(0, $rect.Right - $rect.Left)
                $h = [Math]::Max(0, $rect.Bottom - $rect.Top)
            }
        }

        if ($null -eq $procName) { $procName = "" }
        if ($null -eq $winTitle) { $winTitle = "" }

        }
        # Alt is sampled every 25ms; expensive foreground and microphone work is cached.
        $altState = [Win32Observer]::GetAsyncKeyState(0x12)
        $isAlt = (($altState -band 0x8000) -ne 0)
        if ($isAlt -ne $previousAlt) { $emit = $true; $previousAlt = $isAlt }
        if (-not $emit) { [System.Threading.Thread]::Sleep(25); continue }

        $payload = [PSCustomObject]@{
            pid        = [int]$pidNum
            name       = [string]$procName
            title      = [string]$winTitle
            x          = [int]$x
            y          = [int]$y
            width      = [int]$w
            height     = [int]$h
            alt        = [bool]$isAlt
            microphone = [bool]$micActive
        }

        $json = $payload | ConvertTo-Json -Compress
        if ($json -ne $previousJson) { [System.Console]::Out.WriteLine($json); $previousJson = $json }
    } catch {}

    [System.Threading.Thread]::Sleep(25)
}
