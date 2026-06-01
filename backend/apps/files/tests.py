import uuid
import pytest
from django.urls import reverse
from django.core.files.uploadedfile import SimpleUploadedFile
from django.test import override_settings
from rest_framework.test import APIClient
from django.contrib.auth import get_user_model
from apps.files.models import File, Folder

User = get_user_model()


# ──────────────────────────────────────────────
# Fixtures
# ──────────────────────────────────────────────

@pytest.fixture
def client():
    return APIClient()


@pytest.fixture
def user(db):
    return User.objects.create_user(
        email='test@example.com',
        password='StrongPass123!'
    )


@pytest.fixture
def auth_client(client, user):
    client.force_authenticate(user=user)
    return client


@pytest.fixture
def upload_file():
    return SimpleUploadedFile(
        'test.txt',
        b'hello world',
        content_type='text/plain'
    )


@pytest.fixture
def file_obj(db, user, upload_file):
    return File.objects.create(
        owner=user,
        original_name='test.txt',
        file=upload_file,
        file_size=11,
        mime_type='text/plain',
    )


@pytest.fixture
def trashed_file(db, user):
    f = SimpleUploadedFile('trash.txt', b'hello', content_type='text/plain')
    return File.objects.create(
        owner=user,
        original_name='trash.txt',
        file=f,
        file_size=5,
        mime_type='text/plain',
        is_deleted=True,
    )


@pytest.fixture
def folder(db, user):
    return Folder.objects.create(
        owner=user,
        name='Test Folder',
    )


# ──────────────────────────────────────────────
# File List
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_file_list(auth_client, file_obj):
    res = auth_client.get(reverse('file-list'))
    assert res.status_code == 200
    assert res.data['data']['count'] >= 1


@pytest.mark.django_db
def test_file_list_unauthenticated(client):
    res = client.get(reverse('file-list'))
    assert res.status_code == 401


@pytest.mark.django_db
def test_file_list_search(auth_client, file_obj):
    res = auth_client.get(reverse('file-list'), {'search': 'test'})
    assert res.status_code == 200
    assert res.data['data']['count'] >= 1


@pytest.mark.django_db
def test_file_list_search_no_results(auth_client, file_obj):
    res = auth_client.get(reverse('file-list'), {'search': 'zzznomatch'})
    assert res.status_code == 200
    assert res.data['data']['count'] == 0


# ──────────────────────────────────────────────
# File Detail
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_file_detail(auth_client, file_obj):
    res = auth_client.get(reverse('file-detail', args=[file_obj.pk]))
    assert res.status_code == 200
    assert res.data['data']['id'] == str(file_obj.pk)


@pytest.mark.django_db
def test_file_detail_unauthenticated(client, file_obj):
    res = client.get(reverse('file-detail', args=[file_obj.pk]))
    assert res.status_code == 401


@pytest.mark.django_db
def test_file_detail_not_found(auth_client):
    fake_uuid = uuid.uuid4()
    res = auth_client.get(reverse('file-detail', args=[fake_uuid]))
    assert res.status_code == 404


# ──────────────────────────────────────────────
# File Upload
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_file_upload_success(auth_client):
    f = SimpleUploadedFile('upload.txt', b'data', content_type='text/plain')
    res = auth_client.post(reverse('file-upload'), {'files': f}, format='multipart')
    assert res.status_code == 201
    assert res.data['data']['count'] == 1


@pytest.mark.django_db
def test_file_upload_no_files(auth_client):
    res = auth_client.post(reverse('file-upload'), {}, format='multipart')
    assert res.status_code == 400


@pytest.mark.django_db
def test_file_upload_unauthenticated(client):
    f = SimpleUploadedFile('upload.txt', b'data', content_type='text/plain')
    res = client.post(reverse('file-upload'), {'files': f}, format='multipart')
    assert res.status_code == 401


@pytest.mark.django_db
def test_file_upload_with_expiry(auth_client):
    f = SimpleUploadedFile('expiring.txt', b'data', content_type='text/plain')
    res = auth_client.post(
        reverse('file-upload'),
        {'files': f, 'expiry_option': '1_day'},
        format='multipart',
    )
    assert res.status_code == 201
    assert res.data['data']['uploaded'][0]['expires_at'] is not None


