FROM node:22-alpine AS base
RUN corepack enable
WORKDIR /app

# ── dev: ローカル開発用 (docker compose up server) ──
# src/ は volume mount で提供し、--watch でファイル変更時に自動再起動する。
FROM base AS dev
# bash: Alpine base には無く、Bash tool が heredoc 等の bash 構文を生成しても
#       /bin/sh では失敗するため明示的に追加する (`SHELL=/bin/bash` を併用)。
# chromium 系: PDF エクスポート API (Playwright headless) に必要。
#   PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1 で playwright が自動 DL するのを止め、
#   Alpine system の /usr/bin/chromium-browser を使う。
# 共通スキル (docx / markdown / pdf / pptx / web-research / xlsx) 用:
#   python3 + py3-pip: 各スキルの Python スクリプト実行
#   libreoffice:       docx/pptx/xlsx → PDF 変換、トラッキングチェンジ承認、
#                      Excel 数式再計算（soffice headless）に必要
#   pandoc:            docx ↔ Markdown 変換、web-research の HTML → Markdown 抽出
#   poppler-utils:     pdftoppm / pdftotext / pdfinfo（PDF → 画像 / テキスト）
#   curl:              web-research スキルが URL の HTML を取得するため
#   font-noto-cjk:     LibreOffice が日本語を含むドキュメントを描画するため
# pip (公式 anthropics/skills から移植したスクリプトの依存):
#   python-pptx / python-docx / openpyxl / pandas: Office ファイルの読み書き・集計
#   lxml / defusedxml:  office/validate.py の OOXML スキーマ検証
#   pypdf / pdfplumber / pdf2image: pdf スキルのテキスト/表抽出・結合分割・ページ画像化
#                                   (pdf2image は poppler-utils を利用)
#   markitdown:         docx/pptx/xlsx → Markdown のテキスト抽出
RUN apk add --no-cache libgcc libstdc++ ripgrep bash curl \
    chromium nss freetype harfbuzz ca-certificates ttf-freefont font-noto \
    python3 py3-pip \
    libreoffice pandoc poppler-utils \
    font-noto-cjk \
    && pip install --no-cache-dir --break-system-packages \
        python-pptx \
        python-docx \
        openpyxl \
        pandas \
        Pillow \
        lxml \
        defusedxml \
        pypdf \
        pdfplumber \
        pdf2image \
        'markitdown[pptx,docx,xlsx]' \
    && npm install -g docx pptxgenjs
# pptx / docx skill が workdir で生成する `node script.js` から
# `require("pptxgenjs")` / `require("docx")` を解決可能にするため、
# グローバル node_modules を NODE_PATH に通す。
# ESM 解決には影響せず、ローカル node_modules が常に優先されるため、
# /app/server の dev サーバには副作用がない。
ENV NODE_PATH=/usr/local/lib/node_modules
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium-browser
COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY client/package.json client/
COPY server/package.json server/
COPY server/tsconfig.json server/
RUN pnpm install --frozen-lockfile \
    && chown -R node:node /app
USER node
WORKDIR /app/server
EXPOSE 3000
CMD ["node", "--import", "tsx/esm", "--watch", "src/index.ts"]
