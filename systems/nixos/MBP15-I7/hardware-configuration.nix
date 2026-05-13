{
  lib,
  modulesPath,
  ...
}:
{
  imports = [
    (modulesPath + "/installer/scan/not-detected.nix")
  ];

  # Placeholder for the MacBookPro15,1 / MBP15-I7 full-disk NixOS install.
  #
  # Before installing NixOS on the MacBook:
  # 1. Back up anything needed from macOS; the intended install is full-disk NixOS.
  # 2. Boot macOS Recovery and use Startup Security Utility to allow booting
  #    external/non-Apple operating systems. Disable Secure Boot for the NixOS
  #    installer path.
  # 3. Use the T2 Linux/NixOS install flow, not a generic installer-only flow,
  #    so the Apple T2 keyboard, trackpad, firmware, Wi-Fi/Bluetooth, and audio
  #    support are available early enough.
  # 4. After partitioning/mounting the target system, run:
  #      nixos-generate-config --root /mnt
  # 5. Replace this file with the generated /mnt/etc/nixos/hardware-configuration.nix
  #    content, then re-apply any MBP15-I7-specific comments that are still useful.
  # 6. Before the first real switch/install, verify the generated file has real
  #    root and EFI fileSystems entries for the installed disk. Do not keep the
  #    temporary tmpfs root below for an installed system.
  # 7. After first boot, inspect /dev/dri/by-path and set any Wayland DRM device
  #    ordering in home/MBP15-I7.nix if Radeon-first selection needs tuning.

  boot.initrd.availableKernelModules = [
    "xhci_pci"
    "thunderbolt"
    "nvme"
    "usb_storage"
    "usbhid"
    "sd_mod"
  ];
  boot.initrd.kernelModules = [ ];
  boot.kernelModules = [ "kvm-intel" ];
  boot.extraModulePackages = [ ];

  # Build-only placeholder so .#nixosConfigurations.MBP15-I7 can evaluate before
  # the physical machine generates its real disk layout.
  fileSystems."/" = lib.mkDefault {
    device = "none";
    fsType = "tmpfs";
    options = [
      "defaults"
      "size=2G"
      "mode=755"
    ];
  };

  nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";
  hardware.cpu.intel.updateMicrocode = lib.mkDefault true;
}
