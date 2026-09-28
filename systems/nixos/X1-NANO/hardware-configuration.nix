{
  lib,
  modulesPath,
  ...
}:
{
  imports = [
    (modulesPath + "/installer/scan/not-detected.nix")
  ];

  boot.initrd.availableKernelModules = [
    "xhci_pci"
    "thunderbolt"
    "nvme"
    "usb_storage"
    "sd_mod"
  ];
  boot.initrd.kernelModules = [ ];
  boot.kernelModules = [ "kvm-intel" ];
  boot.kernelParams = [
    "nmi_watchdog=0"
    # Pin deep sleep (S3). Already active, keep it explicit.
    "mem_sleep_default=deep"
  ];

  # Sleep the audio codec after 1s idle instead of 10s. TLP default.
  boot.extraModprobeConfig = ''
    options snd_hda_intel power_save=1
  '';
  boot.extraModulePackages = [ ];

  fileSystems."/" = {
    device = "/dev/disk/by-label/ROOT";
    fsType = "ext4";
  };

  fileSystems."/boot" = {
    device = "/dev/disk/by-label/BOOT";
    fsType = "vfat";
    options = [
      "fmask=0077"
      "dmask=0077"
    ];
  };

  swapDevices = [
    { device = "/dev/disk/by-label/SWAP"; }
  ];

  # Enables DHCP on each ethernet and wireless interface. In case of scripted networking
  # (the default) this is the recommended approach. When using systemd-networkd it's
  # still possible to use this option, but it's recommended to use it in conjunction
  # with explicit per-interface declarations with `networking.interfaces.<interface>.useDHCP`.
  networking.useDHCP = lib.mkDefault true;
  # networking.interfaces.enp0s31f6.useDHCP = lib.mkDefault true;
  # networking.interfaces.wlp3s0.useDHCP = lib.mkDefault true;

  nixpkgs.hostPlatform = lib.mkDefault "x86_64-linux";

  powerManagement.enable = true;

  # WiFi power save is managed per power source by TLP (WIFI_PWR_*).
  services = {
    thermald.enable = false;
    power-profiles-daemon.enable = false;
    tlp = {
      enable = true;
      settings = {
        CPU_SCALING_GOVERNOR_ON_AC = "powersave";
        CPU_SCALING_GOVERNOR_ON_BAT = "powersave";

        CPU_ENERGY_PERF_POLICY_ON_AC = "balance_performance";
        CPU_ENERGY_PERF_POLICY_ON_BAT = "balance_power";

        CPU_MIN_PERF_ON_AC = "0";
        CPU_MAX_PERF_ON_AC = "100";
        CPU_MIN_PERF_ON_BAT = "0";
        # 75 percent of the 4.4GHz peak lands near the previous 3.4GHz cap.
        CPU_MAX_PERF_ON_BAT = "75";

        CPU_BOOST_ON_AC = "1";
        CPU_BOOST_ON_BAT = "1";

        CPU_HWP_DYN_BOOST_ON_AC = "1";
        CPU_HWP_DYN_BOOST_ON_BAT = "1";

        PLATFORM_PROFILE_ON_AC = "balanced";
        PLATFORM_PROFILE_ON_BAT = "low-power";

        WIFI_PWR_ON_AC = "off";
        WIFI_PWR_ON_BAT = "on";

        SOUND_POWER_SAVE_ON_AC = "0";
        SOUND_POWER_SAVE_ON_BAT = "1";

        NMI_WATCHDOG = "0";

        START_CHARGE_THRESH_BAT0 = "75";
        STOP_CHARGE_THRESH_BAT0 = "80";
      };
    };

    # auto-cpufreq retired in favor of TLP. Kept for reference.
    # auto-cpufreq = {
    #   enable = true;
    #   settings = {
    #     charger = {
    #       governor = "powersave";
    #       energy_performance_preference = "balance_performance";
    #       platform_profile = "balanced";
    #       enforce_platform_profile = false;
    #       scaling_max_freq = 4400000;
    #       turbo = "auto";
    #     };
    #
    #     battery = {
    #       governor = "powersave";
    #       energy_performance_preference = "balance_power";
    #       platform_profile = "low-power";
    #       enforce_platform_profile = true;
    #       scaling_max_freq = 3400000;
    #       turbo = "auto";
    #       enable_thresholds = true;
    #       start_threshold = 75;
    #       stop_threshold = 80;
    #     };
    #   };
    # };
    libinput = {
      enable = true;
      touchpad = {
        naturalScrolling = true;
      };
    };
  };
}
