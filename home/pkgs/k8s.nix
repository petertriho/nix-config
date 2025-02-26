{ pkgs, ... }:
{
  home.packages = with pkgs; [
    k9s
    kubectl
    kubernetes-helm
    kubevpn
    minikube
  ];
}
