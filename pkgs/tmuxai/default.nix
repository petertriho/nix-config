{
  lib,
  buildGoModule,
  fetchFromGitHub,
  stdenv,
}:
buildGoModule rec {
  pname = "tmuxai";
  version = "0-unstable-2026-05-12";

  src = fetchFromGitHub {
    owner = "alvinunreal";
    repo = "tmuxai";
    rev = "87386ed34b12ea47b79867a66deb10338b8c6584";
    hash = "sha256-zb8gPC2BFdv+qD/SRSD8I5JwymEbWz9IOY/z/OcflM4=";
  };

  vendorHash = "sha256-TlP5DlsPL46ityGhje/b8OHDHeWWCxu5K5iu3pyVxog=";

  # macOS 26 (Darwin 25) broke /dev/tty inside tmux panes — returns ENXIO
  # because no controlling terminal is assigned. Fall back to a stdin reader
  # when the readline terminal interface is unavailable. NixOS/Linux unaffected.
  postPatch = lib.optionalString stdenv.hostPlatform.isDarwin ''
    substituteInPlace internal/chat.go \
      --replace-fail $'import (\n\t"bytes"' \
                      $'import (\n\t"bufio"\n\t"bytes"'
    substituteInPlace internal/chat.go \
      --replace-fail $'\t\t\treturn err\n\t\t}\n\n\t\t// Save history' \
                      $'\t\t\treturn c.runStdinFallback()\n\t\t}\n\n\t\t// Save history'
    cat >> internal/chat.go << 'GOEOF'

func (c *CLIInterface) runStdinFallback() error {
	fmt.Println()
	scanner := bufio.NewScanner(os.Stdin)
	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)
		if trimmed == "exit" || trimmed == "quit" {
			return nil
		}
		if trimmed == "" {
			continue
		}
		c.processInput(trimmed)
	}
	return scanner.Err()
}
GOEOF
  '';

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
