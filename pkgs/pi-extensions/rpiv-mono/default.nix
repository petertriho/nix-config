{
  fetchFromGitHub,
  fetchurl,
}:
let
  src = fetchFromGitHub {
    owner = "juicesharp";
    repo = "rpiv-mono";
    rev = "226ec6e18f94dbed334a76ff907e1759d768b4bb"; # main HEAD, 2026-08-03
    hash = "sha256-Xo3PJEY8vLlmvyYuji47cyW3b6QyggsvvtqBgSGfzvA=";
  };
  version = "2.4.0-unstable-2026-08-03";

  # Only external runtime dep across the rpiv extensions. The runtime subtree
  # is flat: rpiv-config -> typebox, and typebox has zero runtime deps. The
  # @earendil-works/* peers are injected by Pi at runtime, not installed here.
  typebox = fetchurl {
    url = "https://registry.npmjs.org/typebox/-/typebox-1.3.10.tgz";
    hash = "sha512-L0MT00X96q0P30f1NrGULgaSbmu8hfTjWbLULeVoM+j5u0jR5wyefoDquX2NmRa39f0KiNIBo1wWSaVvHJTZlA==";
  };
in
{
  inherit src version typebox;
}
