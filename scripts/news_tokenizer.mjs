import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const SCRIPT = fileURLToPath(new URL("./tokenize_news.py", import.meta.url));
const LOCAL_PYTHON = fileURLToPath(new URL("../.venv-news/bin/python", import.meta.url));
const MAX_UNITS = 100_000;
const MAX_BUFFER = 32 * 1024 * 1024;
const MESSAGES = {
  INPUT: "Expected title and body strings totaling at most 100000 UTF-16 units.",
  PYTHON: "Required news Python executable is unavailable.",
  ENGINE: "Required jieba 0.42.1 is unavailable.",
  DICTIONARY: "Required news dictionaries could not be loaded or verified.",
  OUTPUT_LIMIT: "News tokenizer output exceeded its size limit.",
  TIMEOUT: "News tokenizer exceeded its execution time limit.",
  OUTPUT: "News tokenizer returned invalid output.",
  FAILED: "Required jieba tokenization failed.",
};

function failure(reason) {
  const error = new Error(MESSAGES[reason]);
  error.code = `NEWS_TOKENIZER_${reason}`;
  return error;
}

function validateResult(result, fields) {
  if (result?.engine !== "jieba" || result.version !== "0.42.1" || result.hmm !== false ||
      typeof result.dictionaryHash !== "string" || !/^[a-f0-9]{64}$/.test(result.dictionaryHash)) {
    throw failure("OUTPUT");
  }
  for (const field of ["title", "body"]) {
    const tokens = result.fields?.[field];
    if (!Array.isArray(tokens)) throw failure("OUTPUT");
    let offset = 0;
    for (const token of tokens) {
      if (!token || typeof token.text !== "string" || !token.text.length ||
          token.start !== offset || !Number.isInteger(token.end) || token.end <= offset ||
          fields[field].slice(token.start, token.end) !== token.text ||
          token.end !== offset + token.text.length ||
          !((token.kind === null && token.canonical === null) ||
            (typeof token.kind === "string" && token.kind.length > 0 &&
             typeof token.canonical === "string" && token.canonical.length > 0))) {
        throw failure("OUTPUT");
      }
      offset = token.end;
    }
    if (offset !== fields[field].length) throw failure("OUTPUT");
  }
  return result;
}

// Offsets are field-local JS UTF-16 indices, with an exclusive end. No cleaning
// or whitespace removal is allowed here; consumers slice the original article.
export async function tokenizeArticle(article) {
  if (!article || typeof article !== "object" || Array.isArray(article) ||
      typeof article.title !== "string" || typeof article.body !== "string" ||
      article.title.length + article.body.length > MAX_UNITS) throw failure("INPUT");
  const fields = { title: article.title, body: article.body };
  const python = process.env.NEWS_PYTHON ?? (existsSync(LOCAL_PYTHON) ? LOCAL_PYTHON : "python3");
  if (!python || python.includes("\0")) throw failure("PYTHON");

  const stdout = await new Promise((resolve, reject) => {
    // One subprocess for both fields. No shell, article text in argv, runtime
    // download, or fallback after a selected interpreter fails.
    const child = execFile(python, ["-I", "-B", SCRIPT], {
      encoding: "utf8", maxBuffer: MAX_BUFFER, timeout: 60_000,
      killSignal: "SIGKILL", windowsHide: true,
    }, (error, output, stderr) => {
      if (!error) { resolve(output); return; }
      let reason = "FAILED";
      if (error.code === "ENOENT" || error.code === "EACCES") reason = "PYTHON";
      else if (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER") reason = "OUTPUT_LIMIT";
      else if (error.killed) reason = "TIMEOUT";
      else {
        const code = stderr.trim();
        const known = Object.keys(MESSAGES).find((key) => code === `NEWS_TOKENIZER_${key}`);
        if (known) reason = known;
      }
      // Never attach child errors, stderr, stdout, paths, or the article as cause.
      reject(failure(reason));
    });
    child.stdin.on("error", () => reject(failure("FAILED")));
    child.stdin.end(JSON.stringify(fields));
  });
  let result;
  try { result = JSON.parse(stdout); } catch { throw failure("OUTPUT"); }
  return validateResult(result, fields);
}
