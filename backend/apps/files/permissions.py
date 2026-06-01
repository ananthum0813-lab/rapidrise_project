from rest_framework.permissions import BasePermission


class IsFileOwner(BasePermission):
    """Only the owner of a file can access or modify it."""
    message = 'You do not have permission to access this file.'

    def has_object_permission(self, request, view, obj):
        return obj.owner == request.user