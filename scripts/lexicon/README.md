# 新聞 jieba 詞典與介面

## 安裝與執行

在 repository 根目錄執行；本機與 CI 使用同一份 requirements 和隨庫字典：

```sh
python3 -m venv .venv-news
.venv-news/bin/python -m pip install --require-hashes -r requirements-news.txt
```

Node 依序選擇 `NEWS_PYTHON`、repository 的 `.venv-news/bin/python`、`python3`。
`NEWS_PYTHON` 是執行檔路徑，不是 shell 命令；指定的 Python 失敗後不再嘗試其他 Python。
字典路徑依腳本位置解析，不受工作目錄影響。每篇文章只啟動一個子程序處理 title 與 body。
切詞過程不存取網路；使用 Python `-I -B`，jieba 的暫存檔放在每次執行的私有臨時目錄並清除。

```js
import { tokenizeArticle } from "./scripts/news_tokenizer.mjs";

const article = {
  title: "🚗依托咪酯與酒測",
  body: "乘客持有依托咪酯，駕駛唾液快篩未檢出；酒測為0。\r\n  未知詞𠮷",
};
const tokens = await tokenizeArticle(article);
console.table(tokens.fields.title);
console.table(tokens.fields.body);
for (const field of ["title", "body"]) {
  if (tokens.fields[field].map(t => t.text).join("") !== article[field] ||
      !tokens.fields[field].every(t => article[field].slice(t.start, t.end) === t.text)) {
    throw new Error("原文或 UTF-16 offset 未完整保留");
  }
}
```

以上可貼入 `node --input-type=module`。預期 title 的 `🚗` 是 `[0,2)`、
`依托咪酯` 是 `[2,6)`；body 的 `乘客` 是 `person_role`，`駕駛` 是 `driving`，
`唾液快篩` 是 `drug_test`，`酒測` 是 `alcohol_test`，`未檢出` 是 `negation`。

## 契約

`export async function tokenizeArticle(article)` 回傳：

```js
{
  engine: "jieba",
  version: "0.42.1",
  dictionaryHash: "<64 lowercase SHA-256 hex characters>",
  hmm: false,
  fields: {
    title: [{ text: "🚗", start: 0, end: 2, kind: null, canonical: null }],
    body: []
  }
}
```

`title` 與 `body` 必須都是字串，空字串合法。兩者合計上限為 100,000 個 JS UTF-16 code units。
多餘 article 欄位不傳入子程序。offset 各自從該欄位的 0 開始，end 不包含結尾；
不做 NFC/NFKC、繁簡轉換、trim 或空白合併。所有空白、換行、標點和未知字詞均保留。
emoji 序列可以有多個 token，保證的是 UTF-16 原文切片與完整還原，不是 grapheme 邊界。
不在領域詞典的 token，`kind` 與 `canonical` 均為 null；canonical 只附加標記，不改寫 text。

輸出 maxBuffer 為 32 MiB，子程序逾時為 60 秒。輸入、版本、詞典、checksum、子程序、
輸出格式或上限失敗均 reject/throw；上層必須停止更新，不能 catch 後退回舊 regex 繼續發布。
錯誤只有固定訊息與 `NEWS_TOKENIZER_*` code，沒有文章內容、原始 stderr、Python 路徑或 traceback。

## 來源與重現

- `dict.txt.big`：jieba 官方 `extra_dict/dict.txt.big`，隨庫保存 8,583,143 bytes。
  固定 tag `v0.42.1`、commit `1e20c89b66f56c9301b0feed211733ffaa1bd72a`。
  [固定原始檔](https://raw.githubusercontent.com/fxsjy/jieba/1e20c89b66f56c9301b0feed211733ffaa1bd72a/extra_dict/dict.txt.big)。
  SHA-256：`b16011275c42955ccd81fc1adecc93a59dbb7926af69d93fc95d4943d40f6aad`。
- MIT 授權完整保留於 `LICENSE.jieba`；`manifest.json` 紀錄來源、commit、長度、字典與 license checksum。
  同目錄 `.gitattributes` 固定上游 bytes 與 JSON 換行，避免跨平台 checkout 改變 checksum/hash。
- `domain.json` 是人工維護的可追溯來源檔：逐詞列 `text`、`kind`、`canonical`、`sources`。
  官方詞名參考法務部反毒大本營、警政署和我的 E 政府；專案歸類、別字、簡稱與否定用語另標
  `project-editorial`，不把專案整理宣稱為官方標註。來源完整 URL、查閱日期與使用範圍均在 JSON 內。
- 每次先校驗基底字典，再以 `jieba.Tokenizer.add_word(text, freq=frequency)` 載入 domain JSON，
  固定 `cut_all=False, HMM=False`。不需要維護另一份易漂移的產生式詞典。
- `dictionaryHash = SHA256(b"jieba-news-dictionary-v1\0" + dict.txt.big 原始 bytes + b"\0" + domain.json 原始 bytes)`。
  修改領域詞、canonical、kind、頻率或來源會改變 hash；修詞時要一併檢查來源及實際斷詞結果。
- `requirements-news.txt` 固定 jieba 0.42.1 與 PyPI source archive SHA-256，沒有模型 API 或 HMM 依賴下載。

## 主線接線

`scripts/news_understanding.mjs` 的 `understandArticle` 已由主線改為 async，
透過 `await tokenizeArticle(article)` 取得結果，實際消費 `drug` 與 `alcohol_test` 詞彙，
並在 sentence/evidence 保留原文區間。所有呼叫點都必須 await；CI 執行前也必須完成上述安裝。
主線及 CI 檔案由主線工作維護，本次 tokenizer 實作沒有修改它們。

人物/事件判讀應實際消費相關原文區間內的 `tokens.fields.title/body`：
`drug` 是物質或俗稱提及，`drug_test` 是檢測用語，`drug_driving` 是毒駕提及；
`alcohol_test`、`alcohol` 與 `alcohol_driving` 提供酒測/飲酒/酒駕線索。
例如用 `tokens.fields.body.filter(t => t.kind === "drug")` 取得 canonical 與原文位置，
再依人物、否定、檢測對象與時間範圍判讀；不能只把 tokens 附加到輸出而繼續忽略詞典。
乘客持有毒品不能直接成為駕駛施用證據，拒測不能當陽性，俗稱也不能證明實際成分。

主線目前按原文區間選取 tokens，再轉為句內相對位置。後續若變更句子清理，仍須保留原文區間
或建立明確映射，不能把 tokenizer offset 直接套用在空白合併或刪除記者署名後的文字。
