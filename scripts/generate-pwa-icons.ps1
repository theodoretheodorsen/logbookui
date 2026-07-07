# Regenerates the PWA icon PNGs from the app's own epaulette emblem
# geometry (see web/index.html's #cover-emblem/menu-toggle-btn inline
# <svg> markup - a closed pentagon outline + three rectangle "stripes",
# in a 48x32 viewBox) using .NET's GDI+ (System.Drawing) directly - no
# npm/image-library dependency, matching this project's no-build-step
# philosophy. Not deployed (lives outside web/, which is all that
# .github/workflows/deploy-pages.yml ships) - a dev-time tool whose
# output (web/icons/*.png) is committed as static assets.
#
# Rerun this whenever the icon design or brand colors change.

Add-Type -AssemblyName System.Drawing

$navy = [System.Drawing.Color]::FromArgb(0x0a, 0x17, 0x33)
$gold = [System.Drawing.Color]::FromArgb(0xc9, 0xa2, 0x27)

# Epaulette geometry, in its native 48x32 viewBox coordinate space.
$pentagon = [System.Drawing.PointF[]]@(
  [System.Drawing.PointF]::new(4, 8),
  [System.Drawing.PointF]::new(38, 8),
  [System.Drawing.PointF]::new(44, 16),
  [System.Drawing.PointF]::new(38, 24),
  [System.Drawing.PointF]::new(4, 24)
)
$stripes = @(
  @{ X = 16; Y = 9; W = 3; H = 14 },
  @{ X = 22; Y = 9; W = 3; H = 14 },
  @{ X = 28; Y = 9; W = 3; H = 14 }
)
$viewBoxWidth = 48
$viewBoxHeight = 32
$strokeWidth = 1.8

function New-EpauletteIcon {
  param(
    [int]$CanvasSize,
    [double]$ContentFraction, # icon width as a fraction of canvas width
    [string]$OutPath
  )

  $bitmap = New-Object System.Drawing.Bitmap $CanvasSize, $CanvasSize
  $g = [System.Drawing.Graphics]::FromImage($bitmap)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

  # Full-bleed navy background - required for maskable icons (no
  # transparency at the edges the OS might crop to a different shape).
  $g.Clear($navy)

  # Scale the 48x32 geometry to occupy $ContentFraction of the canvas
  # width, preserving its aspect ratio, then center it.
  $scale = ($CanvasSize * $ContentFraction) / $viewBoxWidth
  $contentWidth = $viewBoxWidth * $scale
  $contentHeight = $viewBoxHeight * $scale
  $offsetX = ($CanvasSize - $contentWidth) / 2
  $offsetY = ($CanvasSize - $contentHeight) / 2

  $g.TranslateTransform([float]$offsetX, [float]$offsetY)
  $g.ScaleTransform([float]$scale, [float]$scale)

  $pen = New-Object System.Drawing.Pen $gold, ([float]$strokeWidth)
  $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $path.AddLines($pentagon)
  $path.CloseFigure()
  $g.DrawPath($pen, $path)

  $brush = New-Object System.Drawing.SolidBrush $gold
  foreach ($stripe in $stripes) {
    $g.FillRectangle($brush, $stripe.X, $stripe.Y, $stripe.W, $stripe.H)
  }

  $bitmap.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

  $path.Dispose()
  $brush.Dispose()
  $pen.Dispose()
  $g.Dispose()
  $bitmap.Dispose()
}

$iconsDir = Join-Path $PSScriptRoot "..\web\icons"
New-Item -ItemType Directory -Force -Path $iconsDir | Out-Null

New-EpauletteIcon -CanvasSize 32  -ContentFraction 0.68 -OutPath (Join-Path $iconsDir "icon-32.png")
New-EpauletteIcon -CanvasSize 192 -ContentFraction 0.68 -OutPath (Join-Path $iconsDir "icon-192.png")
New-EpauletteIcon -CanvasSize 512 -ContentFraction 0.68 -OutPath (Join-Path $iconsDir "icon-512.png")
New-EpauletteIcon -CanvasSize 512 -ContentFraction 0.56 -OutPath (Join-Path $iconsDir "icon-512-maskable.png")

Write-Output "Generated icons in $iconsDir"
