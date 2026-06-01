"""
apps/sharing/tasks.py
Celery tasks for file scanning and share expiration.
"""

import logging
import math
import os
import re
import tempfile
import zipfile

from celery import shared_task
from django.utils import timezone

logger = logging.getLogger(__name__)

# ── Configuration ─────────────────────────────────────────────────────────────

MAX_SCAN_BYTES = 10 * 1024 * 1024
ENTROPY_THRESHOLD = 7.5
ZIP_RATIO_LIMIT = 100
RETRY_DELAYS = [30, 120, 480]

STATIC_BLOCKED_HASHES: set[str] = {
    '275a021bbfb6489e54d471899f7db9d1663fc695ec2fe2a2c4538aabf651fd0f',
    '131f95c51cc819465fa1797f6ccacf9d494aaaff46fa3eac73ae63ffbdfd8267',
}

BLOCKED_MIME_TYPES = {
    'application/x-msdownload',
    'application/x-executable',
    'application/x-dosexec',
    'application/x-elf',
    'application/x-mach-binary',
    'application/x-bat',
    'application/x-sh',
    'application/x-shellscript',
    'text/x-shellscript',
    'application/x-msi',
    'application/x-ms-installer',
    'application/x-java-archive',
    'application/vnd.android.package-archive',
}

BLOCKED_EXTENSIONS = {
    'exe', 'bat', 'cmd', 'sh', 'ps1', 'vbs', 'msi',
    'dll', 'com', 'scr', 'pif', 'reg', 'hta',
    'jar', 'apk', 'elf', 'deb', 'rpm',
    'dmg', 'pkg', 'app', 'run', 'bin',
}

DANGEROUS_SIGNATURES: list[tuple[int, bytes, str]] = [
    (0, b'\x4d\x5a\x90\x00',   'Windows PE (standard MZ header)'),
    (0, b'MZ',                  'Windows PE executable'),
    (0, b'\x7fELF',             'Linux ELF executable'),
    (0, b'\xca\xfe\xba\xbe',    'Mach-O fat binary'),
    (0, b'\xce\xfa\xed\xfe',    'Mach-O 32-bit binary'),
    (0, b'\xcf\xfa\xed\xfe',    'Mach-O 64-bit binary'),
    (0, b'#!/',                 'Script with shebang'),
    (0, b'#! /',                'Script with shebang'),
    (0, b'\xe9',                'MS-DOS COM executable'),
    # ZIP magic excluded — .docx/.pptx/.xlsx are ZIP-based; handled by _check_office_macros.
    (0, b'\x03\xf3\x0d\x0a',   'Python bytecode (.pyc)'),
    (0, b'\x16\x03',            'TLS/SSL record (unexpected binary)'),
    (0, b'\xff\xd8\xff',        'JPEG image'),
    (0, b'\x89PNG\r\n\x1a\n',  'PNG image'),
    (0, b'GIF87a',              'GIF image'),
    (0, b'GIF89a',              'GIF image'),
    (0, b'RIFF',                'RIFF container (WebP/WAV/AVI)'),
    (0, b'\x00\x00\x00\x0cjP', 'JPEG 2000 image'),
    (0, b'BM',                  'BMP image'),
    (0, b'II*\x00',             'TIFF image (little-endian)'),
    (0, b'MM\x00*',             'TIFF image (big-endian)'),
]

_IMAGE_SIGNATURES: list[tuple[bytes, str]] = [
    (b'\xff\xd8\xff',        'JPEG image'),
    (b'\x89PNG\r\n\x1a\n',  'PNG image'),
    (b'GIF87a',              'GIF image'),
    (b'GIF89a',              'GIF image'),
    (b'RIFF',                'RIFF container (WebP/WAV/AVI)'),
    (b'\x00\x00\x00\x0cjP', 'JPEG 2000 image'),
    (b'BM',                  'BMP image'),
    (b'II*\x00',             'TIFF image (little-endian)'),
    (b'MM\x00*',             'TIFF image (big-endian)'),
]

