{ config, ... }:
{
  # https://nixos.wiki/wiki/Nvidia
  # Enable NVIDIA graphics (MX150)
  services.xserver.videoDrivers = [ "nvidia" ];

  # NVIDIA kernel modules
  boot.initrd.availableKernelModules = [
    "nvidia"
    "nvidia_modeset"
    "nvidia_drm"
    "nvidia_uvm"
  ];
  boot.kernelModules = [ "nvidia" ];

  hardware.nvidia = {
    # Modesetting is required for wayland
    modesetting.enable = true;

    # NVIDIA power management
    powerManagement.enable = true;
    powerManagement.finegrained = false;

    # Use open source driver (better for wayland)
    open = false;

    # Enable nvidia-drm.modeset=1
    nvidiaSettings = true;

    # Optimus PRIME setup for hybrid graphics
    prime = {
      intelBusId = "PCI:0:2:0";
      nvidiaBusId = "PCI:1:0:0";

      # Use sync mode for older Pascal-based MX150
      # Offload mode requires Turing or newer architecture
      sync.enable = true;
    };

    # Package selection
    package = config.boot.kernelPackages.nvidiaPackages.stable;
  };

  # Add NVIDIA tools
  environment.systemPackages = [
    config.hardware.nvidia.package
  ];

  # Force NVIDIA GPU usage for all users
  environment.sessionVariables = {
    __NV_PRIME_RENDER_OFFLOAD = "1";
    __GLX_VENDOR_LIBRARY_NAME = "nvidia";
    LIBVA_DRIVER_NAME = "nvidia";
    GBM_BACKEND = "nvidia-drm";
    WLR_RENDERER = "vulkan";
  };
}
