<#
.SYNOPSIS
    weekly 开发环境一键启动脚本。

.DESCRIPTION
    依次完成四件事：
      1. 检查 Node / npm 是否可用；
      2. 根目录缺少 .env 时从 .env.example 复制一份（前后端共用这份配置）；
      3. 按需为 server / web 安装依赖；
      4. 分别在新窗口启动后端（Fastify，默认 3701）与前端（Vite，默认 3700）。

    两个服务各自独占一个窗口，日志互不干扰，关闭窗口即停止对应服务。

.PARAMETER NoInstall
    跳过依赖检查与安装，直接启动。依赖已装好时用它换取更快的启动。

.EXAMPLE
    .\start.ps1
    完整启动（缺依赖会自动 npm install）。

.EXAMPLE
    .\start.ps1 -NoInstall
    跳过依赖安装，直接拉起两个开发服务。

.NOTES
    若因执行策略被拦截，改用：
    powershell -ExecutionPolicy Bypass -File .\start.ps1
#>

[CmdletBinding()]
param(
    # 跳过依赖安装检查，直接启动
    [switch]$NoInstall
)

$ErrorActionPreference = 'Stop'

# 脚本所在目录即仓库根目录，因此脚本可被移动到任意位置执行
$root = $PSScriptRoot
$serverDir = Join-Path $root 'server'
$webDir = Join-Path $root 'web'
$envFile = Join-Path $root '.env'
$envExampleFile = Join-Path $root '.env.example'

# 优先使用 PowerShell 7（pwsh），没有则回退到 Windows PowerShell
$shellExe = if (Get-Command 'pwsh' -ErrorAction SilentlyContinue) { 'pwsh' } else { 'powershell' }

Write-Host '=== weekly 开发环境启动 ===' -ForegroundColor Cyan

# ---- 1. 环境检查 ----------------------------------------------------------

$nodeCmd = Get-Command 'node' -ErrorAction SilentlyContinue
if (-not $nodeCmd) {
    Write-Host '[错误] 未找到 node，请先安装 Node.js 22 LTS 后再运行本脚本。' -ForegroundColor Red
    exit 1
}

$nodeVersion = (& node --version).Trim()
Write-Host "[1/4] Node 版本：$nodeVersion"

# ---- 2. 生成根目录 .env ---------------------------------------------------

if (Test-Path -LiteralPath $envFile) {
    Write-Host '[2/4] 已存在根目录 .env，沿用现有配置。'
} elseif (Test-Path -LiteralPath $envExampleFile) {
    # 前后端都读这份 .env：后端取 PORT/DB_PATH 等，前端据此决定 /api 代理目标
    Copy-Item -LiteralPath $envExampleFile -Destination $envFile
    Write-Host '[2/4] 未找到 .env，已按 .env.example 生成一份默认配置。' -ForegroundColor Yellow
} else {
    Write-Host '[2/4] 未找到 .env 与 .env.example，将使用代码内置默认值。' -ForegroundColor Yellow
}

# ---- 3. 依赖检查 ----------------------------------------------------------

if ($NoInstall) {
    Write-Host '[3/4] 已指定 -NoInstall，跳过依赖检查。'
} else {
    foreach ($item in @(
            @{ Name = 'server'; Dir = $serverDir },
            @{ Name = 'web'; Dir = $webDir }
        )) {
        $modules = Join-Path $item.Dir 'node_modules'
        if (Test-Path -LiteralPath $modules) {
            Write-Host "[3/4] $($item.Name) 依赖已就绪，跳过安装。"
            continue
        }

        Write-Host "[3/4] $($item.Name) 缺少依赖，开始安装（首次较慢）……" -ForegroundColor Yellow
        Push-Location -LiteralPath $item.Dir
        try {
            & npm install
            if ($LASTEXITCODE -ne 0) {
                throw "npm install 失败（$($item.Name)），退出码 $LASTEXITCODE"
            }
        } finally {
            Pop-Location
        }
    }
}

# ---- 4. 启动前后端 --------------------------------------------------------

# 后端端口以 .env 为准，改端口只需改一处，这里同步提示访问地址
$apiPort = 3000
if (Test-Path -LiteralPath $envFile) {
    $match = Select-String -LiteralPath $envFile -Pattern '^\s*PORT\s*=\s*(\d+)' | Select-Object -First 1
    if ($match) {
        $apiPort = [int]$match.Matches[0].Groups[1].Value
    }
}

<#
.SYNOPSIS
    在新窗口中启动一个开发服务。
.DESCRIPTION
    通过 -NoExit 保留窗口，服务停止后可查看完整报错信息。
.PARAMETER Title
    新窗口标题，用于区分前后端。
.PARAMETER WorkingDirectory
    服务所在目录。
.PARAMETER Command
    在窗口内执行的 npm 脚本命令。
#>
function Start-DevWindow {
    param(
        [Parameter(Mandatory = $true)][string]$Title,
        [Parameter(Mandatory = $true)][string]$WorkingDirectory,
        [Parameter(Mandatory = $true)][string]$Command
    )

    # Windows 路径不含单引号以外的问题字符，这里做单引号转义后再用单引号包裹
    $safeDir = $WorkingDirectory.Replace("'", "''")
    $script = "`$Host.UI.RawUI.WindowTitle = '$Title'; Set-Location -LiteralPath '$safeDir'; $Command"

    # 合并成单个参数字符串传入，避免 Start-Process 对数组参数处理不一致导致的引号问题
    Start-Process -FilePath $shellExe -ArgumentList "-NoExit -Command `"$script`"" | Out-Null
}

Write-Host '[4/4] 启动后端与前端……'
Start-DevWindow -Title 'weekly - server' -WorkingDirectory $serverDir -Command 'npm run dev'
Start-DevWindow -Title 'weekly - web' -WorkingDirectory $webDir -Command 'npm run dev'

Write-Host ''
Write-Host '已在新窗口启动：' -ForegroundColor Green
Write-Host "  后端 API   http://127.0.0.1:$apiPort"
Write-Host '  前端页面   http://127.0.0.1:3700'
Write-Host ''
Write-Host '首次启动需等待编译完成后再访问；关闭对应窗口即可停止该服务。'