_EXTENSION_CONTENT_MAP: dict[str, frozenset[str]] = {
    'jpg':  frozenset({'image'}),
    'jpeg': frozenset({'image'}),
    'png':  frozenset({'image'}),
    'gif':  frozenset({'image'}),
    'bmp':  frozenset({'image'}),
    'webp': frozenset({'image'}),
    'tiff': frozenset({'image'}),
    'tif':  frozenset({'image'}),
    'ico':  frozenset({'image'}),
    'svg':  frozenset({'text'}),
    'pdf':  frozenset({'binary'}),
    'doc':  frozenset({'binary'}),
    'docx': frozenset({'binary'}),
    'xls':  frozenset({'binary'}),
    'xlsx': frozenset({'binary'}),
    'ppt':  frozenset({'binary'}),
    'pptx': frozenset({'binary'}),
    'rtf':  frozenset({'text', 'binary'}),
    'txt':  frozenset({'text'}),
    'csv':  frozenset({'text'}),
    'json': frozenset({'text'}),
    'xml':  frozenset({'text'}),
    'js':   frozenset({'text'}),
    'ts':   frozenset({'text'}),
    'html': frozenset({'text'}),
    'htm':  frozenset({'text'}),
    'css':  frozenset({'text'}),
    'py':   frozenset({'text'}),
    'rb':   frozenset({'text'}),
    'php':  frozenset({'text'}),
    'md':   frozenset({'text'}),
    'yaml': frozenset({'text'}),
    'yml':  frozenset({'text'}),
    'toml': frozenset({'text'}),
    'ini':  frozenset({'text'}),
    'conf': frozenset({'text'}),
    'log':  frozenset({'text'}),
}

_IMAGE_EXTENSIONS: frozenset[str] = frozenset({
    'jpg', 'jpeg', 'png', 'gif', 'bmp', 'webp',
    'tiff', 'tif', 'ico', 'heic', 'heif', 'avif',
})

MALICIOUS_PATTERNS: list[tuple[re.Pattern, str]] = [
    (
        re.compile(rb'(?i)CreateObject\s*\(\s*["\']WScript\.Shell["\']'),
        'VBS/VBA WScript.Shell invocation',
    ),
    (
        re.compile(rb'(?i)powershell\s+-(?:enc|EncodedCommand|nop|NonInteractive|W\s+Hidden)'),
        'PowerShell encoded/hidden execution',
    ),
    (
        re.compile(rb'(?i)cmd\.exe\s+/[cCkK]'),
        'CMD shell execution',
    ),
    (
        re.compile(rb'(?i)eval\s*\(\s*(?:base64_decode|gzinflate|str_rot13)'),
        'PHP obfuscated eval',
    ),
    (
        re.compile(rb'(?i)EICAR-STANDARD-ANTIVIRUS-TEST-FILE'),
        'EICAR test file',
    ),
    (
        re.compile(rb'(?i)AutoOpen|Auto_Open|Document_Open|Workbook_Open'),
        'Office auto-execution macro',
    ),
    (
        re.compile(rb'(?i)Shell\s*\(["\'](?:cmd|powershell|wscript|cscript)'),
        'VBA Shell() execution',
    ),
    (
        re.compile(rb'(?i)(?:curl|wget)\s+.{0,80}(?:http|ftp).*\|\s*(?:bash|sh|python|perl|ruby)'),
        'Download-and-execute pipe chain',
    ),
    (
        re.compile(rb'(?i)certutil\s+.*-(?:decode|urlcache|f)\b'),
        'certutil decode/download abuse',
    ),
    (
        re.compile(rb'(?i)mshta\.exe|mshta\s+(?:http|vbscript|javascript)'),
        'MSHTA remote/script execution',
    ),
    (
        re.compile(rb'(?i)regsvr32\s+.*(?:/s|/u|/i:http)'),
        'Regsvr32 squiblydoo execution',
    ),
    (
        re.compile(rb'(?i)\|\s*base64\s+--?d(?:ecode)?\s*\|\s*(?:bash|sh|python)'),
        'Base64-decode-to-shell pipe',
    ),
    (
        re.compile(rb'(?i)exec\s*\(\s*compile\s*\('),
        'Python exec(compile()) obfuscation',
    ),
    (
        re.compile(rb'(?i)(?:unescape|fromCharCode)\s*\((?:[\'"][^)]{20,}[\'"]|\d[\d,\s]{20,})'),
        'JavaScript character-code obfuscation',
    ),
    (
        re.compile(rb'(?i)ActiveXObject\s*\(\s*["\'](?:MSXML2?|WScript|Scripting)'),
        'JScript/HTA ActiveX object creation',
    ),
    (
        re.compile(rb'(?i)(?:start-process|invoke-expression|iex)\s*[\(\s]'),
        'PowerShell execution alias',
    ),
    (
        re.compile(rb'(?i)rundll32(?:\.exe)?\s+\S+,\S+'),
        'Rundll32 code execution',
    ),
]

# Always block — JS execution and external program launch have no legitimate use in doc readers.
_PDF_ALWAYS_BAD: list[tuple[re.Pattern, str]] = [
    (re.compile(rb'/JS\b'),         'embedded JavaScript (/JS)'),
    (re.compile(rb'/JavaScript\b'), 'embedded JavaScript action (/JavaScript)'),
    (re.compile(rb'/Launch\b'),     '/Launch action that opens external programs'),
    (re.compile(rb'/RichMedia\b'),  'RichMedia/Flash embed'),
]

