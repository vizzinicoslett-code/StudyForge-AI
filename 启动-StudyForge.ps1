$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot
if (-not (Get-Command node -ErrorAction SilentlyContinue)) { throw '请先安装 Node.js 22.13 或更新版本。' }
if (-not (Test-Path -LiteralPath 'node_modules')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw '依赖安装失败，请检查网络。' }
}
if (-not (Test-Path -LiteralPath 'frontend/dist/index.html')) {
    npm run build
    if ($LASTEXITCODE -ne 0) { throw '构建失败，请查看上面的错误。' }
}
Write-Host '浏览器打开 http://127.0.0.1:3001 （若修改 PORT，请使用对应端口）'
Write-Host '按 Ctrl+C 停止服务。'
npm start
