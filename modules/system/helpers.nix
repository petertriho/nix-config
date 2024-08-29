{ ... }:
{
  config = {
    lib.meta = {
      interactiveShellInit =
        pkgs:
        # sh
        ''
          if [[ $(${pkgs.procps}/bin/ps -p $PPID -o "comm=") != "fish" && -z ''${BASH_EXECUTION_STRING} && -z ''${ZSH_EXECUTION_STRING} ]]
           then
             case $- in
               *l*)
                 LOGIN_OPTION='--login'
                 ;;
               *)
                 LOGIN_OPTION=""
                 ;;
             esac
             exec ${pkgs.fish}/bin/fish $LOGIN_OPTION
          fi
        '';
    };
  };
}