# Only dangerous when combined with a JS trigger; /OpenAction and /AA alone are legitimate.
_PDF_EXECUTION_TRIGGERS: list[tuple[re.Pattern, str]] = [
    (re.compile(rb'/OpenAction\b'), '/OpenAction'),
    (re.compile(rb'/AA\b'),         '/AA additional-actions'),
]

# ── Public dispatcher ─────────────────────────────────────────────────────────

def dispatch_scan(file_id: str) -> bool:
    """Queue a scan via Celery, falling back to sync if the broker is unavailable."""
    try:
        scan_uploaded_file.apply_async(args=[str(file_id)], countdown=1)
        logger.info('dispatch_scan: queued async scan file_id=%s', file_id)
        return True
    except Exception as broker_err:
        logger.warning(
            'dispatch_scan: broker unavailable (%s). Running synchronous scan for file_id=%s',
            broker_err, file_id,
        )
        try:
            _run_scan(file_id)
        except Exception:
            logger.exception('dispatch_scan: synchronous scan failed file_id=%s', file_id)
        return False


# ── Shell-safe recovery helper ────────────────────────────────────────────────

def recover_stuck_files(older_than_minutes: int = 5) -> dict:
    """
    Requeue files stuck in SCANNING or PENDING.

        >>> from apps.sharing.tasks import recover_stuck_files
        >>> recover_stuck_files()
        >>> recover_stuck_files(older_than_minutes=0)  # requeue ALL pending
    """
    from datetime import timedelta
    from apps.files.models import File

    cutoff = timezone.now() - timedelta(minutes=older_than_minutes)
    stuck = File.objects.filter(
        scan_status__in=[File.ScanStatus.SCANNING, File.ScanStatus.PENDING],
        scanned_at__isnull=True,
        uploaded_at__lt=cutoff,
    )

    total, requeued, failed = stuck.count(), 0, 0
    print(f'recover_stuck_files: found {total} stuck file(s) (older than {older_than_minutes} min)')

    for file_obj in stuck:
        try:
            dispatch_scan(str(file_obj.id))
            requeued += 1
            print(f'  ✓ requeued  {file_obj.id}  {file_obj.original_name}')
        except Exception as exc:
            failed += 1
            print(f'  ✗ failed    {file_obj.id}  {file_obj.original_name}  — {exc}')
            logger.exception('recover_stuck_files: dispatch failed file_id=%s', file_obj.id)

    print(f'recover_stuck_files: done  requeued={requeued}  failed={failed}')
    return {'total': total, 'requeued': requeued, 'failed': failed}


# ── Celery task ───────────────────────────────────────────────────────────────

@shared_task(
    bind=True,
    max_retries=3,
    default_retry_delay=30,
    name='sharing.scan_uploaded_file',
    acks_late=True,
    reject_on_worker_lost=True,
)
def scan_uploaded_file(self, file_id: str):
    attempt = self.request.retries
    logger.info('scan_uploaded_file: START file_id=%s retry=%s', file_id, attempt)

    try:
        _run_scan(file_id)
    except Exception as exc:
        logger.exception('scan_uploaded_file: unexpected error file_id=%s retry=%s', file_id, attempt)
        retry_delay = RETRY_DELAYS[min(attempt, len(RETRY_DELAYS) - 1)]
        try:
            raise self.retry(exc=exc, countdown=retry_delay)
        except self.MaxRetriesExceededError:
            from apps.files.models import File
            try:
                file_obj = File.objects.get(pk=file_id)
                _mark_result(file_obj, File.ScanStatus.SCAN_FAILED, f'Max retries exceeded: {exc}')
            except Exception:
                logger.exception('Failed updating final scan status file_id=%s', file_id)


# ── Core scan logic ───────────────────────────────────────────────────────────

