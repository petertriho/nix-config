{
  config,
  pkgs,
  ...
}:
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

  home.file.".kube/kubie.yaml".source = config.lib.meta.mkDotfilesSymlink "k8s/.kube/kubie.yaml";
}
