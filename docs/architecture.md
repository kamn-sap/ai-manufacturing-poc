# PoC 構成と機能

## 構成

| 領域 | 技術・用途 |
| --- | --- |
| Frontend | React 19、Vite、React Router。文書ライブラリ、ナレッジアシスタント、設計レビュー |
| API / Worker | Express 5、JWT保護API、SQS long polling worker |
| オブジェクト | AWS Emulator上のS3。署名付きPUT/GET URL |
| メタデータ・認証 | AWS Emulator上のDynamoDB（Documents、ReviewSessions、ReviewFindings。ローカル認証時のみUsers）またはAmazon Cognito User Pool |
| 全文検索 | SQLite FTS5 trigram tokenizer。ベクトル検索は行わない |
| 回答生成 | `LLM_PROVIDER=mock`（決定的テンプレート）または `ollama`（loopback/private IP上のOllama）。外部推論サービスへの接続は対象外 |

Providerの選択は起動時の環境設定で行い、LLMと認証は小さなProvider factoryを使います。検索は`createSearchProvider(database)`で索引DBを注入できます。保存/キューはAWS SDKを使い、`AWS_REGION`、`AWS_ENDPOINT_URL`、各AWSリソース設定でEmulatorまたは実AWSを選択します。現時点で検索ProviderはSQLite、保存/キューProviderはAWSのみです。別製品への入れ替えには対応実装とデータ移行が必要で、設定値だけで切り替わるわけではありません。

