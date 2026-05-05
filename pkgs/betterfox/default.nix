{
  fetchFromGitHub,
  stdenvNoCC,
  lib,
  ...
}:
stdenvNoCC.mkDerivation {
  pname = "betterfox";
  version = "unstable-2026-05-02";

  src = fetchFromGitHub {
    owner = "yokoffing";
    repo = "Betterfox";
    rev = "392c62a03c0d63e323a9aae55bc9aff87454db16";
    hash = "sha256-4d4S0DAqCjQFHoACAUSpltPqYrs83ZecuBU+m/x7xvM=";
  };

  installPhase = ''
    runHook preInstall

    install -Dm0644 user.js "$out/share/betterfox/user.js"
    install -Dm0644 Fastfox.js "$out/share/betterfox/Fastfox.js"
    install -Dm0644 Securefox.js "$out/share/betterfox/Securefox.js"
    install -Dm0644 Peskyfox.js "$out/share/betterfox/Peskyfox.js"
    install -Dm0644 Smoothfox.js "$out/share/betterfox/Smoothfox.js"
    install -Dm0644 policies.json "$out/share/betterfox/policies.json"
    install -Dm0644 README.md "$out/share/doc/betterfox/README.md"
    install -Dm0644 LICENSE "$out/share/doc/betterfox/LICENSE"
    mkdir -p "$out/share/betterfox"

    awk -v out="$out" '
      /OPTION: SHARPEN SCROLLING/ { section = "sharpen" }
      /OPTION: INSTANT SCROLLING/ { section = "instant" }
      /OPTION: SMOOTH SCROLLING/ { section = "smooth" }
      /OPTION: NATURAL SMOOTH SCROLLING/ { section = "natural" }
      section != "" && /^[[:space:]]*user_pref\(/ {
        print > (out "/share/betterfox/Smoothfox-" section ".js")
      }
    ' Smoothfox.js

    runHook postInstall
  '';

  passthru.configs = {
    userjs = "user.js";
    fastfox = "Fastfox.js";
    securefox = "Securefox.js";
    peskyfox = "Peskyfox.js";
    smoothfox-sharpen = "Smoothfox-sharpen.js";
    smoothfox-instant = "Smoothfox-instant.js";
    smoothfox-smooth = "Smoothfox-smooth.js";
    smoothfox-natural = "Smoothfox-natural.js";
  };

  meta = {
    description = "Firefox user.js hardening and performance preferences";
    homepage = "https://github.com/yokoffing/Betterfox";
    license = lib.licenses.mit;
    platforms = lib.platforms.all;
  };
}
