# Check list
# - https://github.com/ntdevlabs/tiny11builder
# - Drivers
# - Sophia app https://github.com/Sophia-Community/SophiApp
# - Winget
# - Scoop
# - WSL
# - excludeWSL.ps1
# - nix-config

# Winget
winget install --source winget --id Ablaze.Floorp
winget install --source winget --id AltSnap.AltSnap
winget install --source winget --id Betterbird.Betterbird
winget install --source winget --id Discord.Discord
winget install --source winget --id Giorgiotani.Peazip
winget install --source winget --id Google.Chrome
winget install --source winget --id MartiCliment.UniGetUI
winget install --source winget --id Microsoft.PowerToys
winget install --source winget --id Mozilla.Firefox
winget install --source winget --id Neovide.Neovide
winget install --source winget --id Nextcloud.NextcloudDesktop
winget install --source winget --id RandyRants.SharpKeys
winget install --source winget --id SumatraPDF.SumatraPDF
winget install --source winget --id Valve.Steam
winget install --source winget --id VideoLAN.VLC
winget install --source winget --id voidtools.Everything
winget install --source winget --id WinSCP.WinSCP
winget install --source winget --id WireGuard.WireGuard
winget install --source winget --id wez.wezterm

# Scoop
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
irm get.scoop.sh | iex
scoop install 7zip aria2 curl dark git neovim sudo win32yank
scoop bucket add nerd-fonts
scoop bucket add extras
sudo scoop install --global JetBrainsMono-NF JetBrainsMono-NF-Mono JetBrainsMono-NF-Propo

# WSL
wsl --install --no-distribution

# Download and install NixOS-WSL (https://github.com/nix-community/NixOS-WSL)
$releaseUrl = "https://api.github.com/repos/nix-community/NixOS-WSL/releases/latest"
$release = Invoke-RestMethod -Uri $releaseUrl
$asset = $release.assets | Where-Object { $_.name -eq "nixos.wsl" }
$downloadUrl = $asset.browser_download_url
$outputPath = Join-Path $env:USERPROFILE "Downloads\nixos.wsl"

Write-Host "Downloading NixOS-WSL..."
Invoke-WebRequest -Uri $downloadUrl -OutFile $outputPath

Write-Host "Installing NixOS-WSL..."
Start-Process -FilePath $outputPath -Wait

Write-Host "NixOS-WSL installed. You can now run: wsl -d NixOS"

# Change username and networking.hostName = "WSL" before running the nix-config bootstrap script
# https://nix-community.github.io/NixOS-WSL/how-to/change-username.html
