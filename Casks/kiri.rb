# nixcfg brew:casks rewrites the version and sha256 lines.
cask "kiri" do
  arch arm: "arm64", intel: "x86_64"

  version "0.2.0"
  sha256 arm:   "b683af7c2388bed8656571f797fcde53af92076a17ca8655d9025b8f1073bf17",
         intel: "e22f28d30f78fb4eb1202354dc036078d1e8957963583fb8e8b3791168bf40e4"

  url "https://github.com/libracoder/kiri/releases/download/v#{version}/Kiri-#{version}-#{arch}.dmg"
  name "Kiri"
  desc "Container runtime for the Docker CLI, Compose and buildx"
  homepage "https://runkiri.com/"

  auto_updates true
  depends_on macos: :sonoma

  app "Kiri.app"

  # Homebrew runs uninstall directives on upgrade too, so the teardown stays
  # in zap: a launchctl directive here would delete the LaunchAgent, and
  # `kiri setup --uninstall` would also drop the docker context and resolver.
  uninstall quit: "dev.kiri.app"

  # Leave /var/run/docker.sock alone: OrbStack owns it on these hosts.
  zap launchctl: [
        "dev.kiri.daemon",
        "dev.kiri.docker-socket",
        "dev.kiri.usb",
      ],
      delete:    [
        "/etc/resolver/kiri.local",
        "/Library/PrivilegedHelperTools/dev.kiri.usb",
        "/Library/PrivilegedHelperTools/dev.kiri.usb.source",
      ],
      trash:     [
        "~/.config/fish/conf.d/kiri.fish",
        "~/.docker/buildx/activity/kiri-build",
        "~/.docker/buildx/instances/kiri",
        "~/.docker/buildx/instances/kiri-build",
        "~/.docker/contexts/meta/80d7688032dda428a5d1e0eea7ad434d219b770b7d3a0646fd58695e40107755",
        "~/.kiri",
        "~/Library/Application Support/Kiri",
        "~/Library/Caches/dev.kiri.app",
        "~/Library/WebKit/dev.kiri.app",
      ],
      rmdir:     "~/Kiri"
end
