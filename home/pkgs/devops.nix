{ pkgs, ... }:
{
  home.packages = with pkgs; [
    # NOTE: add these to direnv/devenv instead
    # opentofu
    # terraform
    terraform-docs
    terraform-compliance
  ];
}