@pytest.mark.django_db
@override_settings(MAX_STORAGE_BYTES=1024 * 1024)
def test_file_upload_rejects_when_quota_exceeded(auth_client, user):
    existing = SimpleUploadedFile('existing.txt', b'a' * 600_000, content_type='text/plain')
    File.objects.create(
        owner=user,
        original_name='existing.txt',
        file=existing,
        file_size=600_000,
        mime_type='text/plain',
    )

    f = SimpleUploadedFile('upload.txt', b'b' * 500_000, content_type='text/plain')
    res = auth_client.post(reverse('file-upload'), {'files': f}, format='multipart')

    assert res.status_code == 400
    assert 'storage' in res.data.get('message', '').lower() or 'not enough storage' in res.data.get('message', '').lower()


# ──────────────────────────────────────────────────────────────
# File Delete (soft)
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_file_delete(auth_client, file_obj):
    res = auth_client.delete(reverse('file-detail', args=[file_obj.pk]))
    assert res.status_code == 200
    file_obj.refresh_from_db()
    assert file_obj.is_deleted is True


@pytest.mark.django_db
def test_file_delete_unauthenticated(client, file_obj):
    res = client.delete(reverse('file-detail', args=[file_obj.pk]))
    assert res.status_code == 401


# ──────────────────────────────────────────────
# File Rename
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_file_rename_success(auth_client, file_obj):
    res = auth_client.post(reverse('file-rename', args=[file_obj.pk]), {'new_name': 'renamed'})
    assert res.status_code == 200
    assert 'renamed' in res.data['data']['original_name']


@pytest.mark.django_db
def test_file_rename_missing_name(auth_client, file_obj):
    res = auth_client.post(reverse('file-rename', args=[file_obj.pk]), {})
    assert res.status_code == 400


@pytest.mark.django_db
def test_file_rename_same_name(auth_client, file_obj):
    res = auth_client.post(reverse('file-rename', args=[file_obj.pk]), {'new_name': 'test'})
    assert res.status_code == 400


# ──────────────────────────────────────────────
# Set Expiry
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_set_expiry_success(auth_client, file_obj):
    res = auth_client.post(reverse('file-set-expiry', args=[file_obj.pk]), {'expiry_option': '1_day'})
    assert res.status_code == 200
    assert res.data['data']['expires_at'] is not None


@pytest.mark.django_db
def test_set_expiry_never(auth_client, file_obj):
    res = auth_client.post(reverse('file-set-expiry', args=[file_obj.pk]), {'expiry_option': 'never'})
    assert res.status_code == 200
    assert res.data['data']['expires_at'] is None


@pytest.mark.django_db
def test_set_expiry_invalid(auth_client, file_obj):
    res = auth_client.post(reverse('file-set-expiry', args=[file_obj.pk]), {'expiry_option': 'bad_value'})
    assert res.status_code == 400


# ──────────────────────────────────────────────
# Favorites
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_toggle_favorite(auth_client, file_obj):
    res = auth_client.post(reverse('file-favorite', args=[file_obj.pk]))
    assert res.status_code == 200
    assert res.data['data']['is_favorite'] is True


@pytest.mark.django_db
def test_toggle_favorite_off(auth_client, file_obj):
    auth_client.post(reverse('file-favorite', args=[file_obj.pk]))
    res = auth_client.post(reverse('file-favorite', args=[file_obj.pk]))
    assert res.status_code == 200
    assert res.data['data']['is_favorite'] is False


@pytest.mark.django_db
def test_favorites_list(auth_client, file_obj):
    auth_client.post(reverse('file-favorite', args=[file_obj.pk]))
    res = auth_client.get(reverse('file-favorites'))
    assert res.status_code == 200
    assert res.data['data']['count'] >= 1


# ──────────────────────────────────────────────
# Storage
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_storage_info(auth_client, file_obj):
    res = auth_client.get(reverse('file-storage'))
    assert res.status_code == 200
    assert 'used_bytes' in res.data['data']
    assert 'total_bytes' in res.data['data']


@pytest.mark.django_db
def test_storage_dashboard(auth_client, file_obj):
    res = auth_client.get(reverse('storage-dashboard'))
    assert res.status_code == 200
    assert 'type_usage' in res.data['data']
    assert 'largest_files' in res.data['data']


@pytest.mark.django_db
def test_storage_unauthenticated(client):
    res = client.get(reverse('file-storage'))
    assert res.status_code == 401


# ──────────────────────────────────────────────
# Trash
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_trash_list(auth_client, trashed_file):
    res = auth_client.get(reverse('file-trash'))
    assert res.status_code == 200
    assert res.data['data']['count'] >= 1


