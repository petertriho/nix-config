{ pkgs, ... }:
{
  environment.systemPackages = with pkgs; [
    kanata
  ];

  services.kanata = {
    enable = true;
    keyboards = {
      internalKeyboard = {
        devices = [
          "/dev/input/by-path/platform-i8042-serio-0-event-kbd"
        ];
        extraDefCfg = "process-unmapped-keys yes";
        config = ''
          (defsrc
              esc
              caps a s d f j k l ;
          )

          (defvar
              tap-time 150
              hold-time 150
              left-hand-keys (
                  q w e r t
                  a s d f g
                  z x c v b
              )
              right-hand-keys (
                  y u i o p
                  h j k l ;
                  n m , . /
              )
          )

          (deflayer base
              caps
              @cap @a @s @d @f @j @k @l @;
          )

          (deflayer nomods
              caps
              lctl a s d f j k l ;
          )


          (deffakekeys
              to-base (layer-switch base)
          )

          (defalias
              cap (tap-hold-release $tap-time $hold-time esc lctl)

              tap (multi
                  (layer-switch nomods)
                  (on-idle-fakekey to-base tap 20)
              )

              a (tap-hold-release-keys $tap-time $hold-time (multi a @tap) lmet $left-hand-keys)
              s (tap-hold-release-keys $tap-time $hold-time (multi s @tap) lalt $left-hand-keys)
              d (tap-hold-release-keys $tap-time $hold-time (multi d @tap) lsft $left-hand-keys)
              f (tap-hold-release-keys $tap-time $hold-time (multi f @tap) lctl $left-hand-keys)
              j (tap-hold-release-keys $tap-time $hold-time (multi j @tap) rctl $right-hand-keys)
              k (tap-hold-release-keys $tap-time $hold-time (multi k @tap) rsft $right-hand-keys)
              l (tap-hold-release-keys $tap-time $hold-time (multi l @tap) lalt $right-hand-keys)
              ; (tap-hold-release-keys $tap-time $hold-time (multi ; @tap) rmet $right-hand-keys)
          )
        '';
      };
    };
  };
}
