from django.shortcuts import render
from django.contrib.auth import authenticate
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from .serializers import RegisterSerializer, LoginSerializer


# ── Auth Views ────────────────────────────────────────────────────────────────

class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = RegisterSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save()
            return Response({"message": "User registered successfully."}, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class LoginView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        serializer = LoginSerializer(data=request.data)
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

        # Authenticate the user with provided credentials
        user = authenticate(
            username=serializer.validated_data["username"],
            password=serializer.validated_data["password"],
        )

        if not user:
            return Response({"error": "Invalid username or password."}, status=status.HTTP_401_UNAUTHORIZED)

        # Generate JWT tokens here in the view
        tokens = RefreshToken.for_user(user)
        return Response({
            "username": user.username,
            "access":   str(tokens.access_token),
            "refresh":  str(tokens),
        }, status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [IsAuthenticated]

    def post(self, request):
        try:
            # Blacklist the refresh token so it can't be used again
            token = RefreshToken(request.data.get("refresh"))
            token.blacklist()
            return Response({"message": "Logged out successfully."}, status=status.HTTP_200_OK)
        except Exception:
            return Response({"error": "Invalid or expired token."}, status=status.HTTP_400_BAD_REQUEST)


# ── Arithmetic Base View ──────────────────────────────────────────────────────

class ArithmeticBaseView(APIView):
    permission_classes = [IsAuthenticated]

    def get_numbers(self, request):
        try:
            a = float(request.query_params.get("a"))
            b = float(request.query_params.get("b"))
            return a, b, None
        except (TypeError, ValueError):
            return None, None, Response({"error": "Provide valid numbers for 'a' and 'b'."}, status=400)

    def calculate(self, a, b):
        raise NotImplementedError

    def get(self, request):
        a, b, err = self.get_numbers(request)
        if err:
            return err
        return Response({"a": a, "b": b, "result": self.calculate(a, b)})


# ── Arithmetic Views ──────────────────────────────────────────────────────────

class AddView(ArithmeticBaseView):
    def calculate(self, a, b): return a + b

class SubtractView(ArithmeticBaseView):
    def calculate(self, a, b): return a - b

class MultiplyView(ArithmeticBaseView):
    def calculate(self, a, b): return a * b

class DivideView(ArithmeticBaseView):
    def get(self, request):
        a, b, err = self.get_numbers(request)
        if err:
            return err
        if b == 0:
            return Response({"error": "Cannot divide by zero."}, status=400)
        return Response({"a": a, "b": b, "result": a / b})
