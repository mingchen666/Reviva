<#
.SYNOPSIS
  一键发版：把 dev 分支 squash 合并到 main
.DESCRIPTION
  将 dev 的全部变更压成一个 commit 叠到 main，全部用 dev 版本解决冲突，
  自动移除敏感文件追踪，提交前做完整复查。详见 RELEASE_DEV_TO_MAIN.md
  注意：本脚本和文档只存在于 dev 分支，不进 main/GitHub。
.PARAMETER Message
  自定义 commit message，默认 "release: squash dev -> main"
.PARAMETER SkipCommit
  只准备暂存区不提交，便于人工审查后再 commit
.PARAMETER DryRun
  只检查状态不做任何修改
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/release-dev-to-main.ps1
.EXAMPLE
  powershell -ExecutionPolicy Bypass -File scripts/release-dev-to-main.ps1 -Message "release: v1.6.0" -SkipCommit
#>
param(
    [string]$Message = "release: squash dev -> main",
    [switch]$SkipCommit,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent $PSScriptRoot
Set-Location $repoRoot

function Write-Step($msg) { Write-Host "`n[STEP] $msg" -ForegroundColor Cyan }
function Write-Ok($msg)   { Write-Host "  [OK] $msg" -ForegroundColor Green }
function Write-Warn($msg) { Write-Host "  [!]  $msg" -ForegroundColor Yellow }
function Die($msg)        { Write-Host "  [X]  $msg" -ForegroundColor Red; exit 1 }

# ---------- 0. 前置检查 ----------
Write-Step "前置检查"
$curBranch = git branch --show-current
if ($curBranch -ne "main") { Die "当前分支是 $curBranch，必须先切到 main" }
Write-Ok "当前分支: main"

$mainHead = git rev-parse main
$devHead  = git rev-parse dev
if (-not $devHead) { Die "dev 分支不存在" }
Write-Ok "main HEAD = $(git log -1 --oneline main)"
Write-Ok "dev  HEAD = $(git log -1 --oneline dev)"

if ($DryRun) { Write-Warn "DryRun 模式，仅检查，不做修改"; exit 0 }

# ---------- 1. 恢复干净状态 ----------
Write-Step "恢复干净状态"
git merge --abort 2>$null
git reset --hard HEAD *>&1 | Out-Null
Remove-Item "$repoRoot/.git/SQUASH_MSG", "$repoRoot/.git/MERGE_MSG" -Force -ErrorAction SilentlyContinue
$dirty = git status --short | Where-Object { $_ -notmatch '^\?\?' }
if ($dirty) { Write-Warn "工作区仍有已追踪文件变动（将随合并覆盖）" } else { Write-Ok "工作区干净" }

# ---------- 2. 用 dev 内容覆盖 ----------
Write-Step "用 dev 内容覆盖工作区（git checkout dev -- .）"
git checkout dev -- .
if ($LASTEXITCODE -ne 0) { Die "git checkout dev -- . 失败" }
Write-Ok "dev 内容已写入工作区 + index"

# 发版文档/脚本只在 dev，从 main 暂存区移除并删除工作区副本（不进 main/GitHub）
foreach ($f in @('RELEASE_DEV_TO_MAIN.md', 'scripts/release-dev-to-main.ps1')) {
    git restore --staged -- $f 2>$null
    if (Test-Path $f) { Remove-Item $f -Force }
}
Write-Ok "发版文档/脚本已从 main 暂存区移除"

# ---------- 3. 删除 dev 已移除的文件（排除发版文档/脚本） ----------
Write-Step "处理 dev 已删除的文件"
$devFiles  = @(git ls-tree -r dev --name-only)
$mainFiles = @(git ls-tree -r main --name-only)
# 这两个文件只在 dev，不应从 main 移除（它们不会出现在 main index 中）
$protected = @("RELEASE_DEV_TO_MAIN.md", "scripts/release-dev-to-main.ps1")
$toDelete  = $mainFiles | Where-Object {
    ($devFiles -notcontains $_) -and ($protected -notcontains $_)
}
foreach ($f in $toDelete) {
    git rm --cached -- $f 2>$null | Out-Null
}
if ($toDelete.Count -gt 0) {
    Write-Ok "从 index 移除 $($toDelete.Count) 个 dev 已删除的文件: $([string]::Join(', ', $toDelete))"
} else {
    Write-Ok "无需移除"
}

# ---------- 4. 移除敏感文件追踪 ----------
Write-Step "移除敏感文件追踪（main 不带 .gitignore，靠 rm --cached 逐个移除）"
foreach ($sensitive in @(".env.production", "AGENTS.md")) {
    $tracked = git ls-files --cached -- $sensitive
    if ($tracked) {
        git rm --cached -- $sensitive 2>$null | Out-Null
        Write-Ok "移除追踪: $sensitive"
    } else {
        Write-Ok "$sensitive 未追踪，无需处理"
    }
}

# ---------- 5. 提交前复查 ----------
Write-Step "提交前复查"

# 5a. 冲突标记
$conflictFiles = @(rg -l -- "^<<<<<<<|^>>>>>>>|^=======$" . 2>$null | Where-Object {
    $_ -notmatch "node_modules|\.history|\.codegraph|\.agents|\.claude|dist|release"
})
if ($conflictFiles.Count -gt 0) {
    Die "发现 $($conflictFiles.Count) 个文件残留冲突标记，不能提交"
}
Write-Ok "冲突标记: 0"

# 5b. 未合并文件
$unmerged = @(git diff --name-only --diff-filter=U)
if ($unmerged.Count -gt 0) { Die "发现 $($unmerged.Count) 个未合并文件" }
Write-Ok "未合并文件: 0"

# 5c. 敏感文件追踪
$sensitiveTracked = @(git ls-files --cached | Select-String "\.history/|\.codegraph/|\.agents/|\.claude/|CLAUDE\.md|\.env\.production|^AGENTS\.md$")
if ($sensitiveTracked.Count -gt 0) {
    Die "敏感文件仍被追踪:`n$($sensitiveTracked -join "`n")"
}
Write-Ok "敏感文件追踪: 空"
# ---------- 6. 完成（默认不提交，由人工提交推送）----------
$statLine = git diff --cached --stat | Select-Object -Last 1
Write-Host "`n  暂存统计: $statLine" -ForegroundColor DarkGray

Write-Step "暂存区已就绪（脚本默认不提交，请人工提交推送）"
Write-Host "  请人工审查后执行：" -ForegroundColor Yellow
Write-Host "    git commit -m ""$Message""" -ForegroundColor Yellow
Write-Host "    git push origin main" -ForegroundColor Yellow
