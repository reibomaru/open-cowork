# ビジネスサイド ユースケース 業務フロー仮説一覧

## 概要

営業チーム含むビジネスサイドへのヒアリングで得られたユースケースについて、現時点での業務フロー仮説・不明用語・追加ヒアリング優先度を整理したドキュメント。

---

## 1. 業務フロー仮説一覧

| # | ユースケース | 想定業務フロー（仮説） | 関連システム | 自動化ポイント | 確信度 |
|---|---|---|---|---|---|
| 1 | **来館予約システムの実行** | ①来館日時・目的を決定 → ②予約システムにログイン → ③空き状況確認 → ④予約情報入力（日時・人数・目的・来館者情報） → ⑤上長承認（必要な場合） → ⑥予約確定 → ⑦来館者へ案内メール送付 | 来館予約システム（社内Web?）、メール | フォーム入力・空き検索・メール送付 | 中 |
| 2 | **SystemaFlowの操作** | ①ワークフロー申請画面を開く → ②申請種別を選択 → ③必要項目を入力 → ④添付書類をアップロード → ⑤承認ルートを確認 → ⑥申請実行 | SystemaFlow（ワークフローシステム?） | 申請フォーム入力・書類添付 | **低**（要確認） |
| 3 | **異動時の必要手続き** | ①異動辞令受領 → ②各種システムの所属変更申請（人事・AD・メール・Teams等） → ③旧部署での権限削除申請 → ④新部署での権限付与申請 → ⑤座席・備品の移動手配 → ⑥関係者への通知 | 人事システム、AD、各業務システム、メール | チェックリスト提示・各システムへの申請代行 | 中 |
| 4 | **入社時の必要手続き** | ①入社者情報受領 → ②アカウント作成申請（AD/メール/各システム） → ③PCセットアップ手配 → ④座席・備品手配 → ⑤セキュリティカード発行申請 → ⑥初期研修案内 → ⑦Teams/配布リスト追加 | 人事システム、AD、IT資産管理、各業務システム | チェックリスト提示・各システムへの申請代行 | 中 |
| 5 | **SAPでの交通費申請** | ①交通経路・金額を確認 → ②SAPにログイン → ③交通費申請画面を開く → ④日付・経路・金額・目的を入力 → ⑤領収書添付（必要時） → ⑥申請実行 → ⑦上長承認待ち | SAP（FI/CO or Concur連携?） | 経路検索・金額算出・フォーム入力 | 中 |
| 6 | **SAP(Concur)での経費申請** | ①経費情報整理（日付・金額・科目・目的） → ②Concurにログイン → ③経費レポート作成 → ④各経費項目を入力 → ⑤領収書画像アップロード → ⑥経費科目を選択 → ⑦申請実行 | SAP Concur | レシート読取(OCR)・科目自動判定・フォーム入力 | 中〜高 |
| 7 | **Teamsへのメンバー追加** | ①追加対象者の情報確認 → ②対象Teamsチーム/チャネルを特定 → ③Teams管理画面 or PowerShellでメンバー追加 → ④追加完了通知 | Microsoft Teams（Graph API） | メンバー追加API実行 | 高 |
| 8 | **自店検査・自己点検** | ①点検項目チェックリスト取得 → ②各項目を現場確認・回答入力 → ③証跡（写真・書類）添付 → ④点検結果レビュー → ⑤報告書作成・提出 → ⑥是正事項のフォローアップ | 点検管理システム（社内?）、Excel? | チェックリスト提示・回答入力支援・報告書作成 | **低**（要確認） |
| 9 | **労務管理・作業工数報告** | ①日次/週次で作業内容・工数を整理 → ②勤怠/工数管理システムにログイン → ③プロジェクト・タスク別に工数入力 → ④上長承認 → ⑤月次集計・報告 | 勤怠システム、工数管理システム（SAP?社内?） | 工数データ入力・集計・報告書生成 | 中 |
| 10 | **定例報告（ID棚卸し）** | ①対象システムのID一覧を抽出 → ②在籍者リストと突合 → ③不要ID（退職者・異動者）を特定 → ④削除/無効化申請 → ⑤結果報告書作成 | AD、各業務システム、人事システム | ID抽出・突合・差分レポート生成 | 中〜高 |
| 10b | **定例報告（情報機器棚卸し）** | ①管理台帳から機器一覧を取得 → ②各機器の現物確認（所在・利用者） → ③台帳との差異を記録 → ④差異是正（紛失報告・台帳修正） → ⑤報告書作成・提出 | IT資産管理システム、Excel? | 台帳データ抽出・差異レポート生成 | 中 |
| 10c | **定例報告（外部委託先評価）** | ①評価項目・基準を確認 → ②委託先のSLA実績データ収集 → ③評価シート記入 → ④スコアリング・総合評価 → ⑤報告書作成・提出 | 評価管理シート（Excel?）、SLA管理ツール | データ収集・スコア算出・報告書生成 | 中 |

