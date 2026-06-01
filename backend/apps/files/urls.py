from django.urls import path
from .views import (
    # File views 
    CheckDuplicateView,
    FileUploadView,
    FileListView,
    FileDetailView,
    FileDownloadView,
    FileRenameView,
    StorageInfoView,
    SetExpiryView,
    # Storage dashboard  
    StorageDashboardView,
    LargestFilesView,
    RecentFilesView,
    FileTypeUsageView,
    TrashInfoView,
    # Favourite / Trash / Batch 
    ToggleFavoriteView,
    FavoritesListView,
    TrashListView,
    RestoreFileView,
    EmptyTrashView,
    PermanentlyDeleteView,
    BatchDeleteView,
    BatchRestoreView,
    # Folder views 
    FolderListCreateView,
    FolderDetailView,
    FolderAddFilesView,
    FolderRemoveFilesView,
    FolderShareView,
)

urlpatterns = [
    #  Storage sub-routes (must come before bare 'storage/') 
    path('storage/dashboard/',  StorageDashboardView.as_view(), name='storage-dashboard'),
    path('storage/largest/',    LargestFilesView.as_view(),     name='storage-largest'),
    path('storage/recent/',     RecentFilesView.as_view(),      name='storage-recent'),
    path('storage/type-usage/', FileTypeUsageView.as_view(),    name='storage-type-usage'),
    path('storage/trash-info/', TrashInfoView.as_view(),        name='storage-trash-info'),

    # Original storage info (kept for backward compat) 
    path('storage/',            StorageInfoView.as_view(),      name='file-storage'),

    # Utility (no pk) 
    path('upload/',             FileUploadView.as_view(),       name='file-upload'),
    path('check-duplicate/',    CheckDuplicateView.as_view(),   name='file-check-duplicate'),
    path('favorites/',          FavoritesListView.as_view(),    name='file-favorites'),
    path('trash/',              TrashListView.as_view(),        name='file-trash'),
    path('trash/empty/',        EmptyTrashView.as_view(),       name='file-trash-empty'),
    path('batch-delete/',       BatchDeleteView.as_view(),      name='file-batch-delete'),
    path('batch-restore/',      BatchRestoreView.as_view(),     name='file-batch-restore'),
    path('',                    FileListView.as_view(),         name='file-list'),

    # Per-file actions (require pk) 
    path('<uuid:pk>/',                    FileDetailView.as_view(),        name='file-detail'),
    path('<uuid:pk>/download/',           FileDownloadView.as_view(),      name='file-download'),
    path('<uuid:pk>/rename/',             FileRenameView.as_view(),        name='file-rename'),
    path('<uuid:pk>/favorite/',           ToggleFavoriteView.as_view(),    name='file-favorite'),
    path('<uuid:pk>/restore/',            RestoreFileView.as_view(),       name='file-restore'),
    path('<uuid:pk>/delete-permanently/', PermanentlyDeleteView.as_view(), name='file-delete-permanently'),
    path('<uuid:pk>/set-expiry/',         SetExpiryView.as_view(),         name='file-set-expiry'),

    # Folder routes
    path('folders/',                            FolderListCreateView.as_view(),  name='folder-list'),
    path('folders/<uuid:pk>/',                  FolderDetailView.as_view(),      name='folder-detail'),
    path('folders/<uuid:pk>/add-files/',        FolderAddFilesView.as_view(),    name='folder-add-files'),
    path('folders/<uuid:pk>/remove-files/',     FolderRemoveFilesView.as_view(), name='folder-remove-files'),
    path('folders/<uuid:pk>/share/',            FolderShareView.as_view(),       name='folder-share'),
]