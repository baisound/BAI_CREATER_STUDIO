# Codex向け WebMCP 引継ぎ

`WEBMCP_SPEC_JA.md` を全文読むこと。`webmcp.js` はブラウザWebMCP用であり、CLI MCPとは異なる。
既存のFBX・PMX・VMD・JSONデータは削除せず、UI/APIを維持。`window.mixamoWebMcpDiagnostics` で登録結果を確認。
インスペクタでツール呼び出しから保存までのE2Eテストを行い、未対応ブラウザに対するフォールバックを保証する。
