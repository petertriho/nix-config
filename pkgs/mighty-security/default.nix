{
  lib,
  pkgs,
}:
pkgs.python3Packages.buildPythonPackage {
  pname = "mighty-security";
  version = "0-unstable-2025-08-15";

  pyproject = true;

  src = pkgs.fetchFromGitHub {
    owner = "NineSunsInc";
    repo = "mighty-security";
    rev = "2d8892b98ac40781fa8820436b81ca26613c14f5";
    sha256 = "sha256-sdYnfTsQzEbhF3efJlXRpAvoH7hpl7hq0Tgtfoq1LHU=";
  };

  build-system = with pkgs.python3Packages; [
    setuptools
    wheel
  ];

  dependencies = with pkgs.python3Packages; [
    click
    rich
    python-dotenv
    aiofiles
    rapidfuzz
    fastapi
    uvicorn
    websockets
    # cerebras-cloud-sdk # Not available in nixpkgs
    # modal # Not available in nixpkgs
    python-multipart
    nest-asyncio
  ];

  # Skip tests for now as they contain intentionally malicious test cases
  doCheck = false;

  # Some dependencies may not be available in nixpkgs
  pythonRelaxDeps = [
    "cerebras-cloud-sdk"
    "modal"
  ];

  pythonRemoveDeps = [
    "cerebras-cloud-sdk"
    "modal"
  ];

  # The application expects to find its src directory relative to the main script
  # Copy the entire source tree to share directory and create a wrapper script
  postInstall = ''
    # Create the application directory structure
    mkdir -p $out/share/mighty-security

    # Copy all source files
    cp -r src $out/share/mighty-security/ || true
    cp -r examples $out/share/mighty-security/ || true
    cp -r mcp_test_cases $out/share/mighty-security/ || true
    cp -r hooks $out/share/mighty-security/ || true
    cp -r docs $out/share/mighty-security/ || true
    cp scan_config.json $out/share/mighty-security/ || true

    # Copy the main mighty_mcp.py to the share directory and create a proper wrapper
    cp mighty_mcp.py $out/share/mighty-security/

    # Replace the installed mighty-mcp script with a wrapper that sets up the environment
    rm -f $out/bin/mighty-mcp
    cat > $out/bin/mighty-mcp << 'EOF'
    #!/usr/bin/env python3
    import sys
    import os
    from pathlib import Path

    # Find the mighty-security share directory
    share_dir = Path(__file__).parent.parent / "share" / "mighty-security"

    # Change working directory and set up paths
    if share_dir.exists():
        os.chdir(str(share_dir))
        sys.path.insert(0, str(share_dir))

    # Run the mighty_mcp.py script directly
    if __name__ == "__main__":
        exec(open(str(share_dir / "mighty_mcp.py")).read())
    EOF
    chmod +x $out/bin/mighty-mcp
  '';

  meta = with lib; {
    description = "Unified security framework for Model Context Protocol (MCP) servers";
    longDescription = ''
      A comprehensive security analysis tool that protects against malicious MCP
      (Model Context Protocol) servers and tools. Provides multi-layer analysis
      including static analysis, taint analysis, ML-powered detection, and optional
      LLM deep analysis for semantic understanding.
    '';
    homepage = "https://github.com/NineSunsInc/mighty-security";
    license = licenses.mit;
    mainProgram = "mighty-mcp";
    platforms = platforms.all;
  };
}
