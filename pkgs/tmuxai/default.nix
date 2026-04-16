{
  lib,
  buildGoModule,
  fetchFromGitHub,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "2.1.2-unstable-2026-04-15";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "8972b661b7a400ae178f4190f76a9d4bde6d2335";
    hash = "sha256-AguNrK6zor3uSPwfmtuagLuZFM+zyytDCjPxIaQxRrw=";
  };

  vendorHash = "sha256-p0ZgnW2pKX6GWkgAmCmkcAJBRkoavyj4+IIGsm+kDJc=";

  ldflags = [
    "-s"
    "-w"
  ];

  meta = with lib; {
    description = "AI-Powered, Non-Intrusive Terminal Assistant for tmux";
    homepage = "https://github.com/alvinunreal/tmuxai";
    license = licenses.asl20;
    maintainers = [ ];
    mainProgram = "tmuxai";
  };
}
