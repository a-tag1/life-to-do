# LifeToDo

予定・実績・目標を記録するオフライン対応PWAです。

## 現在のデータ保存方式

- ブラウザ内のIndexedDBにデータを保存
- Service Workerにより、アプリ本体はオフラインでも利用可能
- `exportAll()` / `restoreAll()` による全データのJSON入出力に対応
- SupabaseをPCとスマートフォン間の共有先として使用

## Supabase同期の実装方針

このアプリでは、端末内のIndexedDBをオフライン利用用に残しつつ、SupabaseをPCとスマートフォン間の共有先として使用します。

- 認証: メール認証を基本にし、Googleログインを追加
- 初回同期: Supabaseのクラウドデータを優先
- 端末内に未同期データがある場合: 上書き前に確認
- 競合処理: 初期版は最後に保存したデータを採用
- オフライン時: IndexedDBへ保存し、オンライン復帰後に同期

## ユーザー側で必要な作業

ここでいう「ユーザー側」とは、LifeToDoを使う人がSupabaseの管理画面やGoogle Cloud Consoleで行う設定を指します。アプリのソースコードを変更する作業は含みません。

### 1. Supabaseアカウントを作成する

1. [Supabase](https://supabase.com/)を開く
2. **Start your project** または **Sign in** を選ぶ
3. GitHubアカウントなどでSupabaseアカウントを作成する
4. ダッシュボードで **New project** を選ぶ
5. Organizationを選ぶ、または新しく作成する
6. Project nameに `life-todo` など任意の名前を入力する
7. Database Passwordを設定する
8. Regionは利用場所に近いリージョンを選ぶ
9. **Create new project** を押す

プロジェクトの作成完了まで数分かかる場合があります。Database Passwordは後からアプリに入力するものではなく、Supabase管理用のパスワードです。アプリやREADMEへ記載しません。

### 2. Project URLと公開キーを確認する

1. 作成したSupabaseプロジェクトを開く
2. 左下の **Project Settings** を開く
3. **API** を開く
4. **Project URL** をコピーする
5. **Project API keys** の公開キーをコピーする

使用するのは、画面上で `anon` または `publishable` と表示されている公開キーです。`service_role` または `secret` と表示されるキーは管理用のため使用しません。

LifeToDoの設定画面を開き、**Supabase同期** に次を入力します。

- Project URL: `https://xxxxx.supabase.co` の形式の値
- 公開キー: `anon` または `publishable` の公開キー

入力後、**Supabase設定を保存** を押します。URLやキーは自分のプロジェクトの値を使います。READMEやソースコードへ実際のキーを貼り付けないでください。

### 3. メール認証を有効にする

1. Supabaseダッシュボードで **Authentication** を開く
2. **Providers** または **Sign In / Providers** を開く
3. **Email** を選ぶ
4. Email providerを有効にする
5. 必要に応じてConfirm emailを有効にする
6. **Save** を押す

Confirm emailを有効にすると、登録後に確認メールが届くまでログインできません。確認メールを受信できるメールアドレスを使用してください。

本アプリでのメール登録手順は次のとおりです。

1. LifeToDoの設定画面でメールアドレスとパスワードを入力する
2. **メール登録** を押す
3. 受信した確認メールを開く
4. メール内の確認リンクを開く
5. LifeToDoへ戻り、同じメールアドレスとパスワードでログインする

メールが届かない場合は、迷惑メールフォルダ、入力したアドレス、Supabaseのメール設定を確認します。

### 4. Googleログインを設定する

Googleログインを使わない場合、この作業は不要です。メール認証だけでもアプリは利用できます。

#### 4-1. SupabaseでGoogle ProviderのCallback URLを確認する

1. Supabaseダッシュボードで **Authentication** を開く
2. **Providers** または **Sign In / Providers** を開く
3. **Google** を選ぶ
4. Supabase画面に表示される **Callback URL** または **Redirect URI** をコピーして控える

このURLは後でGoogle Cloud Consoleへ登録します。自分でURLを作らず、Supabase画面に表示されたURLをそのまま使います。

#### 4-2. Google CloudでOAuthクライアントを作成する

1. [Google Cloud Console](https://console.cloud.google.com/)を開く
2. プロジェクト選択欄からGoogleログイン用プロジェクトを選ぶ
3. プロジェクトがなければ新しいプロジェクトを作成する
4. **APIs & Services** から **OAuth consent screen** を開く
5. アプリ名、サポート用メールアドレス、Developer contact informationを入力する
6. 公開範囲を選択する
7. 必要に応じてテストユーザーへ自分のGoogleアカウントを追加する
8. **Credentials** を開く
9. **Create credentials** → **OAuth client ID** を選ぶ
10. Application typeは **Web application** を選ぶ
11. Authorized JavaScript originsに、LifeToDoの本番URLを登録する
12. Authorized redirect URIsに、Supabaseで控えたCallback URLを登録する
13. **Create** を押す
14. 表示されたClient IDとClient Secretを控える

開発用URLと本番URLが異なる場合は、必要なURLをそれぞれ登録します。URLの末尾のスラッシュ、`http` / `https`、ドメイン名が一致していないとログインに失敗します。

#### 4-3. SupabaseへGoogleの情報を登録する

1. SupabaseのGoogle Provider設定へ戻る
2. Google Providerを有効にする
3. Google Cloudで取得したClient IDを入力する
4. Client Secretを入力する
5. **Save** を押す

Googleログイン後にアプリへ戻るURLは、Supabaseの **URL Configuration** にも登録します。

### 5. 本番URLとリダイレクトURLを設定する

1. Supabaseダッシュボードで **Authentication** を開く
2. **URL Configuration** を開く
3. **Site URL** に本番のLifeToDo URLを入力する
4. **Redirect URLs** に、本番のLifeToDo URLを追加する
5. 開発時にlocalhostを使う場合は、開発用URLも追加する
6. **Save** を押す

例:

```text
Site URL
https://example.com/life-to-do/

Redirect URLs
https://example.com/life-to-do/
http://localhost:5500/
```

実際には自分がLifeToDoを公開しているURLを指定します。Googleログインでは、Supabase Providerに表示されたCallback URLと、アプリへ戻るRedirect URLは役割が異なります。両方をそれぞれ指定してください。

iPhoneでは、LINEなどのアプリ内ブラウザではなくSafariでLifeToDoを開きます。Safariでログインとリダイレクトを確認してから、Safariの共有メニューでホーム画面へ追加します。

### 6. データ同期テーブルを作成する

SupabaseのSQL Editorで次のSQLを実行します。テーブルにはユーザーごとのデータを保存し、Row Level Security（RLS）で本人以外が読めないようにします。

```sql
create table public.life_todo_data (
	user_id uuid primary key references auth.users(id) on delete cascade,
	data jsonb not null default '{}'::jsonb,
	updated_at timestamptz not null default now()
);

alter table public.life_todo_data enable row level security;

create policy "Users can read own LifeToDo data"
	on public.life_todo_data for select
	using (auth.uid() = user_id);

create policy "Users can insert own LifeToDo data"
	on public.life_todo_data for insert
	with check (auth.uid() = user_id);

create policy "Users can update own LifeToDo data"
	on public.life_todo_data for update
	using (auth.uid() = user_id)
	with check (auth.uid() = user_id);
```

データベースの作成やRLS設定を変更する場合は、アプリの指示やREADMEの最新版を確認してから実行します。RLSを無効にしたまま運用しないでください。

### 7. 初回ログイン時のデータを確認する

初めてログインする端末に、すでにIndexedDBのデータがある場合は注意が必要です。

- クラウドにデータがある場合: クラウドデータを優先する
- 端末だけにデータがある場合: クラウドへ移すか、破棄するか確認する
- 両方にデータがある場合: 上書き前に内容を確認する

大切なデータがある場合は、先に設定画面からJSONエクスポートを作成します。

### 8. PCとiPhoneで動作確認する

次の順番で確認します。

1. PCでアカウントを作成してログインする
2. PCでテスト用の予定を入力して同期する
3. iPhoneのSafariで同じアカウントにログインする
4. iPhoneでクラウドデータが表示されることを確認する
5. iPhoneから別の予定を入力して同期する
6. PCでiPhoneの変更が表示されることを確認する
7. iPhoneのSafariからホーム画面へ追加する
8. ホーム画面のPWAでもログイン状態と同期を確認する

### 9. オフライン動作を確認する

- オンライン中にログインしておく
- 通信を切って予定を入力する
- 通信を戻す
- オンライン復帰後に同期されることを確認する

オフライン中にブラウザのサイトデータを削除した場合、IndexedDBの未同期データは復元できない可能性があります。重要な記録は定期的にJSONエクスポートしてください。

## 競合時の注意

初期版では、PCとスマートフォンで同じデータを同時に編集した場合、最後に保存されたデータを採用します。先に保存した変更が後から上書きされる場合があります。

同じ日付を複数端末で同時に編集する場合は、入力を終えてから同期するか、片方の端末だけで編集してください。将来、日付単位や項目単位での競合解決が必要になった場合は、同期方式の拡張が必要です。

## ユーザー側の運用上の注意

- Supabaseのアカウント情報を他人と共有しない
- `service_role`キーやデータベースパスワードを公開しない
- 認証メールのリンクを他人へ転送しない
- 重要なデータは定期的にJSONエクスポートする
- PCとiPhoneで別のメールアドレスを使わない
- Googleログインとメール認証で別アカウントを作らない
- PWAを削除・再インストールする前に同期完了を確認する
- ブラウザのサイトデータを削除する前にバックアップする

## 実装後に確認する項目

- メール登録、メール確認、ログイン、ログアウトができる
- パスワード再設定ができる
- Googleログインとログアウトができる
- PCとiPhoneで同じアカウントのデータが共有される
- 初回同期時に端末データの上書き確認が表示される
- オフライン中の入力がオンライン復帰後に同期される
- 別アカウントのデータが表示されない
- SafariとiPhoneのPWAの両方で認証できる
- JSONエクスポートからデータを復元できる
