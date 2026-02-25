{ pkgs, ... }:
{
  home.packages = with pkgs; [
    # csvkit # command-line CSV toolkit
    csvlens # command-line CSV viewer and transformer
    duckdb # SQL OLAP db management system
    python3Packages.faker # fake data generation library
    fx # JSON viewer
    gron # make JSON greppable
    python3Packages.pgcli # PostgreSQL CLI with autocompletion
    rainfrog # Database TUI
    sqlit-tui # Database TUI
    sqlite # command-line SQLite client
    sqlite-web # web-based SQLite client
    tabiew # csv data viewer
    zsv # fast CSV command-line toolkit
  ];
}