def _run_scan(file_id: str) -> None:
    from apps.files.models import File

    try:
        file_obj = File.objects.get(pk=file_id)
    except File.DoesNotExist:
        logger.error('_run_scan: file not found file_id=%s', file_id)
        return
    except Exception:
        logger.exception('_run_scan: DB error file_id=%s', file_id)
        return

    logger.info('_run_scan: processing file_id=%s current_status=%s', file_id, file_obj.scan_status)

    try:
        File.objects.filter(pk=file_id).update(scan_status=File.ScanStatus.SCANNING, scanned_at=None)
        file_obj.scan_status = File.ScanStatus.SCANNING
    except Exception:
        logger.exception('_run_scan: failed setting SCANNING file_id=%s', file_id)

    file_path, tmp_file = _resolve_path(file_obj)

    if not file_path:
        _mark_result(file_obj, File.ScanStatus.SCAN_FAILED, 'File not accessible for scanning')
        return

    try:
        threat, detail = _full_scan(file_path, file_obj)

        if threat == 'INFECTED':
            _mark_result(file_obj, File.ScanStatus.INFECTED, detail)
            print(f'[THREAT DETECTED] file_id={file_id} | {detail}')
            logger.warning('_run_scan: INFECTED file_id=%s reason=%s', file_id, detail)
        elif threat == 'SCAN_FAILED':
            _mark_result(file_obj, File.ScanStatus.SCAN_FAILED, detail)
        else:
            _mark_result(file_obj, File.ScanStatus.SAFE, 'All security checks passed')
            logger.info('_run_scan: SAFE file_id=%s', file_id)

    except Exception as exc:
        _mark_result(file_obj, File.ScanStatus.SCAN_FAILED, f'Unexpected scan error: {exc}')
        raise
    finally:
        if tmp_file:
            try:
                if os.path.exists(tmp_file):
                    os.unlink(tmp_file)
            except Exception:
                pass


# ── Scan pipeline ─────────────────────────────────────────────────────────────

def _full_scan(file_path: str, file_obj):
    filename = file_obj.original_name or os.path.basename(file_path)

    checks = [
        lambda: _check_extension(filename),
        lambda: _check_double_extension(filename),
        lambda: _check_magic_bytes(file_path, filename),
        lambda: _check_mime_consistency(file_path, file_obj.mime_type or ''),
        lambda: _check_hash_blocklist(file_path, file_obj),
        lambda: _check_archive_bomb(file_path),
        lambda: _check_malicious_patterns(file_path),
        lambda: _check_entropy(file_path, filename),
        lambda: _check_office_macros(file_path, filename),
        lambda: _check_pdf_actions(file_path, filename),
        lambda: _check_svg_scripts(file_path, filename),
        lambda: _check_html_phishing(file_path, filename),
        lambda: _check_content_type_mismatch(file_path, filename),
    ]

    for check in checks:
        result = check()
        if result:
            return 'INFECTED', result

    return 'SAFE', 'All security checks passed'


# ── Individual checks ─────────────────────────────────────────────────────────

def _check_extension(filename: str):
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext in BLOCKED_EXTENSIONS:
        return (
            f'This file type (.{ext}) is not allowed because it can run programs '
            f'on your computer and is commonly used to spread malware.'
        )
    return None


def _check_double_extension(filename: str) -> str | None:
    """Catch double-extension spoofing: 'invoice.pdf.exe', 'photo.jpg.bat'."""
    parts = filename.lower().split('.')
    if len(parts) < 3:
        return None

    real_ext = parts[-1]
    if real_ext not in BLOCKED_EXTENSIONS:
        return None

    decoy_ext = parts[-2]
    harmless = {
        'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx',
        'jpg', 'jpeg', 'png', 'gif', 'bmp', 'svg', 'webp',
        'mp3', 'mp4', 'avi', 'mov', 'mkv',
        'txt', 'csv', 'zip', 'tar', 'gz',
    }
    if decoy_ext in harmless:
        return (
            f'This file uses a double extension (.{decoy_ext}.{real_ext}) to appear '
            f'safe while hiding its true type. The actual file is a .{real_ext}, '
            f'which is a blocked executable type. This is a common malware delivery trick.'
        )
    return None


def _check_magic_bytes(file_path: str, filename: str = ''):
    # Use original filename for extension check — temp paths lose the real extension.
    try:
        with open(file_path, 'rb') as f:
            header = f.read(16)

        name_for_ext = filename if filename else file_path
        ext = os.path.splitext(name_for_ext)[-1].lstrip('.').lower()

        for offset, sig, desc in DANGEROUS_SIGNATURES:
            if header[offset:offset + len(sig)] != sig:
                continue

            is_image_sig = any(sig == img_sig for img_sig, _ in _IMAGE_SIGNATURES)
            if is_image_sig:
                if ext in _IMAGE_EXTENSIONS:
                    continue
                return (
                    f'This file has a .{ext} extension but its actual content is '
                    f'a {desc}. Disguising an image as another file type is a '
                    f'common technique used to hide malicious payloads.'
                )

            return (
                f'This file contains the internal signature of a {desc}. '
                f'Even if it has a different name or extension, it is actually '
                f'an executable program and has been blocked for your safety.'
            )

    except Exception as exc:
        logger.warning('_check_magic_bytes: %s', exc)
    return None


