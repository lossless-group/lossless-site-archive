{
  inputs = {
    nixpkgs.url = "nixpkgs";

    flake-parts = {
      url = "github:hercules-ci/flake-parts";
      inputs.nixpkgs-lib.follows = "nixpkgs";
    };

    # Development tooling
    devshell = {
      url = "github:numtide/devshell";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Editor support
    helix.url = "github:helix-editor/helix";
    neovim-nightly.url = "github:nix-community/neovim-nightly-overlay";

    # Rust tooling
    rust-overlay = {
      url = "github:oxalica/rust-overlay";
      inputs.nixpkgs.follows = "nixpkgs";
    };

    # Node.js version manager
    nvm = {
      url = "github:nvm-sh/nvm";
      flake = false;
    };
  };
  
  outputs = inputs@{ self, nixpkgs, flake-parts, devshell, helix, neovim-nightly, rust-overlay, ... }: 
    flake-parts.lib.mkFlake { inherit inputs; } {
    systems = [ "x86_64-linux" "aarch64-linux" "aarch64-darwin" "x86_64-darwin" ];

    imports = [
      ./flake-modules/devshell.nix
      ./flake-modules/rust.nix
      ./flake-modules/nodejs-devshell.nix
      ./flake-modules/editors.nix
      ./flake-modules/vscode.nix
      ./docs/flake-module.nix
    ];

    perSystem = { config, self', inputs', pkgs, system, ... }: {
      # Add overlays
      _module.args.pkgs = import nixpkgs {
        inherit system;
        overlays = [
          rust-overlay.overlays.default
          neovim-nightly.overlay
        ];
      };

      devshells.default = {
        packages = with pkgs; [
          # Version Control
          git
          gh # GitHub CLI

          # Shell and Terminal
          zsh
          fish
          ghostty
          warp

          # Editors
          helix.packages.${system}.default
          neovim
          windsurf

          # Languages and Runtimes
          (rust-bin.stable.latest.default.override {
            extensions = [ "rust-src" "rust-analyzer" ];
          })
          nodejs_20
          nodePackages.pnpm
          
          # Build tools
          cmake
          gnumake
          ninja
          cargo-audit      # Security auditing
          cargo-watch     # Watch mode for cargo
          cargo-expand    # Macro expansion
          cargo-edit      # Add/remove dependencies
          cargo-outdated  # Check for outdated dependencies
          cargo-release   # Release automation

          # Development tools
          ripgrep
          fd
          fzf
          jq
          yq
          tmux
          tree
          
          # Package managers
          homebrew

          # Additional recommended tools
          direnv      # Environment management
          starship    # Shell prompt
          delta       # Better git diffs
          bat        # Better cat
          exa        # Better ls
          htop       # Process viewer
          duf        # Disk usage
          aha        # Better tree output
          superfile  # Better file management
        ];

        env = [
          {
            name = "RUST_SRC_PATH";
            value = "${pkgs.rust-bin.stable.latest.default}/lib/rustlib/src/rust/library";
          }
          {
            name = "EDITOR";
            value = "hx"; # Set Helix as default editor
          }
        ];
      };
    };

    flake = {
      # your existing definitions before using flake-parts...
    };
  };
}