---

## 2. 不明用語・要確認事項

| 用語/項目 | 仮説 | 確認すべき内容 |
|---|---|---|
| **SystemaFlow** | 社内ワークフローシステム（稟議・各種申請の電子承認基盤）。「Systema」は金融機関向けの業務基盤製品の可能性あり | ①正式名称とベンダー ②どんな申請に使うか（汎用?特定業務?） ③API/RPA連携の可否 ④ログイン方式（SSO?） |
| **自店検査・自己点検** | 銀行業務における**コンプライアンス/内部統制の定期点検**。金融庁ガイドラインに基づく自主検査の可能性が高い（事務ミス・不正防止のチェック） | ①点検の頻度（月次?四半期?） ②点検項目数と種類 ③現行の記録方法（紙?Excel?専用システム?） ④証跡の種類 |
| **来館予約システム** | 社屋への外部来訪者の受付予約、または会議室予約の可能性もあり。銀行の場合、セキュリティゲート連携があり得る | ①「来館」は顧客来店?社外者の本社来訪? ②既存システムの名称・URL ③予約に必要な情報項目 |
| **SAP vs Concur の関係** | SAPの経費管理モジュールとしてConcurを利用。交通費はSAP直接、その他経費はConcur経由の可能性 | ①交通費と一般経費で申請経路が異なるか ②Concurのモバイル利用状況 ③承認フローの段数 |
| **勤怠/工数管理システム** | 勤怠（出退勤）と工数報告（プロジェクト別作業時間）が別システムの可能性。SAPのHR/PSモジュール or 別の専用システム | ①勤怠と工数は同一システム? ②入力頻度（日次/週次/月次） ③システム名称 |

---

## 3. 追加ヒアリング優先度

| 優先度 | ユースケース | 理由 |
|---|---|---|
| **高** | SystemaFlowの操作 | システム自体の正体が不明。汎用ワークフロー基盤なら多くのユースケースの共通基盤になり得る |
| **高** | 自店検査・自己点検 | 業務内容の具体像が不明。金融特有の規制対応なら要件が厳格 |
| **高** | 入社時の必要手続き | 頻度が高い（事務派遣の出入りが激しい）ため、ROIが高い。具体的な手続き一覧が必要 |
| **中** | SAP交通費/Concur経費 | 業務フローは比較的想像がつくが、SAP/Concurの画面操作方式（API? RPA? ブラウザ操作?）で実装難度が大きく変わる |
| **中** | 定例報告系 | 3種とも「データ収集→突合→レポート生成」パターン。データソースの詳細が必要 |
| **低** | Teamsメンバー追加 | Graph APIで実現可能性が高く、業務フローもシンプル |

---

## 4. 横断的な気づき

- **SystemaFlowが鍵**: もしこれが汎用ワークフロー基盤なら、異動手続き・入社手続き・各種申請の多くがSystemaFlow経由の可能性がある。共通Skill/Toolになり得る
- **SAP系は実装難度が高い**: SAP/ConcurはAPI公開が限定的なことが多く、RPA（ブラウザ操作）が必要になる可能性がある
- **「チェックリスト＋代行実行」パターン**: 異動・入社・自店検査は「やるべきことリスト提示 → 各システムで代行実行」という共通パターン
- **定例報告は「データ収集→突合→レポート生成」パターン**: 3つとも同じアーキテクチャで対応できる可能性

---

## 5. 関連システム 非ブラウザインターフェース調査

各ユースケースに登場するシステム/SaaSについて、ブラウザ直接操作以外で利用可能なインターフェース（API、CLI、SDK、MCP等）を調査した結果。

