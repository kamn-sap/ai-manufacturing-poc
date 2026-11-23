# AI Manufacturing PoC

作業現場向けの「AI作業標準書アシスタント」と「AI駆動設計レビュー支援」のPoCです。現状の機能・構成・ローカル実行・検証手順は [docs/architecture.md](./docs/architecture.md) を参照してください。

## 構成

| パス | 内容 |
| --- | --- |
| `frontend/` | React/Viteの認証付き文書ライブラリ、ナレッジアシスタント、設計レビュー |
| `backend/src/routes/` | JWT保護された文書・検索・レビューAPIと署名付きファイルURL |
| `backend/src/services/` | TXT/Markdown/PDF/DOCX/XLSXの抽出、チャンク化、FTS5索引 |
| `backend/src/workers/` | SQS long pollingによる非同期文書取り込み |
| `backend/src/lib/` | AWS Emulator、ローカル/Cognito認証、SQLite FTS5、Mock/Ollama LLM provider |
| `scripts/` | AWS EmulatorのDynamoDB/S3/SQSリソース初期化、ローカル起動 |
| `docker/aws-emulator/` | ローカル開発用AWS Emulatorコンテナ |
| `fixtures/` | E2Eで利用する機密情報を含まない作業標準書・FAQ・設計書 |
| `e2e/` | 文書登録から根拠表示まで、設計レビュー、人の判断記録、複数ユーザーの独立ログインを検証するPlaywrightシナリオ |
| `docs/` | アーキテクチャと運用・安全上の注意 |
| `.github/workflows/` | 手動・アプリ変更時のUT/E2E/LintとGitHub Pagesレポート公開 |

## クイックスタート

Node.js 26+、pnpm 12+、AWS Emulator互換endpointが必要です。

```sh
pnpm install
cp .env.example .env
# .envのJWT_SECRET、AUTH_PASSWORD、AWS_ENDPOINT_URLを設定
pnpm aws:init
pnpm dev
```

別ターミナルで `pnpm worker` を起動します。`AUTH_PROVIDER=local` の場合、`pnpm aws:init` は `.env` のユーザーをAWS EmulatorのDynamoDB `Users` テーブルへパスワードハッシュで登録します。初期開発ログインは `operator` / `change-me` です。実行前に必ず `.env` の認証情報を変更してください。Cognitoを使う場合は `AUTH_PROVIDER=cognito` とUser Pool/Client IDを設定し、ユーザーはCognito側で管理します。ユーザーごとのログインセッションは分離され、文書・レビューは共有ワークスペースとして利用します。

### Dockerを使う簡易ローカル起動

Docker DesktopまたはDocker Engine、Node.js 26+、pnpm 12+があれば、AWS Emulatorも含めて一つのコマンドで起動できます。

```sh
pnpm dev:local
```

このコマンドは、初回のみ `.env` を作成し、依存関係をセットアップし、AWS Emulatorコンテナを起動し、リソース初期化後に画面・API・workerを起動します。ブラウザーでは <http://localhost:5173> を開きます。終了時はターミナルで `Ctrl+C` を押すと、アプリとEmulatorコンテナを停止します。

初回は `.env.example` から作成された `.env` の開発用認証情報を確認してください。AWS EmulatorのDynamoDB/S3/SQSリソースはメモリ上にあり、停止すると消去されます。Emulatorが生成するcredential/config/CAファイルは `~/.aws/emulator/` に保存されます。ローカル開発用途に限り、実AWSの認証情報は使用しません。

## チェック

```sh
pnpm test
pnpm lint
pnpm test:e2e
```

ベクトル検索、OCR、動画・図面解析、Bedrock等の外部推論サービスは含みません。`LLM_PROVIDER=ollama` を指定すると、loopback/private IP上のOllamaを利用できます（既定値はMock）。AI出力は参考情報であり、安全作業は承認済み原文の確認、設計指摘は担当者による採否が必要です。

GitHub Actionsは手動実行、またはアプリ関連ファイルのpush/PRで検証を実行します。default branchでは成功・失敗を含む検証結果をGitHub Pagesに公開し、E2Eレポート内で各テストの録画動画を参照できます。PR等のdefault branch以外の実行結果はActions artifactから確認できます。Pagesの公開先はリポジトリ設定でGitHub Actionsを有効にしてください。
