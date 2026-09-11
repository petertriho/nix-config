{
  services.easyeffects = {
    enable = true;

    # Load only the output chain. Input stays untouched.
    preset = {
      output = "t480-speakers";
    };

    settings = {
      StreamOutputs.useDefaultOutputDevice = true;
    };

    extraPresets = {
      t480-speakers = {
        output = {
          blocklist = [ ];
          plugins_order = [
            "equalizer#0"
            "bass_enhancer#0"
            "limiter#0"
          ];

          # Tames tinny T480 speakers: high-pass rumble,
          # cuts mud and harshness, adds a little air.
          "equalizer#0" = {
            bypass = false;
            input-gain = 0.0;
            output-gain = 0.0;
            mode = "IIR";
            decramp = "Off";
            split-channels = false;
            balance = 0.0;
            pitch-left = 0.0;
            pitch-right = 0.0;
            num-bands = 6;
            left = {
              band0 = {
                type = "Hi-pass";
                mode = "RLC (BT)";
                slope = "x2";
                solo = false;
                mute = false;
                gain = 0.0;
                frequency = 90.0;
                q = 0.7;
                width = 4.0;
              };
              band1 = {
                type = "Bell";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = -2.0;
                frequency = 250.0;
                q = 1.0;
                width = 4.0;
              };
              band2 = {
                type = "Bell";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = -1.0;
                frequency = 1000.0;
                q = 1.0;
                width = 4.0;
              };
              band3 = {
                type = "Bell";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = -4.0;
                frequency = 3500.0;
                q = 1.2;
                width = 4.0;
              };
              band4 = {
                type = "Bell";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = 1.0;
                frequency = 7000.0;
                q = 1.0;
                width = 4.0;
              };
              band5 = {
                type = "Hi-shelf";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = 2.0;
                frequency = 11000.0;
                q = 0.7;
                width = 4.0;
              };
            };
            right = {
              band0 = {
                type = "Hi-pass";
                mode = "RLC (BT)";
                slope = "x2";
                solo = false;
                mute = false;
                gain = 0.0;
                frequency = 90.0;
                q = 0.7;
                width = 4.0;
              };
              band1 = {
                type = "Bell";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = -2.0;
                frequency = 250.0;
                q = 1.0;
                width = 4.0;
              };
              band2 = {
                type = "Bell";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = -1.0;
                frequency = 1000.0;
                q = 1.0;
                width = 4.0;
              };
              band3 = {
                type = "Bell";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = -4.0;
                frequency = 3500.0;
                q = 1.2;
                width = 4.0;
              };
              band4 = {
                type = "Bell";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = 1.0;
                frequency = 7000.0;
                q = 1.0;
                width = 4.0;
              };
              band5 = {
                type = "Hi-shelf";
                mode = "RLC (BT)";
                slope = "x1";
                solo = false;
                mute = false;
                gain = 2.0;
                frequency = 11000.0;
                q = 0.7;
                width = 4.0;
              };
            };
          };

          # Gentle warmth. Raise amount in the GUI if speakers allow it.
          "bass_enhancer#0" = {
            bypass = false;
            input-gain = 0.0;
            output-gain = 0.0;
            amount = 3.0;
            harmonics = 8.5;
            scope = 100.0;
            floor = 20.0;
            blend = 0.0;
            floor-active = false;
          };

          # Safety net against distortion after EQ and bass boost.
          "limiter#0" = {
            bypass = false;
            input-gain = 0.0;
            output-gain = 0.0;
            threshold = -1.0;
          };
        };
      };
    };
  };
}
