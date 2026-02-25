from django.shortcuts import render
import os
from django.conf import settings
from django.shortcuts import get_object_or_404
from rest_framework import status
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework_simplejwt.tokens import RefreshToken
from .models import Task
from .serializers import RegisterSerializer
from .serializers import TaskSerializer
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
