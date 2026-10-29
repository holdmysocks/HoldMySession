# Pester 5 checks for Update-SessionMap.ps1.
#
# Run from the repo root in PowerShell:
#   Invoke-Pester -Path .\Update-SessionMap.Tests.ps1 -Output Detailed

BeforeAll {
    . (Join-Path $PSScriptRoot 'Update-SessionMap.ps1')
}

Describe 'Dependency install check' {
    BeforeEach {
        $script:webDir = Join-Path $TestDrive ([guid]::NewGuid().ToString())
        New-Item -ItemType Directory -Path $script:webDir | Out-Null
        Set-Content -LiteralPath (Join-Path $script:webDir 'package-lock.json') -Value '{"lockfileVersion":3}' -NoNewline
    }

    It 'reports not current when node_modules has never been installed' {
        Test-DependenciesCurrent -WebDir $script:webDir | Should -BeFalse
    }

    It 'reports current right after the stamp is written for the current lock file' {
        New-Item -ItemType Directory -Path (Join-Path $script:webDir 'node_modules') | Out-Null
        Write-InstallStamp -WebDir $script:webDir
        Test-DependenciesCurrent -WebDir $script:webDir | Should -BeTrue
    }

    It 'reports not current when package-lock.json changed after the install' {
        New-Item -ItemType Directory -Path (Join-Path $script:webDir 'node_modules') | Out-Null
        Write-InstallStamp -WebDir $script:webDir
        Set-Content -LiteralPath (Join-Path $script:webDir 'package-lock.json') -Value '{"lockfileVersion":3,"changed":true}' -NoNewline
        Test-DependenciesCurrent -WebDir $script:webDir | Should -BeFalse
    }

    It 'reports not current when node_modules exists but has no stamp' {
        New-Item -ItemType Directory -Path (Join-Path $script:webDir 'node_modules') | Out-Null
        Test-DependenciesCurrent -WebDir $script:webDir | Should -BeFalse
    }

    It 'reports not current when the stamp holds a different hash' {
        New-Item -ItemType Directory -Path (Join-Path $script:webDir 'node_modules') | Out-Null
        Set-Content -LiteralPath (Get-InstallStampPath -WebDir $script:webDir) -Value 'NOT-THE-HASH' -NoNewline
        Test-DependenciesCurrent -WebDir $script:webDir | Should -BeFalse
    }

    It 'reports not current when there is no package-lock.json' {
        Remove-Item -LiteralPath (Join-Path $script:webDir 'package-lock.json')
        New-Item -ItemType Directory -Path (Join-Path $script:webDir 'node_modules') | Out-Null
        Set-Content -LiteralPath (Get-InstallStampPath -WebDir $script:webDir) -Value 'anything' -NoNewline
        Test-DependenciesCurrent -WebDir $script:webDir | Should -BeFalse
    }

    It 'accepts a stamp with a trailing newline' {
        New-Item -ItemType Directory -Path (Join-Path $script:webDir 'node_modules') | Out-Null
        $hash = Get-LockHash -LockPath (Join-Path $script:webDir 'package-lock.json')
        Set-Content -LiteralPath (Get-InstallStampPath -WebDir $script:webDir) -Value "$hash`r`n" -NoNewline
        Test-DependenciesCurrent -WebDir $script:webDir | Should -BeTrue
    }
}

Describe 'Dot-sourcing does not run the update' {
    It 'loads the functions without touching the repo path' {
        $missing = Join-Path $TestDrive 'no-such-repo'
        { . (Join-Path $PSScriptRoot 'Update-SessionMap.ps1') -RepoPath $missing } | Should -Not -Throw
    }
}
