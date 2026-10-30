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

public static class Win32Observer {
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

$lastMicCheck = 0
$micActive = $false

while ($true) {
    try {
        $now = [Environment]::TickCount
        if ($lastMicCheck -eq 0 -or [Math]::Abs($now - $lastMicCheck) -ge 2000) {
            $micActive = Test-MicrophoneInUse
            $lastMicCheck = $now
        }

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

        # Alt key state (VK_MENU = 0x12)
        $altState = [Win32Observer]::GetAsyncKeyState(0x12)
        $isAlt = (($altState -band 0x8000) -ne 0)

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
        [System.Console]::Out.WriteLine($json)
    } catch {}

    [System.Threading.Thread]::Sleep(250)
}
