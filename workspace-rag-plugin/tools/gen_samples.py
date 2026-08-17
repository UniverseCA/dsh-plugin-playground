#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Generate sample PDF and DOCX files into 示例文档 for RAG testing."""
import os

from pypdf import PdfWriter
from pypdf.generic import DictionaryObject, NameObject, DecodedStreamObject, NumberObject
from docx import Document

BASE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "示例文档")
os.makedirs(BASE, exist_ok=True)


def build_pdf(path, pages):
    """pages: list of list-of-lines (ASCII only, Helvetica base font)."""
    writer = PdfWriter()
    font_ref = writer._add_object(DictionaryObject({
        NameObject("/Type"): NameObject("/Font"),
        NameObject("/Subtype"): NameObject("/Type1"),
        NameObject("/BaseFont"): NameObject("/Helvetica"),
    }))
    for lines in pages:
        page = writer.add_blank_page(width=612, height=792)
        ops = []
        y = 720
        for line in lines:
            esc = line.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
            ops.append("BT /F1 13 Tf 72 %d Td (%s) Tj ET\n" % (y, esc))
            y -= 22
        stream = DecodedStreamObject()
        stream.set_data(b"".join(op.encode("latin-1") for op in ops))
        content_ref = writer._add_object(stream)
        page[NameObject("/Contents")] = content_ref
        page[NameObject("/Resources")] = DictionaryObject({
            NameObject("/Font"): DictionaryObject({NameObject("/F1"): font_ref}),
        })
    with open(path, "wb") as f:
        writer.write(f)


def build_docx(path, paragraphs):
    doc = Document()
    for p in paragraphs:
        doc.add_paragraph(p)
    doc.save(path)


build_pdf(
    os.path.join(BASE, "RAG升级说明.pdf"),
    [
        [
            "Retrieval-Augmented Generation (RAG) Upgrade Notes",
            "",
            "This upgrade adds local semantic search to the workspace RAG plugin.",
            "Chunks are embedded with a multilingual transformer model and",
            "retrieved by cosine similarity, fused with BM25 lexical scores.",
            "",
            "The helper toolchain lives under tools/ in the workspace:",
            "pdf-parse extracts text from PDF files, mammoth extracts text",
            "from Word documents, and Transformers.js computes embeddings",
            "locally on CPU without any external API key.",
        ],
        [
            "Hybrid retrieval combines two rankings:",
            "",
            "1. BM25 lexical matching over tokens (English words plus CJK bigrams).",
            "2. Cosine similarity over dense embeddings (default model: e5-small).",
            "",
            "The final score is a weighted blend of the two, so a query",
            "matches both by exact wording and by meaning.",
        ],
    ],
)

build_docx(
    os.path.join(BASE, "项目周报.docx"),
    [
        "项目周报（第 12 周）",
        "本周完成了向量检索模块的开发，语义检索准确率明显提升。",
        "技术选型：使用本地多语言 embedding 模型，不依赖外部 API。",
        "性能数据：索引重建耗时 3 分钟，平均检索延迟约 200 毫秒。",
        "下周计划：接入更多文档格式（Excel、PPT），并优化切块粒度。",
        "风险提示：大文件切块数量过多时需要限流，避免内存占用过高。",
    ],
)

print("generated:", os.path.join(BASE, "RAG升级说明.pdf"))
print("generated:", os.path.join(BASE, "项目周报.docx"))