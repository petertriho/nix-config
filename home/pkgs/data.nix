{ pkgs, ... }:
{
  home.packages = with pkgs; [
    csvkit # command-line CSV toolkit
    duckdb # SQL OLAP db management system
    python3Packages.faker # fake data generation library
    fx # JSON viewer
    gron # make JSON greppable
    python3Packages.pgcli # PostgreSQL CLI with autocompletion
    sqlite # command-line SQLite client
    sqlite-web # web-based SQLite client
    tabiew # csv data viewer
    zsv # fast CSV command-line toolkit
  ];
}
