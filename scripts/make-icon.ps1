# scripts/make-icon.ps1
# Original icon generator for Real Sticky Note
# Creates assets/icon.png and assets/icon.ico using System.Drawing

$ErrorActionPreference = 'Stop'

Add-Type -AssemblyName System.Drawing

$projectRoot = Split-Path -Parent $PSScriptRoot
$assetsDir = Join-Path $projectRoot "assets"
if (-not (Test-Path $assetsDir)) {
    New-Item -ItemType Directory -Path $assetsDir -Force | Out-Null
}

$pngPath = Join-Path $assetsDir "icon.png"
$icoPath = Join-Path $assetsDir "icon.ico"

$size = 256
$bmp = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($bmp)

$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# Paper coordinates and geometry
$left = 22.0
$top = 22.0
$width = 212.0
$height = 212.0
$right = $left + $width
$bottom = $top + $height
$radius = 24.0
$foldSize = 52.0

# Function to build the sticky note path (rounded rectangle with top-right folded corner)
function Get-StickyNotePath([float]$ox, [float]$oy) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $l = $left + $ox
    $t = $top + $oy
    $r = $right + $ox
    $b = $bottom + $oy
    $rad = $radius
    $diam = $rad * 2.0
    $fs = $foldSize

    # Top edge from top-left curve to start of fold
    $path.AddLine(($l + $rad), $t, ($r - $fs), $t)

    # Diagonal cut for fold
    $path.AddLine(($r - $fs), $t, $r, ($t + $fs))

    # Right edge to bottom-right curve
    $path.AddLine($r, ($t + $fs), $r, ($b - $rad))

    # Bottom-right corner
    $path.AddArc(($r - $diam), ($b - $diam), $diam, $diam, 0.0, 90.0)

    # Bottom edge
    $path.AddLine(($r - $rad), $b, ($l + $rad), $b)

    # Bottom-left corner
    $path.AddArc($l, ($b - $diam), $diam, $diam, 90.0, 90.0)

    # Left edge
    $path.AddLine($l, ($b - $rad), $l, ($t + $rad))

    # Top-left corner
    $path.AddArc($l, $t, $diam, $diam, 180.0, 90.0)

    $path.CloseFigure()
    return $path
}

# 1. Soft drop shadows underneath paper
$shadowOffsets = @(
    @{ X = 0.0; Y = 8.0; Alpha = 22 },
    @{ X = 0.0; Y = 4.0; Alpha = 35 },
    @{ X = 0.0; Y = 2.0; Alpha = 45 }
)
foreach ($s in $shadowOffsets) {
    $sPath = Get-StickyNotePath $s.X $s.Y
    $sBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb($s.Alpha, 15, 23, 42))
    $g.FillPath($sBrush, $sPath)
    $sBrush.Dispose()
    $sPath.Dispose()
}

# 2. Main paper body with subtle warm yellow gradient
$paperPath = Get-StickyNotePath 0.0 0.0
$paperRect = New-Object System.Drawing.RectangleF $left, $top, $width, $height
$cTop = [System.Drawing.Color]::FromArgb(255, 255, 244, 130)   # Bright warm canary yellow
$cBottom = [System.Drawing.Color]::FromArgb(255, 250, 212, 60) # Rich warm yellow
$paperBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $paperRect,
    $cTop,
    $cBottom,
    [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
)
$g.FillPath($paperBrush, $paperPath)

# Subtle paper border
$paperPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(60, 217, 119, 6), 1.0)
$g.DrawPath($paperPen, $paperPath)
$paperPen.Dispose()
$paperBrush.Dispose()
$paperPath.Dispose()

# 3. Shadow under the folded flap
$foldShadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$fx = $right - $foldSize
$fy = $top + $foldSize
$foldShadowPath.AddPolygon(@(
    (New-Object System.Drawing.PointF ($fx - 4), $top),
    (New-Object System.Drawing.PointF ($fx - 4), ($fy + 4)),
    (New-Object System.Drawing.PointF $right, ($fy + 4))
))
$foldShadowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($foldShadowPath)
$foldShadowBrush.CenterColor = [System.Drawing.Color]::FromArgb(90, 30, 20, 0)
$foldShadowBrush.SurroundColors = @(
    [System.Drawing.Color]::FromArgb(0, 0, 0, 0),
    [System.Drawing.Color]::FromArgb(0, 0, 0, 0),
    [System.Drawing.Color]::FromArgb(0, 0, 0, 0)
)
$g.FillPath($foldShadowBrush, $foldShadowPath)
$foldShadowBrush.Dispose()
$foldShadowPath.Dispose()

