{
  lib,
  python3,
  python3Packages,
  runCommand,
  writers,
}:
let
  keymods = writers.writePython3Bin "keymods" {
    libraries = [ python3Packages.evdev ];
  } (builtins.readFile ./keymods.py);
in
keymods.overrideAttrs (old: {
  passthru = (old.passthru or { }) // {
    tests.unit =
      runCommand "keymods-unit-tests"
        {
          nativeBuildInputs = [ (python3.withPackages (ps: [ ps.evdev ])) ];
          KEYMODS_SCRIPT = ./keymods.py;
        }
        ''
          python -m unittest discover -s ${./tests} -v
          touch "$out"
        '';
  };

  meta = (old.meta or { }) // {
    description = "Report held keyboard modifiers to the Quickshell which-key overlay";
    mainProgram = "keymods";
    platforms = lib.platforms.linux;
  };
})
