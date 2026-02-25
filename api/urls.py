from django.urls import path
from rest_framework_simplejwt.views import TokenRefreshView
from . import views

urlpatterns = [

    # ── Auth endpoints ────────────────────────────────────────────────────────
    path('auth/register/', views.RegisterView.as_view(),  name='register'),
    path('auth/login/',    views.LoginView.as_view(),     name='login'),
    path('auth/logout/',   views.LogoutView.as_view(),    name='logout'),
    path('auth/refresh/',  TokenRefreshView.as_view(),    name='token_refresh'),
    # ^ SimpleJWT's built-in refresh view (POST with {"refresh": "<token>"})

    # ── Task CRUD endpoints ───────────────────────────────────────────────────
    path('tasks/',      views.TaskListCreateView.as_view(), name='task-list'),
    path('tasks/<int:pk>/', views.TaskDetailView.as_view(), name='task-detail'),

    # ── File endpoints ────────────────────────────────────────────────────────
    path('files/',                       views.FileUploadView.as_view(),   name='file-list'),
    path('files/<int:pk>/download/',     views.FileDownloadView.as_view(), name='file-download'),
    path('files/<int:pk>/',              views.FileDeleteView.as_view(),   name='file-delete'),
]