def _check_mime_consistency(file_path: str, stored_mime: str):
    try:
        import magic as libmagic
        detected = libmagic.from_file(file_path, mime=True) or ''
    except ImportError:
        return None
    except Exception as exc:
        logger.warning('_check_mime_consistency: %s', exc)
        return None

    if detected in BLOCKED_MIME_TYPES:
        return (
            f'This file is identified as a {detected}, which is an executable '
            f'or installer type that is not permitted for upload.'
        )

    if not (stored_mime and detected):
        return None

    detected_major = detected.split('/')[0]
    stored_major   = stored_mime.split('/')[0]

    if detected_major == 'application' and stored_major in ('image', 'audio', 'video'):
        return (
            f'This file is disguised — it was uploaded as a {stored_mime} '
            f'(e.g. an image or video) but is actually a {detected}. '
            f'Hiding executable files this way is a common attack technique.'
        )

    _document_mimes = {
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.ms-powerpoint',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation',
        'text/plain',
        'text/csv',
    }
    if detected_major == 'image' and stored_mime in _document_mimes:
        return (
            f'This file was uploaded as a {stored_mime} but its actual '
            f'content is {detected}. An image file renamed to look like a '
            f'document is a common malware delivery technique.'
        )

    _image_mimes = {
        'image/jpeg', 'image/png', 'image/gif', 'image/bmp',
        'image/webp', 'image/tiff', 'image/x-icon', 'image/svg+xml',
        'image/heic', 'image/avif',
    }
    _script_text_mimes = {
        'text/javascript', 'application/javascript',
        'text/x-python', 'application/x-python',
        'text/x-shellscript', 'application/x-sh',
        'text/x-php', 'application/x-httpd-php',
        'text/html', 'application/xhtml+xml',
        'text/css', 'text/x-ruby',
        'application/x-perl', 'text/x-perl',
        'text/xml', 'application/xml',
        'application/json',
    }
    if stored_mime in _image_mimes and detected in _script_text_mimes:
        return (
            f'This file was uploaded as a {stored_mime} (image) but its actual '
            f'content is {detected}. Hiding a script or code file inside an '
            f'image extension is a known technique to bypass upload filters.'
        )

    return None


def _check_hash_blocklist(file_path: str, file_obj):
    import hashlib
    try:
        sha = hashlib.sha256()
        with open(file_path, 'rb') as f:
            for chunk in iter(lambda: f.read(65536), b''):
                sha.update(chunk)
        digest = sha.hexdigest()

        try:
            if hasattr(file_obj, 'sha256') and not file_obj.sha256:
                type(file_obj).objects.filter(pk=file_obj.pk).update(sha256=digest)
                file_obj.sha256 = digest
        except Exception:
            pass

        if digest in STATIC_BLOCKED_HASHES:
            return (
                f'This exact file has been previously identified as malicious '
                f'and is permanently blocked (file fingerprint: {digest[:16]}...).'
            )

    except Exception as exc:
        logger.warning('_check_hash_blocklist: %s', exc)
    return None


def _check_archive_bomb(file_path: str):
    """
    Detects zip bombs via file count, total uncompressed size, and compression ratio.
    Office Open XML files use a higher member threshold since they legitimately
    contain many internal parts.
    """
    if not zipfile.is_zipfile(file_path):
        return None
    try:
        compressed = os.path.getsize(file_path)
        if not compressed:
            return None

        _OFFICE_ZIP_SUFFIXES = ('.docx', '.xlsx', '.pptx', '.docm', '.xlsm', '.pptm',
                                '.odt', '.ods', '.odp', '.epub')
        member_limit = 50000 if file_path.lower().endswith(_OFFICE_ZIP_SUFFIXES) else 10000

        total = 0
        with zipfile.ZipFile(file_path, 'r') as zf:
            members = zf.infolist()

            if len(members) > member_limit:
                return (
                    f'This archive contains {len(members):,} files, which is abnormally high. '
                    f'This is a known attack called a "zip bomb" designed to crash or overwhelm systems.'
                )

            for member in members:
                if member.file_size > 2 * 1024 * 1024 * 1024:
                    return (
                        f'This archive contains a single entry ("{member.filename}") that would '
                        f'expand to over 2 GB. This is a zip bomb technique designed to exhaust disk space.'
                    )
                total += member.file_size
                if total > 5 * 1024 * 1024 * 1024:
                    return (
                        'This archive would expand to over 5 GB when extracted. '
                        'This is a known attack called a "zip bomb" designed to exhaust '
                        'disk space and crash systems.'
                    )

        if (total / compressed) > ZIP_RATIO_LIMIT:
            return (
                f'This archive expands to {total // compressed}x its compressed size. '
                f'This extreme compression ratio is a sign of a "zip bomb" — a file '
                f'designed to exhaust disk space and crash systems when extracted.'
            )

    except zipfile.BadZipFile:
        return None
    except Exception as exc:
        logger.warning('_check_archive_bomb: %s', exc)
    return None


