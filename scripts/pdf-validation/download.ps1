$ErrorActionPreference = 'Stop'
$corpusCache = Join-Path (Split-Path (Split-Path $PSScriptRoot -Parent) -Parent) '.pdf-corpus-cache'
New-Item -ItemType Directory -Path $corpusCache -Force | Out-Null
$publicSources = @{
  'mit-probability-slides' = 'https://ocw.mit.edu/courses/6-041-probabilistic-systems-analysis-and-applied-probability-spring-2006/e93a3d8242ae1c6e75f7ea9c0a2aa3bf_lec01.pdf'
  'mit-theory-slides' = 'https://ocw.mit.edu/courses/18-175-theory-of-probability-spring-2014/e793116b0f70b437cca5e9cf75754cab_MIT18_175S14_Lecture1.pdf'
  'attention-paper' = 'https://arxiv.org/pdf/1706.03762v7'
  'think-python-full' = 'https://greenteapress.com/thinkpython2/thinkpython2.pdf'
}
foreach ($sourceId in $publicSources.Keys) {
  $target = Join-Path $corpusCache ($sourceId + '.pdf')
  if (-not (Test-Path -LiteralPath $target)) {
    Invoke-WebRequest -Uri $publicSources[$sourceId] -OutFile $target -TimeoutSec 45
  }
  if ((Get-Item -LiteralPath $target).Length -gt 20MB) { throw "Corpus download exceeds preparation budget: $sourceId" }
}
Write-Output 'Four public PDFs cached using normal TLS certificate validation.'
