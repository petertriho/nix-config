let
  concat = builtins.concatStringsSep;

  lines = concat "\n";
  renderBlock = name: rows: lines ([ "(${name}" ] ++ (map (row: "    ${row}") rows) ++ [ ")" ]);

  commonDefvar = lines [
    "(defvar"
    "    tap-time 150"
    "    hold-time 150"
    "    left-hand-keys ("
    "        q w e r t"
    "        a s d f g"
    "        z x c v b"
    "    )"
    "    right-hand-keys ("
    "        y u i o p"
    "        h j k l ;"
    "        n m , . /"
    "    )"
    ")"
  ];

  commonFakeKeys = lines [
    "(deffakekeys"
    "    to-base (layer-switch base)"
    ")"
  ];

  homeRowAliases = [
    "a (tap-hold-release-keys $tap-time $hold-time (multi a @tap) lmet $left-hand-keys)"
    "s (tap-hold-release-keys $tap-time $hold-time (multi s @tap) lalt $left-hand-keys)"
    "d (tap-hold-release-keys $tap-time $hold-time (multi d @tap) lsft $left-hand-keys)"
    "f (tap-hold-release-keys $tap-time $hold-time (multi f @tap) lctl $left-hand-keys)"
    "j (tap-hold-release-keys $tap-time $hold-time (multi j @tap) rctl $right-hand-keys)"
    "k (tap-hold-release-keys $tap-time $hold-time (multi k @tap) rsft $right-hand-keys)"
    "l (tap-hold-release-keys $tap-time $hold-time (multi l @tap) lalt $right-hand-keys)"
    "; (tap-hold-release-keys $tap-time $hold-time (multi ; @tap) rmet $right-hand-keys)"
  ];

  renderAliases =
    extraAliases:
    lines (
      [
        "(defalias"
        "    cap (tap-hold-release $tap-time $hold-time esc lctl)"
      ]
      ++ (map (alias: "    ${alias}") extraAliases)
      ++ [
        ""
        "    tap (multi"
        "        (layer-switch nomods)"
        "        (on-idle-fakekey to-base tap 20)"
        "    )"
        ""
      ]
      ++ (map (alias: "    ${alias}") homeRowAliases)
      ++ [ ")" ]
    );

  mkKeymap =
    {
      defcfg ? null,
      defsrc,
      base,
      nomods,
      extraLayers ? [ ],
      extraAliases ? [ ],
    }:
    (if defcfg == null then "" else "${defcfg}\n\n")
    + renderBlock "defsrc" defsrc
    + "\n\n"
    + commonDefvar
    + "\n\n"
    + renderBlock "deflayer base" base
    + "\n\n"
    + renderBlock "deflayer nomods" nomods
    + "\n\n\n"
    + commonFakeKeys
    + "\n\n"
    + (if extraLayers == [ ] then "" else concat "\n\n" extraLayers + "\n\n")
    + renderAliases extraAliases
    + "\n";
in
{
  inherit mkKeymap;

  thinkpad = mkKeymap {
    defsrc = [
      "esc"
      "caps a s d f j k l ;"
    ];
    base = [
      "caps"
      "@cap @a @s @d @f @j @k @l @;"
    ];
    nomods = [
      "caps"
      "lctl a s d f j k l ;"
    ];
  };

  mad68pror = mkKeymap {
    defsrc = [ "lctl a s d f j k l ;" ];
    base = [ "@cap @a @s @d @f @j @k @l @;" ];
    nomods = [ "lctl a s d f j k l ;" ];
  };

  darwin = mkKeymap {
    defcfg = lines [
      "(defcfg"
      "     macos-dev-names-include ("
      "         \"Apple Internal Keyboard / Trackpad\""
      "     )"
      "     process-unmapped-keys yes"
      ")"
    ];
    defsrc = [
      "esc f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12"
      "caps a s d f j k l ;"
      "fn"
    ];
    base = [
      "esc brdn brup _ _ _ _ prev pp next mute vold volu"
      "@cap @a @s @d @f @j @k @l @;"
      "@fnl"
    ];
    nomods = [
      "esc f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12"
      "caps a s d f j k l ;"
      "fn"
    ];
    extraLayers = [
      (renderBlock "deflayer fn" [
        "esc f1 f2 f3 f4 f5 f6 f7 f8 f9 f10 f11 f12"
        "_ _ _ _ _ _ _ _ _"
        "_"
      ])
    ];
    extraAliases = [ "fnl (tap-hold $tap-time $hold-time fn (layer-toggle fn))" ];
  };
}