# 4. Folded corner flap (underside of paper folded over diagonal)
$flapPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$flapPoints = @(
    (New-Object System.Drawing.PointF $fx, $top),
    (New-Object System.Drawing.PointF $right, $fy),
    (New-Object System.Drawing.PointF ($fx + 2.0), ($fy - 2.0))
)
$flapPath.AddPolygon($flapPoints)

$flapRect = New-Object System.Drawing.RectangleF $fx, $top, $foldSize, $foldSize
$cFlap1 = [System.Drawing.Color]::FromArgb(255, 245, 202, 58)
$cFlap2 = [System.Drawing.Color]::FromArgb(255, 228, 172, 32)
$flapBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
    $flapRect,
    $cFlap1,
    $cFlap2,
    [System.Drawing.Drawing2D.LinearGradientMode]::BackwardDiagonal
)
$g.FillPath($flapBrush, $flapPath)

$flapPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(80, 180, 120, 20), 1.0)
$g.DrawPath($flapPen, $flapPath)
$flapPen.Dispose()
$flapBrush.Dispose()
$flapPath.Dispose()

# 5. Dark green checkmark in the center
# Shadow for checkmark
$chkPointsShadow = @(
    (New-Object System.Drawing.PointF 78.0, 133.0),
    (New-Object System.Drawing.PointF 112.0, 167.0),
    (New-Object System.Drawing.PointF 176.0, 97.0)
)
$chkShadowPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(35, 10, 40, 15), 24.0)
$chkShadowPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$chkShadowPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$chkShadowPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawLines($chkShadowPen, $chkPointsShadow)
$chkShadowPen.Dispose()

# Checkmark body (dark forest/emerald green)
$chkPoints = @(
    (New-Object System.Drawing.PointF 78.0, 131.0),
    (New-Object System.Drawing.PointF 112.0, 165.0),
    (New-Object System.Drawing.PointF 176.0, 95.0)
)
$darkGreen = [System.Drawing.Color]::FromArgb(255, 22, 115, 48)
$chkPen = New-Object System.Drawing.Pen($darkGreen, 23.0)
$chkPen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$chkPen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$chkPen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
$g.DrawLines($chkPen, $chkPoints)
$chkPen.Dispose()

# Clean up graphics
$g.Dispose()

# 6. Save PNG
$ms = New-Object System.IO.MemoryStream
$bmp.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
$pngBytes = $ms.ToArray()
$ms.Dispose()
[System.IO.File]::WriteAllBytes($pngPath, $pngBytes)

# 7. Save ICO with PNG container (valid Windows Vista+ 256x256 format)
$icoStream = New-Object System.IO.MemoryStream
$writer = New-Object System.IO.BinaryWriter($icoStream)

# ICONDIR header (6 bytes)
$writer.Write([uint16]0)    # idReserved: Must be 0
$writer.Write([uint16]1)    # idType: 1 for icon
$writer.Write([uint16]1)    # idCount: 1 image

# ICONDIRENTRY (16 bytes)
$writer.Write([byte]0)      # bWidth: 0 means 256px
$writer.Write([byte]0)      # bHeight: 0 means 256px
$writer.Write([byte]0)      # bColorCount: 0 for 32bpp
$writer.Write([byte]0)      # bReserved
$writer.Write([uint16]1)    # wPlanes: 1
$writer.Write([uint16]32)   # wBitCount: 32bpp
$writer.Write([uint32]$pngBytes.Length) # dwBytesInRes
$writer.Write([uint32]22)   # dwImageOffset: 6 + 16 = 22

# Raw PNG payload
$writer.Write($pngBytes)
$writer.Flush()

$icoBytes = $icoStream.ToArray()
[System.IO.File]::WriteAllBytes($icoPath, $icoBytes)
$writer.Dispose()
$icoStream.Dispose()
$bmp.Dispose()

Write-Output "Successfully generated:"
Write-Output " - $pngPath ($($pngBytes.Length) bytes)"
Write-Output " - $icoPath ($($icoBytes.Length) bytes)"
