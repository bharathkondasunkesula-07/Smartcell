# SmartCell — Lightweight Local Web Server (Zero-Dependency)
# Runs on any Windows system using built-in .NET HttpListener.
# Automatically serves the current directory on http://localhost:3000

$port = 3000
$root = $PSScriptRoot
if (-not $root) { $root = (Get-Location).Path }

$listener = New-Object System.Net.HttpListener
$prefix = "http://localhost:$port/"
$listener.Prefixes.Add($prefix)

try {
    $listener.Start()
    Write-Host ""
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  SmartCell -- Battery Monitoring Dashboard Server" -ForegroundColor Green
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host "  Local URL   : $prefix" -ForegroundColor Yellow
    Write-Host "  Root Folder : $root"
    Write-Host "  Press Ctrl+C in this terminal to stop the server." -ForegroundColor Gray
    Write-Host "==========================================================" -ForegroundColor Cyan
    Write-Host ""

    # Launch default web browser
    Start-Process $prefix

    while ($listener.IsListening) {
        try {
            $context = $listener.GetContext()
            $request = $context.Request
            $response = $context.Response

            $rawPath = $request.Url.LocalPath.TrimStart('/')
            if ([string]::IsNullOrWhiteSpace($rawPath)) {
                $rawPath = 'index.html'
            }

            # Normalize relative path to prevent directory traversal
            $normalizedRelative = $rawPath.Replace('/', [System.IO.Path]::DirectorySeparatorChar)
            $filePath = [System.IO.Path]::Combine($root, $normalizedRelative)

            if ([System.IO.File]::Exists($filePath)) {
                $ext = [System.IO.Path]::GetExtension($filePath).ToLower()
                $mime = 'application/octet-stream'
                switch ($ext) {
                    '.html' { $mime = 'text/html; charset=utf-8' }
                    '.htm'  { $mime = 'text/html; charset=utf-8' }
                    '.css'  { $mime = 'text/css; charset=utf-8' }
                    '.js'   { $mime = 'application/javascript; charset=utf-8' }
                    '.mjs'  { $mime = 'application/javascript; charset=utf-8' }
                    '.json' { $mime = 'application/json; charset=utf-8' }
                    '.svg'  { $mime = 'image/svg+xml' }
                    '.png'  { $mime = 'image/png' }
                    '.jpg'  { $mime = 'image/jpeg' }
                    '.ico'  { $mime = 'image/x-icon' }
                    '.csv'  { $mime = 'text/csv; charset=utf-8' }
                }

                $bytes = [System.IO.File]::ReadAllBytes($filePath)
                $response.ContentType = $mime
                $response.ContentLength64 = $bytes.Length
                $response.StatusCode = 200
                $response.AddHeader('Access-Control-Allow-Origin', '*')
                if ($request.HttpMethod -ne 'HEAD') {
                    $response.OutputStream.Write($bytes, 0, $bytes.Length)
                }
            } else {
                $response.StatusCode = 404
                $errBytes = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found: $rawPath")
                $response.ContentLength64 = $errBytes.Length
                if ($request.HttpMethod -ne 'HEAD') {
                    $response.OutputStream.Write($errBytes, 0, $errBytes.Length)
                }
            }
            $response.Close()
        }
        catch {
            Write-Host ('Request error: ' + $_.Exception.Message) -ForegroundColor Yellow
        }
    }
}
catch {
    Write-Host ('Server stopped: ' + $_.Exception.Message) -ForegroundColor Red
}
finally {
    if ($null -ne $listener -and $listener.IsListening) {
        $listener.Stop()
        $listener.Close()
    }
}