def _check_malicious_patterns(file_path: str):
    try:
        with open(file_path, 'rb') as f:
            raw = f.read(MAX_SCAN_BYTES)
        for pattern, desc in MALICIOUS_PATTERNS:
            if pattern.search(raw):
                return (
                    f'This file contains a dangerous command pattern ({desc}) '
                    f'that is used to run hidden programs or system commands. '
                    f'This is a strong indicator of malware or a malicious script.'
                )
    except Exception as exc:
        logger.warning('_check_malicious_patterns: %s', exc)
    return None


def _check_entropy(file_path: str, filename: str = '') -> str | None:
    """High Shannon entropy signals encryption/obfuscation. Naturally compressed formats are skipped."""
    SKIP = {
        'zip', 'gz', 'tar', 'bz2', '7z', 'rar',
        'jpg', 'jpeg', 'png', 'gif', 'webp',
        'mp4', 'mp3', 'wav', 'pdf',
        'docx', 'xlsx', 'pptx',
        'odt', 'ods', 'odp',
    }
    try:
        # Use original filename — temp paths lose the real extension.
        name_for_ext = filename if filename else file_path
        ext = name_for_ext.rsplit('.', 1)[-1].lower()
        if ext in SKIP:
            return None

        with open(file_path, 'rb') as f:
            data = f.read(MAX_SCAN_BYTES)

        if len(data) < 512:
            return None

        entropy = _shannon_entropy(data)
        if entropy > ENTROPY_THRESHOLD:
            return (
                f'This file appears to be encrypted or heavily obfuscated '
                f'(randomness score: {entropy:.2f}/8.00). '
                f'Legitimate files are not normally this random. '
                f'This is a common sign of hidden malware or a packed malicious payload.'
            )

    except Exception as exc:
        logger.warning('_check_entropy: %s', exc)
    return None


def _shannon_entropy(data: bytes) -> float:
    if not data:
        return 0.0
    freq = [0] * 256
    for byte in data:
        freq[byte] += 1
    n = len(data)
    return -sum(
        (count / n) * math.log2(count / n)
        for count in freq if count
    )


def _check_office_macros(file_path: str, filename: str = '') -> str | None:
    """Detect VBA macros and external template injection in Office Open XML files."""
    if not zipfile.is_zipfile(file_path):
        return None
    try:
        with zipfile.ZipFile(file_path, 'r') as zf:
            names = [n.lower() for n in zf.namelist()]

            macro_indicators = [
                'vbaproject.bin',
                'word/vbaproject.bin',
                'xl/vbaproject.bin',
                'ppt/vbaproject.bin',
                '_vba_project_cur',
            ]
            for indicator in macro_indicators:
                if any(indicator in name for name in names):
                    return (
                        'This Office document contains an embedded VBA macro '
                        f'(detected: {indicator}). '
                        'Macros can silently run programs when the file is opened '
                        'and are one of the most common malware delivery methods.'
                    )

            for name in names:
                if name.endswith('.rels'):
                    try:
                        content = zf.read(name)
                        if re.search(rb'(?i)Target\s*=\s*["\']https?://', content):
                            return (
                                'This Office document contains an external template relationship '
                                'pointing to a remote URL. This technique (template injection) '
                                'is used to load malicious macros from a remote server at open time.'
                            )
                    except Exception:
                        pass

    except zipfile.BadZipFile:
        return None
    except Exception as exc:
        logger.warning('_check_office_macros: %s', exc)
    return None