AWS Emulatorの導入・利用方法は[Emulator GitHub](https://github.com/aws/aws-emulator)と[AWS Emulatorドキュメント](https://docs.aws.amazon.com/ja_jp/emulator/)を参照してください。

## 文書登録と検索

ログイン後、文書ライブラリでTXT、Markdown、PDF、DOCX、XLSXを選びます。APIが短時間有効のS3署名付きURLを払い出し、ブラウザーが直接アップロードします。登録完了後に `doc-ingest-queue` へメッセージを送り、workerがテキストを抽出してチャンク化し、SQLite FTS5へ登録します。取り込み状態はDynamoDBで管理します。

ナレッジアシスタントはFTS5の検索ヒットだけを根拠に回答と引用元を表示します。ヒットがない場合は資料を確認できない旨を返し、推測で補完しません。質問への評価はSQLiteに記録します。

## ログインとユーザー登録

`AUTH_PROVIDER=local`（既定）ではログインAPIがDynamoDB `Users` テーブルのscryptハッシュを照合し、ローカルJWTを発行します。`pnpm aws:init` は `.env` の `AUTH_USERNAME` / `AUTH_PASSWORD`、または `AUTH_USERS_JSON` を登録します。

`AUTH_PROVIDER=cognito` ではAmazon Cognito User Poolの `USER_PASSWORD_AUTH` を使い、APIがID tokenを検証します。`COGNITO_REGION`、`COGNITO_USER_POOL_ID`、`COGNITO_CLIENT_ID` を設定し、Cognitoアプリクライアントでこの認証フローを有効にしてください。ユーザーはCognito側で作成・管理し、`pnpm aws:init` はDynamoDB `Users` を作成・seedしません。MFA等の追加チャレンジを返すアプリクライアントは現行ログイン画面では完了できず、追加認証が必要な旨を返します。これは試し運用向けの接続であり、公開運用前にMFA/Hosted UI、アカウント復旧、レート制限、監査要件を決めてください。

いずれの認証Providerでも各ユーザーのログイン状態はブラウザーごとに独立しますが、現状の文書・レビュー領域は共有ワークスペースです。Cognitoを導入しても文書単位の権限分離が自動で追加されるわけではありません。

## 設計レビュー

レビュー対象は取り込み済み文書です。Mock AIが確認観点、指摘候補、品質リスク、テスト観点、根拠箇所を返します。生成結果は常に候補状態で保存し、担当者が採用・却下・修正を記録するまでは確定指摘として扱いません。

## ローカルLLM

試し運用では `LLM_PROVIDER=ollama` を指定し、`OLLAMA_BASE_URL` と `OLLAMA_MODEL` でOllamaを選択します。既定URLは `http://127.0.0.1:11434` です。Ollamaは同じEC2上、またはプライベートネットワーク内で実行し、インターネットへ公開しないでください。公開ホスト名を指定した場合は設定エラーになります。モデル出力の引用箇所は生成させず、検索で取得した文書チャンクだけを引用として返します。モデルの品質・応答時間・必要メモリ・費用は実文書を外部へ送らない評価環境で確認してください。

`LLM_PROVIDER=mock` は従来どおり既定値です。Ollamaを選択する場合、指定モデルを事前に取得し、`OLLAMA_TIMEOUT_MS` でリクエスト上限時間を設定します。

## ローカル起動

Docker DesktopまたはDocker Engine、Node.js 26+、pnpm 12+が利用できる場合は、次の簡易起動を推奨します。

```sh
pnpm dev:local
```

`pnpm dev:local` はDockerでAWS Emulatorを起動し、ホスト側で依存関係確認・リソース初期化・画面/API/worker起動を行います。終了時は `Ctrl+C` でEmulatorコンテナも停止します。

初回起動では `.env.example` から `.env` を作成します。開発用の認証情報を確認し、ローカル開発以外では使用しないでください。AWS EmulatorのDynamoDB/S3/SQSリソースはメモリ上にあり、コンテナ停止時に消去されます。Emulatorが生成するcredential/config/CAファイルは `~/.aws/emulator/` に残ります。

手動で起動する場合は次の手順を使います。

1. Node.js 26+ と pnpm 12+、AWS Emulatorを用意します。Linux/Docker起動時の既定endpointは `https://127.0.0.1:9297` です。
2. Emulatorが生成するcredential/config/CAファイルのパスを確認し、`.env.example` を `.env` にコピーして `AWS_SHARED_CREDENTIALS_FILE`、`AWS_CONFIG_FILE`、`AWS_CA_BUNDLE` を設定します。SDKが証明書を信頼するようCA bundleを読み込みます。実AWSの `AWS_ACCESS_KEY_ID`、`AWS_SECRET_ACCESS_KEY`、`AWS_SESSION_TOKEN`、`AWS_PROFILE` が環境に設定されている場合は外してください。ブラウザーから署名付きURLを使う場合は、EmulatorのCA証明書をOS/ブラウザー側でも信頼させてください。JWT secretとログインパスワードも必ず変更してください。
3. 依存関係をインストールし、`pnpm aws:init` でAWSリソースを初期化します。
4. `pnpm dev` でAPI/画面を起動し、別ターミナルで `pnpm worker` を起動します。
5. `.env` のユーザー名とパスワードでログインします。初期値は開発用のみ `operator` / `change-me` です。

このPoCはS3、DynamoDB、SQSのサービスを自身では起動しません。AWS Emulatorの起動方法とSDK設定は[公式Getting Started](https://docs.aws.amazon.com/emulator/latest/userguide/getting-started.html)および[SDK接続手順](https://docs.aws.amazon.com/emulator/latest/userguide/point-sdk-to-emulator.html)を参照してください。EmulatorはAWSサービスへ接続せず、SDKの既定endpointもEmulatorに向けています。

## 検証

- `pnpm test`: 取り込み分割、FTS検索、Mock LLM、認証境界のユニット/APIテスト
- `pnpm lint`: backend、frontend、スクリプト、E2Eの静的検査
- `pnpm test:e2e`: Playwrightでログイン、複数ユーザーの独立セッション、文書アップロードから根拠表示まで、レビュー候補の人手判断を検証（外部APIは決定的なテストダブル）

E2E用Mockは文書ストレージやLLMの挙動をネットワークへ接続せず再現します。AWS Emulatorとの実接続確認は `pnpm aws:init` とworkerを使う実行環境で行います。

## GitHub Actions / Pages

`.github/workflows/app-validation.yml` は `workflow_dispatch`、アプリ関連ファイルのpush、対象PRでユニットテスト・lint・Playwright E2Eを実行します。default branchの実行では、結果ダッシュボードとPlaywright HTML reportをGitHub Pagesへデプロイします。E2Eレポートには全テストの録画動画を添付し、テストごとの詳細画面から再生できます。その他のブランチ/PRでは同じレポートをActions artifact（30日保持）として保存します。

GitHubリポジトリの **Settings → Pages → Build and deployment → Source** を **GitHub Actions** に設定してください。失敗した検証でもレポートを公開してからworkflowを失敗扱いにします。

## 対象外と安全上の注意

OCR、動画文字起こし、図面解析、ベクトル検索、Bedrock等の外部推論サービス、複雑な承認フローは対象外です。AIの出力は参考情報です。安全に関わる作業は承認済みの原文と現場の安全手順を確認し、設計の最終判断は人が行ってください。