### 5-1. 既知SaaS/プロダクト

| システム | REST API | CLI | SDK | MCP サーバー | RPA対応 | その他の自動化手段 | エージェント連携しやすさ |
|---|---|---|---|---|---|---|---|
| **SAP ERP (FI/CO)** | OData V2/V4 あり（SAP Gateway経由）。S/4HANAではJournal Entry、Cost Center、Profit Center等のAPIをAPI Business Hubで公開 | SAP BTP CLI (`btp`)、SAP CAP CLI (`cds`)。ただしFI/CO直接操作用ではない | SAP Cloud SDK (Java/JS)、**PyRFC** (Python→RFC)、**node-rfc** (Node.js→RFC) | コミュニティ実装あり（非公式、2025年時点で登場段階） | UiPath SAP専用コネクタ、Power Automate SAP ERPコネクタ (RFC/BAPI経由)。SAP GUI Scripting経由のRPAも主流 | **BAPI** (例: `BAPI_ACC_DOCUMENT_POST`で伝票転記)、**RFC**、**IDoc** (EDI連携)、SAP GUI Scripting | **中〜低**: オンプレはBAPI/RFC経由が現実的。S/4HANAクラウドならOData APIで容易 |
| **SAP Concur** | **あり（充実）**。Expense Report v4、Quick Expense v4、Travel Request v4、Receipts v4、Users v4等。OAuth 2.0認証。ベースURL: `us.api.concursolutions.com` | 公式CLIなし | 公式SDKなし（REST APIを直接呼び出し）。コミュニティ製Node.js/Pythonラッパーあり | 公式/コミュニティとも未確認 | UiPath Concur専用パッケージ、SAP Build Process Automation、Power Automate/Zapier コネクタ | **Event Subscription Service** (Webhook)でイベントリアルタイム受信、**SFTP**で一括インポート/エクスポート、Concur Connect (App Center) | **高**: REST APIが充実。経費レポート作成・申請の自動化が可能。Webhook対応もあり |
| **Microsoft Teams** | **あり（Graph API）**。`/teams`, `/channels`, `/members`, `/chats`, `/onlineMeetings` 等の豊富なエンドポイント | **Microsoft 365 CLI** (`m365`、クロスプラットフォーム)、**Teams PowerShell** (`MicrosoftTeams` モジュール) | **Microsoft Graph SDK** (`msgraph-sdk` Python / `@microsoft/microsoft-graph-client` JS / Java / C#)、**Bot Framework SDK** (Node.js/C#/Python) | コミュニティ製 `microsoft-graph` MCPサーバーが複数あり。Graph API経由でTeams操作可能 | UiPath/Automation Anywhere コネクタ、Power Automate Desktop 標準搭載 | Power Automate コネクタ（メッセージ投稿・チャネル作成・承認フロー・アダプティブカード）、Logic Apps、Webhook、Bot Framework | **極高**: Graph API + CLI + SDK + MCPと全方位でインターフェースが揃っている |
| **Active Directory (オンプレAD)** | 直接REST APIなし（Entra IDはGraph API経由） | **PowerShell** (`ActiveDirectory` モジュール)、`dsquery`/`dsmod`等のコマンドラインツール | LDAP SDK各種 (Python: `ldap3`、Node.js: `ldapjs`) | コミュニティ実装あり（非公式） | UiPath/Power Automate 対応あり | **LDAP** プロトコル（標準的な読み書きインターフェース） | **中**: PowerShell/LDAP経由で操作可能だが、オンプレ環境へのアクセス経路確保が課題 |
| **Microsoft Entra ID (旧Azure AD)** | **あり（Graph API）**。`/users`, `/groups`, `/applications` 等 | **Azure CLI** (`az ad`)、**Microsoft Graph CLI** (`mgc`)、**PowerShell** (`Microsoft.Graph` モジュール) | **Microsoft Graph SDK** (Python/JS/Java/C#) | Microsoft 365 MCP対応（上述Teams同様） | UiPath/Power Automate 対応あり | SCIM プロビジョニング、Azure Logic Apps | **高**: Graph API経由でユーザー/グループ管理が自動化可能 |
| **Microsoft Excel** | **あり（Graph API）**。`/drive/items/{id}/workbook` でExcel Onlineのセル読み書き・テーブル操作が可能 | 公式Excel専用CLIなし。`mgc`（Graph CLI）経由で間接利用可能 | **Python**: `openpyxl`, `xlsxwriter`, `pandas`。**Node.js**: `exceljs`, `sheetjs`。**.NET**: `EPPlus`, `ClosedXML` | コミュニティ実装あり（`excel-mcp-server`等。非公式） | UiPath/Power Automate 対応あり | VBA（デスクトップ版）、Office Scripts（Excel on the web、TypeScript）、Power Automate「Excel Online」コネクタ | **高**: ローカルファイルはライブラリ直接操作、OnlineはGraph API。どちらも自動化容易 |

### 5-2. 社内/不明システム（要ヒアリング）

| システム | 現時点での推測 | 確認すべきインターフェース情報 |
|---|---|---|
| **来館予約システム** | 社内Webアプリケーション。API公開は不明 | ①API/Webhookの有無 ②DB直接アクセスの可否 ③SSOの仕組み ④RPA（ブラウザ操作）で代替可能か |
| **SystemaFlow** | ワークフロー製品。ベンダー不明 | ①製品名・ベンダー確認 ②REST API/SOAP APIの有無 ③外部連携機能の有無 ④DB直アクセスの可否 |
| **人事システム** | SAP HCM or 専用システム | ①システム名 ②API/データエクスポート機能の有無 ③マスタデータ連携方式 |
| **勤怠/工数管理システム** | 専用SaaS or 社内システム | ①システム名・ベンダー ②API公開状況 ③CSV/Excel入出力の可否 |
| **点検管理システム** | 社内システム or Excel管理 | ①専用システムの有無 ②Excel管理の場合のファイル格納場所 ③入力インターフェース |
| **IT資産管理システム** | SKYSEA, LanScope等の可能性 | ①システム名 ②API/CSVエクスポート機能 ③台帳データの取得方法 |
| **SLA管理ツール** | Excel or 専用ツール | ①管理方法（ツール名 or Excel） ②データ取得方法 |

### 5-3. エージェント連携方式の推奨アプローチ

| 連携方式 | 適用システム | メリット | デメリット |
|---|---|---|---|
| **REST API直接呼び出し** | Concur、Teams(Graph API)、Entra ID、Excel Online | 安定・高速・監査証跡が残しやすい | API公開範囲に制約あり。認証トークン管理が必要 |
| **SDK/ライブラリ利用** | Excel(openpyxl等)、AD(ldap3) | 型安全・エラーハンドリングが容易 | 言語依存。ローカル実行環境が必要 |
| **CLI/PowerShell経由** | Teams(m365 CLI)、AD(PowerShell)、Azure(az cli) | スクリプト連携が容易。既存運用資産を活用可能 | Windows環境依存（PowerShell系）。エラーハンドリングが煩雑 |
| **MCP サーバー経由** | Teams/M365（公式対応）、Excel(コミュニティ) | LLMエージェントとの親和性が最も高い | 公式対応が限定的。コミュニティ実装は品質にばらつき |
| **RPA（ブラウザ操作）** | SAP GUI、来館予約、SystemaFlow等のAPI未公開システム | API未公開でも自動化可能 | 脆弱（UI変更で破損）、低速、メンテコスト高 |
| **BAPI/RFC（SAP固有）** | SAP ERP (FI/CO) | SAP内部の業務ロジックに直接アクセス可能 | SAP専門知識が必要。接続設定が複雑 |

### 5-4. 認証方式・インストール・ドキュメントリンク詳細

#### SAP ERP (FI/CO) 関連

| インターフェース | 認証方式 | インストール | 公式ドキュメント |
|---|---|---|---|
| **SAP OData API (Gateway)** | Basic認証、OAuth 2.0 (NW 7.40 SP08+)、SAP Logon Ticket、X.509証明書、SAML 2.0 Bearer | SAP Gateway有効化（サーバー側設定） | [SAP API Business Hub](https://api.sap.com/) / [SAP Gateway ドキュメント](https://help.sap.com/docs/SAP_NETWEAVER_AS_ABAP_752) |
| **PyRFC** | SAP RFC認証 (`user`/`passwd`)、SNC (X.509/Kerberos)、SAP Logon Ticket | `pip install pyrfc` ※[SAP NW RFC SDK](https://support.sap.com/en/product/connectors/nwrfcsdk.html)が前提（S-User要） | [GitHub](https://github.com/SAP/PyRFC) / [ドキュメント](https://sap.github.io/PyRFC/) |
| **node-rfc** | SAP RFC認証、SNC、SAP Logon Ticket | `npm install node-rfc` ※SAP NW RFC SDK が前提 | [GitHub](https://github.com/SAP/node-rfc) / [ドキュメント](https://sap.github.io/node-rfc/) |
| **SAP Cloud SDK** | Basic、OAuth 2.0 (CC/AuthCode/SAML Bearer/JWT)、Principal Propagation、X.509 | Java: Maven (`com.sap.cloud.sdk:sdk-bom`) / JS: `npm install @sap-cloud-sdk/http-client @sap-cloud-sdk/connectivity` | [公式ドキュメント](https://sap.github.io/cloud-sdk/) / [GitHub (JS)](https://github.com/SAP/cloud-sdk-js) / [GitHub (Java)](https://github.com/SAP/cloud-sdk-java) |
| **SAP BTP CLI** | SAP Universal ID / S-User SSO（ブラウザベース `btp login`） | [SAP Development Tools](https://tools.hana.ondemand.com/#cloud) からバイナリDL | [BTP CLI ドキュメント](https://help.sap.com/docs/btp/sap-business-technology-platform/btp-cli) / [コマンドリファレンス](https://help.sap.com/docs/btp/btp-cli-command-reference/btp-cli-command-reference) |
| **UiPath SAP Connector** | SAP GUI ログオン資格情報、SSO対応 | UiPath Studio から SAP アクティビティパッケージ追加 | [UiPath SAP自動化](https://docs.uipath.com/activities/other/latest/productivity/sap) / [概要](https://www.uipath.com/solutions/technology/sap-automation) |
| **Power Automate SAP Connector** | Basic認証、Windows認証、Azure AD (OAuth 2.0)、SNC。オンプレミスデータゲートウェイ経由 | Power Automate上でコネクタ追加 + [オンプレミスゲートウェイ](https://learn.microsoft.com/en-us/data-integration/gateway/service-gateway-install) | [SAP ERPコネクタ](https://learn.microsoft.com/en-us/connectors/saperp/) / [SAP ODataコネクタ](https://learn.microsoft.com/en-us/connectors/sapodata/) / [SAP統合ガイド](https://learn.microsoft.com/en-us/power-automate/sap-integration/overview) |

#### SAP Concur 関連

| インターフェース | 認証方式 | インストール | 公式ドキュメント |
|---|---|---|---|
| **Concur REST API** | OAuth 2.0 (Authorization Code / Password Grant / Client Credentials + Company JWT) | なし（HTTPクライアントで直接呼び出し） | [開発者ポータル](https://developer.concur.com/) / [OAuth 2.0](https://developer.concur.com/api-reference/authentication/apidoc.html) / [Getting Started](https://developer.concur.com/api-reference/authentication/getting-started.html) |
| **Event Subscription Service** | 登録時: OAuth 2.0トークン、受信時: JWT検証（Concur公開鍵） | Webhook受信サーバーを自前構築 | [ESS ドキュメント](https://developer.concur.com/api-reference/ess/v4.event-subscription.html) / [Event Topics](https://developer.concur.com/event-topics/) |
| **Power Automate コネクタ** | OAuth 2.0 (Authorization Code) | Power Automate上でコネクタ追加 | [コネクタリファレンス](https://learn.microsoft.com/en-us/connectors/concur/) |
| **Zapier コネクタ** | OAuth 2.0 | Zapier上でアプリ追加 | [Zapier Concur統合](https://zapier.com/apps/concur/integrations) ※サポート状況要確認 |
| **SAP Build Process Automation** | SAP BTP Destination経由 OAuth 2.0 | SAP BTP上でセットアップ | [ドキュメント](https://help.sap.com/docs/build-process-automation) / [SAP Discovery Center](https://discovery-center.cloud.sap/) で「Concur」検索 |

#### Microsoft Teams / Entra ID / Graph API 関連

| インターフェース | 認証方式 | インストール | 公式ドキュメント |
|---|---|---|---|
| **Microsoft Graph API** | OAuth 2.0: **Delegated** (Authorization Code / Device Code / OBO) または **Application** (Client Credentials + Secret/証明書)。Azure ADアプリ登録が必要 | なし（HTTPクライアントで直接呼び出し） | [認証概要](https://learn.microsoft.com/en-us/graph/auth/) / [App-only](https://learn.microsoft.com/en-us/graph/auth-v2-service) / [Delegated](https://learn.microsoft.com/en-us/graph/auth-v2-user) / [アプリ登録](https://learn.microsoft.com/en-us/graph/auth-register-app-v2) |
| **Microsoft 365 CLI (`m365`)** | Device Code、証明書、Client Secret、ブラウザ対話認証 | `npm install -g @pnp/cli-microsoft365` | [公式ドキュメント](https://pnp.github.io/cli-microsoft365/) / [インストール](https://pnp.github.io/cli-microsoft365/user-guide/installing-cli/) / [認証](https://pnp.github.io/cli-microsoft365/user-guide/connecting-microsoft-365/) / [npm](https://www.npmjs.com/package/@pnp/cli-microsoft365) |
| **Teams PowerShell** | 対話的ログイン、サービスプリンシパル（証明書）、アクセストークン指定 | `Install-Module -Name MicrosoftTeams -Force` | [インストール](https://learn.microsoft.com/en-us/microsoftteams/teams-powershell-install) / [概要](https://learn.microsoft.com/en-us/microsoftteams/teams-powershell-overview) / [PSGallery](https://www.powershellgallery.com/packages/MicrosoftTeams) |
| **Graph SDK Python** | `azure-identity` の各Credential (ClientSecret / InteractiveBrowser / DeviceCode / Certificate) | `pip install msgraph-sdk azure-identity` | [PyPI](https://pypi.org/project/msgraph-sdk/) / [GitHub](https://github.com/microsoftgraph/msgraph-sdk-python) / [ドキュメント](https://learn.microsoft.com/en-us/graph/sdks/sdk-installation#install-the-microsoft-graph-python-sdk) |
| **Graph SDK JavaScript** | MSAL / `azure-identity` の TokenCredentialAuthenticationProvider | `npm install @microsoft/microsoft-graph-client @azure/identity` | [npm](https://www.npmjs.com/package/@microsoft/microsoft-graph-client) / [GitHub](https://github.com/microsoftgraph/msgraph-sdk-javascript) / [ドキュメント](https://learn.microsoft.com/en-us/graph/sdks/sdk-installation#install-the-microsoft-graph-javascript-sdk) |
| **Azure CLI (`az ad`)** | 対話的ログイン、サービスプリンシパル (Secret/証明書)、マネージドID、Device Code | macOS: `brew install azure-cli` / Linux: `curl -sL https://aka.ms/InstallAzureCLIDeb \| sudo bash` | [インストール](https://learn.microsoft.com/en-us/cli/azure/install-azure-cli) / [認証](https://learn.microsoft.com/en-us/cli/azure/authenticate-azure-cli) / [az ad](https://learn.microsoft.com/en-us/cli/azure/ad) |
| **Microsoft.Graph PowerShell** | 対話的、サービスプリンシパル（証明書/Secret）、マネージドID | `Install-Module Microsoft.Graph -Scope CurrentUser` | [インストール](https://learn.microsoft.com/en-us/powershell/microsoftgraph/installation) / [認証](https://learn.microsoft.com/en-us/powershell/microsoftgraph/authentication-commands) / [PSGallery](https://www.powershellgallery.com/packages/Microsoft.Graph) |
| **Bot Framework SDK** | Azure Bot Service経由。AppId/AppPassword。Teams SSO対応 | JS: `npm install botbuilder` / Python: `pip install botbuilder-core` / C#: `dotnet add package Microsoft.Bot.Builder` | [概要](https://learn.microsoft.com/en-us/azure/bot-service/bot-service-overview) / [JS](https://learn.microsoft.com/en-us/azure/bot-service/javascript/bot-builder-javascript-quickstart) / [Python](https://learn.microsoft.com/en-us/azure/bot-service/python/bot-builder-python-quickstart) / [認証](https://learn.microsoft.com/en-us/azure/bot-service/bot-builder-authentication) |

#### Active Directory (オンプレ) 関連

| インターフェース | 認証方式 | インストール | 公式ドキュメント |
|---|---|---|---|
| **AD PowerShell** | Kerberos（ドメイン参加PCの資格情報を自動使用）、`-Credential`で明示指定も可 | Win Server: `Install-WindowsFeature RSAT-AD-PowerShell` / Win10/11: `Add-WindowsCapability -Online -Name Rsat.ActiveDirectory.DS-LDS.Tools~~~~0.0.1.0` | [モジュールリファレンス](https://learn.microsoft.com/en-us/powershell/module/activedirectory/) / [Get-ADUser](https://learn.microsoft.com/en-us/powershell/module/activedirectory/get-aduser) / [RSATインストール](https://learn.microsoft.com/en-us/troubleshoot/windows-server/system-management-components/remote-server-administration-tools) |
| **ldap3 (Python)** | Simple Bind (user/password)、NTLM、SASL (GSSAPI/Kerberos)、Anonymous | `pip install ldap3` | [PyPI](https://pypi.org/project/ldap3/) / [ドキュメント](https://ldap3.readthedocs.io/) / [GitHub](https://github.com/cannatag/ldap3) |
| **ldapjs (Node.js)** | Simple Bind、Anonymous。SASL は限定的 | `npm install ldapjs` | [npm](https://www.npmjs.com/package/ldapjs) / [ドキュメント](http://ldapjs.org/) / [GitHub](https://github.com/ldapjs/node-ldapjs) |

#### Excel 関連

| インターフェース | 認証方式 | インストール | 公式ドキュメント |
|---|---|---|---|
| **Graph API (Excel Online)** | OAuth 2.0 (Delegated / Application) ※上記Graph APIと同一 | なし（HTTPクライアント） | 上記 Graph API と同一 |
| **openpyxl (Python)** | 不要（ローカルファイル操作） | `pip install openpyxl` | [PyPI](https://pypi.org/project/openpyxl/) / [ドキュメント](https://openpyxl.readthedocs.io/) |
| **exceljs (Node.js)** | 不要（ローカルファイル操作） | `npm install exceljs` | [npm](https://www.npmjs.com/package/exceljs) / [GitHub](https://github.com/exceljs/exceljs) |
| **Office Scripts** | Microsoft 365ライセンス（Excel on the web内で実行） | 追加インストール不要 | 要確認 |

#### MCP サーバー

| MCPサーバー | 認証方式 | インストール | リポジトリ |
|---|---|---|---|
| **Excel MCP Server (Python版)** | 不要（ローカルファイル操作） | `uvx excel-mcp-server stdio` | [GitHub](https://github.com/haris-musa/excel-mcp-server) (3,720 stars) |
| **Excel MCP Server (Node.js版)** | 不要（ローカルファイル操作） | `npx --yes @negokaz/excel-mcp-server` | [GitHub](https://github.com/negokaz/excel-mcp-server) (927 stars) / [npm](https://www.npmjs.com/package/@negokaz/excel-mcp-server) |
| **Microsoft Graph MCP** | Device Code Flow (Azure AD) | `pip install -r requirements.txt` | [GitHub](https://github.com/marlonluo2018/microsoft_graph_mcp_server) |
| **SAP MCP一覧** | 各サーバーにより異なる | 各リポジトリ参照 | [SAP AI MCP Servers一覧](https://github.com/marianfoo/sap-ai-mcp-servers) (210 stars) |
| **SAP OData MCP Bridge** | SAP OData認証（Basic/OAuth） | Go バイナリ | [GitHub](https://github.com/oisee/odata_mcp_go) (127 stars) |
| **SAP GUI MCP Server** | SAP GUI ログオン資格情報 | Python | [GitHub](https://github.com/mario-andreschak/mcp-sap-gui) (101 stars) |
| **HANA MCP Server** | HANA DB認証 | Python | [GitHub](https://github.com/HatriGt/hana-mcp-server) (49 stars) |

> **注意**: URLはすべて2025年5月時点の知識に基づいています。SAP Help Portal / Microsoft Learnのサイトリニューアルによりパスが変更される可能性があるため、アクセスできない場合は各ポータルのトップページから検索してください。PyRFC / node-rfc は **SAP NW RFC SDK** が前提であり、S-Userアカウント（SAPライセンス）がないとダウンロードできません。
