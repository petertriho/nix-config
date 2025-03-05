{ pkgs, ... }:
{
  home.packages = with pkgs; [
    k9s
    kubectl
    kubectx
    kubernetes-helm
    kubeswitch
    kubevpn
    kubie
    minikube
  ];
}
