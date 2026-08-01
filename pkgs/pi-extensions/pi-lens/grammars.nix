let
  standardGrammar = filename: sha256: {
    inherit filename sha256;
    npmPackage = "tree-sitter-wasms";
    version = "0.1.13";
    url = "https://unpkg.com/tree-sitter-wasms@0.1.13/out/${filename}";
  };

  overrideGrammar =
    {
      filename,
      npmPackage,
      version,
      sha256,
    }:
    {
      inherit
        filename
        npmPackage
        version
        sha256
        ;
      url = "https://unpkg.com/${npmPackage}@${version}/${filename}";
    };
in
[
  (standardGrammar "tree-sitter-bash.wasm" "807dcdb1380a59befb112ed8fbd3d3872c7fadaf5903a769282b50973b30696d")
  (standardGrammar "tree-sitter-c.wasm" "056b25072382f72deee2c64ec238ffc4bb8cf42844ef21502c0e70f03a8a0d66")
  (standardGrammar "tree-sitter-c_sharp.wasm" "6266a7e32d68a3459104d994dc848df15d5672b0ea8e86d327274b694f8e6991")
  (standardGrammar "tree-sitter-cpp.wasm" "f6afdf53bfd6de76557bb7edb624a3a3869e14d9a83b78433f93617ecee42527")
  (standardGrammar "tree-sitter-css.wasm" "5fc615467b1b98420ed7517e5bf9e1f88468132dd903d842dfb13714f6a1cb0c")
  (standardGrammar "tree-sitter-dart.wasm" "7f5364e4256cf7e55efd01dd52421ef2663caa8061b82659b7e4bf61064545ec")
  (standardGrammar "tree-sitter-elixir.wasm" "82e91b9759ddca30d8978ebbfa8e347b4451b64c931f9ae62112e6db9b8fac20")
  (standardGrammar "tree-sitter-go.wasm" "9963ca89b616eaf04b08a43bc1fb0f07b85395bec313330851f1f1ead2f755b6")
  (standardGrammar "tree-sitter-html.wasm" "11b3405c1543fb012f5ed7f8ee73125076dce8b168301e1e787e4c717da6b456")
  (standardGrammar "tree-sitter-java.wasm" "637aac4415fb39a211a4f4292d63c66b5ce9c32fa2cd35464af4f681d91b9a1f")
  (standardGrammar "tree-sitter-javascript.wasm" "63812b9e275d26851264734868d27a1656bd44a2ef6eb3e85e6b03728c595ab5")
  (standardGrammar "tree-sitter-json.wasm" "fdb5219abe058369e16897aaa11eecf47ef4f546752c3ddbac339cdd89e1e667")
  (standardGrammar "tree-sitter-kotlin.wasm" "b5cb00c8d06ed0f10f1dbe497205b437809d7e87db1f638721a8cfb30e044449")
  (overrideGrammar {
    filename = "tree-sitter-lua.wasm";
    npmPackage = "@tree-sitter-grammars/tree-sitter-lua";
    version = "0.4.1";
    sha256 = "6d95607fc7d78964cfdf065ccb1ba76be5ed217c5ec0d0a3cace13c59fa1ae43";
  })
  (standardGrammar "tree-sitter-ocaml.wasm" "60849b6320ee956233d77b017c65c45660e507d03ae70aa1bd5783458e2e9e18")
  (standardGrammar "tree-sitter-php.wasm" "55bb617b6f01e14bab997861f0b20a2420cf6ba3199ffeb295b9ec398966d8a3")
  (standardGrammar "tree-sitter-python.wasm" "9056d0fb0c337810d019fae350e8167786119da98f0f282aceae7ab89ee8253b")
  (standardGrammar "tree-sitter-ruby.wasm" "93a5022855314cdb45458c7bb026a24a0ebc3a5ff6439e542e881f14dfa13a39")
  (standardGrammar "tree-sitter-rust.wasm" "4409921a70d0aa5bec7d1d7ce809a557a8ee1cf6ace901e3ac6a76e62cfea903")
  (standardGrammar "tree-sitter-swift.wasm" "41c4fdb2249a3aa6d87eed0d383081ff09725c2248b4977043a43825980ffcc7")
  (standardGrammar "tree-sitter-toml.wasm" "7849ac8ce9d10a4684ca189ea8ad3654c20c38acb2d674a014a164398cbd37a2")
  (standardGrammar "tree-sitter-tsx.wasm" "6aa3b2c70e76f5d48eafef1093e9c4de383e13f2fdde2f4e9b98a378f6a8f1b6")
  (standardGrammar "tree-sitter-typescript.wasm" "8515404dceed38e1ed86aa34b09fcf3379fff1b4ff9dd3967bcd6d1eb5ac3d8f")
  (standardGrammar "tree-sitter-vue.wasm" "6244521bb3fb60f34ce5f677f2af81facb2c38691193985ca5fa85e1b6f29250")
  (overrideGrammar {
    filename = "tree-sitter-yaml.wasm";
    npmPackage = "@tree-sitter-grammars/tree-sitter-yaml";
    version = "0.7.1";
    sha256 = "e752dc21c3591df9b45692fe417d101f45d1828c28c44d79005f4066dc7e4e91";
  })
  (standardGrammar "tree-sitter-zig.wasm" "59cc4531aa661e2de4c5bc04e4045b6bdd5d2bfa75045cbda5f673102d140eef")
]