def _check_pdf_actions(file_path: str, filename: str) -> str | None:
    """
    Scan PDFs for dangerous action tokens. Reads both head and tail since
    cross-reference tables (where actions are declared) live at the end of the file.

    /JS, /JavaScript, /Launch, /RichMedia → always block.
    /OpenAction, /AA → only block when combined with a JS token.
    /URI, /EmbeddedFile, /XFA, /SubmitForm → not checked (legitimate use cases).
    """
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    try:
        with open(file_path, 'rb') as f:
            header = f.read(8)
    except Exception as exc:
        logger.warning('_check_pdf_actions header read: %s', exc)
        return None

    if not (header.startswith(b'%PDF') or ext == 'pdf'):
        return None

    try:
        file_size = os.path.getsize(file_path)
        tail_size = min(512 * 1024, file_size)

        with open(file_path, 'rb') as f:
            raw = f.read(MAX_SCAN_BYTES)

        if file_size > MAX_SCAN_BYTES:
            with open(file_path, 'rb') as f:
                f.seek(file_size - tail_size)
                raw = raw + f.read(tail_size)

        always_bad_found = []
        for pattern, desc in _PDF_ALWAYS_BAD:
            if pattern.search(raw):
                always_bad_found.append(desc)

        if always_bad_found:
            joined = ', '.join(always_bad_found)
            return (
                f'This PDF contains dangerous elements: {joined}. '
                f'These can silently execute code or launch programs when the file '
                f'is opened in a PDF reader. This is a known malware delivery technique.'
            )

        has_js = (
            re.search(rb'/JS\b', raw) or
            re.search(rb'/JavaScript\b', raw)
        )
        if has_js:
            for pattern, desc in _PDF_EXECUTION_TRIGGERS:
                if pattern.search(raw):
                    return (
                        f'This PDF contains an auto-execution trigger ({desc}) '
                        f'combined with embedded JavaScript. '
                        f'This combination automatically runs code when the file is opened '
                        f'and is a primary technique used in PDF-based malware.'
                    )

    except Exception as exc:
        logger.warning('_check_pdf_actions: %s', exc)
    return None


def _check_svg_scripts(file_path: str, filename: str) -> str | None:
    """Detect <script> tags, event handlers, and <foreignObject> in SVGs — vectors for stored XSS."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext != 'svg':
        return None

    try:
        with open(file_path, 'rb') as f:
            raw = f.read(MAX_SCAN_BYTES)
    except Exception as exc:
        logger.warning('_check_svg_scripts read: %s', exc)
        return None

    svg_threats = [
        (re.compile(rb'(?i)<script[\s>]'),                   'embedded <script> tag'),
        (re.compile(rb'(?i)\bon\w+\s*=\s*["\']'),            'inline event handler (e.g. onload, onclick)'),
        (re.compile(rb'(?i)<foreignObject[\s>]'),             '<foreignObject> HTML embed'),
        (re.compile(rb'(?i)href\s*=\s*["\']javascript:'),     'javascript: URI link'),
        (re.compile(rb'(?i)xlink:href\s*=\s*["\']javascript:'), 'javascript: xlink URI'),
    ]

    found = []
    for pattern, desc in svg_threats:
        if pattern.search(raw):
            found.append(desc)

    if found:
        joined = ', '.join(found)
        return (
            f'This SVG file contains active content: {joined}. '
            f'SVG files with scripts or event handlers can execute JavaScript '
            f'when opened in a browser, enabling cross-site scripting (XSS) attacks.'
        )
    return None


def _check_html_phishing(file_path: str, filename: str) -> str | None:
    """Detect phishing patterns: credential harvesting, obfuscated scripts, hidden iframes, redirects."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    if ext not in ('html', 'htm', 'xhtml', 'shtml'):
        return None

    try:
        with open(file_path, 'rb') as f:
            raw = f.read(MAX_SCAN_BYTES)
    except Exception as exc:
        logger.warning('_check_html_phishing read: %s', exc)
        return None

    if re.search(rb'(?i)<input[^>]+type\s*=\s*["\']?password["\']?', raw) and \
       re.search(rb'(?i)<form[^>]+action\s*=\s*["\']https?://', raw):
        return (
            'This HTML file contains a password field that submits to an external '
            'URL. This is the hallmark of a phishing page designed to steal login credentials.'
        )

    if re.search(rb'(?i)<script[^>]+src\s*=\s*["\']data:', raw):
        return (
            'This HTML file loads a script from a data: URI. '
            'This technique is used to embed obfuscated malicious code that '
            'bypasses URL-based security filters.'
        )

    if re.search(rb'(?i)<meta[^>]+http-equiv\s*=\s*["\']?refresh["\']?[^>]+url\s*=\s*https?://', raw):
        return (
            'This HTML file automatically redirects visitors to an external URL '
            'via a meta refresh tag. This is a common phishing redirect technique.'
        )

    if re.search(
        rb'(?i)<iframe[^>]+(?:display\s*:\s*none|visibility\s*:\s*hidden|width\s*=\s*["\']?0)[^>]*src\s*=\s*["\']https?://',
        raw,
    ):
        return (
            'This HTML file contains a hidden iframe loading an external URL. '
            'Hidden iframes are used to silently load malicious content or '
            'perform clickjacking attacks.'
        )

    if re.search(rb'(?i)href\s*=\s*["\']javascript:', raw):
        return (
            'This HTML file contains a javascript: URI in a link. '
            'This can execute arbitrary JavaScript when the link is clicked '
            'and is commonly used in phishing and XSS attacks.'
        )

    if re.search(rb'(?i)eval\s*\(\s*(?:atob|decodeURIComponent|unescape)\s*\(', raw):
        return (
            'This HTML file contains an obfuscated script that decodes and executes '
            'hidden code at runtime (eval with base64/URL encoding). '
            'This is a common technique to conceal malicious payloads.'
        )

    return None


