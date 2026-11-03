#!/usr/bin/env python3
"""One article over stdin/stdout; dictionary and engine failures are fatal."""

import hashlib
import json
import logging
from pathlib import Path
import sys
import tempfile

VERSION = "0.42.1"
LEXICON = Path(__file__).resolve().parent / "lexicon"
MAX_UNITS = 100_000
MAX_INPUT_BYTES = MAX_UNITS * 6 + 128
MAX_OUTPUT_BYTES = 32 * 1024 * 1024


class TokenizerFailure(Exception):
    pass


def utf16_length(text):
    return len(text.encode("utf-16-le", errors="surrogatepass")) // 2


def read_article():
    try:
        raw = sys.stdin.buffer.read(MAX_INPUT_BYTES + 1)
        if len(raw) > MAX_INPUT_BYTES:
            raise ValueError()
        article = json.loads(raw.decode("utf-8"))
        if not isinstance(article, dict) or any(
            not isinstance(article.get(field), str) for field in ("title", "body")
        ):
            raise ValueError()
        if sum(utf16_length(article[field]) for field in ("title", "body")) > MAX_UNITS:
            raise ValueError()
        return article
    except (ValueError, UnicodeError, RecursionError):
        raise TokenizerFailure("INPUT") from None


def read_dictionaries():
    try:
        manifest = json.loads((LEXICON / "manifest.json").read_bytes())
        base = (LEXICON / "dict.txt.big").read_bytes()
        if manifest["schemaVersion"] != 1 or (
            hashlib.sha256(base).hexdigest() != manifest["files"]["dict.txt.big"]["sha256"]
            or len(base) != manifest["files"]["dict.txt.big"]["bytes"]
        ):
            raise ValueError()
        domain_bytes = (LEXICON / "domain.json").read_bytes()
        domain = json.loads(domain_bytes)
        if domain["schemaVersion"] != 1 or not domain["entries"]:
            raise ValueError()
        frequency = domain["frequency"]
        if type(frequency) is not int or frequency <= 0:
            raise ValueError()
        entries = {}
        for entry in domain["entries"]:
            if any(not isinstance(entry[key], str) or not entry[key]
                   for key in ("text", "kind", "canonical")):
                raise ValueError()
            if (any(c.isspace() for c in entry["text"]) or entry["text"] in entries
                    or not entry["sources"] or any(
                        source not in domain["sources"] for source in entry["sources"]
                    )):
                raise ValueError()
            entries[entry["text"]] = entry
        if not {"drug", "alcohol_test", "driving", "vehicle", "negation"}.issubset(
            {entry["kind"] for entry in entries.values()}
        ):
            raise ValueError()
        digest = hashlib.sha256(b"jieba-news-dictionary-v1\0" + base + b"\0" + domain_bytes).hexdigest()
        return entries, frequency, digest
    except Exception:
        raise TokenizerFailure("DICTIONARY") from None


def tokenize_field(tokenizer, text, entries):
    tokens = []
    source_offset = 0
    offset = 0
    for word in tokenizer.cut(text, cut_all=False, HMM=False):
        if not word or text[source_offset:source_offset + len(word)] != word:
            raise TokenizerFailure("OUTPUT")
        end = offset + utf16_length(word)
        entry = entries.get(word)
        tokens.append({"text": word, "start": offset, "end": end,
                       "kind": entry["kind"] if entry else None,
                       "canonical": entry["canonical"] if entry else None})
        source_offset += len(word)
        offset = end
    if source_offset != len(text):
        raise TokenizerFailure("OUTPUT")
    return tokens


def main():
    article = read_article()
    try:
        import jieba
        if jieba.__version__ != VERSION:
            raise ValueError()
        jieba.setLogLevel(logging.CRITICAL)
    except Exception:
        raise TokenizerFailure("ENGINE") from None
    entries, frequency, digest = read_dictionaries()
    # A private cache prevents jieba from trusting stale/shared marshal caches.
    # Both fields use the same initialized tokenizer; all assets are local.
    with tempfile.TemporaryDirectory(prefix="news-jieba-") as cache:
        try:
            tokenizer = jieba.Tokenizer(str(LEXICON / "dict.txt.big"))
            tokenizer.tmp_dir = cache
            tokenizer.initialize()
            for word in entries:
                tokenizer.add_word(word, freq=frequency)
        except Exception:
            raise TokenizerFailure("DICTIONARY") from None
        result = {"engine": "jieba", "version": VERSION, "dictionaryHash": digest,
                  "hmm": False, "fields": {
                      field: tokenize_field(tokenizer, article[field], entries)
                      for field in ("title", "body")
                  }}
    # ASCII JSON also preserves lone JS surrogates without lossy encoding.
    output = json.dumps(result, ensure_ascii=True, separators=(",", ":")).encode("ascii")
    if len(output) > MAX_OUTPUT_BYTES:
        raise TokenizerFailure("OUTPUT_LIMIT")
    sys.stdout.buffer.write(output + b"\n")


if __name__ == "__main__":
    try:
        main()
    except TokenizerFailure as error:
        sys.stderr.write(f"NEWS_TOKENIZER_{error.args[0]}\n")
        sys.exit(1)
    except Exception:
        # No traceback, article, paths or child exception messages in diagnostics.
        sys.stderr.write("NEWS_TOKENIZER_FAILED\n")
        sys.exit(1)
