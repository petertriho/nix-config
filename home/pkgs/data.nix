{ pkgs, ... }:
{
  home.packages = with pkgs; [
    csvkit # command-line CSV toolkit
    duckdb # SQL OLAP db management system
    fx # JSON viewer
    gron # make JSON greppable
    python3Packages.pgcli # PostgreSQL CLI with autocompletion
    sqlite # command-line SQLite client
    sqlite-web # web-based SQLite client
    tabiew # csv data viewer
  ];
}
