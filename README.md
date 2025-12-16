# Splatoon Point Counter

<p align="center">
  OBS向けのリアルタイム・データオーバーレイ・システム
</p>

<p align="center">
  <img src="https://github.com/eddie-splatoon/splatoon-point-counter/blob/main/docs/assets/demo.png" width="1400px">
</p>

## 概要

**Splatoon Point Counter** は、ライブストリーミング（特にOBS Studioでの利用）をリッチにするためのリアルタイム・データオーバーレイ・システムです。Next.jsで構築されており、ストリーマーがコントロールパネルからスコアやメッセージ、各種データをリアルタイムで更新し、それを配信画面上のオーバーレイに反映させることができます。

## 主な機能

本システムは、主に以下の4つの画面で構成されています。

### 1. ランチャー

アプリケーションの起点となるページです。ここからコントロールパネルや各オーバーレイ画面を新しいタブで開くことができます。

<img width="1428" height="598" alt="image" src="https://github.com/user-attachments/assets/f8a72585-30dd-4012-875e-07ac057045de" />

### 2. コントロールパネル

ストリーマーがオーバーレイに表示するデータを操作するための管理画面です。タブ形式で各機能を直感的にコントロールできます。

- **スコア表示**: メインスコアのラベルや値を更新します。
- **バーンダウン**: 目標値に対する進捗（例: ポイント、視聴者数など）を管理します。
- **メッセージ**: オーバーレイに表示するスクロールメッセージを複数プリセットから選択・管理します。
- **共通設定**: オーバーレイ全体のフォントや、音声認識によるエフェクト（「ナイス！」などのキーワードでハートを表示）の有効/無効を切り替えます。

<img width="1428" height="743" alt="image" src="https://github.com/user-attachments/assets/602c7504-c7ae-4834-b7ca-901b0de2dc69" />

### 3. スコア＆メッセージオーバーレイ

コントロールパネルで設定されたスコアとメッセージを配信画面に表示するためのオーバーレイです。OBSのブラウザソースにURLを指定して使用します。

<img width="1428" height="598" alt="image" src="https://github.com/user-attachments/assets/25e33768-1037-4ce0-98fc-76cd400953f0" />

### 4. バーンダウンチャートオーバーレイ

特定の目標（例: 配信時間、目標登録者数）に対する進捗をグラフとプログレスバーで可視化する専用オーバーレイです。目標達成時には花火のエフェクトが表示されます。

<img width="1428" height="598" alt="image" src="https://github.com/user-attachments/assets/d55824e2-017c-419d-b5d6-e9b981c00146" />



## 技術スタック

- **フレームワーク**: [Next.js](https://nextjs.org/) 14+ (App Router)
- **言語**: TypeScript
- **UI/スタイリング**: Material-UI (MUI), Tailwind CSS
- **リアルタイム通信**: REST API (クライアントからのポーリング)
- **テスト**: Vitest, React Testing Library
- **CI/CD**: GitHub Actions

## セットアップと起動方法

### ローカル環境での起動

1.  依存関係をインストールします。
    ```bash
    npm install
    ```

2.  開発サーバーを起動します。
    ```bash
    npm run dev
    ```

3.  ブラウザで `http://localhost:3000` を開きます。

### Dockerでの起動

1.  Dockerイメージをビルドします。
    ```bash
    docker-compose build
    ```

2.  コンテナを起動します。
    ```bash
    docker-compose up
    ```
3.  ブラウザで `http://localhost:3000` を開きます。

## CI/CD

このリポジトリでは、GitHub Actionsを利用してCI/CDパイプラインを構築しています。

- **CI (継続的インテグレーション)**: `main`または`staging`ブランチへのプルリクエスト時、および`main`ブランチへのプッシュ時に、Lintとテストが自動的に実行されます。
- **CD (継続的デリバリー)**: `main`ブランチへのマージをトリガーとして、Dockerイメージがビルドされ、Docker HubおよびGitHub Container Registryに自動的にプッシュされます。
