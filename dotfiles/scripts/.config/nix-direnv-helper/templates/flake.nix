{
  description = "Development environment templates for nix-direnv-helper";

  outputs = _: { templates = import ./default.nix; };
}