@pytest.mark.django_db
def test_restore_file(auth_client, trashed_file):
    res = auth_client.post(reverse('file-restore', args=[trashed_file.pk]))
    assert res.status_code == 200
    trashed_file.refresh_from_db()
    assert trashed_file.is_deleted is False


@pytest.mark.django_db
def test_empty_trash(auth_client, trashed_file):
    res = auth_client.post(reverse('file-trash-empty'))
    assert res.status_code == 200


@pytest.mark.django_db
def test_permanently_delete(auth_client, trashed_file):
    res = auth_client.post(reverse('file-delete-permanently', args=[trashed_file.pk]))
    assert res.status_code == 200
    assert not File.objects.filter(pk=trashed_file.pk).exists()


# ──────────────────────────────────────────────
# Batch
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_batch_delete(auth_client, file_obj):
    res = auth_client.post(
        reverse('file-batch-delete'),
        {'file_ids': [str(file_obj.pk)]},
        format='json',
    )
    assert res.status_code == 200
    file_obj.refresh_from_db()
    assert file_obj.is_deleted is True


@pytest.mark.django_db
def test_batch_delete_empty_ids(auth_client):
    res = auth_client.post(
        reverse('file-batch-delete'),
        {'file_ids': []},
        format='json',
    )
    assert res.status_code == 400


@pytest.mark.django_db
def test_batch_restore(auth_client, trashed_file):
    res = auth_client.post(
        reverse('file-batch-restore'),
        {'file_ids': [str(trashed_file.pk)]},
        format='json',
    )
    assert res.status_code == 200
    trashed_file.refresh_from_db()
    assert trashed_file.is_deleted is False


# ──────────────────────────────────────────────
# Duplicate Check
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_check_duplicate_not_found(auth_client):
    res = auth_client.post(reverse('file-check-duplicate'), {'sha256': 'a' * 64})
    assert res.status_code == 200
    assert res.data['data']['is_duplicate'] is False


@pytest.mark.django_db
def test_check_duplicate_invalid_hash(auth_client):
    res = auth_client.post(reverse('file-check-duplicate'), {'sha256': 'invalid'})
    assert res.status_code == 400


# ──────────────────────────────────────────────
# Folders
# ──────────────────────────────────────────────

@pytest.mark.django_db
def test_folder_list(auth_client, folder):
    res = auth_client.get(reverse('folder-list'))
    assert res.status_code == 200
    assert res.data['data']['count'] >= 1


@pytest.mark.django_db
def test_folder_create(auth_client):
    res = auth_client.post(reverse('folder-list'), {'name': 'New Folder'})
    assert res.status_code == 201
    assert res.data['data']['name'] == 'New Folder'


@pytest.mark.django_db
def test_folder_create_missing_name(auth_client):
    res = auth_client.post(reverse('folder-list'), {})
    assert res.status_code == 400


@pytest.mark.django_db
def test_folder_detail(auth_client, folder):
    res = auth_client.get(reverse('folder-detail', args=[folder.pk]))
    assert res.status_code == 200
    assert res.data['data']['name'] == 'Test Folder'


@pytest.mark.django_db
def test_folder_update(auth_client, folder):
    res = auth_client.patch(reverse('folder-detail', args=[folder.pk]), {'name': 'Updated Folder'})
    assert res.status_code == 200
    assert res.data['data']['name'] == 'Updated Folder'


@pytest.mark.django_db
def test_folder_delete(auth_client, folder):
    res = auth_client.delete(reverse('folder-detail', args=[folder.pk]))
    assert res.status_code == 200
    assert not Folder.objects.filter(pk=folder.pk).exists()


@pytest.mark.django_db
def test_folder_add_files(auth_client, folder, file_obj):
    res = auth_client.post(
        reverse('folder-add-files', args=[folder.pk]),
        {'file_ids': [str(file_obj.pk)]},
        format='json',
    )
    assert res.status_code == 200
    assert res.data['data']['added'] == 1


@pytest.mark.django_db
def test_folder_remove_files(auth_client, folder, file_obj):
    folder.files.add(file_obj)
    res = auth_client.post(
        reverse('folder-remove-files', args=[folder.pk]),
        {'file_ids': [str(file_obj.pk)]},
        format='json',
    )
    assert res.status_code == 200
    assert res.data['data']['removed'] == 1


@pytest.mark.django_db
def test_folder_unauthenticated(client):
    res = client.get(reverse('folder-list'))
    assert res.status_code == 401