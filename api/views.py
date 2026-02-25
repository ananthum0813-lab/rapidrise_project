from django.shortcuts import render
import os
from django.conf import settings
from django.http import FileResponse
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Task,UploadedFile
from .serializers import RegisterSerializer
from .serializers import TaskSerializer,UploadedFileSerializer
# Create your views here.



# ═══════════════════════════════════════════════════════════════════════════════
# 1. USER AUTHENTICATION  (Register / Login / Refresh / Logout)
# ═══════════════════════════════════════════════════════════════════════════════

class RegisterView(APIView):
    """POST /api/auth/register/  — Create a new user account."""
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            user = serializer.save()
            # Return tokens immediately after registration
            refresh = RefreshToken.for_user(user)
            return Response({
                'message': 'User created successfully',
                'access':  str(refresh.access_token),
                'refresh': str(refresh),
            }, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    """POST /api/auth/login/  — Login and receive JWT tokens."""
    permission_classes = [AllowAny]

    def post(self, request):
        from django.contrib.auth import authenticate
        username = request.data.get('username')
        password = request.data.get('password')

        user = authenticate(username=username, password=password)
        if user is None:
            return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)

        refresh = RefreshToken.for_user(user)
        return Response({
            'access':  str(refresh.access_token),
            'refresh': str(refresh),
        })


class LogoutView(APIView):
    """POST /api/auth/logout/  — Blacklist the refresh token."""
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            refresh_token = request.data.get('refresh')
            token = RefreshToken(refresh_token)
            token.blacklist()
            return Response({'message': 'Logged out successfully'})
        except Exception:
            return Response({'error': 'Invalid token'}, status=status.HTTP_400_BAD_REQUEST)


# Note: Token refresh is handled automatically by SimpleJWT.
# Just add: path('api/auth/refresh/', TokenRefreshView.as_view())  in urls.py



# ═══════════════════════════════════════════════════════════════════════════════
# 2. CRUD API  (Tasks)
# ═══════════════════════════════════════════════════════════════════════════════

class TaskListCreateView(APIView):
    """
    GET  /api/tasks/  — List all tasks for the logged-in user.
    POST /api/tasks/  — Create a new task.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        tasks = Task.objects.filter(user=request.user)
        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)

    def post(self, request):
        serializer = TaskSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class TaskDetailView(APIView):
    """
    GET    /api/tasks/<id>/  — Retrieve a single task.
    PUT    /api/tasks/<id>/  — Update a task.
    DELETE /api/tasks/<id>/  — Delete a task.
    """
    permission_classes = [IsAuthenticated]

    def get_task(self, pk, user):
        """Helper: get task that belongs to this user or 404."""
        return get_object_or_404(Task, pk=pk, user=user)

    def get(self, request, pk):
        task = self.get_task(pk, request.user)
        return Response(TaskSerializer(task).data)

    def put(self, request, pk):
        task = self.get_task(pk, request.user)
        serializer = TaskSerializer(task, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

    def delete(self, request, pk):
        task = self.get_task(pk, request.user)
        task.delete()
        return Response({'message': 'Task deleted'}, status=status.HTTP_204_NO_CONTENT)


# ═══════════════════════════════════════════════════════════════════════════════
# 3. FILE UPLOAD & DOWNLOAD API
# ═══════════════════════════════════════════════════════════════════════════════

class FileUploadView(APIView):
    """
    GET  /api/files/        — List all files uploaded by the user.
    POST /api/files/        — Upload a new file.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        files = UploadedFile.objects.filter(user=request.user)
        serializer = UploadedFileSerializer(files, many=True, context={'request': request})
        return Response(serializer.data)

    def post(self, request):
        file = request.FILES.get('file')
        if not file:
            return Response({'error': 'No file provided'}, status=status.HTTP_400_BAD_REQUEST)

        # Validate file size
        if file.size > settings.MAX_UPLOAD_SIZE:
            return Response(
                {'error': f'File too large. Max size is {settings.MAX_UPLOAD_SIZE // (1024*1024)}MB'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # Validate file type
        if file.content_type not in settings.ALLOWED_FILE_TYPES:
            return Response(
                {'error': f'File type not allowed. Allowed: {settings.ALLOWED_FILE_TYPES}'},
                status=status.HTTP_400_BAD_REQUEST
            )

        uploaded = UploadedFile.objects.create(
            user=request.user,
            file=file,
            original_name=file.name,
            file_size=file.size,
        )
        serializer = UploadedFileSerializer(uploaded, context={'request': request})
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class FileDownloadView(APIView):
    """GET /api/files/<id>/download/  — Download a file."""
    permission_classes = [IsAuthenticated]

    def get(self, request, pk):
        uploaded_file = get_object_or_404(UploadedFile, pk=pk, user=request.user)
        file_path = uploaded_file.file.path

        if not os.path.exists(file_path):
            return Response({'error': 'File not found on server'}, status=status.HTTP_404_NOT_FOUND)

        response = FileResponse(open(file_path, 'rb'))
        response['Content-Disposition'] = f'attachment; filename="{uploaded_file.original_name}"'
        return response


class FileDeleteView(APIView):
    """DELETE /api/files/<id>/  — Delete a file."""
    permission_classes = [IsAuthenticated]

    def delete(self, request, pk):
        uploaded_file = get_object_or_404(UploadedFile, pk=pk, user=request.user)

        # Delete the actual file from disk
        if os.path.exists(uploaded_file.file.path):
            os.remove(uploaded_file.file.path)

        uploaded_file.delete()
        return Response({'message': 'File deleted'}, status=status.HTTP_204_NO_CONTENT)
