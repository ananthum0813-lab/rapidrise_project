import mimetypes
from typing import BinaryIO


_PDF = b"%PDF-"
_PNG = b"\x89PNG\r\n\x1a\n"
_JPG = b"\xff\xd8\xff"
_GIF87 = b"GIF87a"
_GIF89 = b"GIF89a"
_WEBP_RIFF = b"RIFF"
_WEBP = b"WEBP"
_ZIP = b"PK\x03\x04"
_GZIP = b"\x1f\x8b"
_MP3_ID3 = b"ID3"
_WAV_RIFF = b"RIFF"
_WAV = b"WAVE"
_MP4_FTYP = b"ftyp"


def _peek_head(file_obj: BinaryIO, size: int = 8192) -> bytes:
    pos = file_obj.tell()
    head = file_obj.read(size) or b""
    file_obj.seek(pos)
    return head


def detect_mime_type(uploaded_file) -> str:
    """
    Best-effort server-side MIME detection from file signature/content.
    Falls back to extension and then to browser-provided content_type.
    """
    head = _peek_head(uploaded_file, 8192)
    lower_name = (getattr(uploaded_file, "name", "") or "").lower()

    if head.startswith(_PDF):
        return "application/pdf"
    if head.startswith(_PNG):
        return "image/png"
    if head.startswith(_JPG):
        return "image/jpeg"
    if head.startswith(_GIF87) or head.startswith(_GIF89):
        return "image/gif"
    if len(head) >= 12 and head.startswith(_WEBP_RIFF) and head[8:12] == _WEBP:
        return "image/webp"
    if head.startswith(_ZIP):
        if lower_name.endswith(".docx"):
            return "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        if lower_name.endswith(".xlsx"):
            return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        if lower_name.endswith(".pptx"):
            return "application/vnd.openxmlformats-officedocument.presentationml.presentation"
        return "application/zip"
    if head.startswith(_GZIP):
        return "application/gzip"
    if head.startswith(_MP3_ID3) or lower_name.endswith(".mp3"):
        return "audio/mpeg"
    if len(head) >= 12 and head.startswith(_WAV_RIFF) and head[8:12] == _WAV:
        return "audio/wav"
    if len(head) >= 12 and _MP4_FTYP in head[:32]:
        return "video/mp4"

    # Plain-text sniff: catches renamed scripts like ".png" containing JS/text.
    if head:
        sample = head[:2048]
        if b"\x00" not in sample:
            try:
                sample.decode("utf-8")
                return "text/plain"
            except UnicodeDecodeError:
                pass

    guessed, _ = mimetypes.guess_type(getattr(uploaded_file, "name", "") or "")
    if guessed:
        return guessed

    browser_type = getattr(uploaded_file, "content_type", "") or ""
    return browser_type or "application/octet-stream"