def _check_content_type_mismatch(file_path: str, filename: str) -> str | None:
    """Magic-byte vs extension mismatch check — no libmagic required."""
    ext = filename.rsplit('.', 1)[-1].lower() if '.' in filename else ''
    allowed_families = _EXTENSION_CONTENT_MAP.get(ext)
    if not allowed_families:
        return None

    try:
        with open(file_path, 'rb') as f:
            header = f.read(16)
    except Exception as exc:
        logger.warning('_check_content_type_mismatch read: %s', exc)
        return None

    actual_family = None
    actual_desc   = None

    for img_sig, img_desc in _IMAGE_SIGNATURES:
        if header[:len(img_sig)] == img_sig:
            actual_family = 'image'
            actual_desc   = img_desc
            break

    if actual_family is None and (
        header[:4] in (b'%PDF', b'PK\x03\x04')
        or header[:8] == b'\xd0\xcf\x11\xe0\xa1\xb1\x1a\xe1'
        or header[:4] == b'Rar!'
        or header[:6] == b'7z\xbc\xaf\x27\x1c'
        or header[:5] == b'%!PS-'
    ):
        actual_family = 'binary'
        actual_desc   = 'binary/document data'

    if actual_family is None:
        try:
            with open(file_path, 'rb') as f:
                sample = f.read(512)
            printable = sum(1 for b in sample if 0x09 <= b <= 0x0d or 0x20 <= b <= 0x7e)
            actual_family = 'text' if (printable / max(len(sample), 1)) > 0.90 else 'binary'
            actual_desc   = 'text/script content'
        except Exception:
            return None

    if actual_family in allowed_families:
        return None

    ext_upper = ext.upper()
    if actual_family == 'image':
        return (
            f'This .{ext_upper} file contains image data ({actual_desc}), '
            f'not {ext_upper} content. An image renamed to .{ext} is a common '
            f'technique to sneak files past upload filters.'
        )
    if actual_family == 'text' and 'image' in allowed_families:
        return (
            f'This file has a .{ext_upper} extension (image) but its content '
            f'is text or script code ({actual_desc}). A script file renamed to '
            f'look like an image is a known method to bypass security checks.'
        )
    return (
        f'This file has a .{ext_upper} extension but its actual content '
        f'appears to be {actual_desc}, which does not match the expected '
        f'type for .{ext} files.'
    )


# ── Helpers ───────────────────────────────────────────────────────────────────

def _resolve_path(file_obj):
    try:
        if not file_obj.file or not file_obj.file.name:
            return None, None

        try:
            path = file_obj.file.path
            if os.path.exists(path):
                return path, None
        except NotImplementedError:
            pass

        suffix = os.path.splitext(file_obj.file.name)[-1] or '.bin'
        tmp = tempfile.NamedTemporaryFile(delete=False, suffix=suffix, prefix='scan_')
        with file_obj.file.open('rb') as src:
            while chunk := src.read(65536):
                tmp.write(chunk)
        tmp.flush()
        tmp.close()
        return tmp.name, tmp.name

    except Exception as exc:
        logger.warning('_resolve_path: %s', exc)
        return None, None


def _mark_result(file_obj, scan_status, message: str):
    try:
        type(file_obj).objects.filter(pk=file_obj.pk).update(
            scan_status=scan_status,
            scan_result=message[:1000],
            scanned_at=timezone.now(),
        )
        logger.info('_mark_result: file_id=%s status=%s', file_obj.pk, scan_status)
    except Exception:
        logger.exception('_mark_result failed file_id=%s', file_obj.pk)


# ── Periodic tasks ────────────────────────────────────────────────────────────

@shared_task(name='sharing.expire_old_shares')
def expire_old_shares():
    from .models import FileShare, ZipShare

    now = timezone.now()
    fs = FileShare.objects.filter(status=FileShare.Status.ACTIVE, expires_at__lt=now).update(status=FileShare.Status.EXPIRED)
    zs = ZipShare.objects.filter(status=ZipShare.Status.ACTIVE, expires_at__lt=now).update(status=ZipShare.Status.EXPIRED)

    logger.info('expire_old_shares: file_shares=%s zip_shares=%s', fs, zs)
    return {'file_shares_expired': fs, 'zip_shares_expired': zs}


@shared_task(name='sharing.unstick_scanning_files')
def unstick_scanning_files():
    """Periodic beat task — delegates to recover_stuck_files()."""
    return recover_stuck_files(older_than_minutes=5)